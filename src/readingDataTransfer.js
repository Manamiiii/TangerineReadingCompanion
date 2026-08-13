import { db } from './db/core.js'

export const READING_COMPANION_SCENE = {
  id: 'scene-reading-companion',
  name: '橘子阅读伴侣',
  type: 'reading',
  tools: ['reader'],
}

export const READING_BACKUP_FORMAT = 'tangerine-reading-companion-backup'
export const READING_BACKUP_SCHEMA_VERSION = 1

const READING_META_PREFIXES = ['readerState:', 'readerPersonalPackage:']

function isReadingMetaRecord(record) {
  return record
    && typeof record.key === 'string'
    && READING_META_PREFIXES.some((prefix) => record.key.startsWith(prefix))
    && Object.hasOwn(record, 'value')
}

function normalizeStateRecord(record) {
  if (!record.key.startsWith('readerState:')) return record
  const editionId = record.value?.editionId || record.key.split(':').at(-1)
  if (!editionId) return null
  return {
    key: `readerState:${READING_COMPANION_SCENE.id}:${editionId}`,
    value: {
      ...record.value,
      sceneId: READING_COMPANION_SCENE.id,
      editionId,
    },
  }
}

function newestRecord(left, right) {
  const leftTime = Date.parse(left?.value?.updatedAt || '') || 0
  const rightTime = Date.parse(right?.value?.updatedAt || '') || 0
  return rightTime >= leftTime ? right : left
}

export function readingRecordsFromPayload(payload) {
  const meta = payload?.data?.meta
  if (!Array.isArray(meta)) throw new Error('备份中缺少有效的 data.meta 数组')

  const source = payload?.format === READING_BACKUP_FORMAT
    ? 'reading-companion'
    : 'tangerine-tools'
  if (source === 'reading-companion' && payload.schemaVersion !== READING_BACKUP_SCHEMA_VERSION) {
    throw new Error(`不支持的阅读备份版本：${payload.schemaVersion}`)
  }

  const records = new Map()
  for (const candidate of meta) {
    if (!isReadingMetaRecord(candidate)) continue
    const normalized = normalizeStateRecord(candidate)
    if (!normalized) continue
    records.set(normalized.key, newestRecord(records.get(normalized.key), normalized))
  }
  if (records.size === 0) throw new Error('备份中没有可导入的阅读记录')
  return { records: [...records.values()], source }
}

export async function exportReadingData() {
  const meta = (await db.meta.toArray()).filter(isReadingMetaRecord)
  return {
    format: READING_BACKUP_FORMAT,
    schemaVersion: READING_BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: { meta },
  }
}

export async function importReadingData(payload) {
  const { records, source } = readingRecordsFromPayload(payload)
  await db.meta.bulkPut(records)
  return { imported: records.length, source }
}
