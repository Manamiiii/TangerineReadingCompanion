export const READING_PACKAGE_SCHEMA_VERSION = 1

export const SPOILER_RISK = {
  SAFE: 'safe',
  POTENTIAL: 'potential',
  HIGH: 'high',
}

export const SPOILER_GATE_ACTION = {
  DISPLAY: 'display',
  WARN: 'warn',
  CONFIRM_TWICE: 'confirm-twice',
}

export const OBSERVED_ENTITY_KIND = {
  PLACE: 'place',
  PERSON: 'person',
  CONCEPT: 'concept',
  EVENT: 'event',
}

export const OBSERVED_PLACE_KIND = {
  UNKNOWN: 'unknown',
  REAL: 'real',
  FICTIONAL: 'fictional',
  PROTOTYPE: 'prototype',
  APPROXIMATE: 'approximate',
}

export const SPOILER_CATEGORY_LABELS = {
  location_significance: '地点的剧情意义',
  character_relationship: '人物关系',
  character_fate: '人物命运',
  future_event: '后续事件',
  historical_plot_link: '历史与剧情联系',
  route_significance: '路线的剧情意义',
  ending: '结局',
  identity_secret: '身份或核心秘密',
}

const VALID_RISK_LEVELS = new Set(Object.values(SPOILER_RISK))
const VALID_ENTITY_KINDS = new Set(['place', 'person', 'concept', 'event'])
const VALID_PLACE_KINDS = new Set(['real', 'fictional', 'prototype', 'approximate'])
const VALID_OBSERVED_PLACE_KINDS = new Set(Object.values(OBSERVED_PLACE_KIND))
const VALID_GEOMETRY_TYPES = new Set(['point', 'area', 'geojson'])
const VALID_GEOJSON_TYPES = new Set([
  'Point',
  'LineString',
  'MultiLineString',
  'Polygon',
  'MultiPolygon',
])
const VALID_FACT_KINDS = new Set(['spatial', 'character', 'plot', 'history', 'concept'])
const VALID_RISK_CATEGORIES = new Set(Object.keys(SPOILER_CATEGORY_LABELS))

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

export function summarizeReadingPackage(pkg) {
  const preparedEntities = [...new Map([
    ...(Array.isArray(pkg?.onDemandEntities) ? pkg.onDemandEntities : []),
    ...(Array.isArray(pkg?.entities) ? pkg.entities : []),
  ].map((entity, index) => [
    entity?.id || `${entity?.kind || 'unknown'}:${entity?.name || index}`,
    entity,
  ])).values()]
  const kindCounts = preparedEntities.reduce((counts, entity) => {
    if (VALID_ENTITY_KINDS.has(entity?.kind)) counts[entity.kind] += 1
    return counts
  }, {
    place: 0,
    person: 0,
    concept: 0,
    event: 0,
  })
  return {
    entityCount: preparedEntities.length,
    ...kindCounts,
    factCount: Array.isArray(pkg?.facts) ? pkg.facts.length : 0,
    sourceCount: Array.isArray(pkg?.sources) ? pkg.sources.length : 0,
  }
}

export function readingStateKey(editionId) {
  if (!isNonEmptyString(editionId)) {
    throw new Error('阅读状态需要有效的版本 id')
  }
  return `readerState:${editionId}`
}

export function chapterIndex(chapters, chapterId) {
  return chapters.findIndex((chapter) => chapter.id === chapterId)
}

export function normalizeObservedEntityName(name) {
  return typeof name === 'string'
    ? name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase()
    : ''
}

export function observedEntityEncounterChapterIds(entity, chapters = []) {
  const chapterIds = [
    ...(Array.isArray(entity?.encounterChapterIds) ? entity.encounterChapterIds : []),
    entity?.firstSeenChapterId,
  ].filter((chapterId) => isNonEmptyString(chapterId))
  const uniqueChapterIds = [...new Set(chapterIds)]
  if (!Array.isArray(chapters) || chapters.length === 0) return uniqueChapterIds
  return uniqueChapterIds
    .filter((chapterId) => chapterIndex(chapters, chapterId) >= 0)
    .sort((left, right) => chapterIndex(chapters, left) - chapterIndex(chapters, right))
}

