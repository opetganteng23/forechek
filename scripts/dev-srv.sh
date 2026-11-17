#!/bin/bash
# Pembantu lokal: jalankan server produksi uji (env palsu, MongoDB uji) pada port $1 (default 3000).
P=${1:-3000}
for p in $(netstat -ano | grep ":$P " | grep LISTENING | awk '{print $5}' | sort -u); do taskkill //PID $p //F >/dev/null; done
cd "$(dirname "$0")/../apps/web"
NODE_ENV=production MONGODB_URI=mongodb://localhost:27017/publikasi_db NEXTAUTH_SECRET=test-secret-test-secret-test-secret-123456 NEXTAUTH_URL=http://localhost:$P BASE_URL=http://localhost:$P AI_PROVIDER=fake AI_ALLOW_FAKE=true AI_MODEL_CHAT=demo-model AI_MODEL_REPORT=demo-model LITERATURE_PROVIDERS=fixture LITERATURE_ALLOW_FIXTURE=true TRUST_PROXY=true MIDTRANS_SERVER_KEY=dummy-e2e-key npx next start -p $P > ../../.srv$P.log 2>&1 &
sleep 6
curl -s -o /dev/null -w "server $P: %{http_code}\n" http://localhost:$P/
