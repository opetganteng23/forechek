const nodemailer = require('nodemailer')

// SMTP biasa (host/port/user/pass), BUKAN OAuth2. 465 = TLS langsung (secure); selain itu STARTTLS wajib (587). Berlaku untuk penyedia
// SMTP apa pun (hosting email, Brevo, Mailgun, Gmail dengan App Password: smtp.gmail.com:587). Hanya NAMA variabel yang disebut pada galat.
function smtpConfig(env = process.env) {
  const missing = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'].filter((k) => !env[k])
  if (missing.length) {
    const err = new Error(`SMTP belum dikonfigurasi: ${missing.join(', ')} belum diisi`)
    err.code = 'SMTP_NOT_CONFIGURED'
    throw err
  }
  const port = Number.parseInt(env.SMTP_PORT || '587', 10) || 587
  const secure = env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465
  return {
    host: env.SMTP_HOST,
    port,
    secure,
    requireTLS: !secure, // jangan pernah mengirim kredensial tanpa TLS
    // Tanpa batas waktu, SMTP yang tak terjangkau/salah konfigurasi menahan request (mis. register) bermenit-menit.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }
  }
}

function getTransporter() {
  return nodemailer.createTransport(smtpConfig())
}

// Nama pengguna berasal dari input pengguna: HARUS di-escape sebelum masuk HTML email (cegah injeksi HTML).
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const FROM = () => process.env.SMTP_FROM || `"Forechek" <${process.env.SMTP_USER}>`

async function sendVerificationEmail(to, name, token) {
  const verifyUrl = `${process.env.BASE_URL}/verify-email?token=${token}`

  await getTransporter().sendMail({
    from: FROM(),
    to,
    subject: '[Forechek] Verifikasi email Anda',
    html: `
      <h2>Halo, ${esc(name)}!</h2>
      <p>Terima kasih sudah mendaftar. Klik tombol di bawah untuk verifikasi email:</p>
      <a href="${verifyUrl}"
         style="background:#4F46E5;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;">
        Verifikasi Email
      </a>
      <p>Link berlaku selama 24 jam.</p>
    `
  })
}

async function sendPasswordResetEmail(to, name, token) {
  const resetUrl = `${process.env.BASE_URL}/reset-password?token=${token}`

  await getTransporter().sendMail({
    from: FROM(),
    to,
    subject: '[Forechek] Reset password Anda',
    html: `
      <h2>Halo, ${esc(name)}!</h2>
      <p>Kami menerima permintaan reset password. Klik tombol berikut:</p>
      <a href="${resetUrl}"
         style="background:#DC2626;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;">
        Reset Password
      </a>
      <p>Link berlaku selama 1 jam. Abaikan email ini jika tidak merasa meminta.</p>
    `
  })
}

async function sendAnalysisCompleteEmail(to, name, analysisId, grade, score) {
  const resultUrl = `${process.env.BASE_URL}/dashboard/analyses/${analysisId}`
  const gradeColor = { A: '#16A34A', B: '#2563EB', C: '#D97706', D: '#DC2626', F: '#991B1B' }

  await getTransporter().sendMail({
    from: FROM(),
    to,
    subject: `[Forechek] Hasil analisis naskah Anda sudah siap (grade ${esc(grade)})`,
    html: `
      <h2>Halo, ${esc(name)}!</h2>
      <p>Analisis naskah Anda telah selesai. Berikut ringkasan hasilnya:</p>

      <div style="background:#F3F4F6;padding:20px;border-radius:8px;margin:20px 0;">
        <p style="margin:0;font-size:14px;color:#6B7280;">Overall Score</p>
        <p style="margin:4px 0;font-size:36px;font-weight:bold;color:#111827;">${score}/100</p>
        <p style="margin:0;">
          Grade:
          <span style="font-weight:bold;color:${gradeColor[grade] || '#111827'}">
            ${grade}
          </span>
        </p>
      </div>

      <a href="${resultUrl}"
         style="background:#4F46E5;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;">
        Lihat Hasil Lengkap
      </a>

      <p style="color:#6B7280;font-size:12px;margin-top:24px;">
        Forechek - persiapan naskah ilmiah
      </p>
    `
  })
}

async function sendPaymentConfirmationEmail(to, name, plan, expiredAt) {
  await getTransporter().sendMail({
    from: FROM(),
    to,
    subject: '[Forechek] Pembayaran berhasil - akun Pro aktif',
    html: `
      <h2>Halo, ${esc(name)}!</h2>
      <p>Pembayaran Anda berhasil. Akun <strong>${plan}</strong> kini aktif hingga
         <strong>${new Date(expiredAt).toLocaleDateString('id-ID')}</strong>.</p>
      <p>Selamat menggunakan semua fitur premium!</p>
      <a href="${process.env.BASE_URL}/dashboard"
         style="background:#16A34A;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;">
        Buka Dashboard
      </a>
    `
  })
}

module.exports = {
  smtpConfig,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendAnalysisCompleteEmail,
  sendPaymentConfirmationEmail
}
