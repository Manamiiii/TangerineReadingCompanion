import test from 'node:test'
import assert from 'node:assert/strict'
import { isValidGeoJsonGeometry } from '../../src/features/reading-companion/domain/geometry.js'
import { normalizeNominatimResults } from '../../src/features/reading-companion/map/geocoding.js'
import { loadStoredModelConfig } from '../../src/features/model/modelConfig.js'
import { loadStoredReadingMapConfig, saveStoredReadingMapConfig, READING_MAP_STORAGE_KEYS } from '../../src/features/reading-companion/map/mapConfig.js'
import { createPersonalReadingPackage, mergePersonalBookKnowledge } from '../../src/features/reading-companion/domain/personalBooks.js'
import { assertReadingPackage, validateReadingPackage } from '../../src/features/reading-companion/domain/readingCompanion.js'
import { assertBackupSize } from '../../src/readingDataTransfer.js'
import { answerReadingQuestion } from '../../src/features/reading-companion/model/modelAdapter.js'

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
