import assert from 'node:assert/strict'
import test from 'node:test'
import 'fake-indexeddb/auto'
import { db } from '../../src/db/core.js'
import {
  exportReadingData,
  importReadingData,
  readingRecordsFromPayload,
  READING_BACKUP_FORMAT,
} from '../../src/readingDataTransfer.js'

test.beforeEach(async () => {
  await db.meta.clear()
})

test.after(async () => {
  db.close()
})

test('extracts reading records from a TangerineTools backup and normalizes scene ids', () => {
  const result = readingRecordsFromPayload({
    schemaVersion: 1,
    data: {
      scenes: [],
      catalogTables: [],
      catalogFields: [],
      catalogRows: [],
      meta: [
        { key: 'seededRockKingdom', value: true },
        {
          key: 'readerState:custom-scene:edition-1',
          value: { sceneId: 'custom-scene', editionId: 'edition-1', currentChapterId: 'chapter-2' },
        },
      ],
    },
  })

  assert.equal(result.source, 'tangerine-tools')
  assert.deepEqual(result.records.map((record) => record.key).sort(), [
    'readerState:scene-reading-companion:edition-1',
  ])
  assert.equal(result.records.find((record) => record.key.startsWith('readerState:')).value.sceneId, 'scene-reading-companion')
})

test('imports by key and exports only reading records', async () => {
  const imported = await importReadingData({
    format: READING_BACKUP_FORMAT,
    schemaVersion: 1,
    data: {
      meta: [
        { key: 'readerState:scene-reading-companion:edition-1', value: { editionId: 'edition-1' } },
      ],
    },
  })
  await db.meta.put({ key: 'unrelated', value: true })

  assert.equal(imported.imported, 1)
  const exported = await exportReadingData()
  assert.equal(exported.format, READING_BACKUP_FORMAT)
  assert.deepEqual(exported.data.meta.map((record) => record.key), [
    'readerState:scene-reading-companion:edition-1',
  ])
})

test('rejects backups without reading data', () => {
  assert.throws(
    () => readingRecordsFromPayload({
      schemaVersion: 1,
      data: {
        scenes: [],
        catalogTables: [],
        catalogFields: [],
        catalogRows: [],
        meta: [{ key: 'seededRockKingdom', value: true }],
      },
    }),
    /没有可导入的阅读记录/u,
  )
})

test('rejects unknown formats and malformed reading records', () => {
  assert.throws(
    () => readingRecordsFromPayload({
      format: 'tangerine-reading-companion-backup-v2',
      schemaVersion: 1,
      data: { meta: [] },
    }),
    /不支持的备份格式/u,
  )
  assert.throws(
    () => readingRecordsFromPayload({
      schemaVersion: 1,
      data: { meta: [{ key: 'readerState:old:edition-1', value: null }] },
    }),
    /不是受支持/u,
  )
  assert.throws(
    () => readingRecordsFromPayload({
      format: READING_BACKUP_FORMAT,
      schemaVersion: 1,
      data: {
        meta: [{
          key: 'readerState:scene-reading-companion:edition-1',
          value: { editionId: 'edition-1', observedEntities: {} },
        }],
      },
    }),
    /已遇到记录无效/u,
  )
})
