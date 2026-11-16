const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

// Regresi: tanpa timeout, SMTP yang tak terjangkau menahan request register selama bermenit-menit.
test('transporter memakai timeout koneksi, greeting, dan socket yang terbatas', async () => {
  const captured = []
  const nmPath = require.resolve('nodemailer', { paths: [path.join(__dirname, '..')] })
  require.cache[nmPath] = {
    id: nmPath,
    filename: nmPath,
    loaded: true,
    exports: { createTransport: (opts) => (captured.push(opts), { sendMail: async () => {} }) }
  }

  Object.assign(process.env, { SMTP_HOST: 'mail.example.org', SMTP_USER: 'u', SMTP_PASS: 'p' })
  const { sendVerificationEmail } = require('../index.js')
  await sendVerificationEmail('a@example.com', 'A', 'tok')

  assert.equal(captured.length, 1)
  for (const key of ['connectionTimeout', 'greetingTimeout', 'socketTimeout']) {
    assert.ok(
      Number.isFinite(captured[0][key]) && captured[0][key] > 0 && captured[0][key] <= 30_000,
      `${key} harus bernilai positif dan <= 30 detik`
    )
  }
})
