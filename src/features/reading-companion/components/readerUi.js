import { OBSERVED_ENTITY_KIND, OBSERVED_PLACE_KIND, normalizeObservedEntityName, observedEntityEncounterChapterIds } from '../domain/readingCompanion.js'

export const PLACE_KIND_LABELS = {
  unknown: '不确定',
  real: '真实地点',
  fictional: '虚构地点',
  prototype: '原型地点',
  approximate: '模糊区域',
}

export const OBSERVED_KIND_LABELS = {
  [OBSERVED_ENTITY_KIND.PLACE]: '地点',
  [OBSERVED_ENTITY_KIND.PERSON]: '人物',
  [OBSERVED_ENTITY_KIND.CONCEPT]: '概念',
  [OBSERVED_ENTITY_KIND.EVENT]: '事件',
}

export const OBSERVED_PLACE_KIND_LABELS = {
  [OBSERVED_PLACE_KIND.UNKNOWN]: '不确定',
  [OBSERVED_PLACE_KIND.REAL]: '现实地点',
  [OBSERVED_PLACE_KIND.FICTIONAL]: '虚构地点',
  [OBSERVED_PLACE_KIND.PROTOTYPE]: '有现实原型',
  [OBSERVED_PLACE_KIND.APPROXIMATE]: '位置模糊',
}

export const OBSERVED_PLACE_KIND_DESCRIPTIONS = {
  [OBSERVED_PLACE_KIND.UNKNOWN]: '原文信息不足时先这样记录；不会开放公网地图搜索。',
  [OBSERVED_PLACE_KIND.REAL]: '现实中可确认的地点；可以搜索并保存现代代表位置。',
  [OBSERVED_PLACE_KIND.FICTIONAL]: '作品虚构地点；不保存伪造的精确坐标，只能设置宽泛参考区域。',
  [OBSERVED_PLACE_KIND.PROTOTYPE]: '虚构地点有可靠资料支持的现实原型；原型与作品地点必须明确区分。',
  [OBSERVED_PLACE_KIND.APPROXIMATE]: '只能确认国家、州、省或地区，无法可靠定位到精确点。',
}

export const PLACE_ACCESS_LABELS = {
  'reader-confirmed-exact-match': '阅读中确认后解锁',
  'reader-confirmed-geocoder': '个人确认位置',
  'reader-confirmed-approximate-area': '宽泛参考区域',
  'reader-confirmed-fallback-area': '精确位置未收录',
}

export const READER_TAB = Object.freeze({
  INPUT: 'input',
  RECORDS: 'records',
  MAP: 'map',
  FACTS: 'facts',
  SETTINGS: 'settings',
})

export function observedRecordAction(
  observedEntities,
  name,
  kind,
  currentChapterId,
  chapters,
  packageEntityId = '',
  equivalentNames = [],
) {
  const normalizedEquivalentNames = new Set(
    equivalentNames.map(normalizeObservedEntityName).filter(Boolean),
  )
  const existing = observedEntities.find((item) => (
    item.kind === kind
    && (
      normalizeObservedEntityName(item.name) === normalizeObservedEntityName(name)
      || (packageEntityId && item.packageEntityId === packageEntityId)
      || (
        packageEntityId
        && normalizedEquivalentNames.has(normalizeObservedEntityName(item.name))
      )
    )
  ))
  const currentIndex = chapters.findIndex((item) => item.id === currentChapterId)
  if (!existing) {
    return {
      type: 'add',
      label: `记在${chapters[currentIndex]?.label || '当前章'}`,
    }
  }
  const existingIndex = chapters.findIndex((item) => item.id === existing.firstSeenChapterId)
  const existingChapter = chapters[existingIndex]
  if (existingIndex > currentIndex) {
    return {
      type: 'move-earlier',
      label: `提前到${chapters[currentIndex]?.label || '当前章'}`,
      existing,
      existingChapter,
    }
  }
  if (!observedEntityEncounterChapterIds(existing, chapters).includes(currentChapterId)) {
    return {
      type: 'record-again',
      label: `记录${chapters[currentIndex]?.label || '当前章'}出现`,
      existing,
      existingChapter,
    }
  }
  return {
    type: 'recorded',
    label: `${chapters[currentIndex]?.label || '当前章'}已记录`,
    existing,
    existingChapter,
  }
}
