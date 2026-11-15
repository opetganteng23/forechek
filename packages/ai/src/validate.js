'use strict'
// Validator JSON Schema minimal untuk input tool (MTS 38.2 C). Sengaja kecil: hanya kata kunci yang dipakai tool kita.
// Mengembalikan daftar pesan galat (kosong = valid). additionalProperties default DITOLAK agar model tidak bisa
// menyelundupkan parameter (mis. projectId lain).
function typeOf(v) {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  return typeof v
}

function validateSchema(schema, value, path = 'input') {
  const errors = []
  const t = typeOf(value)
  const want = schema.type
  if (want === 'integer') {
    if (!Number.isInteger(value)) return [`${path} harus berupa bilangan bulat`]
  } else if (want === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return [`${path} harus berupa angka`]
  } else if (want && t !== want) {
    return [`${path} harus bertipe ${want}`]
  }
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path} harus salah satu dari: ${schema.enum.join(', ')}`)
  if (want === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path} minimal ${schema.minLength} karakter`)
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path} maksimal ${schema.maxLength} karakter`)
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${path} format tidak valid`)
  }
  if (want === 'integer' || want === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path} minimal ${schema.minimum}`)
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path} maksimal ${schema.maximum}`)
  }
  if (want === 'array') {
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path} maksimal ${schema.maxItems} item`)
    if (schema.items) value.forEach((v, i) => errors.push(...validateSchema(schema.items, v, `${path}[${i}]`)))
  }
  if (want === 'object') {
    const props = schema.properties || {}
    for (const key of schema.required || []) if (!(key in value)) errors.push(`${path}.${key} wajib diisi`)
    for (const key of Object.keys(value)) {
      if (props[key]) errors.push(...validateSchema(props[key], value[key], `${path}.${key}`))
      else if (schema.additionalProperties !== true) errors.push(`${path}.${key} tidak dikenal`)
    }
  }
  return errors
}

module.exports = { validateSchema }
