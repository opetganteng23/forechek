import { withAuth } from 'next-auth/middleware'

// Semua halaman /dashboard memerlukan sesi; tanpa sesi diarahkan ke /login?callbackUrl=...
export default withAuth({ pages: { signIn: '/login' } })

export const config = { matcher: ['/dashboard/:path*'] }
