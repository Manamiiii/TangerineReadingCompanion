import assert from 'node:assert/strict'
import test from 'node:test'
import { runOcrWorker } from '../../src/features/ocr/localOcr.js'

test('OCR releases its worker after success and failure', async () => {
  for (const fail of [false, true]) {
    let terminated = 0
    const pending = runOcrWorker(async () => ({
      recognize: async () => { if (fail) throw new Error('synthetic'); return { data: { text: 'recognized' } } },
      terminate: async () => { terminated++ },
    }), new Blob(['synthetic']))
    if (fail) await assert.rejects(pending, /synthetic/)
    else assert.equal((await pending).data.text, 'recognized')
    assert.equal(terminated, 1)
  }
})

test('OCR cancellation releases a running worker and discards late output', async () => {
  const controller = new AbortController()
  let complete
  let started
  const ready = new Promise(resolve => { started = resolve })
  let terminated = 0
  const pending = runOcrWorker(async () => ({
    recognize: () => { started(); return new Promise(resolve => { complete = resolve }) },
    terminate: async () => { terminated++ },
  }), new Blob(['synthetic']), { signal: controller.signal })
  const rejected = assert.rejects(pending, { name: 'AbortError' })
  await ready
  controller.abort()
  await rejected
  assert.equal(terminated, 1)
  complete({ data: { text: 'late' } })
})

test('OCR cancellation during initialization terminates the worker when it arrives', async () => {
  const controller = new AbortController()
  let initialize
  let released
  const terminated = new Promise(resolve => { released = resolve })
  const pending = runOcrWorker(() => new Promise(resolve => { initialize = resolve }), new Blob(['synthetic']), { signal: controller.signal })
  const rejected = assert.rejects(pending, { name: 'AbortError' })
  controller.abort()
  await rejected
  initialize({ recognize: () => assert.fail('cancelled input must not be recognized'), terminate: released })
  await terminated
})
