const STATIC_CACHE_PREFIX = 'tangerine-reading-companion-static-'
const STATIC_CACHE = `${STATIC_CACHE_PREFIX}__BUILD_VERSION__`
const PRECACHE = /* __PRECACHE__ */ []
const APP_ROOT = new URL('./', self.location.href)
const APP_URLS = new Set(PRECACHE.map(url => new URL(url, APP_ROOT).href))
const ASSET_ROOT = new URL('assets/', APP_ROOT).href
const DATA_ROOT = new URL('presets/reading-companion/', APP_ROOT).href

async function buildCaches() {
  return (await caches.keys()).filter(key => key.startsWith(STATIC_CACHE_PREFIX))
}

async function offlineStatus(appAssets) {
  const available = await buildCaches()
  const keys = [...available.filter(key => key === STATIC_CACHE), ...available.filter(key => key !== STATIC_CACHE).reverse()]
  const assets = Array.isArray(appAssets) ? appAssets : []
  if (assets.length > 10 || assets.some(url => typeof url !== 'string' || !url.startsWith(ASSET_ROOT) || new URL(url).search)) {
    return { ready: false }
  }
  for (const key of keys) {
    const match = url => caches.match(url, { cacheName: key, ignoreVary: true })
    if (assets.length && !(await Promise.all(assets.map(match))).every(Boolean)) continue
    const manifest = await match(new URL('offline-manifest.json', APP_ROOT))
    const files = manifest ? (await manifest.json()).files : key === STATIC_CACHE ? PRECACHE : []
    const ready = Array.isArray(files) && files.length > 0
      && (await Promise.all(files.map(match))).every(Boolean)
    return { ready, updateAvailable: key !== STATIC_CACHE, expired: !ready }
  }
  return { ready: false, updateAvailable: true, expired: true }
}

async function resourceUnavailable(event, status = 409) {
  const client = event.clientId && await self.clients.get(event.clientId)
  client?.postMessage({ type: 'BUILD_RESOURCE_MISSING' })
  return new Response('This page version is unavailable. Refresh to use the current version.', { status })
}

async function cachedBuildResource(event, legacy = false) {
  for (const key of (await buildCaches()).reverse()) {
    if (legacy && key === STATIC_CACHE) continue
    const cached = await caches.match(event.request, { cacheName: key, ignoreVary: true })
    if (cached) return cached
  }
  // Never send legacy fixed paths to the latest deployment. Fingerprinted URLs
  // can only retrieve those exact bytes; missing old versions require a refresh.
  if (legacy) return resourceUnavailable(event)
  try {
    const response = await fetch(event.request)
    return response.ok ? response : resourceUnavailable(event, response.status)
  } catch {
    return resourceUnavailable(event, 503)
  }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try { await (await caches.open(STATIC_CACHE)).addAll(PRECACHE) }
    catch (error) { await caches.delete(STATIC_CACHE); throw error }
  })())
})
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting()
  if (event.data?.type === 'OFFLINE_STATUS') {
    event.waitUntil(offlineStatus(event.data.appAssets)
      .then(status => event.ports[0]?.postMessage(status))
      .catch(() => event.ports[0]?.postMessage({ ready: false })))
  }
})
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await buildCaches()
    const old = keys.slice(0, keys.indexOf(STATIC_CACHE))
    // Retain the previous build, excluding any newer build still installing.
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
    event.respondWith(caches.match(new URL('index.html', APP_ROOT), { cacheName: STATIC_CACHE, ignoreVary: true })
      .then(cached => cached || fetch(event.request)))
  } else if (!url.search && (url.href.startsWith(ASSET_ROOT)
    || (url.href.startsWith(DATA_ROOT) && /\.[a-f0-9]{64}\.json$/.test(url.pathname)))) {
    event.respondWith(cachedBuildResource(event))
  } else if (APP_URLS.has(url.href)) {
    event.respondWith(caches.match(event.request, { cacheName: STATIC_CACHE, ignoreVary: true })
      .then(cached => cached || fetch(event.request)))
  } else if (!url.search && url.href.startsWith(DATA_ROOT)
    && /^[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(url.href.slice(DATA_ROOT.length))) {
    event.respondWith(cachedBuildResource(event, true))
  }
  // User input, OCR, remote services and images outside the build are not cached.
})