export function upsertObservedEntity(observedEntities, candidate, chapters) {
  const current = Array.isArray(observedEntities) ? observedEntities : []
  const name = typeof candidate?.name === 'string' ? candidate.name.normalize('NFKC').trim() : ''
  const normalizedName = normalizeObservedEntityName(name)
  const packageEntityId = isNonEmptyString(candidate?.packageEntityId)
    ? candidate.packageEntityId.trim()
    : ''
  const equivalentNames = new Set(
    (Array.isArray(candidate?.equivalentNames) ? candidate.equivalentNames : [])
      .map(normalizeObservedEntityName)
      .filter(Boolean),
  )
  if (!normalizedName) throw new Error('遇到的名称不能为空')
  if (!VALID_ENTITY_KINDS.has(candidate?.kind)) throw new Error('遇到的内容类型无效')
  const candidateChapterIndex = chapterIndex(chapters, candidate?.firstSeenChapterId)
  if (candidateChapterIndex < 0) throw new Error('首次遇到位置必须是已知章节')

  const existingIndex = current.findIndex((item) => (
    item?.kind === candidate.kind
    && (
      normalizeObservedEntityName(item.name) === normalizedName
      || (packageEntityId && item.packageEntityId === packageEntityId)
      || (packageEntityId && equivalentNames.has(normalizeObservedEntityName(item.name)))
    )
  ))
  if (existingIndex < 0) {
    if (!isNonEmptyString(candidate?.id)) throw new Error('新记录需要稳定 id')
    return [...current, {
      id: candidate.id,
      name,
      kind: candidate.kind,
      firstSeenChapterId: candidate.firstSeenChapterId,
      encounterChapterIds: [candidate.firstSeenChapterId],
      ...(packageEntityId ? { packageEntityId } : {}),
      ...(candidate.kind === OBSERVED_ENTITY_KIND.PLACE
        ? {
            placeKind: VALID_OBSERVED_PLACE_KINDS.has(candidate.placeKind)
              ? candidate.placeKind
              : OBSERVED_PLACE_KIND.UNKNOWN,
          }
        : {}),
    }]
  }

  const existing = current[existingIndex]
  const existingEncounterChapterIds = observedEntityEncounterChapterIds(existing, chapters)
  if (existingEncounterChapterIds.includes(candidate.firstSeenChapterId)) return current
  const encounterChapterIds = [...existingEncounterChapterIds, candidate.firstSeenChapterId]
    .sort((left, right) => chapterIndex(chapters, left) - chapterIndex(chapters, right))
  const firstSeenChapterId = encounterChapterIds[0]
  return current.map((item, index) => (
    index === existingIndex
      ? {
          ...existing,
          name: firstSeenChapterId === candidate.firstSeenChapterId ? name : existing.name,
          firstSeenChapterId,
          encounterChapterIds,
          ...(packageEntityId && !existing.packageEntityId ? { packageEntityId } : {}),
        }
      : item
  ))
}

export function updateObservedEntityNote(observedEntities, observedEntityId, note) {
  if (!Array.isArray(observedEntities)) throw new Error('已遇到名称记录无效')
  const index = observedEntities.findIndex((item) => item?.id === observedEntityId)
  if (index < 0) throw new Error('找不到要添加备注的名称')
  const normalizedNote = typeof note === 'string' ? note.trim() : ''
  if (normalizedNote.length > 500) throw new Error('个人备注不能超过 500 个字')
  return observedEntities.map((item, itemIndex) => {
    if (itemIndex !== index) return item
    if (!normalizedNote) {
      const next = { ...item }
      delete next.note
      return next
    }
    return { ...item, note: normalizedNote }
  })
}

export function updateObservedPlaceKind(observedEntities, observedEntityId, placeKind) {
  if (!Array.isArray(observedEntities)) throw new Error('已遇到名称记录无效')
  if (!VALID_OBSERVED_PLACE_KINDS.has(placeKind)) throw new Error('地点性质无效')
  const index = observedEntities.findIndex((item) => item?.id === observedEntityId)
  if (index < 0) throw new Error('找不到要分类的地点记录')
  if (observedEntities[index].kind !== OBSERVED_ENTITY_KIND.PLACE) {
    throw new Error('只有地点记录可以设置地点性质')
  }
  return observedEntities.map((item, itemIndex) => {
    if (itemIndex !== index) return item
    const next = { ...item, placeKind }
    if (placeKind !== OBSERVED_PLACE_KIND.REAL) delete next.mapLocation
    return next
  })
}

export function visibleObservedEntities(observedEntities, currentChapterId, chapters) {
  if (!Array.isArray(observedEntities)) return []
  return observedEntities.filter((item) => isRevealedAtChapter(
    { chapterId: item?.firstSeenChapterId },
    currentChapterId,
    chapters,
  ))
}

