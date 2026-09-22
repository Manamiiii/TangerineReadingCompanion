import { isValidGeoJsonGeometry } from '../domain/geometry.js'
import {
  READING_MAP_PROVIDER,
  normalizeReadingMapProvider,
} from './mapConfig.js'

const resultCache = new Map()
const nextRequestAtByProvider = new Map()

function normalizedQuery(query) {
  return typeof query === 'string' ? query.normalize('NFKC').trim() : ''
}

function finiteCoordinate(value, minimum, maximum) {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') return null
  const coordinate = Number(value)
  return Number.isFinite(coordinate) && coordinate >= minimum && coordinate <= maximum
    ? coordinate
    : null
}

export function normalizeGeoJsonGeometry(geometry) {
  if (!isValidGeoJsonGeometry(geometry)) return null
  return {
    type: geometry.type,
    coordinates: geometry.coordinates,
  }
}

function normalizedResult({
  id,
  label,
  latitude,
  longitude,
  providerId,
  geometry,
  category,
}) {
  const normalizedLatitude = finiteCoordinate(latitude, -90, 90)
  const normalizedLongitude = finiteCoordinate(longitude, -180, 180)
  if (!label || normalizedLatitude === null || normalizedLongitude === null) return null
  const normalizedGeometry = normalizeGeoJsonGeometry(geometry)
  return {
    id: String(id || `${providerId}:${normalizedLatitude}:${normalizedLongitude}`),
    label: String(label),
    latitude: normalizedLatitude,
    longitude: normalizedLongitude,
    providerId,
    ...(normalizedGeometry ? { geometry: normalizedGeometry } : {}),
    ...(category ? { category: String(category) } : {}),
  }
}

export function normalizeNominatimResults(payload) {
  if (!Array.isArray(payload)) return []
  return payload
    .map((item) => {
      const names = item?.namedetails || {}
      const chineseName = names['name:zh-Hans']
        || names['name:zh_CN']
        || names['name:zh']
        || ''
      const displayName = String(item?.display_name || '')
      const label = chineseName && !displayName.includes(chineseName)
        ? `${chineseName} · ${displayName}`
        : displayName
      return normalizedResult({
        id: item?.place_id,
        label,
        latitude: item?.lat,
        longitude: item?.lon,
        providerId: READING_MAP_PROVIDER.INTERNATIONAL,
        geometry: item?.geojson,
        category: [item?.category || item?.class, item?.type].filter(Boolean).join('/'),
      })
    })
    .filter(Boolean)
}

export function normalizeTiandituResults(payload) {
  const rawResults = Array.isArray(payload?.pois)
    ? payload.pois
    : Array.isArray(payload?.area)
      ? payload.area
      : payload?.area
        ? [payload.area]
        : []
  return rawResults
    .map((item) => {
      const [longitude, latitude] = String(item?.lonlat || '').split(',')
      const addressParts = [
        item?.name,
        item?.address || item?.eaddress,
        item?.province,
        item?.city,
        item?.county,
      ].filter(Boolean)
      return normalizedResult({
        id: item?.hotPointID || item?.adminCode,
        label: [...new Set(addressParts)].join(' · '),
        latitude,
        longitude,
        providerId: READING_MAP_PROVIDER.DOMESTIC,
      })
    })
    .filter(Boolean)
}

async function waitForProviderRateLimit(providerId, signal) {
  const start = Math.max(Date.now(), nextRequestAtByProvider.get(providerId) || 0)
  nextRequestAtByProvider.set(providerId, start + 1000)
  const waitMs = start - Date.now()
  if (waitMs > 0) await new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException('地图搜索已取消', 'AbortError')) }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve() }, waitMs)
    signal?.addEventListener('abort', abort, { once: true })
  })
  signal?.throwIfAborted()
}

async function fetchJson(url, fetchImpl, signal) {
  const controller = new AbortController()
  const abort = () => controller.abort(signal.reason)
  signal?.throwIfAborted()
  signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('地图搜索超时，请重试', 'TimeoutError')), 20000)
  try {
  const response = await fetchImpl(url, {
    signal: controller.signal,
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7',
    },
  })
  if (!response.ok) throw Object.assign(new Error(`地图服务请求失败（${response.status}）`), { status: response.status })
  const payload = await response.json()
  controller.signal.throwIfAborted()
  return payload
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason
    throw error
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}

export async function searchReadingPlaces({
  providerId,
  query,
  tiandituToken = '',
  fetchImpl = globalThis.fetch,
  signal,
}) {
  signal?.throwIfAborted()
  const searchQuery = normalizedQuery(query)
  if (!searchQuery) throw new Error('请输入地图搜索词')
  if (searchQuery.length > 120) throw new Error('地图搜索词不能超过 120 个字符')
  if (typeof fetchImpl !== 'function') throw new Error('当前环境无法访问地图搜索服务')

  const provider = normalizeReadingMapProvider(providerId)
  const token = tiandituToken.trim()
  if (provider === READING_MAP_PROVIDER.DOMESTIC && !token) {
    throw new Error('国内地图搜索需要先填写天地图浏览器端 Key')
  }
  const cacheKey = `${provider}:${token}:${searchQuery.toLocaleLowerCase()}`
  if (resultCache.has(cacheKey)) return resultCache.get(cacheKey)

  let results
  await waitForProviderRateLimit(provider, signal)
  if (provider === READING_MAP_PROVIDER.DOMESTIC) {
    const postStr = JSON.stringify({
      keyWord: searchQuery,
      level: 8,
      mapBound: '-180,-90,180,90',
      queryType: 7,
      start: 0,
      count: 5,
      show: 2,
    })
    const url = `https://api.tianditu.gov.cn/v2/search?postStr=${encodeURIComponent(postStr)}&type=query&tk=${encodeURIComponent(token)}`
    results = normalizeTiandituResults(await fetchJson(url, fetchImpl, signal))
  } else {
    const parameters = new URLSearchParams({
      q: searchQuery,
      format: 'jsonv2',
      'accept-language': 'zh-CN,zh-Hans,zh,en',
      addressdetails: '1',
      namedetails: '1',
      polygon_geojson: '1',
      polygon_threshold: '0.002',
      limit: '5',
    })
    const url = `https://nominatim.openstreetmap.org/search?${parameters}`
    results = normalizeNominatimResults(await fetchJson(url, fetchImpl, signal))
  }
  signal?.throwIfAborted()
  resultCache.set(cacheKey, results)
  while (resultCache.size > 30) resultCache.delete(resultCache.keys().next().value)
  return results
}

export function clearMapSearchCache() { resultCache.clear() }
