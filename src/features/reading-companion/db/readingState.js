import { readingStateKey } from '../domain/readingCompanion.js'
import { db } from '../../../db/core.js'
import { nowIso } from '../../../utils.js'
import { normalizePersistedReadingState } from '../domain/persistedReadingState.js'

const LEGACY_READING_STATE_PREFIX = 'readerState:'

function newestRecord(left, right) {
  const leftTime = Date.parse(left?.value?.updatedAt || '') || 0
  const rightTime = Date.parse(right?.value?.updatedAt || '') || 0
  return rightTime >= leftTime ? right : left
}

export async function getReadingState(editionId, { migrate = true } = {}) {
  if (migrate) return db.transaction('rw', db.meta, () => readReadingState(editionId, true))
  return readReadingState(editionId, false)
}

async function readReadingState(editionId, migrate) {
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
    const value = normalizePersistedReadingState({ ...record.value, editionId })
    if (migrate) await db.meta.put({ key, value })
    return value
  }
  return normalizePersistedReadingState(record.value)
}

export async function saveReadingState(editionId, patch) {
  const key = readingStateKey(editionId)
  return db.transaction('rw', db.meta, async () => {
    const current = await readReadingState(editionId, false) || {}
    // Execute domain updates against the latest state inside the same transaction.
    const changes = typeof patch === 'function' ? patch(current) : patch
    if (!changes || typeof changes !== 'object' || typeof changes.then === 'function') {
      throw new Error('阅读状态修改必须是同步操作')
    }
    const value = normalizePersistedReadingState({
      ...current, ...changes, editionId, updatedAt: nowIso(),
    })
    await db.meta.put({ key, value })
    return value
  })
}