export function confirmObservedPlaceLocation(observedEntities, observedEntityId, location) {
  if (!Array.isArray(observedEntities)) throw new Error('已遇到名称记录无效')
  const index = observedEntities.findIndex((item) => item?.id === observedEntityId)
  if (index < 0) throw new Error('找不到要定位的地点记录')
  const observed = observedEntities[index]
  if (observed.kind !== OBSERVED_ENTITY_KIND.PLACE) throw new Error('只有地点记录可以确认地图位置')
  if (observed.placeKind !== OBSERVED_PLACE_KIND.REAL) {
    throw new Error('只有明确标记为现实地点后才能确认公网地图位置')
  }
  const latitude = Number(location?.latitude)
  const longitude = Number(location?.longitude)
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error('地图候选纬度无效')
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error('地图候选经度无效')
  }
  if (!isNonEmptyString(location?.label) || !isNonEmptyString(location?.providerId)) {
    throw new Error('地图候选缺少来源或名称')
  }
  if (location.geometry && !isValidGeoJsonGeometry(location.geometry)) {
    throw new Error('地图候选几何数据无效')
  }
  return observedEntities.map((item, itemIndex) => (
    itemIndex === index
      ? {
          ...item,
          mapLocation: {
            mode: 'exact',
            resultId: String(location.id || ''),
            label: location.label.trim(),
            providerId: location.providerId,
            latitude,
            longitude,
            ...(location.geometry ? { geometry: location.geometry } : {}),
          },
        }
      : item
  ))
}

export function confirmObservedPlaceApproximateArea(
  observedEntities,
  observedEntityId,
  location,
  radiusKm = 50,
) {
  if (!Array.isArray(observedEntities)) throw new Error('已遇到名称记录无效')
  const index = observedEntities.findIndex((item) => item?.id === observedEntityId)
  if (index < 0) throw new Error('找不到要标记参考区域的地点记录')
  const observed = observedEntities[index]
  if (observed.kind !== OBSERVED_ENTITY_KIND.PLACE) throw new Error('只有地点记录可以标记参考区域')
  if (![OBSERVED_PLACE_KIND.FICTIONAL, OBSERVED_PLACE_KIND.PROTOTYPE, OBSERVED_PLACE_KIND.APPROXIMATE]
    .includes(observed.placeKind)) {
    throw new Error('只有虚构、原型或位置模糊地点可以标记参考区域')
  }
  const latitude = Number(location?.latitude)
  const longitude = Number(location?.longitude)
  const normalizedRadius = Number(radiusKm)
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error('参考区域纬度无效')
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error('参考区域经度无效')
  }
  if (!Number.isFinite(normalizedRadius) || normalizedRadius < 5 || normalizedRadius > 1000) {
    throw new Error('参考区域半径必须是 5–1000 公里')
  }
  if (!isNonEmptyString(location?.label) || !isNonEmptyString(location?.providerId)) {
    throw new Error('参考区域缺少来源或名称')
  }
  return observedEntities.map((item, itemIndex) => (
    itemIndex === index
      ? {
          ...item,
          mapLocation: {
            mode: 'approximate-area',
            resultId: String(location.id || ''),
            label: location.label.trim(),
            providerId: location.providerId,
            latitude,
            longitude,
            radiusKm: normalizedRadius,
          },
        }
      : item
  ))
}

export function confirmObservedRealPlaceFallbackArea(
  observedEntities,
  observedEntityId,
  location,
  radiusKm = 20,
) {
  if (!Array.isArray(observedEntities)) throw new Error('已遇到名称记录无效')
  const index = observedEntities.findIndex((item) => item?.id === observedEntityId)
  if (index < 0) throw new Error('找不到要标记参考区域的地点记录')
  const observed = observedEntities[index]
  if (
    observed.kind !== OBSERVED_ENTITY_KIND.PLACE
    || observed.placeKind !== OBSERVED_PLACE_KIND.REAL
  ) {
    throw new Error('只有搜索不到精确位置的现实地点可以使用区域兜底')
  }
  const latitude = Number(location?.latitude)
  const longitude = Number(location?.longitude)
  const normalizedRadius = Number(radiusKm)
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error('参考区域纬度无效')
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error('参考区域经度无效')
  }
  if (!Number.isFinite(normalizedRadius) || normalizedRadius < 5 || normalizedRadius > 1000) {
    throw new Error('参考区域半径必须是 5–1000 公里')
  }
  if (!isNonEmptyString(location?.label) || !isNonEmptyString(location?.providerId)) {
    throw new Error('参考区域缺少来源或名称')
  }
  return observedEntities.map((item, itemIndex) => (
    itemIndex === index
      ? {
          ...item,
          mapLocation: {
            mode: 'fallback-area',
            resultId: String(location.id || ''),
            label: location.label.trim(),
            providerId: location.providerId,
            latitude,
            longitude,
            radiusKm: normalizedRadius,
          },
        }
      : item
  ))
}

export function clearObservedPlaceLocation(observedEntities, observedEntityId) {
  if (!Array.isArray(observedEntities)) throw new Error('已遇到名称记录无效')
  const index = observedEntities.findIndex((item) => item?.id === observedEntityId)
  if (index < 0) throw new Error('找不到要取消定位的地点记录')
  return observedEntities.map((item, itemIndex) => {
    if (itemIndex !== index || !item.mapLocation) return item
    const withoutLocation = { ...item }
    delete withoutLocation.mapLocation
    return withoutLocation
  })
}

