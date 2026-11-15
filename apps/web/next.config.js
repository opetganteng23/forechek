/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }
  // Content-Security-Policy sengaja belum diaktifkan: perlu disusun bersama inline script Next dan
  // domain Midtrans Snap, lalu diuji (dijadwalkan di Tahap 7).
]

const nextConfig = {
  poweredByHeader: false,
  transpilePackages: [
    '@publication-prepare/db',
    '@publication-prepare/mailer',
    '@publication-prepare/ai',
    '@publication-prepare/core',
    '@publication-prepare/manuscript'
  ],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  }
}

module.exports = nextConfig
