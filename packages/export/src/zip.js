'use strict'

// ZIP minimal (metode STORE, tanpa kompresi, tanpa dependensi). Nama berkas harus relatif, tanpa ".." atau "/" awal.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function assertSafeName(name) {
  if (typeof name !== 'string' || !name || name.startsWith('/') || name.includes('\\') || name.split('/').some((p) => p === '..' || p === '' || p === '.')) throw new Error(`nama berkas ZIP tidak aman: ${name}`)
}

function dosDateTime(d) {
  const time = (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1)
  const date = ((Math.max(d.getUTCFullYear(), 1980) - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate()
  return { time, date }
}

// files: [{name, data: Buffer|string}] -> Buffer ZIP
function createZip(files, date = new Date()) {
  const { time, date: day } = dosDateTime(date)
  const locals = []
  const centrals = []
  let offset = 0
  const seen = new Set()
  for (const f of files) {
    assertSafeName(f.name)
    if (seen.has(f.name)) throw new Error(`nama berkas ZIP ganda: ${f.name}`)
    seen.add(f.name)
    const name = Buffer.from(f.name, 'utf8')
    const data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(String(f.data), 'utf8')
    const crc = crc32(data)
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(0, 8)
    lh.writeUInt16LE(time, 10); lh.writeUInt16LE(day, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22)
    lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28)
    locals.push(lh, name, data)
    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(0, 10)
    ch.writeUInt16LE(time, 12); ch.writeUInt16LE(day, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24)
    ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42)
    centrals.push(ch, name)
    offset += lh.length + name.length + data.length
  }
  const cd = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, end])
}

// Pembaca untuk verifikasi/uji: memeriksa struktur dan CRC. Mengembalikan [{name, data}] atau melempar.
function readZip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (eocd < 0) throw new Error('bukan ZIP')
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  const out = []
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('direktori pusat rusak')
    const crc = buf.readUInt32LE(p + 16)
    const size = buf.readUInt32LE(p + 24)
    const nl = buf.readUInt16LE(p + 28)
    const el = buf.readUInt16LE(p + 30)
    const cl = buf.readUInt16LE(p + 32)
    const lo = buf.readUInt32LE(p + 42)
    const name = buf.slice(p + 46, p + 46 + nl).toString('utf8')
    assertSafeName(name)
    if (buf.readUInt32LE(lo) !== 0x04034b50) throw new Error('header lokal rusak')
    const start = lo + 30 + buf.readUInt16LE(lo + 26) + buf.readUInt16LE(lo + 28)
    const data = buf.slice(start, start + size)
    if (crc32(data) !== crc) throw new Error(`CRC tidak cocok: ${name}`)
    out.push({ name, data })
    p += 46 + nl + el + cl
  }
  return out
}

module.exports = { createZip, readZip, crc32 }