export function readerConfirmedMapEntities(observedEntities, currentChapterId, chapters) {
  return visibleObservedEntities(observedEntities, currentChapterId, chapters)
    .filter((item) => (
      item?.kind === OBSERVED_ENTITY_KIND.PLACE
      && (
        item.placeKind === OBSERVED_PLACE_KIND.REAL
        || item.mapLocation?.mode === 'approximate-area'
        || item.mapLocation?.mode === 'fallback-area'
        || (!item.placeKind && item.mapLocation)
      )
      && Number.isFinite(item.mapLocation?.latitude)
      && Number.isFinite(item.mapLocation?.longitude)
    ))
    .map((item) => ({
      id: `reader-map:${item.id}`,
      name: item.name,
      kind: 'place',
      placeKind: ['approximate-area', 'fallback-area'].includes(item.mapLocation.mode)
        ? item.placeKind
        : 'real',
      aliases: [],
      parentLabel: item.mapLocation.label,
      revealAt: { chapterId: item.firstSeenChapterId },
      geometry: {
        type: ['approximate-area', 'fallback-area'].includes(item.mapLocation.mode)
          ? 'area'
          : item.mapLocation.geometry
            ? 'geojson'
            : 'point',
        latitude: item.mapLocation.latitude,
        longitude: item.mapLocation.longitude,
        ...(['approximate-area', 'fallback-area'].includes(item.mapLocation.mode)
          ? { radiusKm: item.mapLocation.radiusKm }
          : {}),
        ...(item.mapLocation.geometry ? { geojson: item.mapLocation.geometry } : {}),
      },
      accessMode: item.mapLocation.mode === 'fallback-area'
        ? 'reader-confirmed-fallback-area'
        : item.mapLocation.mode === 'approximate-area'
          ? 'reader-confirmed-approximate-area'
          : 'reader-confirmed-geocoder',
      readerConfirmedName: item.name,
      geocodingProviderId: item.mapLocation.providerId,
      scopeNote: item.mapLocation.mode === 'fallback-area'
        ? '精确地点未被地图服务收录；由读者选择相关现实区域作为兜底，不代表该地点的精确坐标。'
        : item.mapLocation.mode === 'approximate-area'
          ? '由读者选择现实区域作为宽泛参考，不代表虚构地点的精确位置。'
          : '由读者从公网地图搜索结果中选择，仅代表个人确认的现代现实位置。',
    }))
}

export function matchOnDemandEntity(onDemandEntities, observedName, kind, packageEntityId = '') {
  const normalizedName = normalizeObservedEntityName(observedName)
  if (!normalizedName || !VALID_ENTITY_KINDS.has(kind) || !Array.isArray(onDemandEntities)) {
    return null
  }
  if (isNonEmptyString(packageEntityId)) {
    const linkedEntity = onDemandEntities.find((entity) => (
      entity?.id === packageEntityId && entity?.kind === kind
    ))
    if (linkedEntity) return linkedEntity
  }
  return onDemandEntities.find((entity) => (
    entity?.kind === kind
    && [entity.name, entity.originalName, ...(entity.aliases || [])]
      .some((name) => normalizeObservedEntityName(name) === normalizedName)
  )) || null
}

export function readingEntitySafeNoteSources(entity, sources) {
  if (!isNonEmptyString(entity?.safeNote)
    || !Array.isArray(entity.safeNoteSourceIds)
    || !Array.isArray(sources)) {
    return []
  }
  const sourcesById = new Map(sources.map((source) => [source?.id, source]))
  return entity.safeNoteSourceIds.flatMap((sourceId) => {
    const source = sourcesById.get(sourceId)
    if (!source || !isNonEmptyString(source.url)) return []
    try {
      const url = new URL(source.url)
      if (!['http:', 'https:'].includes(url.protocol)) return []
    } catch {
      return []
    }
    return [{
      id: source.id,
      label: source.label || source.organization || source.id,
      url: source.url,
    }]
  })
}

function textContainsExactTerm(text, term) {
  const normalizedText = typeof text === 'string' ? text.normalize('NFKC').toLocaleLowerCase() : ''
  const normalizedTerm = normalizeObservedEntityName(term)
  if (!normalizedText || !normalizedTerm) return false
  const needsWordBoundary = /[a-z0-9]/.test(normalizedTerm)
  let index = normalizedText.indexOf(normalizedTerm)
  while (index >= 0) {
    const before = normalizedText[index - 1] || ''
    const after = normalizedText[index + normalizedTerm.length] || ''
    if (!needsWordBoundary || (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after))) {
      return true
    }
    index = normalizedText.indexOf(normalizedTerm, index + 1)
  }
  return false
}

