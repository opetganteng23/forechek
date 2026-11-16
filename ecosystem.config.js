// pm2 untuk Forechek (Biznet Gio / VPS). Dipakai oleh deploy/scripts/deploy.sh:  pm2 startOrReload ecosystem.config.js --update-env
// Satu instance (mode fork): batas laju memory per proses tidak berlaku lintas instance. Untuk cluster (instances > 1) WAJIB isi REDIS_URL
// dan pasang paket ioredis (sudah opsional di apps/web), lalu ubah exec_mode ke 'cluster'. Env aplikasi dibaca Next dari apps/web/.env.local
// (berkas rahasia di shared/, tidak di-commit).
const APP_ROOT = process.env.FORECHEK_ROOT || '/var/www/forechek'

module.exports = {
  apps: [
    {
      name: 'forechek',
      cwd: `${APP_ROOT}/current/apps/web`, // `current` = symlink ke rilis aktif (ganti atomik saat deploy/rollback)
      script: '../../node_modules/next/dist/bin/next',
      args: 'start -p 3000 -H 127.0.0.1', // hanya loopback; nginx yang terbuka ke publik
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '20s',
      max_memory_restart: '900M',
      kill_timeout: 15000, // beri waktu stream SSE selesai saat reload
      listen_timeout: 30000,
      env: { NODE_ENV: 'production', PORT: '3000' },
      out_file: '/var/log/forechek/out.log',
      error_file: '/var/log/forechek/error.log',
      merge_logs: true,
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
}
