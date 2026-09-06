import assert from 'node:assert/strict'
import test from 'node:test'
import 'fake-indexeddb/auto'
import { db } from '../../src/db/core.js'
import { upsertObservedEntity, updateObservedEntityNote } from '../../src/features/reading-companion/domain/readingCompanion.js'
import { createPersonalReadingPackage, mergePersonalBookKnowledge } from '../../src/features/reading-companion/domain/personalBooks.js'
import { savePersonalReadingPackage, updatePersonalReadingPackage, loadPersonalReadingPackage, deletePersonalReadingPackage } from '../../src/features/reading-companion/db/personalBooks.js'
import {
  exportReadingData,
  importReadingData,
  previewReadingImport,
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

test('concurrent progress, name and note commands preserve each other', async () => {
  const chapters = [{ id: 'chapter-01' }, { id: 'chapter-02' }]
  const entry = id => ({ id, name: id, kind: 'person', firstSeenChapterId: 'chapter-01' })
  await saveReadingState('concurrent', { currentChapterId: 'chapter-01', observedEntities: [entry('Alice')] })
  await Promise.all([
    saveReadingState('concurrent', { currentChapterId: 'chapter-02' }),
    saveReadingState('concurrent', state => ({ observedEntities: upsertObservedEntity(state.observedEntities, entry('Bob'), chapters) })),
    saveReadingState('concurrent', state => ({ observedEntities: updateObservedEntityNote(state.observedEntities, 'Alice', '保留备注') })),
  ])
  const result = await getReadingState('concurrent')
  assert.equal(result.currentChapterId, 'chapter-02')
  assert.deepEqual(result.observedEntities.map(item => item.id), ['Alice', 'Bob'])
  assert.equal(result.observedEntities[0].note, '保留备注')
})

test('personal preparation merges concurrent additions and cannot resurrect a deleted book', async () => {
  const pkg = createPersonalReadingPackage({ packageId: 'personal', bookId: 'book', editionId: 'edition', title: '测试', author: '测试', chapterCount: 2 })
  await savePersonalReadingPackage(pkg)
  await Promise.all(['Alpha', 'Beta'].map(name => updatePersonalReadingPackage(pkg.id, current => (
    mergePersonalBookKnowledge(current, [{ name, kind: 'concept' }], () => name).package
  ))))
  assert.deepEqual((await loadPersonalReadingPackage(pkg.id)).onDemandEntities.map(item => item.name), ['Alpha', 'Beta'])
  await deletePersonalReadingPackage(pkg.id)
  await assert.rejects(updatePersonalReadingPackage(pkg.id, () => pkg), /不存在|移除/)
  assert.equal(await db.meta.get('readerPersonalPackage:personal'), undefined)
})

test('backup roundtrip projects nested fields and rejects malformed records before writing', async () => {
  const pkg = createPersonalReadingPackage({ packageId: 'personal', bookId: 'book', editionId: 'edition', title: '测试', author: '测试', chapterCount: 2 })
  pkg.book.excerpt = 'PRIVATE-RAW'
  pkg.book.cover.apiKey = 'PRIVATE-KEY'
  const state = { editionId: 'edition', excerpt: 'PRIVATE-RAW', spoilerAuthorization: 'high', observedEntities: [{
    id: 'Alice', name: 'Alice', kind: 'person', firstSeenChapterId: 'chapter-01', note: '保留个人备注', ocrText: 'PRIVATE-OCR',
  }] }
  const payload = { format: READING_BACKUP_FORMAT, schemaVersion: 1, data: { meta: [
    { key: 'readerState:edition', value: state },
    { key: 'readerPersonalPackage:personal', value: { package: pkg, apiKey: 'PRIVATE-KEY' } },
  ] } }
  await importReadingData(payload)
  const exported = await exportReadingData()
  assert.doesNotMatch(JSON.stringify(exported), /PRIVATE-|spoilerAuthorization/)
  assert.match(JSON.stringify(exported), /保留个人备注/)
  const before = await db.meta.toArray()
  const malformed = structuredClone(payload)
  malformed.data.meta[0].value.observedEntities[0].name = 42
  await assert.rejects(importReadingData(malformed), /名称无效/)
  assert.deepEqual(await db.meta.toArray(), before)
  state.observedEntities[0] = { id: 'place', name: '虚构地点', kind: 'place', placeKind: 'fictional', firstSeenChapterId: 'chapter-01', mapLocation: { mode: 'exact', latitude: 30, longitude: 40, label: '不应接受', providerId: 'test' } }
  await assert.rejects(importReadingData(payload), /地点性质/)
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


test('preview is read-only, reports merge counts and rejects concurrent local changes atomically', async () => {
  await db.meta.bulkPut([
    { key: 'readerState:edition-1', value: { editionId: 'edition-1', currentChapterId: 'chapter-01' } },
    { key: 'readerState:keep', value: { editionId: 'keep' } },
  ])
  const payload = { format: READING_BACKUP_FORMAT, schemaVersion: 1, data: { meta: [
    { key: 'readerState:edition-1', value: { editionId: 'edition-1', currentChapterId: 'chapter-02' } },
    { key: 'readerState:new', value: { editionId: 'new' } },
  ] } }
  const before = await db.meta.toArray()
  const preview = await previewReadingImport(payload)
  assert.equal(preview.added, 1)
  assert.equal(preview.replaced, 1)
  assert.equal(preview.retained, 1)
  assert.deepEqual(await db.meta.toArray(), before)
  await saveReadingState('edition-1', { currentChapterId: 'chapter-03' })
  await assert.rejects(importReadingData(payload, { expectedSnapshot: preview.snapshot }), /数据已变化/)
  assert.equal(await db.meta.get('readerState:new'), undefined)
  assert.equal((await db.meta.get('readerState:edition-1')).value.currentChapterId, 'chapter-03')
  const current = await previewReadingImport(payload)
  const result = await importReadingData(payload, { expectedSnapshot: current.snapshot })
  assert.equal(result.retained, 1)
  assert.ok(await db.meta.get('readerState:keep'))
})

test('legacy lookup can run in a readonly subscription before explicit migration', async () => {
  await db.meta.put({ key: 'readerState:old:edition-1', value: { editionId: 'edition-1', currentChapterId: 'chapter-02' } })
  const state = await db.transaction('r', db.meta, () => getReadingState('edition-1', { migrate: false }))
  assert.equal(state.currentChapterId, 'chapter-02')
  assert.equal(await db.meta.get('readerState:edition-1'), undefined)
  await getReadingState('edition-1')
  assert.ok(await db.meta.get('readerState:edition-1'))
})
