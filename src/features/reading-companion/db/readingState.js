import { readingStateKey } from '../domain/readingCompanion.js'
import { db } from '../../../db/core.js'
import { nowIso } from '../../../utils.js'

export async function getReadingState(sceneId, editionId) {
  const record = await db.meta.get(readingStateKey(sceneId, editionId))
  return record?.value || null
}

export async function saveReadingState(sceneId, editionId, patch) {
  const key = readingStateKey(sceneId, editionId)
  const current = await db.meta.get(key)
  const value = {
    ...current?.value,
    ...patch,
    sceneId,
    editionId,
    updatedAt: nowIso(),
  }
  await db.meta.put({ key, value })
  return value
}
