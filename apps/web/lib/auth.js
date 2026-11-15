import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import bcrypt from 'bcryptjs'
import { dbConnect, User } from '@publication-prepare/db'
import {
  normalizeEmail,
  createRateLimiter,
  createLogger,
  loadConfig,
  googleLinkUpdate
} from '@publication-prepare/core'

const log = createLogger()
const loginLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10 })

// Hash palsu agar waktu respons login tidak membedakan "email tidak ada" dan "password salah".
let dummyHash
function getDummyHash() {
  if (!dummyHash) dummyHash = bcrypt.hashSync('tidak-dipakai-untuk-login', 10)
  return dummyHash
}

function ipFrom(req) {
  const h = req?.headers || {}
  const xff = h['x-forwarded-for']
  const first = (Array.isArray(xff) ? xff[0] : xff || '').split(',')[0].trim()
  return first || 'unknown'
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

        const byIp = loginLimiter.check(`ip:${ipFrom(req)}`)
        const byEmail = loginLimiter.check(`em:${email}`)
        if (!byIp.allowed || !byEmail.allowed) throw new Error('RATE_LIMITED')

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
      } else if (user) {
        token.id = user.id
        token.role = user.role
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id
        session.user.role = token.role
      }
      return session
    }
  },
  secret: process.env.NEXTAUTH_SECRET
}
