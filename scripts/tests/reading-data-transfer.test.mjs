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
import {
  getReadingState,
  saveReadingState,
} from '../../src/features/reading-companion/db/readingState.js'

test.beforeEach(async () => {
  await db.meta.clear()
})

test.after(async () => {
  db.close()
})

test('extracts reading records from a TangerineTools backup and removes scene ids', () => {
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
    'readerState:edition-1',
  ])
  assert.equal(Object.hasOwn(result.records[0].value, 'sceneId'), false)
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
    'readerState:edition-1',
  ])
})

test('reading state lazily copies the newest legacy scene record and only writes edition keys', async () => {
  await db.meta.bulkPut([{
    key: 'readerState:old-scene:edition-1',
    value: {
      sceneId: 'old-scene',
      editionId: 'edition-1',
      currentChapterId: 'chapter-01',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  }, {
    key: 'readerState:scene-reading-companion:edition-1',
    value: {
      sceneId: 'scene-reading-companion',
      editionId: 'edition-1',
      currentChapterId: 'chapter-02',
      updatedAt: '2026-02-01T00:00:00.000Z',
    },
  }])

  const migrated = await getReadingState('edition-1')
  assert.equal(migrated.currentChapterId, 'chapter-02')
  assert.equal(Object.hasOwn(migrated, 'sceneId'), false)
  assert.deepEqual((await db.meta.get('readerState:edition-1')).value, migrated)

  const saved = await saveReadingState('edition-1', { currentChapterId: 'chapter-03' })
  assert.equal(saved.currentChapterId, 'chapter-03')
  assert.equal(Object.hasOwn(saved, 'sceneId'), false)
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
