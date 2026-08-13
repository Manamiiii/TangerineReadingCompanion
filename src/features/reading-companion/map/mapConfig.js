export const READING_MAP_DEFAULT_VIEW = Object.freeze({
  center: [20, 0],
  zoom: 2,
})

export const READING_MAP_PROVIDER = Object.freeze({
  INTERNATIONAL: 'openstreetmap',
  DOMESTIC: 'tianditu',
})

export const READING_MAP_STORAGE_KEYS = Object.freeze({
  provider: 'reader-map-provider',
  tiandituToken: 'reader-map-tianditu-token',
})

export const READING_MAP_PROVIDERS = Object.freeze({
  [READING_MAP_PROVIDER.INTERNATIONAL]: Object.freeze({
    id: READING_MAP_PROVIDER.INTERNATIONAL,
    label: '国际地图',
    description: 'OpenStreetMap · 免 Key，国内网络可能需要 VPN',
    requiresToken: false,
  }),
  [READING_MAP_PROVIDER.DOMESTIC]: Object.freeze({
    id: READING_MAP_PROVIDER.DOMESTIC,
    label: '国内地图',
    description: '天地图 · 国内可访问，需要浏览器端 Key',
    requiresToken: true,
  }),
})

const COMMON_TILE_OPTIONS = Object.freeze({
  minZoom: 2,
  maxZoom: 18,
  updateWhenIdle: true,
  updateWhenZooming: false,
  keepBuffer: 1,
})

export function normalizeReadingMapProvider(providerId) {
  return READING_MAP_PROVIDERS[providerId]
    ? providerId
    : READING_MAP_PROVIDER.INTERNATIONAL
}

export function readingMapTileSources(providerId, tiandituToken = '') {
  const normalizedProvider = normalizeReadingMapProvider(providerId)
  if (normalizedProvider === READING_MAP_PROVIDER.DOMESTIC) {
    const token = tiandituToken.trim()
    if (!token) return []
    const encodedToken = encodeURIComponent(token)
    const commonUrl = [
      'SERVICE=WMTS',
      'REQUEST=GetTile',
      'VERSION=1.0.0',
      'STYLE=default',
      'TILEMATRIXSET=w',
      'FORMAT=tiles',
      'TILEMATRIX={z}',
      'TILEROW={y}',
      'TILECOL={x}',
      `tk=${encodedToken}`,
    ].join('&')
    const attribution = '&copy; <a href="https://www.tianditu.gov.cn/" target="_blank" rel="noreferrer">天地图</a>'
    return [
      {
        usageKind: 'base',
        url: `https://t{s}.tianditu.gov.cn/vec_w/wmts?LAYER=vec&${commonUrl}`,
        options: {
          ...COMMON_TILE_OPTIONS,
          subdomains: '01234567',
          attribution,
        },
      },
      {
        usageKind: 'labels',
        url: `https://t{s}.tianditu.gov.cn/cva_w/wmts?LAYER=cva&${commonUrl}`,
        options: {
          ...COMMON_TILE_OPTIONS,
          subdomains: '01234567',
          attribution,
        },
      },
    ]
  }

  return [{
    usageKind: 'base',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: {
      ...COMMON_TILE_OPTIONS,
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    },
  }]
}