export function scanOnDemandEntities(text, onDemandEntities) {
  if (typeof text !== 'string' || !text.trim() || !Array.isArray(onDemandEntities)) return []
  const matches = []
  for (const entity of onDemandEntities) {
    const terms = [...new Set([
      entity?.name,
      entity?.originalName,
      ...(entity?.aliases || []),
    ].filter(Boolean))]
    const matchedTerm = terms.find((term) => textContainsExactTerm(text, term))
    if (matchedTerm) matches.push({ entity, matchedTerm })
  }
  return matches
}

export function scanObservedEntities(text, observedEntities) {
  if (typeof text !== 'string' || !text.trim() || !Array.isArray(observedEntities)) return []
  return observedEntities.flatMap((entity) => (
    textContainsExactTerm(text, entity?.name)
      ? [{ entity, matchedTerm: entity.name, source: 'observed' }]
      : []
  ))
}

export function unlockedOnDemandEntities(
  onDemandEntities,
  observedEntities,
  currentChapterId,
  chapters,
) {
  const unlocked = new Map()
  for (const observed of visibleObservedEntities(
    observedEntities,
    currentChapterId,
    chapters,
  )) {
    const match = matchOnDemandEntity(
      onDemandEntities,
      observed.name,
      observed.kind,
      observed.packageEntityId,
    )
    if (!match || unlocked.has(match.id)) continue
    unlocked.set(match.id, {
      ...match,
      revealAt: { chapterId: observed.firstSeenChapterId },
      readerConfirmedName: observed.name,
      accessMode: 'reader-confirmed-exact-match',
    })
  }
  return [...unlocked.values()]
}

export function isRevealedAtChapter(revealAt, currentChapterId, chapters) {
  if (!revealAt?.chapterId || !isNonEmptyString(currentChapterId) || !Array.isArray(chapters)) {
    return false
  }
  const revealIndex = chapterIndex(chapters, revealAt.chapterId)
  const currentIndex = chapterIndex(chapters, currentChapterId)
  return revealIndex >= 0 && currentIndex >= revealIndex
}

export function visibleReadingEntities(entities, currentChapterId, chapters) {
  if (!Array.isArray(entities)) return []
  return entities.filter((entity) => isRevealedAtChapter(
    entity?.revealAt,
    currentChapterId,
    chapters,
  ))
}

export function visibleReadingFacts(facts, currentChapterId, chapters) {
  if (!Array.isArray(facts)) return []
  return facts.filter((fact) => isRevealedAtChapter(
    fact?.revealAt,
    currentChapterId,
    chapters,
  ))
}

export function projectReadingPlaces(entities) {
  const places = (Array.isArray(entities) ? entities : [])
    .filter((entity) => entity?.kind === 'place' && entity.geometry)
    .map((entity) => ({
      id: entity.id,
      latitude: entity.geometry.latitude,
      longitude: entity.geometry.longitude,
    }))
    .filter(({ latitude, longitude }) => Number.isFinite(latitude) && Number.isFinite(longitude))
  if (places.length === 0) return []

  const latitudes = places.map((place) => place.latitude)
  const longitudes = places.map((place) => place.longitude)
  const minLatitude = Math.min(...latitudes)
  const maxLatitude = Math.max(...latitudes)
  const minLongitude = Math.min(...longitudes)
  const maxLongitude = Math.max(...longitudes)
  const latitudeSpan = maxLatitude - minLatitude
  const longitudeSpan = maxLongitude - minLongitude

  return places.map((place) => ({
    ...place,
    x: longitudeSpan === 0 ? 50 : 8 + ((place.longitude - minLongitude) / longitudeSpan) * 84,
    y: latitudeSpan === 0 ? 50 : 8 + ((maxLatitude - place.latitude) / latitudeSpan) * 84,
  }))
}

function placeCoordinates(place) {
  const latitude = place?.geometry?.latitude
  const longitude = place?.geometry?.longitude
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  return { latitude, longitude }
}

function geoJsonCoordinateCount(value) {
  if (!Array.isArray(value)) return -1
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
    const itemCount = geoJsonCoordinateCount(item)
    if (itemCount < 0) return -1
    count += itemCount
    if (count > 10000) return -1
  }
  return count
}

function isValidGeoJsonGeometry(geometry) {
  if (
    !isObject(geometry)
    || !VALID_GEOJSON_TYPES.has(geometry.type)
    || !Array.isArray(geometry.coordinates)
  ) {
    return false
  }
  const coordinateCount = geoJsonCoordinateCount(geometry.coordinates)
  return coordinateCount > 0 && coordinateCount <= 10000
}

