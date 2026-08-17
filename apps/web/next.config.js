/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@publication-prepare/db',
    '@publication-prepare/mailer',
    '@publication-prepare/ai'
  ]
}

module.exports = nextConfig
