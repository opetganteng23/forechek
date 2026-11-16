const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

// Memuat nodemailer palsu lebih dulu agar tidak ada koneksi jaringan.
require.cache[require.resolve('nodemailer', { paths: [path.join(__dirname, '..')] })] = { id: 'x', filename: 'x', loaded: true, exports: { createTransport: () => ({ sendMail: async () => {} }) } }

test('rebrand Forechek + escape: nama pengguna ber-HTML tidak disisipkan mentah; subjek dan pengirim memakai merek Forechek', async () => {
  const sent = []
  const nmPath = require.resolve('nodemailer', { paths: [path.join(__dirname, '..')] })
  require.cache[nmPath].exports = { createTransport: () => ({ sendMail: async (m) => { sent.push(m) } }) }
  delete require.cache[require.resolve('../index.js')]
  const { sendVerificationEmail, sendPasswordResetEmail } = require('../index.js')
  Object.assign(process.env, { SMTP_HOST: 'mail.example.org', SMTP_USER: 'forechek@example.org', SMTP_PASS: 'x' })
  process.env.BASE_URL = 'https://forechek.ailo.ai.id'
  await sendVerificationEmail('a@example.com', '<img src=x onerror=alert(1)>', 'tok')
  await sendPasswordResetEmail('a@example.com', 'Budi', 'tok')
  assert.ok(!sent[0].html.includes('<img'), 'HTML pada nama harus di-escape')
  assert.ok(sent[0].html.includes('&lt;img'))
  for (const m of sent) {
    assert.match(m.subject, /^\[Forechek\]/)
    assert.match(m.from, /Forechek/)
    assert.ok(!/Platform Analisis|Kesiapan Publikasi/i.test(m.html + m.subject + m.from))
  }
  assert.ok(sent[0].html.includes('https://forechek.ailo.ai.id/verify-email?token=tok'))
})

test('SMTP biasa (bukan OAuth2): host/port/user/pass dari env; 465 = TLS langsung, 587 = STARTTLS wajib; pengirim dari SMTP_FROM', async () => {
  const captured = []
  const sent = []
  const nmPath = require.resolve('nodemailer', { paths: [path.join(__dirname, '..')] })
  require.cache[nmPath].exports = { createTransport: (o) => (captured.push(o), { sendMail: async (m) => { sent.push(m) } }) }
  delete require.cache[require.resolve('../index.js')]
  const { sendPasswordResetEmail } = require('../index.js')
  Object.assign(process.env, { SMTP_HOST: 'mail.example.org', SMTP_PORT: '587', SMTP_USER: 'noreply@example.org', SMTP_PASS: 'rahasia-smtp', BASE_URL: 'https://forechek.ailo.ai.id' })
  delete process.env.SMTP_SECURE
  delete process.env.SMTP_FROM
  await sendPasswordResetEmail('a@example.com', 'Budi', 'tok')
  assert.equal(captured[0].host, 'mail.example.org')
  assert.equal(captured[0].port, 587)
  assert.equal(captured[0].secure, false)
  assert.equal(captured[0].requireTLS, true)
  assert.deepEqual(captured[0].auth, { user: 'noreply@example.org', pass: 'rahasia-smtp' })
  assert.ok(!('service' in captured[0]) && !JSON.stringify(captured[0].auth).includes('OAuth2'))
  assert.match(sent[0].from, /Forechek.*noreply@example\.org/)
  process.env.SMTP_PORT = '465'
  process.env.SMTP_FROM = 'Forechek <halo@example.org>'
  await sendPasswordResetEmail('a@example.com', 'Budi', 'tok')
  assert.equal(captured[1].port, 465)
  assert.equal(captured[1].secure, true)
  assert.equal(captured[1].requireTLS, false)
  assert.equal(sent[1].from, 'Forechek <halo@example.org>')
  for (const k of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM']) delete process.env[k]
})

test('SMTP belum dikonfigurasi: pengiriman gagal dengan galat jelas tanpa membocorkan nilai', async () => {
  const nmPath = require.resolve('nodemailer', { paths: [path.join(__dirname, '..')] })
  require.cache[nmPath].exports = { createTransport: () => ({ sendMail: async () => {} }) }
  delete require.cache[require.resolve('../index.js')]
  const { sendVerificationEmail } = require('../index.js')
  for (const k of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS']) delete process.env[k]
  await assert.rejects(() => sendVerificationEmail('a@example.com', 'A', 'tok'), (e) => e.code === 'SMTP_NOT_CONFIGURED' && /SMTP_HOST/.test(e.message))
})
