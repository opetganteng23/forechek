import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import bcrypt from 'bcryptjs'
import { dbConnect, User } from '@publication-prepare/db'
import {
  normalizeEmail,
  createLogger,
  effectiveMax,
  loadConfig,
  googleLinkUpdate
} from '@publication-prepare/core'

import { limiterFor, clientIpFromHeaders } from './rateLimitStore'

const log = createLogger()

// Hash palsu agar waktu respons login tidak membedakan "email tidak ada" dan "password salah".
let dummyHash
function getDummyHash() {
  if (!dummyHash) dummyHash = bcrypt.hashSync('tidak-dipakai-untuk-login', 10)
  return dummyHash
}

function ipFrom(req) {
  const h = req?.headers || {}
  const pick = (n) => (Array.isArray(h[n]) ? h[n][0] : h[n])
  return clientIpFromHeaders(pick) // sama dengan API: X-Forwarded-For hanya dipercaya bila TRUST_PROXY=true
}

// Pesan error ini dibaca UI login (lihat components/auth/LoginForm.jsx).
export const AUTH_ERRORS = ['INVALID_CREDENTIALS', 'RATE_LIMITED', 'EMAIL_NOT_VERIFIED', 'ACCOUNT_DISABLED']

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET
    }),
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials, req) {
        let email
        try {
          email = normalizeEmail(credentials?.email)
        } catch {
          throw new Error('INVALID_CREDENTIALS')
        }
        const password = typeof credentials?.password === 'string' ? credentials.password : ''

        // Kunci email hanya dihitung bila IP lolos (klien yang sudah diblokir tidak dapat menghabiskan kuota email korban); IP 'unknown' diskalakan.
        const ipKey = `ip:${ipFrom(req)}`
        const byIp = await (await limiterFor({ name: 'login-ip', windowMs: 15 * 60 * 1000, max: effectiveMax(ipKey, 10) })).check(ipKey)
        if (!byIp.allowed) throw new Error('RATE_LIMITED')
        const byEmail = await (await limiterFor({ name: 'login-email', windowMs: 15 * 60 * 1000, max: 10 })).check(`em:${email}`)
        if (!byEmail.allowed) throw new Error('RATE_LIMITED')

        await dbConnect()
        const user = await User.findOne({ email })
        const valid = await bcrypt.compare(password, user?.password || getDummyHash())
        if (!user || !user.password || !valid) throw new Error('INVALID_CREDENTIALS')
        if (user.isActive === false) throw new Error('ACCOUNT_DISABLED')
        if (loadConfig().requireEmailVerification && !user.emailVerified) {
          throw new Error('EMAIL_NOT_VERIFIED')
        }

        return { id: user._id.toString(), name: user.name, email: user.email, role: user.role }
      }
    })
  ],
  session: { strategy: 'jwt', maxAge: 7 * 24 * 60 * 60 },
  pages: { signIn: '/login', error: '/login' },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== 'google') return true
      if (!profile?.email || profile.email_verified !== true) return false

      try {
        await dbConnect()
        const email = profile.email.toLowerCase()
        const existing = await User.findOne({ email })

        if (!existing) {
          await User.create({
            name: profile.name || email.split('@')[0],
            email,
            avatar: profile.picture || null,
            oauthProvider: 'google',
            oauthId: account.providerAccountId,
            emailVerified: true
          })
          return true
        }

        if (existing.isActive === false) return false
        const { set, unset } = googleLinkUpdate(existing, account.providerAccountId)
        const update = { $set: set }
        if (unset.length) update.$unset = Object.fromEntries(unset.map((f) => [f, 1]))
        await User.updateOne({ _id: existing._id }, update)
        return true
      } catch (err) {
        log.error('google_signin_failed', { err })
        return false
      }
    },
    async jwt({ token, user, account }) {
      // Login Google: id dari provider BUKAN _id Mongo, jadi selalu petakan lewat email.
      if (account?.provider === 'google') {
        await dbConnect()
        const dbUser = await User.findOne({ email: String(token.email || '').toLowerCase() })
        if (dbUser) {
          token.id = dbUser._id.toString()
          token.role = dbUser.role
        }
        // Dicatat HANYA saat sign-in (bukan saat token diperbarui): dasar re-autentikasi segar untuk tindakan tidak dapat dibatalkan.
        token.authProvider = 'google'
        token.authAt = Math.floor(Date.now() / 1000)
        token.authAtMs = Date.now() // presisi milidetik untuk pencabutan sesi (sesi pada detik yang sama dengan pencabutan tidak boleh lolos)
      } else if (user) {
        token.id = user.id
        token.role = user.role
        token.authProvider = 'credentials'
        token.authAt = Math.floor(Date.now() / 1000)
        token.authAtMs = Date.now() // presisi milidetik untuk pencabutan sesi (sesi pada detik yang sama dengan pencabutan tidak boleh lolos)
      } else if (token.id) {
        // Pencabutan sesi (QA-14): sesi yang diterbitkan sebelum reset password, atau milik akun yang dinonaktifkan/dihapus, tidak berlaku.
        await dbConnect()
        const u = await User.findById(token.id).select('sessionsValidAfter isActive role').lean()
        const validAfter = u && u.sessionsValidAfter ? new Date(u.sessionsValidAfter).getTime() : 0
        if (!u || u.isActive === false || (validAfter && Number(token.authAtMs || (token.authAt || token.iat || 0) * 1000) < validAfter)) return { ...token, id: undefined, role: undefined }
        token.role = u.role // peran selalu mengikuti database (mis. admin baru di-seed/diubah) tanpa menunggu login ulang
      }
      return token
    },
    async session({ session, token }) {
      // Sesi yang dicabut (token.id dikosongkan oleh callback jwt) harus dianggap TIDAK ADA oleh semua rute, termasuk rute lama
      // yang hanya memeriksa `if (!session)`: objek kosong membuat getServerSession mengembalikan null.
      if (!token.id) return {}
      if (session.user) {
        session.user.id = token.id
        session.user.role = token.role
      }
      return session
    }
  },
  secret: process.env.NEXTAUTH_SECRET
}
