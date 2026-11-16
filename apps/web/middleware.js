import { NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

// Dua tugas: (1) Content-Security-Policy ketat berbasis NONCE per permintaan (G), (2) halaman /dashboard memerlukan sesi.
// Catatan sesi: middleware hanya memeriksa keberadaan/tanda tangan JWT (tanpa DB di edge). Sesi yang dicabut server (akun dihapus/
// dinonaktifkan, kata sandi direset) ditangani di klien: API menjawab 401 dan apiFetch mengalihkan ke /login?reason=session.
function buildCsp(nonce) {
  const dev = process.env.NODE_ENV !== 'production'
  return [
    "default-src 'self'",
    // 'strict-dynamic': skrip yang dimuat oleh skrip ber-nonce ikut dipercaya; 'self' dan host lain diabaikan oleh browser modern.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    // Gaya inline masih diizinkan (Tailwind/Next menyisipkan style); risiko XSS utama ada di script-src.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ['upgrade-insecure-requests'])
  ].join('; ')
}

export async function middleware(request) {
  const nonce = btoa(crypto.randomUUID())
  const csp = buildCsp(nonce)

  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    const token = await getToken({ req: request })
    if (!token) {
      const login = new URL('/login', request.url)
      login.searchParams.set('callbackUrl', request.nextUrl.pathname + request.nextUrl.search)
      return NextResponse.redirect(login)
    }
  }

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('content-security-policy', csp) // Next membaca nonce dari header ini untuk skrip bawaannya
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', csp)
  return response
}

// Semua halaman kecuali aset statis dan API (API mengembalikan JSON; header keamanan lain dipasang di next.config.js).
export const config = {
  matcher: [{ source: '/((?!api|_next/static|_next/image|favicon.ico).*)', missing: [{ type: 'header', key: 'next-router-prefetch' }, { type: 'header', key: 'purpose', value: 'prefetch' }] }]
}
