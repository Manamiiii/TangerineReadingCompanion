import test from 'node:test'
import assert from 'node:assert/strict'
import { isValidGeoJsonGeometry } from '../../src/features/reading-companion/domain/geometry.js'
import { normalizeNominatimResults, searchReadingPlaces } from '../../src/features/reading-companion/map/geocoding.js'
import { loadStoredModelConfig } from '../../src/features/model/modelConfig.js'
import { loadStoredReadingMapConfig, saveStoredReadingMapConfig, READING_MAP_STORAGE_KEYS } from '../../src/features/reading-companion/map/mapConfig.js'
import { createPersonalReadingPackage, mergePersonalBookKnowledge } from '../../src/features/reading-companion/domain/personalBooks.js'
import { assertReadingPackage, validateReadingPackage } from '../../src/features/reading-companion/domain/readingCompanion.js'
import { assertBackupSize } from '../../src/readingDataTransfer.js'
import { answerReadingQuestion } from '../../src/features/reading-companion/model/modelAdapter.js'
import { scanBookMetadata, mergeScannedMetadata } from '../../src/features/reading-companion/input/bookMetadataScan.js'
import { assertReadingCatalog } from '../../src/features/reading-companion/domain/readingCatalog.js'
import { readingDiagnosticErrorCode } from '../../src/features/reading-companion/domain/trialDiagnostics.js'
import { extractPersonalBookMetadataDetails } from '../../src/features/reading-companion/domain/personalBooks.js'

test('explicit author and translator values preserve characters that resemble role labels', () => {
  const { metadata } = extractPersonalBookMetadataDetails('书名：测试书\n作者：测试作者\n译者：张译、李和平')
  assert.equal(metadata.author, '测试作者')
  assert.deepEqual(metadata.translators, ['张译', '李和平'])
})

test('GeoJSON validates nesting, ring closure, minimum points and bounded input', () => {
  for (const geometry of [
    { type: 'Point', coordinates: [[1, 2], [3, 4]] },
    { type: 'LineString', coordinates: [1, 2] },
    { type: 'LineString', coordinates: [[1, 2]] },
    { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] },
    { type: 'MultiPolygon', coordinates: [] },
    { type: 'Point', coordinates: [null, 2] },
    { type: 'LineString', coordinates: Array(10001).fill([1, 2]) },
  ]) assert.equal(isValidGeoJsonGeometry(geometry), false)
  assert.equal(isValidGeoJsonGeometry({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }), true)
  for (const lat of [null, '', ' ', false, []]) assert.deepEqual(normalizeNominatimResults([{ lat, lon: 10, display_name: 'test' }]), [])
})

test('denied config storage falls back without throwing or retaining credentials', () => {
  const denied = { get localStorage() { throw new Error('denied') } }
  assert.equal(loadStoredModelConfig('', true, denied).apiKey, '')
  assert.equal(loadStoredReadingMapConfig({ getItem() { throw new Error('denied') } }, {}).tiandituToken, '')
})

test('map credentials migrate once to session and cannot revive after clearing', () => {
  const storage = initial => { const data = new Map(Object.entries(initial)); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) } }
  const local = storage({ 'reader-map-tianditu-token': 'test-token' }), session = storage({})
  assert.equal(loadStoredReadingMapConfig(local, session).tiandituToken, 'test-token')
  assert.equal(local.getItem('reader-map-tianditu-token'), null)
  assert.equal(local.getItem(READING_MAP_STORAGE_KEYS.tiandituToken), null)
  saveStoredReadingMapConfig({ providerId: 'tianditu', tiandituToken: '' }, local, session)
  assert.equal(loadStoredReadingMapConfig(local, session).tiandituToken, '')
})

