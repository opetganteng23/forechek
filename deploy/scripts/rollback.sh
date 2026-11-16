#!/usr/bin/env bash
# Rollback Forechek ke rilis sebelumnya (atau ke rilis tertentu): ganti symlink `current` secara atomik, reload pm2, healthcheck.
#   deploy/scripts/rollback.sh              -> rilis tepat sebelum rilis aktif
#   deploy/scripts/rollback.sh 20261116-101500   -> rilis bernama itu
# Rollback hanya mengganti KODE. Perubahan data tidak dibatalkan (skema bersifat aditif; lihat docs/DEPLOY.md bagian Rollback).
set -euo pipefail
ROOT="${FORECHEK_ROOT:-/var/www/forechek}"
HERE="$(cd "$(dirname "$0")" && pwd)"

[ -L "$ROOT/current" ] || { echo "[rollback] symlink current tidak ada" >&2; exit 1; }
CUR="$(readlink -f "$ROOT/current")"

if [ -n "${1:-}" ]; then
  TARGET="$ROOT/releases/$1"
  [ -d "$TARGET" ] || { echo "[rollback] rilis $1 tidak ada. Tersedia:" >&2; ls -1 "$ROOT/releases" >&2; exit 1; }
else
  TARGET=""
  for d in $(ls -1dt "$ROOT"/releases/*/ 2>/dev/null); do
    d="${d%/}"
    if [ "$(readlink -f "$d")" != "$CUR" ]; then TARGET="$d"; break; fi
  done
  [ -n "$TARGET" ] || { echo "[rollback] tidak ada rilis lain untuk dituju" >&2; exit 1; }
fi

echo "[rollback] $CUR -> $TARGET"
ln -sfn "$TARGET" "$ROOT/current.new" && mv -Tf "$ROOT/current.new" "$ROOT/current"
( cd "$ROOT/current" && FORECHEK_ROOT="$ROOT" pm2 startOrReload ecosystem.config.js --update-env )
pm2 save >/dev/null 2>&1 || true
if RETRIES=10 SLEEP_SEC=3 "$HERE/healthcheck.sh"; then
  echo "[rollback] BERHASIL: aktif $(basename "$TARGET")"
else
  echo "[rollback] PERINGATAN: healthcheck gagal setelah rollback; periksa 'pm2 logs forechek' dan MongoDB" >&2
  exit 1
fi
