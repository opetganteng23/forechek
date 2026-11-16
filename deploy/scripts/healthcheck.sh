#!/usr/bin/env bash
# Healthcheck Forechek: GET /api/health harus 200 dan memuat "status":"ok". Kode keluar 0 = sehat, 1 = tidak sehat.
# Dipakai oleh deploy.sh/rollback.sh dan layanan pemantau eksternal (cron/uptime). Tidak mencetak detail internal.
#   HEALTH_URL (default http://127.0.0.1:3000/api/health)  RETRIES (default 1)  SLEEP_SEC (default 3)
set -uo pipefail
URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"
RETRIES="${RETRIES:-1}"
SLEEP_SEC="${SLEEP_SEC:-3}"

for i in $(seq 1 "$RETRIES"); do
  code="$(curl -s -o /tmp/forechek-health.$$ -w '%{http_code}' --max-time 8 "$URL" || echo 000)"
  if [ "$code" = "200" ] && grep -q '"status":"ok"' /tmp/forechek-health.$$ 2>/dev/null; then
    rm -f /tmp/forechek-health.$$
    echo "OK health ($URL) percobaan $i"
    exit 0
  fi
  rm -f /tmp/forechek-health.$$
  [ "$i" -lt "$RETRIES" ] && sleep "$SLEEP_SEC"
done
echo "GAGAL health ($URL) kode=$code setelah $RETRIES percobaan" >&2
exit 1