test('personal unknown places remain valid without coordinates and package UI contracts are enforced', () => {
  const pkg = createPersonalReadingPackage({ packageId: 'p', bookId: 'b', editionId: 'e', title: '测试', author: '作者', chapterCount: 2 })
  const prepared = mergePersonalBookKnowledge(pkg, [{ name: '未知地', kind: 'place', placeKind: 'unknown' }], () => 'x').package
  assertReadingPackage(prepared)
  prepared.onDemandEntities[0].geometry = { type: 'point', latitude: 1, longitude: 2 }
  assert.ok(validateReadingPackage(prepared).some(error => error.includes('未知地点')))
  prepared.onDemandEntities[0].placeKind = 'approximate'
  assert.ok(validateReadingPackage(prepared).some(error => error.includes('不能伪造精确坐标')))
  pkg.edition.translators = 'not an array'
  pkg.chapters[1].number = 20
  assert.ok(validateReadingPackage(pkg).some(error => error.includes('translators')))
  assert.ok(validateReadingPackage(pkg).some(error => error.includes('number')))
})

test('oversized export and evidence input fail explicitly before external work', async () => {
  assert.throws(() => assertBackupSize({ text: '中文'.repeat(100) }, 100), /导入上限/)
  await assert.rejects(answerReadingQuestion({ question: '这是什么', excerpt: '字'.repeat(6001), fetchImpl: () => assert.fail('must not request') }), /6000/)
})

test('optional OCR and model failures preserve local metadata and concurrent manual edits', async () => {
  const result = await scanBookMetadata({
    file: new Blob(['synthetic'], { type: 'image/png' }),
    recognize: async () => '书名：测试书籍\n作者：王明',
    recognizeStructured: async () => { throw new Error('retry failed') },
    analyze: async () => { throw new Error('model failed') },
    modelConfig: { endpoint: 'https://test.example', model: 'test', apiKey: 'synthetic' },
  })
  assert.equal(result.metadata.title, '测试书籍')
  assert.equal(result.warnings.length, 2)
  const merged = mergeScannedMetadata({ title: '手动书名', author: '' }, result.metadata, {}, { title: 1 })
  assert.equal(merged.title, '手动书名')
  assert.equal(merged.author, '王明')
  await assert.rejects(scanBookMetadata({ file: new Blob(['bad']), recognize: () => assert.fail('invalid image must not initialize OCR') }), /图片/)
})

test('catalog validator rejects duplicate ids and missing summaries', () => {
  const entry = { id: 'book', title: '书', editionLabel: '版本', path: 'presets/reading-companion/book.json', preparedSummary: Object.fromEntries(['entityCount', 'place', 'person', 'concept', 'event', 'factCount', 'sourceCount'].map(key => [key, 0])) }
  assert.throws(() => assertReadingCatalog({ schemaVersion: 1, packages: [entry, entry] }), /重复/)
  assert.throws(() => assertReadingCatalog({ schemaVersion: 1, packages: [{ ...entry, preparedSummary: {} }] }), /摘要/)
})

test('map timeout covers response bodies and diagnostics distinguish cancellation from timeout', async () => {
  const original = globalThis.setTimeout, clear = globalThis.clearTimeout
  let expire, cleared = false
  globalThis.setTimeout = callback => { expire = callback; return 1 }
  globalThis.clearTimeout = () => { cleared = true }
  try {
    await assert.rejects(searchReadingPlaces({ providerId: 'openstreetmap', query: 'synthetic-timeout', fetchImpl: async () => ({ ok: true, json: async () => { expire(); return [] } }) }), { name: 'TimeoutError' })
    assert.equal(cleared, true)
  } finally { globalThis.setTimeout = original; globalThis.clearTimeout = clear }
  assert.equal(readingDiagnosticErrorCode({ status: 401 }), 'authentication')
  assert.equal(readingDiagnosticErrorCode({ status: 429 }), 'rate-limit')
  assert.equal(readingDiagnosticErrorCode({ name: 'AbortError' }), 'cancelled')
  assert.equal(readingDiagnosticErrorCode({ name: 'TimeoutError' }), 'timeout')
})
