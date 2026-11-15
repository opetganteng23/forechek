'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { validateSchema, createToolRegistry, ToolError, hashInput, readSectionTool } = require('../index')

const schema = {
  type: 'object',
  properties: { q: { type: 'string', minLength: 2, maxLength: 5 }, n: { type: 'integer', minimum: 1, maximum: 3 }, mode: { type: 'string', enum: ['a', 'b'] }, tags: { type: 'array', items: { type: 'string' }, maxItems: 2 } },
  required: ['q']
}

test('validateSchema: tipe, batas, enum, array, wajib, properti asing ditolak', () => {
  assert.deepEqual(validateSchema(schema, { q: 'ab' }), [])
  assert.ok(validateSchema(schema, {}).some((e) => /q wajib/.test(e)))
  assert.ok(validateSchema(schema, { q: 'a' }).length)
  assert.ok(validateSchema(schema, { q: 'abcdef' }).length)
  assert.ok(validateSchema(schema, { q: 'ab', n: 1.5 }).length)
  assert.ok(validateSchema(schema, { q: 'ab', n: 4 }).length)
  assert.ok(validateSchema(schema, { q: 'ab', mode: 'z' }).length)
  assert.ok(validateSchema(schema, { q: 'ab', tags: ['x', 'y', 'z'] }).length)
  assert.ok(validateSchema(schema, { q: 'ab', projectId: 'orang-lain' }).some((e) => /tidak dikenal/.test(e)))
  assert.ok(validateSchema(schema, 'bukan objek').length)
  assert.ok(validateSchema(schema, { q: { $ne: '' } }).length)
})

const ctx = { userId: 'u1', projectId: 'p1' }
const echo = { name: 'echo', description: 'x', inputSchema: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] }, handler: async (i) => ({ got: i.q }) }

test('registry: sukses, definisi bernama dan additionalProperties=false', async () => {
  const r = createToolRegistry([echo])
  const defs = r.definitions()
  assert.equal(defs[0].name, 'echo')
  assert.equal(defs[0].input_schema.additionalProperties, false)
  const out = await r.execute('echo', { q: 'hai' }, ctx)
  assert.equal(out.ok, true)
  assert.deepEqual(out.output, { got: 'hai' })
  assert.equal(out.inputHash, hashInput({ q: 'hai' }))
})

test('registry: tool tidak dikenal, input tidak valid, tanpa konteks otorisasi', async () => {
  const r = createToolRegistry([echo])
  assert.equal((await r.execute('delete_project', {}, ctx)).error.code, 'TOOL_NOT_FOUND')
  assert.equal((await r.execute('echo', {}, ctx)).error.code, 'TOOL_INVALID_INPUT')
  assert.equal((await r.execute('echo', { q: 'a', projectId: 'x' }, ctx)).error.code, 'TOOL_INVALID_INPUT')
  assert.equal((await r.execute('echo', { q: 'a' }, {})).error.code, 'TOOL_FORBIDDEN')
})

test('registry: timeout, retry hanya untuk galat retryable, galat internal tidak bocor', async () => {
  let calls = 0
  const slow = { name: 'slow', description: 'x', inputSchema: { type: 'object', properties: {} }, timeoutMs: 30, handler: () => new Promise((r) => setTimeout(r, 500)) }
  const flaky = { name: 'flaky', description: 'x', inputSchema: { type: 'object', properties: {} }, retries: 2, handler: async () => { calls++; if (calls < 3) throw new ToolError('TMP', 'sementara', { retryable: true }); return { ok: calls } } }
  const boom = { name: 'boom', description: 'x', inputSchema: { type: 'object', properties: {} }, retries: 2, handler: async () => { calls += 100; throw new Error('rahasia: mongodb://user:pass@host') } }
  const r = createToolRegistry([slow, flaky, boom])
  assert.equal((await r.execute('slow', {}, ctx)).error.code, 'TOOL_TIMEOUT')
  const f = await r.execute('flaky', {}, ctx)
  assert.equal(f.ok, true)
  assert.equal(calls, 3)
  calls = 0
  const b = await r.execute('boom', {}, ctx)
  assert.equal(b.error.code, 'TOOL_ERROR')
  assert.ok(!JSON.stringify(b).includes('mongodb'))
  assert.equal(calls, 100, 'galat non-retryable tidak diulang')
})

test('registry: keluaran terlalu besar dipotong', async () => {
  const big = { name: 'big', description: 'x', inputSchema: { type: 'object', properties: {} }, handler: async () => ({ t: 'a'.repeat(50000) }) }
  const out = await createToolRegistry([big]).execute('big', {}, ctx)
  assert.equal(out.ok, true)
  assert.equal(out.truncated, true)
})

test('registry: definisi tidak lengkap atau ganda ditolak', () => {
  assert.throws(() => createToolRegistry([{ name: 'x' }]))
  assert.throws(() => createToolRegistry([echo, echo]))
})

test('read_section: membaca bagian milik konteks sesi; parameter projectId dari model ditolak', async () => {
  const { parseManuscript } = require('@publication-prepare/manuscript')
  const src = '# T\n\n## Abstract\nHalo dunia.\n\n## Introduction\nIsi.\n'
  const version = { number: 3, source: src, parse: parseManuscript(src, 'markdown') }
  const seen = []
  const reader = { async getCurrentVersion(userId, projectId) { seen.push([userId, projectId]); return version } }
  const r = createToolRegistry([readSectionTool])
  const ok = await r.execute('read_section', { section: 'abstract' }, { userId: 'u1', projectId: 'p1', reader })
  assert.equal(ok.output.text, 'Halo dunia.')
  assert.equal(ok.output.versionNumber, 3)
  assert.deepEqual(seen, [['u1', 'p1']])
  const miss = await r.execute('read_section', { section: 'results' }, { userId: 'u1', projectId: 'p1', reader })
  assert.equal(miss.error.code, 'SECTION_NOT_FOUND')
  assert.match(miss.error.message, /Abstract/)
  const hijack = await r.execute('read_section', { section: 'abstract', projectId: 'p2' }, { userId: 'u1', projectId: 'p1', reader })
  assert.equal(hijack.error.code, 'TOOL_INVALID_INPUT')
  assert.equal(seen.length, 2, 'handler tidak dipanggil untuk input yang ditolak')
})
