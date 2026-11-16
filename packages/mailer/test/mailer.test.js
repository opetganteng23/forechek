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
  process.env.GMAIL_USER = 'forechek@example.org'
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
