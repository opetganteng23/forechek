/** @type {import('next').NextConfig} */
const securityHeaders = [
  // HSTS hanya di produksi (melalui HTTPS). Browser mengabaikan header ini di http.
  ...(process.env.NODE_ENV === 'production' ? [{ key: 'Strict-Transport-Security', value: 'max-age=15552000; includeSubDomains' }] : []),
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }
  // Content-Security-Policy sengaja belum diaktifkan: perlu disusun bersama inline script Next dan
  // domain Midtrans Snap, lalu diuji (dijadwalkan di Tahap 7).
]

const nextConfig = {
  poweredByHeader: false,
  // Pengoptimal gambar Next dinonaktifkan: aplikasi tidak memakai next/image, dan endpoint /_next/image memiliki advisori (DoS/RCE) pada 14.x.
  images: { unoptimized: true },
  experimental: { instrumentationHook: true }, // instrumentation.js: fail-fast env saat boot (QA-16)
  transpilePackages: [
    '@publication-prepare/db',
    '@publication-prepare/mailer',
    '@publication-prepare/ai',
    '@publication-prepare/core',
    '@publication-prepare/literature',
    '@publication-prepare/venues',
    '@publication-prepare/checks',
    '@publication-prepare/edits',
    '@publication-prepare/export',
    '@publication-prepare/indicators',
    '@publication-prepare/manuscript'
  ],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  }
}

module.exports = nextConfig
