import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeReadingExcerpt, answerReadingQuestion } from '../../src/features/reading-companion/model/modelAdapter.js'
import { cacheModelResult, clearModelSession, readCachedModelResult, requestModelJson } from '../../src/features/model/modelClient.js'
import { createAsyncTask } from '../../src/platform/asyncTask.js'

const options = { endpoint: 'https://model.example/chat', model: 'boundary-test', apiKey: 'synthetic-key' }
const response = payload => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] }) })

test('model names must occur in the excerpt with whole English word boundaries', async () => {
  const result = await analyzeReadingExcerpt({ ...options, excerpt: 'Alice visited Malice.', fetchImpl: async () => response({ candidates: [
    { name: 'Alice', kind: 'person' }, { name: 'Bob', kind: 'person' }, { name: 'lice', kind: 'concept' },
  ] }) })
  assert.deepEqual(result.map(item => item.name), ['Alice'])
})

test('answers cannot publish invented plot or altered source quotes', async () => {
  for (const payload of [
    { answer: '阿甲在决斗中杀死了阿乙。' },
    { evidence: [{ sourceId: 'excerpt', quote: '阿甲杀死了阿乙。' }] },
    { evidence: [{ sourceId: 'invented', quote: '阿甲走进花园。' }] },
  ]) {
    await assert.rejects(answerReadingQuestion({ ...options, question: '发生了什么？', excerpt: '阿甲走进花园。', fetchImpl: async () => response(payload) }), /依据|停止显示/)
  }
  await assert.rejects(answerReadingQuestion({ ...options, question: '这里发生了什么？', fetchImpl: () => assert.fail('must not request without evidence') }), /请先提供/)
})

test('session clearing aborts response-body work and removes cached raw context', async () => {
  cacheModelResult('raw-context', { text: 'synthetic-input' })
  let releaseBody
  let bodyStarted
  const started = new Promise(resolve => { bodyStarted = resolve })
  const pending = requestModelJson({ ...options, fetchImpl: async () => ({ ok: true, json: () => {
    bodyStarted()
    return new Promise(resolve => { releaseBody = resolve })
  } }) })
  const rejected = assert.rejects(pending, { name: 'AbortError' })
  await started
  clearModelSession()
  assert.equal(readCachedModelResult('raw-context'), null)
  releaseBody({ choices: [{ message: { content: '{"answer":"late"}' } }] })
  await rejected
})

test('request timeout remains active while reading the response body', async () => {
  const originalSetTimeout = globalThis.setTimeout
  const originalClearTimeout = globalThis.clearTimeout
  let expire
  let cleared = false
  globalThis.setTimeout = callback => { expire = callback; return 123 }
  globalThis.clearTimeout = () => { cleared = true }
  try {
    await assert.rejects(requestModelJson({ ...options, fetchImpl: async () => ({ ok: true, json: async () => {
      assert.equal(cleared, false)
      expire()
      return {}
    } }) }), { name: 'AbortError' })
    assert.equal(cleared, true)
  } finally {
    globalThis.setTimeout = originalSetTimeout
    globalThis.clearTimeout = originalClearTimeout
  }
})

test('replacing a task invalidates results even when transport ignores cancellation', () => {
  const task = createAsyncTask()
  const old = task.start()
  const current = task.start()
  assert.equal(old.signal.aborted, true)
  assert.equal(old.isCurrent(), false)
  assert.equal(current.isCurrent(), true)
  task.cancel()
  assert.equal(current.isCurrent(), false)
})