function validatePlaceGeometry(geometry, label, errors) {
  if (!isObject(geometry)) {
    errors.push(`${label}.geometry 必须是对象`)
    return
  }
  const {
    type,
    latitude,
    longitude,
    radiusKm,
    geojson,
  } = geometry
  if (!VALID_GEOMETRY_TYPES.has(type)) {
    errors.push(`${label}.geometry.type 无效`)
    return
  }
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    errors.push(`${label}.geometry.latitude 无效`)
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    errors.push(`${label}.geometry.longitude 无效`)
  }
  if (type === 'area' && (!Number.isFinite(radiusKm) || radiusKm <= 0)) {
    errors.push(`${label}.geometry.radiusKm 无效`)
  }
  if (type === 'geojson' && !isValidGeoJsonGeometry(geojson)) {
    errors.push(`${label}.geometry.geojson 无效`)
  }
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180
}

function directionLabel(bearing) {
  const labels = ['北', '东北', '东', '东南', '南', '西南', '西', '西北']
  return labels[Math.round(bearing / 45) % labels.length]
}

export function readingPlaceRelations(places, selectedPlaceId) {
  if (!Array.isArray(places) || !isNonEmptyString(selectedPlaceId)) return []
  const selectedPlace = places.find((place) => place?.id === selectedPlaceId)
  const origin = placeCoordinates(selectedPlace)
  if (!origin) return []

  const latitude1 = toRadians(origin.latitude)
  return places
    .filter((place) => place?.id !== selectedPlaceId)
    .map((place) => {
      const destination = placeCoordinates(place)
      if (!destination) return null
      const latitude2 = toRadians(destination.latitude)
      const latitudeDelta = latitude2 - latitude1
      const longitudeDelta = toRadians(destination.longitude - origin.longitude)
      const haversine = (
        Math.sin(latitudeDelta / 2) ** 2
        + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2
      )
      const normalizedHaversine = Math.min(1, Math.max(0, haversine))
      const distanceKm = 6371.0088 * 2 * Math.atan2(
        Math.sqrt(normalizedHaversine),
        Math.sqrt(1 - normalizedHaversine),
      )
      const y = Math.sin(longitudeDelta) * Math.cos(latitude2)
      const x = (
        Math.cos(latitude1) * Math.sin(latitude2)
        - Math.sin(latitude1) * Math.cos(latitude2) * Math.cos(longitudeDelta)
      )
      const bearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
      return {
        id: place.id,
        name: place.name,
        distanceKm,
        direction: directionLabel(bearing),
      }
    })
    .filter(Boolean)
    .sort((left, right) => left.distanceKm - right.distanceKm)
}

export function riskForDisclosure({ riskLevel, revealAt, currentChapterId, chapters }) {
  const normalizedRisk = VALID_RISK_LEVELS.has(riskLevel) ? riskLevel : SPOILER_RISK.POTENTIAL
  if (!isNonEmptyString(currentChapterId) || !Array.isArray(chapters) || chapters.length === 0) {
    return normalizedRisk === SPOILER_RISK.HIGH ? SPOILER_RISK.HIGH : SPOILER_RISK.POTENTIAL
  }

  const currentIndex = chapterIndex(chapters, currentChapterId)
  const revealIndex = revealAt?.chapterId ? chapterIndex(chapters, revealAt.chapterId) : -1
  if (currentIndex < 0 || (revealAt?.chapterId && revealIndex < 0)) {
    return normalizedRisk === SPOILER_RISK.HIGH ? SPOILER_RISK.HIGH : SPOILER_RISK.POTENTIAL
  }
  if (revealIndex > currentIndex) {
    return normalizedRisk === SPOILER_RISK.HIGH ? SPOILER_RISK.HIGH : SPOILER_RISK.POTENTIAL
  }
  return normalizedRisk
}

export function spoilerGateAction(riskLevel) {
  if (riskLevel === SPOILER_RISK.SAFE) return SPOILER_GATE_ACTION.DISPLAY
  if (riskLevel === SPOILER_RISK.HIGH) return SPOILER_GATE_ACTION.CONFIRM_TWICE
  return SPOILER_GATE_ACTION.WARN
}

export function canRevealRisk(riskLevel, authorization = 'none') {
  if (riskLevel === SPOILER_RISK.SAFE) return true
  if (riskLevel === SPOILER_RISK.POTENTIAL) {
    return authorization === SPOILER_RISK.POTENTIAL || authorization === SPOILER_RISK.HIGH
  }
  return riskLevel === SPOILER_RISK.HIGH && authorization === SPOILER_RISK.HIGH
}

export function strongestSpoilerRisk(risks) {
  if (risks.includes(SPOILER_RISK.HIGH)) return SPOILER_RISK.HIGH
  if (risks.includes(SPOILER_RISK.POTENTIAL)) return SPOILER_RISK.POTENTIAL
  return SPOILER_RISK.SAFE
}

