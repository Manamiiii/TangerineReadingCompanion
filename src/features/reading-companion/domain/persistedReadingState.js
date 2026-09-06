import { OBSERVED_ENTITY_KIND, OBSERVED_PLACE_KIND, isValidGeoJsonGeometry } from './readingCompanion.js'

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}无效`)
  return value
}

function text(value, label, max = 500, allowEmpty = false) {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim()) || value.length > max) {
    throw new Error(`${label}无效`)
  }
  return value
}

function strings(value, label, max = 500) {
  if (!Array.isArray(value)) throw new Error(`${label}无效`)
  return [...new Set(value.map(item => text(item, label, max)))]
}

function mapLocation(value, entity) {
  object(value, '地图位置')
  const mode = value.mode || 'exact' // Older confirmed geocoder records had no mode.
  if (!['exact', 'approximate-area', 'fallback-area'].includes(mode)
    || entity.kind !== 'place'
    || (mode === 'exact' && entity.placeKind && entity.placeKind !== 'real')
    || (mode === 'fallback-area' && entity.placeKind !== 'real')
    || (mode === 'approximate-area' && !['fictional', 'prototype', 'approximate'].includes(entity.placeKind))) {
    throw new Error('地图位置与地点性质不一致')
  }
  const { latitude, longitude } = value
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90
    || !Number.isFinite(longitude) || Math.abs(longitude) > 180) throw new Error('地图坐标无效')
  const result = {
    mode, latitude, longitude,
    label: text(value.label, '地图名称', 2000),
    providerId: text(value.providerId, '地图来源'),
  }
  if (value.resultId !== undefined) result.resultId = text(value.resultId, '地图结果 id', 500, true)
  if (mode !== 'exact') {
    if (!Number.isFinite(value.radiusKm) || value.radiusKm < 5 || value.radiusKm > 1000) throw new Error('地图区域半径无效')
    result.radiusKm = value.radiusKm
  } else if (value.geometry !== undefined) {
    if (!isValidGeoJsonGeometry(value.geometry)) throw new Error('地图几何无效')
    // GeoJSON foreign members must not become a channel for arbitrary input.
    result.geometry = { type: value.geometry.type, coordinates: structuredClone(value.geometry.coordinates) }
  }
  return result
}

export function normalizePersistedReadingState(value) {
  object(value, '阅读状态')
  const result = { editionId: text(value.editionId, '阅读版本') }
  for (const key of ['packageId', 'bookId', 'currentChapterId', 'updatedAt']) {
    if (value[key] !== undefined) result[key] = text(value[key], `阅读状态 ${key}`)
  }
  if (value.observedEntities !== undefined) {
    if (!Array.isArray(value.observedEntities)) throw new Error('阅读状态已遇到记录无效')
    const ids = new Set()
    result.observedEntities = value.observedEntities.map(item => {
      object(item, '已遇到记录')
      const entity = {
        id: text(item.id, '名称 id'), name: text(item.name, '名称', 120),
        kind: item.kind, firstSeenChapterId: text(item.firstSeenChapterId, '首次遇到章节'),
      }
      if (!Object.values(OBSERVED_ENTITY_KIND).includes(entity.kind) || ids.has(entity.id)) throw new Error('名称类型或 id 无效')
      ids.add(entity.id)
      if (item.placeKind !== undefined) {
        if (entity.kind !== 'place' || !Object.values(OBSERVED_PLACE_KIND).includes(item.placeKind)) throw new Error('地点性质无效')
        entity.placeKind = item.placeKind
      }
      if (item.packageEntityId !== undefined) entity.packageEntityId = text(item.packageEntityId, '资料实体 id')
      if (item.note !== undefined) entity.note = text(item.note, '个人备注', 500, true)
      if (item.encounterChapterIds !== undefined) entity.encounterChapterIds = strings(item.encounterChapterIds, '出现章节')
      if (item.mapLocation !== undefined) entity.mapLocation = mapLocation(item.mapLocation, entity)
      return entity
    })
  }
  return result
}
