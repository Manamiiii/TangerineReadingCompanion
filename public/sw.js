const STATIC_CACHE_PREFIX = 'tangerine-reading-companion-static-'
const STATIC_CACHE = `${STATIC_CACHE_PREFIX}__BUILD_VERSION__`
const PRECACHE = /* __PRECACHE__ */ []
const APP_ROOT = new URL('./', self.location.href)
const APP_URLS = new Set(PRECACHE.map(url => new URL(url, APP_ROOT).href))

self.addEventListener('install', event => {
  event.waitUntil(caches.open(STATIC_CACHE).then(cache => cache.addAll(PRECACHE)))
})
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting()
  if (event.data?.type === 'OFFLINE_STATUS') {
    event.waitUntil(caches.open(STATIC_CACHE).then(async cache => {
      const entries = await Promise.all(PRECACHE.map(url => cache.match(url, { ignoreVary: true })))
      event.ports[0]?.postMessage({ ready: PRECACHE.length > 0 && entries.every(Boolean) })
    }))
  }
})
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const old = (await caches.keys()).filter(key => key.startsWith(STATIC_CACHE_PREFIX) && key !== STATIC_CACHE)
    // Keep one prior build for tabs with older chunks, never touch other apps or DBs.
    await Promise.all(old.slice(0, -1).map(key => caches.delete(key)))
    await self.clients.claim()
  })())
})
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.origin !== APP_ROOT.origin || !url.pathname.startsWith(APP_ROOT.pathname)) return
  if (event.request.mode === 'navigate') {
    // Query strings and fragments never become persistent cache keys.
    event.respondWith(caches.open(STATIC_CACHE).then(async cache => (
      await cache.match(new URL('index.html', APP_ROOT), { ignoreVary: true }) || fetch(event.request)
    )))
  } else if (APP_URLS.has(url.href)) {
    event.respondWith(caches.open(STATIC_CACHE).then(async cache => (
      await cache.match(event.request, { ignoreVary: true }) || fetch(event.request)
    )))
  } else if (!url.search && url.pathname.startsWith(new URL('assets/', APP_ROOT).pathname)) {
    event.respondWith((async () => {
      const keys = (await caches.keys()).filter(key => key.startsWith(STATIC_CACHE_PREFIX))
      for (const key of keys) {
        const cached = await (await caches.open(key)).match(event.request, { ignoreVary: true })
        if (cached) return cached
      }
      return fetch(event.request)
    })())
  }
  // User input, OCR, remote services and images outside the build are not cached.
})
