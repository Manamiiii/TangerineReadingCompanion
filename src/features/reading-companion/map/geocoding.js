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
  const coordinate = Number(value)
  return Number.isFinite(coordinate) && coordinate >= minimum && coordinate <= maximum
    ? coordinate
    : null
}

function coordinateCount(value) {
  if (!Array.isArray(value)) return 0
  if (
    value.length >= 2
    && value.every((item) => typeof item === 'number' && Number.isFinite(item))
  ) {
    const [longitude, latitude] = value
    return longitude >= -180 && longitude <= 180 && latitude >= -90 && latitude <= 90
      ? 1
      : -1
  }
  let count = 0
  for (const item of value) {
    const itemCount = coordinateCount(item)
    if (itemCount < 0) return -1
    count += itemCount
    if (count > 10000) return -1
  }
  return count
}

export function normalizeGeoJsonGeometry(geometry) {
  const validTypes = new Set([
    'Point',
    'LineString',
    'MultiLineString',
    'Polygon',
    'MultiPolygon',
  ])
  if (!geometry || !validTypes.has(geometry.type) || !Array.isArray(geometry.coordinates)) {
    return null
  }
  const count = coordinateCount(geometry.coordinates)
  if (count < 1 || count > 10000) return null
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

async function waitForProviderRateLimit(providerId) {
  const waitMs = Math.max(0, (nextRequestAtByProvider.get(providerId) || 0) - Date.now())
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs))
  nextRequestAtByProvider.set(providerId, Date.now() + 1000)
}

async function fetchJson(url, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7',
    },
  })
  if (!response.ok) throw new Error(`地图服务请求失败（${response.status}）`)
  return response.json()
}

export async function searchReadingPlaces({
  providerId,
  query,
  tiandituToken = '',
  fetchImpl = globalThis.fetch,
}) {
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
  await waitForProviderRateLimit(provider)
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
    results = normalizeTiandituResults(await fetchJson(url, fetchImpl))
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
    results = normalizeNominatimResults(await fetchJson(url, fetchImpl))
  }
  resultCache.set(cacheKey, results)
  return results
}
