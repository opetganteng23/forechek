'use strict'

// Pemeriksaan Origin untuk permintaan pengubah-status (QA-18/T7-05). Murni dan dapat diuji.
//  - tanpa header Origin: diizinkan (klien non-browser, webhook server-ke-server); cookie SameSite=Lax tetap lapisan pertama;
//  - Origin harus sama dengan host permintaan; di belakang proxy (trustProxy=true) host/skema diambil dari X-Forwarded-Host/Proto,
//    memakai entri TERAKHIR (ditambahkan proxy tepercaya, bukan yang dapat dipalsukan klien di kiri);
//  - tanpa trustProxy header X-Forwarded-* diabaikan sepenuhnya;
//  - Origin tambahan lewat `allowed` (daftar Origin persis, mis. https://forechek.ailo.ai.id).
const last = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean).pop() || '' : '')

function isSameOrigin({ origin, host, forwardedHost, forwardedProto, trustProxy = false, allowed = [] }) {
  if (!origin) return true
  let u
  try {
    u = new URL(origin)
  } catch {
    return false // termasuk Origin "null"
  }
  if (allowed.includes(origin)) return true
  const ownHost = (trustProxy && last(forwardedHost)) || last(host)
  if (!ownHost || u.host.toLowerCase() !== ownHost.toLowerCase()) return false
  const proto = trustProxy ? last(forwardedProto) : ''
  if (proto && u.protocol !== `${proto.toLowerCase()}:`) return false
  return true
}

module.exports = { isSameOrigin }
