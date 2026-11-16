// Klien fetch untuk komponen client. Mengurai envelope standar { success, data, error, requestId }.
export async function apiFetch(path, { method = 'GET', body } = {}) {
  let res
  try {
    res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    })
  } catch {
    const err = new Error('Tidak dapat terhubung ke server. Periksa koneksi Anda.')
    err.code = 'NETWORK'
    throw err
  }

  let json = null
  try {
    json = await res.json()
  } catch {
    /* respons bukan JSON */
  }

  // Sesi dicabut/berakhir (user dihapus/dinonaktifkan, kata sandi direset): bersihkan cookie dan arahkan ke login dengan pesan jelas,
  // bukan membiarkan halaman tampak hidup tetapi semua API menjawab 401 (T7-06). Rute autentikasi sendiri dikecualikan.
  if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/api/auth/') && !window.location.pathname.startsWith('/login')) {
    import('next-auth/react').then((m) => m.signOut({ callbackUrl: '/login?reason=session' })).catch(() => window.location.assign('/login?reason=session'))
    const err = new Error('Sesi Anda telah berakhir. Mengalihkan ke halaman masuk...')
    err.code = 'UNAUTHENTICATED'
    err.status = 401
    throw err
  }

  if (!res.ok || !json || json.success !== true) {
    const err = new Error(json?.error?.message || 'Permintaan gagal. Coba lagi.')
    err.code = json?.error?.code || 'UNKNOWN'
    err.status = res.status
    err.requestId = json?.requestId
    err.details = json?.error?.details
    throw err
  }
  return json.data
}

// Hanya izinkan redirect ke path internal; cegah open redirect (//evil.com, https://evil.com, /\evil.com).
export function safeCallbackUrl(value, fallback = '/dashboard') {
  if (typeof value !== 'string') return fallback
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback
  return value
}
