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
