#!/usr/bin/env bash
# Backup MongoDB Forechek (mongodump terkompresi) dengan rotasi. Jalankan dari cron sebagai user aplikasi:
#   15 2 * * *  FORECHEK_ROOT=/var/www/forechek /var/www/forechek/current/deploy/scripts/backup-mongo.sh >> /var/log/forechek/backup.log 2>&1
# MONGODB_URI dibaca dari shared/.env.local TANPA dicetak. Backup memuat naskah pengguna: simpan terenkripsi dan batasi akses (chmod 700 direktori).
# Data yang dihapus pengguna tetap ada di backup sampai kedaluwarsa (BACKUP_KEEP_DAYS); kebijakan privasi menyatakannya.
#   BACKUP_DIR (default /var/backups/forechek)   BACKUP_KEEP_DAYS (default 14)
# UJI RESTORE (wajib sebelum rilis): docs/DEPLOY.md bagian "Uji restore".
set -euo pipefail
ROOT="${FORECHEK_ROOT:-/var/www/forechek}"
ENV_FILE="${ENV_FILE:-$ROOT/shared/.env.local}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/forechek}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"

command -v mongodump >/dev/null || { echo "[backup] mongodump tidak ditemukan (pasang mongodb-database-tools)" >&2; exit 1; }
[ -f "$ENV_FILE" ] || { echo "[backup] $ENV_FILE tidak ada" >&2; exit 1; }

# Ambil nilai MONGODB_URI tanpa 'source' (tidak mengeksekusi isi berkas) dan tanpa mencetaknya.
MONGODB_URI="$(grep -E '^MONGODB_URI=' "$ENV_FILE" | head -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")"
[ -n "$MONGODB_URI" ] || { echo "[backup] MONGODB_URI kosong di env" >&2; exit 1; }

umask 077
mkdir -p "$BACKUP_DIR"
OUT="$BACKUP_DIR/forechek-$(date +%Y%m%d-%H%M%S).archive.gz"
echo "[backup] mulai -> $OUT"
mongodump --uri="$MONGODB_URI" --archive="$OUT" --gzip --quiet
SIZE="$(stat -c %s "$OUT" 2>/dev/null || wc -c < "$OUT")"
[ "$SIZE" -gt 1024 ] || { echo "[backup] GAGAL: arsip terlalu kecil ($SIZE B)" >&2; rm -f "$OUT"; exit 1; }
echo "[backup] selesai ($SIZE byte)"

# Rotasi
find "$BACKUP_DIR" -name 'forechek-*.archive.gz' -mtime +"$KEEP_DAYS" -print -delete | sed 's/^/[backup] hapus lama: /'
