#!/usr/bin/env bash
# Deploy Forechek (rilis berdampingan + symlink atomik + rollback otomatis bila healthcheck gagal).
#
# Tata letak (default /var/www/forechek):
#   source/          klon git (satu kali: git clone <REPO_URL> source)
#   releases/<ts>/   hasil build tiap deploy;   current -> releases/<ts>   (symlink aktif)
#   shared/.env.local berkas env produksi (BUKAN di git; chmod 600) — ditautkan ke apps/web/.env.local di setiap rilis
#
# Pakai:  deploy/scripts/deploy.sh [ref]        ref default: main  (branch, tag, atau commit)
#   RUN_TESTS=1   jalankan npm test sebelum switch (disarankan)
#   KEEP=5        jumlah rilis yang disimpan
#   SKIP_PREFLIGHT=1 lewati npm run preflight
set -euo pipefail

ROOT="${FORECHEK_ROOT:-/var/www/forechek}"
REF="${1:-main}"
KEEP="${KEEP:-5}"
TS="$(date +%Y%m%d-%H%M%S)"
REL="$ROOT/releases/$TS"
HERE="$(cd "$(dirname "$0")" && pwd)"

log() { echo "[deploy $(date +%H:%M:%S)] $*"; }
fail() { echo "[deploy] GAGAL: $*" >&2; exit 1; }

[ -d "$ROOT/source/.git" ] || fail "klon git tidak ditemukan di $ROOT/source (git clone <REPO_URL> $ROOT/source)"
[ -f "$ROOT/shared/.env.local" ] || fail "$ROOT/shared/.env.local belum ada (salin dari .env.example, isi nilai, chmod 600)"
command -v node >/dev/null || fail "node tidak ditemukan"
command -v pm2 >/dev/null || fail "pm2 tidak ditemukan (npm i -g pm2)"

log "mengambil kode ($REF)"
git -C "$ROOT/source" fetch --tags --prune origin
git -C "$ROOT/source" rev-parse --verify "$REF^{commit}" >/dev/null 2>&1 || git -C "$ROOT/source" rev-parse --verify "origin/$REF^{commit}" >/dev/null 2>&1 || fail "ref '$REF' tidak ditemukan"
COMMIT="$(git -C "$ROOT/source" rev-parse --verify "origin/$REF^{commit}" 2>/dev/null || git -C "$ROOT/source" rev-parse --verify "$REF^{commit}")"

mkdir -p "$REL"
[ -d /var/log/forechek ] || echo "[deploy] PERINGATAN: /var/log/forechek belum ada (lihat docs/DEPLOY.md); pm2 akan gagal menulis log" >&2
git -C "$ROOT/source" archive "$COMMIT" | tar -x -C "$REL"
echo "$COMMIT" > "$REL/.release-commit"
ln -sfn "$ROOT/shared/.env.local" "$REL/apps/web/.env.local"

log "npm ci (rilis $TS, commit ${COMMIT:0:8})"
( cd "$REL" && npm ci --no-audit --no-fund )

if [ "${SKIP_PREFLIGHT:-0}" != "1" ]; then
  log "preflight"
  ( cd "$REL" && npm run preflight --silent ) || fail "preflight gagal; perbaiki env (rilis TIDAK diaktifkan)"
fi
if [ "${RUN_TESTS:-0}" = "1" ]; then
  log "npm test"
  ( cd "$REL" && npm test --silent ) || fail "tes gagal; rilis TIDAK diaktifkan"
fi

log "build"
( cd "$REL" && npm run build )

PREV=""
[ -L "$ROOT/current" ] && PREV="$(readlink -f "$ROOT/current")"
log "switch symlink current -> $REL"
ln -sfn "$REL" "$ROOT/current.new" && mv -Tf "$ROOT/current.new" "$ROOT/current"

log "pm2 startOrReload"
( cd "$ROOT/current" && FORECHEK_ROOT="$ROOT" pm2 startOrReload ecosystem.config.js --update-env )
pm2 save >/dev/null 2>&1 || true

log "healthcheck"
if RETRIES=10 SLEEP_SEC=3 "$HERE/healthcheck.sh"; then
  log "BERHASIL: rilis $TS aktif (commit ${COMMIT:0:8})"
else
  echo "[deploy] healthcheck GAGAL" >&2
  if [ -n "$PREV" ] && [ -d "$PREV" ]; then
    echo "[deploy] rollback otomatis ke $PREV" >&2
    ln -sfn "$PREV" "$ROOT/current.new" && mv -Tf "$ROOT/current.new" "$ROOT/current"
    ( cd "$ROOT/current" && FORECHEK_ROOT="$ROOT" pm2 startOrReload ecosystem.config.js --update-env )
    RETRIES=10 SLEEP_SEC=3 "$HERE/healthcheck.sh" || echo "[deploy] PERINGATAN: rilis sebelumnya pun tidak sehat; periksa log pm2 dan MongoDB" >&2
  fi
  exit 1
fi

# Hapus rilis lama (simpan KEEP terbaru, selalu pertahankan rilis aktif dan sebelumnya).
ls -1dt "$ROOT"/releases/*/ 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
  [ "$(readlink -f "$old")" = "$(readlink -f "$ROOT/current")" ] && continue
  rm -rf "$old"
done
