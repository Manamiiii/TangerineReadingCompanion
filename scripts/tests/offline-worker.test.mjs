import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'

test('offline worker caches only build files and activates updates only on explicit request', async () => {
  const handlers = {}
  let activations = 0
  const cached = new Map()
  const source = (await readFile(new URL('../../public/sw.js', import.meta.url), 'utf8'))
    .replace('__BUILD_VERSION__', 'test')
    .replace('/* __PRECACHE__ */ []', '["./index.html","./assets/app.js"]')
  const cache = {
    addAll: async urls => urls.forEach(url => cached.set(new URL(url, 'https://example.com/app/').href, { ok: true })),
    match: async request => cached.get(new URL(request.url || request, 'https://example.com/app/').href),
  }
  runInNewContext(source, {
    URL,
    self: {
      location: { href: 'https://example.com/app/sw.js' },
      addEventListener: (type, handler) => { handlers[type] = handler },
      skipWaiting: () => activations++,
      clients: { claim: async () => {} },
    },
    caches: { open: async () => cache, keys: async () => ['tangerine-reading-companion-static-test'] },
    fetch: async () => { throw new Error('offline') },
  })
  let work
  handlers.install({ waitUntil: promise => { work = promise } })
  await work
  assert.equal(cached.size, 2)
  assert.equal(activations, 0)
  handlers.message({ data: { type: 'ACTIVATE_UPDATE' } })
  assert.equal(activations, 1)
  for (const request of [
    { method: 'POST', url: 'https://example.com/app/share' },
    { method: 'GET', url: 'https://example.com/app/private?text=raw' },
    { method: 'GET', url: 'https://external.test/model' },
  ]) {
    handlers.fetch({ request, respondWith: () => assert.fail('must not intercept private or external content') })
  }
  handlers.fetch({ request: { method: 'GET', mode: 'navigate', url: 'https://example.com/app/?raw=private' }, respondWith: promise => { work = promise } })
  assert.deepEqual(await work, { ok: true })
  assert.equal(cached.size, 2)
})
