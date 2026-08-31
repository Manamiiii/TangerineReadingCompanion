import assert from 'node:assert/strict'
import test from 'node:test'
import { createInputRevision, normalizeReadingInput, INPUT_LIMITS } from '../../src/platform/readingInput.js'
import { createWebPlatform } from '../../src/platform/webPlatform.js'

test('input contract drops extra fields and rejects unsafe links or oversized payloads', () => {
  assert.deepEqual(normalizeReadingInput({ kind: 'text', source: 'manual', text: '当前段落', apiKey: 'secret' }), {
    kind: 'text', source: 'manual', text: '当前段落',
  })
  for (const url of ['javascript:alert(1)', 'file:///private', 'https://user:pass@example.com']) {
    assert.throws(() => normalizeReadingInput({ kind: 'link', source: 'share', url }))
  }
  assert.throws(() => normalizeReadingInput({ kind: 'text', source: 'manual', text: 'x'.repeat(INPUT_LIMITS.text + 1) }))
  assert.throws(() => normalizeReadingInput({ kind: 'image', source: 'file', blob: new Blob(['svg'], { type: 'image/svg+xml' }) }))
  const blob = new Blob(['image'], { type: 'image/png' })
  assert.equal(normalizeReadingInput({ kind: 'image', source: 'share', blob }).blob, blob)
  assert.equal(normalizeReadingInput({ kind: 'link', source: 'share', url: 'https://example.com' }).url, 'https://example.com/')
})

test('replacement invalidates late async results without storing payloads', () => {
  const revision = createInputRevision()
  const first = revision.next()
  assert.equal(revision.isCurrent(first), true)
  revision.next()
  assert.equal(revision.isCurrent(first), false)
})

test('web clipboard handles missing capability and rejected permission without exposing native errors', async () => {
  await assert.rejects(createWebPlatform({}).clipboard.read(), /粘贴/)
  await assert.rejects(createWebPlatform({ navigator: { clipboard: { readText: async () => { throw new Error('sensitive') } } } }).clipboard.read(), /无法读取剪贴板/)
  const platform = createWebPlatform({ navigator: { clipboard: { readText: async () => '当前段落' } } })
  assert.deepEqual(await platform.clipboard.read(), { kind: 'text', source: 'clipboard', text: '当前段落' })
  assert.equal(platform.capabilities.capture, false)
  assert.equal(platform.capabilities.shareInbox, false)
  await assert.rejects(platform.capture.region(), /原生/)
})