export function validateReadingPackage(pkg) {
  const errors = []
  if (!isObject(pkg)) return ['资料包必须是对象']
  if (pkg.schemaVersion !== READING_PACKAGE_SCHEMA_VERSION) {
    errors.push(`schemaVersion 必须为 ${READING_PACKAGE_SCHEMA_VERSION}`)
  }
  for (const key of ['id', 'packageVersion']) {
    if (!isNonEmptyString(pkg[key])) errors.push(`${key} 不能为空`)
  }
  for (const [parent, fields] of [
    ['book', ['id', 'title', 'author', 'originalLanguage']],
    ['edition', ['id', 'isbn', 'language', 'publisher', 'publishedAt']],
  ]) {
    if (!isObject(pkg[parent])) {
      errors.push(`${parent} 必须是对象`)
      continue
    }
    for (const field of fields) {
      if (!isNonEmptyString(pkg[parent][field])) errors.push(`${parent}.${field} 不能为空`)
    }
  }

  if (!Array.isArray(pkg.chapters) || pkg.chapters.length === 0) {
    errors.push('chapters 必须是非空数组')
  } else {
    const chapterIds = new Set()
    for (const [index, chapter] of pkg.chapters.entries()) {
      if (!isObject(chapter)) {
        errors.push(`chapters[${index}] 必须是对象`)
        continue
      }
      if (!isNonEmptyString(chapter.id)) errors.push(`chapters[${index}].id 不能为空`)
      if (!Number.isInteger(chapter.number) || chapter.number < 1) {
        errors.push(`chapters[${index}].number 必须是正整数`)
      }
      if (!isNonEmptyString(chapter.label)) errors.push(`chapters[${index}].label 不能为空`)
      if (chapterIds.has(chapter.id)) errors.push(`章节 id 重复：${chapter.id}`)
      chapterIds.add(chapter.id)
    }
    if (Number.isInteger(pkg.edition?.chapterCount) && pkg.edition.chapterCount !== pkg.chapters.length) {
      errors.push('edition.chapterCount 与 chapters 数量不一致')
    }
  }

  for (const key of ['entities', 'facts', 'sources']) {
    if (!Array.isArray(pkg[key])) errors.push(`${key} 必须是数组`)
  }
  if (pkg.onDemandEntities !== undefined && !Array.isArray(pkg.onDemandEntities)) {
    errors.push('onDemandEntities 必须是数组')
  }

  const chapterIds = new Set(Array.isArray(pkg.chapters) ? pkg.chapters.map((chapter) => chapter?.id) : [])
  const sourceIds = new Set()
  for (const [index, source] of (Array.isArray(pkg.sources) ? pkg.sources : []).entries()) {
    if (!isObject(source) || !isNonEmptyString(source.id)) {
      errors.push(`sources[${index}].id 不能为空`)
      continue
    }
    if (sourceIds.has(source.id)) errors.push(`来源 id 重复：${source.id}`)
    sourceIds.add(source.id)
  }
  const entityIds = new Set()
  for (const [index, entity] of (Array.isArray(pkg.entities) ? pkg.entities : []).entries()) {
    if (!isObject(entity) || !isNonEmptyString(entity.id)) {
      errors.push(`entities[${index}].id 不能为空`)
      continue
    }
    if (entityIds.has(entity.id)) errors.push(`实体 id 重复：${entity.id}`)
    entityIds.add(entity.id)
    if (!isNonEmptyString(entity.name)) errors.push(`entities[${index}].name 不能为空`)
    if (!VALID_ENTITY_KINDS.has(entity.kind)) errors.push(`entities[${index}].kind 无效`)
    if (!entity.revealAt?.chapterId || !chapterIds.has(entity.revealAt.chapterId)) {
      errors.push(`entities[${index}].revealAt 必须引用已知章节`)
    }
    if (!Array.isArray(entity.sourceIds) || entity.sourceIds.length === 0) {
      errors.push(`entities[${index}].sourceIds 必须是非空数组`)
    } else {
      for (const sourceId of entity.sourceIds) {
        if (!sourceIds.has(sourceId)) {
          errors.push(`entities[${index}] 引用了未知来源：${sourceId}`)
        }
      }
    }
    if (entity.kind === 'place') {
      if (!VALID_PLACE_KINDS.has(entity.placeKind)) {
        errors.push(`entities[${index}].placeKind 无效`)
      }
      if (entity.geometry) {
        validatePlaceGeometry(entity.geometry, `entities[${index}]`, errors)
        if (entity.placeKind === 'fictional' && entity.geometry.type !== 'area') {
          errors.push(`entities[${index}] 的虚构地点不能伪造精确坐标`)
        }
      }
    }
  }
  const onDemandEntityIds = new Set()
  for (const [index, entity] of (
    Array.isArray(pkg.onDemandEntities) ? pkg.onDemandEntities : []
  ).entries()) {
    const label = `onDemandEntities[${index}]`
    if (!isObject(entity) || !isNonEmptyString(entity.id)) {
      errors.push(`${label}.id 不能为空`)
      continue
    }
    if (entityIds.has(entity.id) || onDemandEntityIds.has(entity.id)) {
      errors.push(`实体 id 重复：${entity.id}`)
    }
    onDemandEntityIds.add(entity.id)
    if (!isNonEmptyString(entity.name)) errors.push(`${label}.name 不能为空`)
    if (!VALID_ENTITY_KINDS.has(entity.kind)) errors.push(`${label}.kind 无效`)
    if (entity.activation !== 'exact-reader-input') {
      errors.push(`${label}.activation 必须为 exact-reader-input`)
    }
    if (!Array.isArray(entity.aliases)
      || entity.aliases.some((alias) => !isNonEmptyString(alias))) {
      errors.push(`${label}.aliases 必须是字符串数组`)
    }
    if (entity.safeNote !== undefined
      && (!isNonEmptyString(entity.safeNote) || entity.safeNote.length > 400)) {
      errors.push(`${label}.safeNote 必须是 1–400 字符的非空字符串`)
    }
    if (!Array.isArray(entity.sourceIds) || entity.sourceIds.length === 0) {
      errors.push(`${label}.sourceIds 必须是非空数组`)
    } else {
      for (const sourceId of entity.sourceIds) {
        if (!sourceIds.has(sourceId)) errors.push(`${label} 引用了未知来源：${sourceId}`)
      }
    }
    if (entity.safeNote !== undefined) {
      if (!Array.isArray(entity.safeNoteSourceIds) || entity.safeNoteSourceIds.length === 0) {
        errors.push(`${label}.safeNoteSourceIds 必须引用至少一个注释来源`)
      } else {
        for (const sourceId of entity.safeNoteSourceIds) {
          if (!entity.sourceIds?.includes(sourceId)) {
            errors.push(`${label}.safeNoteSourceIds 必须属于 sourceIds：${sourceId}`)
          }
        }
      }
    } else if (entity.safeNoteSourceIds !== undefined) {
      errors.push(`${label}.safeNoteSourceIds 不能脱离 safeNote 单独存在`)
    }
    if (entity.kind === 'place') {
      if (!VALID_PLACE_KINDS.has(entity.placeKind)) errors.push(`${label}.placeKind 无效`)
      if (entity.geometry) {
        validatePlaceGeometry(entity.geometry, label, errors)
        if (entity.placeKind === 'fictional' && entity.geometry.type !== 'area') {
          errors.push(`${label} 的虚构地点不能伪造精确坐标`)
        }
      }
    }
  }
  const factIds = new Set()
  for (const [index, fact] of (Array.isArray(pkg.facts) ? pkg.facts : []).entries()) {
    if (!isObject(fact) || !isNonEmptyString(fact.id)) {
      errors.push(`facts[${index}].id 不能为空`)
      continue
    }
    if (factIds.has(fact.id)) errors.push(`事实 id 重复：${fact.id}`)
    factIds.add(fact.id)
    if (!VALID_FACT_KINDS.has(fact.kind)) errors.push(`facts[${index}].kind 无效`)
    if (!isNonEmptyString(fact.content)) errors.push(`facts[${index}].content 不能为空`)
    if (!VALID_RISK_LEVELS.has(fact.riskLevel)) {
      errors.push(`facts[${index}].riskLevel 无效`)
    }
    if (!fact.revealAt?.chapterId || !chapterIds.has(fact.revealAt.chapterId)) {
      errors.push(`facts[${index}].revealAt 必须引用已知章节`)
    }
    if (!Array.isArray(fact.entityIds)) {
      errors.push(`facts[${index}].entityIds 必须是数组`)
    }
    if (!Array.isArray(fact.sourceIds) || fact.sourceIds.length === 0) {
      errors.push(`facts[${index}].sourceIds 必须是非空数组`)
    } else {
      for (const sourceId of fact.sourceIds) {
        if (!sourceIds.has(sourceId)) {
          errors.push(`facts[${index}] 引用了未知来源：${sourceId}`)
        }
      }
    }
    if (!Array.isArray(fact.riskCategories)) {
      errors.push(`facts[${index}].riskCategories 必须是数组`)
    } else {
      if (fact.riskLevel !== SPOILER_RISK.SAFE && fact.riskCategories.length === 0) {
        errors.push(`facts[${index}] 的潜在或高风险内容必须声明风险类别`)
      }
      for (const category of fact.riskCategories) {
        if (!VALID_RISK_CATEGORIES.has(category)) {
          errors.push(`facts[${index}] 使用了未知风险类别：${category}`)
        }
      }
    }
    for (const entityId of fact.entityIds || []) {
      if (!entityIds.has(entityId)) errors.push(`facts[${index}] 引用了未知实体：${entityId}`)
    }
  }
  return errors
}

export function assertReadingPackage(pkg) {
  const errors = validateReadingPackage(pkg)
  if (errors.length > 0) throw new Error(`阅读资料包无效：${errors.join('；')}`)
  return pkg
}
