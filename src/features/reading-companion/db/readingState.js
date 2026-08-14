import { readingStateKey } from '../domain/readingCompanion.js'
import { db } from '../../../db/core.js'
import { nowIso } from '../../../utils.js'

const LEGACY_READING_STATE_PREFIX = 'readerState:'

function newestRecord(left, right) {
  const leftTime = Date.parse(left?.value?.updatedAt || '') || 0
  const rightTime = Date.parse(right?.value?.updatedAt || '') || 0
  return rightTime >= leftTime ? right : left
}

export async function getReadingState(editionId) {
  const key = readingStateKey(editionId)
  const records = await db.meta
    .filter((record) => (
      record.key === key
      || (record.key.startsWith(LEGACY_READING_STATE_PREFIX)
        && record.value?.editionId === editionId)
    ))
    .toArray()
  const record = records.reduce(newestRecord, null)
  if (!record?.value) return null
  if (record.key !== key) {
    const value = { ...record.value, editionId }
    delete value.sceneId
    await db.meta.put({ key, value })
    return value
  }
  return record.value
}

export async function saveReadingState(editionId, patch) {
  const key = readingStateKey(editionId)
  const current = await db.meta.get(key)
  const value = {
    ...current?.value,
    ...patch,
    editionId,
    updatedAt: nowIso(),
  }
  delete value.sceneId
  await db.meta.put({ key, value })
  return value
}
