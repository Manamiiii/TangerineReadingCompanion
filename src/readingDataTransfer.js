import { db } from './db/core.js'
import { normalizePersistedReadingState } from './features/reading-companion/domain/persistedReadingState.js'
import { normalizePersonalPackage } from './features/reading-companion/domain/persistedPersonalPackage.js'
import {
  assertReadingPackage,
  readingStateKey,
} from './features/reading-companion/domain/readingCompanion.js'

export const READING_BACKUP_FORMAT = 'tangerine-reading-companion-backup'
export const READING_BACKUP_SCHEMA_VERSION = 1

const READING_META_PREFIXES = ['readerState:', 'readerPersonalPackage:']
const TANGERINE_TOOLS_SCHEMA_VERSION = 1
const TANGERINE_TOOLS_TABLE_KEYS = ['scenes', 'catalogTables', 'catalogFields', 'catalogRows']

function isReadingMetaRecord(record) {
  return record
    && typeof record.key === 'string'
    && READING_META_PREFIXES.some((prefix) => record.key.startsWith(prefix))
    && Object.hasOwn(record, 'value')
}

function normalizeStateRecord(record) {
  if (!record.key.startsWith('readerState:')) return record
  if (!record.value || typeof record.value !== 'object' || Array.isArray(record.value)) {
    throw new Error(`阅读状态记录无效：${record.key}`)
  }
  const editionId = record.value?.editionId || record.key.split(':').at(-1)
  if (typeof editionId !== 'string' || !editionId.trim()) {
    throw new Error(`阅读状态缺少版本 id：${record.key}`)
  }
  if (record.value.currentChapterId !== undefined
    && typeof record.value.currentChapterId !== 'string') {
    throw new Error(`阅读状态章节无效：${record.key}`)
  }
  if (record.value.observedEntities !== undefined
    && !Array.isArray(record.value.observedEntities)) {
    throw new Error(`阅读状态已遇到记录无效：${record.key}`)
  }
  const value = normalizePersistedReadingState({ ...record.value, editionId })
  return { key: readingStateKey(editionId), value }
}

function normalizePersonalPackageRecord(record) {
  if (!record.key.startsWith('readerPersonalPackage:')) return record
  const pkg = normalizePersonalPackage(record.value?.package)
  try {
    assertReadingPackage(pkg)
  } catch {
    throw new Error(`个人书籍记录无效：${record.key}`)
  }
  if (!pkg.personal) throw new Error(`个人书籍记录缺少个人书籍标记：${record.key}`)
  if (record.key !== `readerPersonalPackage:${pkg.id}`) {
    throw new Error(`个人书籍记录 key 与资料包 id 不一致：${record.key}`)
  }
  return { key: record.key, value: {
    package: pkg,
    ...Object.fromEntries(['createdAt', 'updatedAt'].flatMap(key => {
      const value = record.value[key]
      if (value === undefined) return []
      if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error('个人书籍时间无效')
      return [[key, value]]
    })),
  } }
}

function backupSource(payload) {
  if (payload?.format === READING_BACKUP_FORMAT) return 'reading-companion'
  if (payload?.format !== undefined) {
    throw new Error(`不支持的备份格式：${payload.format}`)
  }
  const data = payload?.data
  const isTangerineToolsBackup = data
    && TANGERINE_TOOLS_TABLE_KEYS.every((key) => Array.isArray(data[key]))
  if (!isTangerineToolsBackup) throw new Error('文件不是受支持的阅读伴侣或 TangerineTools 备份')
  return 'tangerine-tools'
}

function newestRecord(left, right) {
  const leftTime = Date.parse(left?.value?.updatedAt || '') || 0
  const rightTime = Date.parse(right?.value?.updatedAt || '') || 0
  return rightTime >= leftTime ? right : left
}

function normalizeReadingRecords(meta) {
  const records = new Map()
  const canonicalKeys = new Set()
  for (const candidate of meta) {
    if (typeof candidate?.key === 'string'
      && READING_META_PREFIXES.some(prefix => candidate.key.startsWith(prefix))
      && !Object.hasOwn(candidate, 'value')) throw new Error('阅读记录缺少 value')
    if (!isReadingMetaRecord(candidate)) continue
    const normalized = normalizePersonalPackageRecord(normalizeStateRecord(candidate))
    const canonical = candidate.key === normalized.key
    if (canonical && !canonicalKeys.has(normalized.key)) {
      records.set(normalized.key, normalized)
    } else if (canonical || !canonicalKeys.has(normalized.key)) {
      records.set(normalized.key, newestRecord(records.get(normalized.key), normalized))
    }
    if (canonical) canonicalKeys.add(normalized.key)
  }
  return [...records.values()]
}

export function readingRecordsFromPayload(payload) {
  const meta = payload?.data?.meta
  if (!Array.isArray(meta)) throw new Error('备份中缺少有效的 data.meta 数组')

  const source = backupSource(payload)
  const expectedSchemaVersion = source === 'reading-companion'
    ? READING_BACKUP_SCHEMA_VERSION
    : TANGERINE_TOOLS_SCHEMA_VERSION
  if (payload.schemaVersion !== expectedSchemaVersion) {
    throw new Error(`不支持的${source === 'reading-companion' ? '阅读' : ' TangerineTools'}备份版本：${payload.schemaVersion}`)
  }

  const records = normalizeReadingRecords(meta)
  if (records.length === 0) throw new Error('备份中没有可导入的阅读记录')
  return { records, source }
}

export async function exportReadingData() {
  const meta = normalizeReadingRecords(await db.meta.toArray())
  return {
    format: READING_BACKUP_FORMAT,
    schemaVersion: READING_BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: { meta },
  }
}

function mergeSummary(localRecords, incomingRecords) {
  const localKeys = new Set(normalizeReadingRecords(localRecords).map(record => record.key))
  const incomingKeys = new Set(incomingRecords.map(record => record.key))
  const replaced = incomingRecords.filter(record => localKeys.has(record.key)).length
  return {
    added: incomingRecords.length - replaced,
    replaced,
    retained: [...localKeys].filter(key => !incomingKeys.has(key)).length,
  }
}

export async function previewReadingImport(payload) {
  const { records, source } = readingRecordsFromPayload(payload)
  const localRecords = await db.meta.toArray()
  return {
    source,
    total: records.length,
    ...mergeSummary(localRecords, records),
    // Memory-only concurrency token. Never written to storage or diagnostics.
    snapshot: JSON.stringify(localRecords),
  }
}

export async function importReadingData(payload, { expectedSnapshot } = {}) {
  const { records, source } = readingRecordsFromPayload(payload)
  return db.transaction('rw', db.meta, async () => {
    const localRecords = await db.meta.toArray()
    if (expectedSnapshot !== undefined && JSON.stringify(localRecords) !== expectedSnapshot) {
      throw new Error('预览后本机数据已变化，请重新选择备份、预览并备份本机数据。')
    }
    const summary = mergeSummary(localRecords, records)
    await db.meta.bulkPut(records)
    return { imported: records.length, source, ...summary }
  })
}
