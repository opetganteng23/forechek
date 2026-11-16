// pm2 untuk server BERSAMA (Caddy memegang 80/443; aplikasi tetangga di host yang sama).
// Aplikasi hanya mendengar di antarmuka docker 172.19.0.1:5021 (bukan 0.0.0.0) agar tidak terbuka ke publik; Caddy yang melayani HTTPS.
// Pakai:  FORECHEK_ROOT=$HOME/apps/forechek pm2 startOrReload ecosystem.config.js --update-env
const ROOT = process.env.FORECHEK_ROOT || `${process.env.HOME}/apps/forechek`

module.exports = {
  apps: [
    {
      name: 'forechek',
      cwd: `${ROOT}/current/apps/web`, // current = symlink ke rilis aktif
      script: '../../node_modules/next/dist/bin/next',
      args: 'start -p 5021 -H 172.19.0.1',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '20s',
      max_memory_restart: '600M', // server bersama dengan memori ketat
      kill_timeout: 15000,
      listen_timeout: 30000,
      env: { NODE_ENV: 'production', PORT: '5021' },
      out_file: `${ROOT}/logs/out.log`,
      error_file: `${ROOT}/logs/error.log`,
      merge_logs: true,
      time: true
    }
  ]
}
