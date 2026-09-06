import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'

const template = await readFile(new URL('../../public/sw.js', import.meta.url), 'utf8')
const root = 'https://example.com/reader/'
const prefix = 'tangerine-reading-companion-static-'
const absolute = value => new URL(value.url || value, root).href
const dataPath = version => `./presets/reading-companion/story.${version.repeat(64)}.json`

function worker(version, storage, { failInstall = false } = {}) {
  const files = ['./index.html', `./assets/app-${version}.js`, dataPath(version), './offline-manifest.json']
  const handlers = {}
  const notices = []
  const cacheApi = {
    keys: async () => [...storage.keys()],
    delete: async key => storage.delete(key),
    match: async (request, { cacheName }) => storage.get(cacheName)?.get(absolute(request))?.clone(),
    open: async key => {
      if (!storage.has(key)) storage.set(key, new Map())
      const entries = storage.get(key)
      return {
        match: async request => entries.get(absolute(request))?.clone(),
        addAll: async urls => {
          if (failInstall) throw new Error('synthetic install failure')
          for (const url of urls) entries.set(absolute(url), new Response(url.endsWith('offline-manifest.json')
            ? JSON.stringify({ version, files }) : `${version}:${url}`))
        },
      }
    },
  }
  let networkRequests = 0
  runInNewContext(template.replace('__BUILD_VERSION__', version).replace('/* __PRECACHE__ */ []', JSON.stringify(files)), {
    URL, Response,
    self: {
      location: { href: root + 'sw.js' },
      addEventListener: (type, handler) => { handlers[type] = handler },
      clients: { claim: async () => {}, get: async () => ({ postMessage: value => notices.push(value) }) },
      skipWaiting: async () => {},
    },
    caches: cacheApi,
    fetch: async () => { networkRequests++; return new Response('missing', { status: 404 }) },
  })
  return {
    notices,
    get networkRequests() { return networkRequests },
    async lifecycle(type) { let work; handlers[type]({ waitUntil: promise => { work = promise } }); await work },
    async fetch(url) {
      let response
      handlers.fetch({ request: { method: 'GET', url: absolute(url) }, clientId: 'test-tab', respondWith: promise => { response = promise } })
      return response
    },
    async status(version) {
      let result, work
      handlers.message({ data: { type: 'OFFLINE_STATUS', appAssets: [absolute(`./assets/app-${version}.js`)] },
        ports: [{ postMessage: value => { result = value } }], waitUntil: promise => { work = promise } })
      await work
      return result
    },
  }
}

test('new worker serves old fingerprinted data and checks the old page cache', async () => {
  const storage = new Map()
  const a = worker('a', storage)
  await a.lifecycle('install')
  await a.lifecycle('activate')
  const b = worker('b', storage)
  await b.lifecycle('install')
  await b.lifecycle('activate')
  assert.equal(await (await b.fetch(dataPath('a'))).text(), 'a:' + dataPath('a'))
  assert.equal(await (await b.fetch(dataPath('b'))).text(), 'b:' + dataPath('b'))
  assert.equal(b.networkRequests, 0)
  const status = await b.status('a')
  assert.equal(status.ready, true)
  assert.equal(status.updateAvailable, true)
  storage.get(prefix + 'a').delete(absolute(dataPath('a')))
  assert.equal((await b.status('a')).expired, true)
})

test('retired builds fail closed and never fall back to current data', async () => {
  const storage = new Map([['other-app', new Map()]])
  for (const version of ['a', 'b', 'c']) {
    const instance = worker(version, storage)
    await instance.lifecycle('install')
    await instance.lifecycle('activate')
  }
  const c = worker('c', storage)
  assert.equal(storage.has(prefix + 'a'), false)
  assert.equal(storage.has(prefix + 'b'), true)
  assert.equal(storage.has('other-app'), true)
  assert.equal((await c.fetch(dataPath('a'))).status, 404)
  assert.equal((await c.status('a')).expired, true)
  assert.equal(storage.has(prefix + 'a'), false)
  const count = c.networkRequests
  assert.equal((await c.fetch('./presets/reading-companion/story.json')).status, 409)
  assert.equal(c.networkRequests, count)
  assert.equal(c.notices.at(-1).type, 'BUILD_RESOURCE_MISSING')
})

test('activation does not mistake a newer waiting cache for the previous build', async () => {
  const storage = new Map()
  const a = worker('a', storage), b = worker('b', storage), c = worker('c', storage)
  await a.lifecycle('install')
  await b.lifecycle('install')
  await c.lifecycle('install')
  await b.lifecycle('activate')
  assert.equal(storage.has(prefix + 'a'), true)
  assert.equal(storage.has(prefix + 'c'), true)
  await c.lifecycle('activate')
  assert.equal(storage.has(prefix + 'a'), false)
  assert.equal(storage.has(prefix + 'b'), true)
})

test('failed installation discards only its incomplete cache', async () => {
  const storage = new Map()
  const a = worker('a', storage)
  await a.lifecycle('install')
  const b = worker('b', storage, { failInstall: true })
  await assert.rejects(b.lifecycle('install'), /synthetic/)
  assert.equal(storage.has(prefix + 'a'), true)
  assert.equal(storage.has(prefix + 'b'), false)
})

test('legacy fixed paths use only their retained old cache', async () => {
  const url = './presets/reading-companion/story.json'
  const storage = new Map([[prefix + 'legacy', new Map([[absolute(url), new Response('legacy data')]])]])
  const a = worker('a', storage)
  await a.lifecycle('install')
  await a.lifecycle('activate')
  assert.equal(await (await a.fetch(url)).text(), 'legacy data')
  assert.equal(a.networkRequests, 0)
})
