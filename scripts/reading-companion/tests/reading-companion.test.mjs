import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  OBSERVED_ENTITY_KIND,
  OBSERVED_PLACE_KIND,
  SPOILER_GATE_ACTION,
  SPOILER_RISK,
  canRevealRisk,
  clearObservedPlaceLocation,
  confirmObservedPlaceApproximateArea,
  confirmObservedPlaceLocation,
  confirmObservedRealPlaceFallbackArea,
  isRevealedAtChapter,
  matchOnDemandEntity,
  normalizeObservedEntityName,
  observedEntityEncounterChapterIds,
  projectReadingPlaces,
  readingEntitySafeNoteSources,
  readingPlaceRelations,
  readerConfirmedMapEntities,
  readingStateKey,
  riskForDisclosure,
  scanOnDemandEntities,
  scanObservedEntities,
  spoilerGateAction,
  strongestSpoilerRisk,
  summarizeReadingPackage,
  unlockedOnDemandEntities,
  updateObservedEntityNote,
  updateObservedPlaceKind,
  upsertObservedEntity,
  validateReadingPackage,
  visibleReadingEntities,
  visibleReadingFacts,
  visibleObservedEntities,
} from '../../../src/features/reading-companion/domain/readingCompanion.js'
import {
  buildReadingPreviewFromStaging,
  buildReadingPreviews,
} from '../lib/package-pipeline.mjs'
import {
  auditReadingPackageQuality,
  checkReadingSourceLinks,
} from '../lib/quality-audit.mjs'
import {
  READING_MAP_DEFAULT_VIEW,
  READING_MAP_PROVIDER,
  normalizeReadingMapProvider,
  readingMapTileSources,
} from '../../../src/features/reading-companion/map/mapConfig.js'
import {
  normalizeGeoJsonGeometry,
  normalizeNominatimResults,
  normalizeTiandituResults,
  searchReadingPlaces,
} from '../../../src/features/reading-companion/map/geocoding.js'
import {
  buildPersonalChapters,
  createPersonalReadingPackage,
  extractPersonalBookMetadataDetails,
  extractPersonalBookMetadataFromText,
  mergePersonalBookKnowledge,
  mergePersonalBookMetadata,
  personalCatalogEntry,
} from '../../../src/features/reading-companion/domain/personalBooks.js'
import {
  analyzeReadingBookMetadata,
  analyzeReadingExcerpt,
  answerReadingQuestion,
  normalizeModelCandidates,
  normalizePersonalBookKnowledge,
  preparePersonalBookKnowledge,
  readingAnswerLooksForward,
  readingQuestionLooksForward,
  suggestReadingPlaceQueries,
  translateReadingPlaceQuery,
} from '../../../src/features/reading-companion/model/modelAdapter.js'
import {
  normalizeOcrText,
} from '../../../src/features/ocr/localOcr.js'
import {
  READING_MODEL_PROVIDER,
  READING_MODEL_PROVIDERS,
  inferReadingModelProvider,
  readingModelApiKeyStorageKey,
  readingModelProviderDefaults,
} from '../../../src/features/reading-companion/model/modelProviders.js'
import {
  READING_PROMPT_IDS,
  personalBookKnowledgeMessages,
} from '../../../src/features/reading-companion/model/promptCatalog.js'
import {
  READING_FEEDBACK_KIND,
  READING_FEEDBACK_SCHEMA_VERSION,
  createReadingFeedbackBundle,
} from '../../../src/features/reading-companion/domain/feedbackBundle.js'
import {
  readingDiagnosticErrorCode,
  readingTrialDiagnosticsSnapshot,
  recordReadingTrialDiagnostic,
} from '../../../src/features/reading-companion/domain/trialDiagnostics.js'

const repoUrl = new URL('../../../', import.meta.url)
const readingPackage = JSON.parse(
  await readFile(
    new URL('public/presets/reading-companion/gone-with-the-wind-zh-9787570202188.json', repoUrl),
    'utf8',
  ),
)

test('reading companion keeps feature code and maintenance files in dedicated directories', async () => {
  const dedicatedPaths = [
    'src/features/reading-companion/index.js',
    'src/features/reading-companion/components/ReaderTool.jsx',
    'src/features/reading-companion/components/ReadingGeoMap.jsx',
    'src/features/reading-companion/data/readingPackages.js',
    'src/features/reading-companion/db/personalBooks.js',
    'src/features/reading-companion/db/readingState.js',
    'src/features/reading-companion/domain/personalBooks.js',
    'src/features/reading-companion/domain/feedbackBundle.js',
    'src/features/reading-companion/domain/trialDiagnostics.js',
    'src/features/reading-companion/domain/readingCompanion.js',
    'src/features/reading-companion/map/geocoding.js',
    'src/features/reading-companion/map/mapConfig.js',
    'src/features/reading-companion/model/modelAdapter.js',
    'src/features/reading-companion/model/modelProviders.js',
    'src/features/ocr/localOcr.js',
    'src/readingDataTransfer.js',
    'scripts/reading-companion/build-preview.mjs',
    'scripts/reading-companion/audit-quality.mjs',
    'scripts/reading-companion/lib/quality-audit.mjs',
    'docs/model-provider-setup.md',
    'docs/product-and-architecture.md',
  ]
  await Promise.all(dedicatedPaths.map((file) => access(new URL(file, repoUrl))))

  const retiredMixedPaths = [
    'src/components/reader.jsx',
    'src/data/readingPackages.js',
    'src/db/readingState.js',
    'src/db/readingCompanionSeed.js',
    'src/domain/readingCompanion.js',
    'src/presets/readingCompanion.js',
    'scripts/reading/build-preview.mjs',
  ]
  for (const file of retiredMixedPaths) {
    await assert.rejects(access(new URL(file, repoUrl)), { code: 'ENOENT' })
  }
})

test('PWA registration and static cache use the same update generation', async () => {
  const [html, serviceWorker] = await Promise.all([
    readFile(new URL('index.html', repoUrl), 'utf8'),
    readFile(new URL('public/sw.js', repoUrl), 'utf8'),
  ])
  assert.match(html, /sw\.js\?v=6/)
  assert.match(serviceWorker, /tangerine-static-v6/)
})

test('personal books accept a chapter count or pasted numeric directory', () => {
  assert.deepEqual(buildPersonalChapters({ chapterCount: 3, chapterText: '' }), [
    { id: 'chapter-01', number: 1, label: '第 1 章' },
    { id: 'chapter-02', number: 2, label: '第 2 章' },
    { id: 'chapter-03', number: 3, label: '第 3 章' },
  ])
  assert.deepEqual(buildPersonalChapters({
    chapterCount: 1,
    chapterText: '1\n2\n尾声',
  }), [
    { id: 'chapter-01', number: 1, label: '第 1 章' },
    { id: 'chapter-02', number: 2, label: '第 2 章' },
    { id: 'chapter-03', number: 3, label: '尾声' },
  ])
  assert.throws(
    () => buildPersonalChapters({ chapterCount: 0, chapterText: '' }),
    /章节数量/,
  )
})

test('personal book creation produces a valid empty local package and catalog entry', () => {
  const pkg = createPersonalReadingPackage({
    packageId: 'reader-package-personal-test',
    bookId: 'reader-book-personal-test',
    editionId: 'reader-edition-personal-test',
    title: '测试个人书籍',
    author: '测试作者',
    publisher: '测试出版社',
    publishedAt: '2026-07',
    translators: '译者甲、译者乙',
    chapterCount: 2,
  })
  assert.deepEqual(validateReadingPackage(pkg), [])
  assert.equal(pkg.personal, true)
  assert.equal(pkg.chapters.length, 2)
  assert.deepEqual(pkg.entities, [])
  assert.deepEqual(pkg.facts, [])
  assert.deepEqual(pkg.edition.translators, ['译者甲', '译者乙'])
  assert.deepEqual(personalCatalogEntry(pkg), {
    id: pkg.id,
    title: '测试个人书籍',
    editionLabel: '测试出版社 · 2026-07',
    source: 'personal',
    cover: { theme: 'amber' },
    preparedSummary: {
      entityCount: 0,
      place: 0,
      person: 0,
      concept: 0,
      event: 0,
      factCount: 0,
      sourceCount: 0,
    },
  })
})

test('personal book AI knowledge becomes a hidden exact-match dictionary without facts', () => {
  const pkg = createPersonalReadingPackage({
    packageId: 'reader-package-personal-ai-test',
    bookId: 'reader-book-personal-ai-test',
    editionId: 'reader-edition-personal-ai-test',
    title: '测试个人书籍',
    author: '测试作者',
    chapterCount: 2,
  })
  let id = 0
  const prepared = mergePersonalBookKnowledge(pkg, [
    {
      name: '测试人物',
      originalName: 'Test Person',
      aliases: ['人物别名'],
      kind: 'person',
      plot: 'ignored',
    },
    {
      name: '测试地点',
      aliases: [],
      kind: 'place',
      placeKind: 'fictional',
      latitude: 1,
      longitude: 2,
    },
  ], () => `personal-ai-${id += 1}`)
  assert.equal(prepared.addedCount, 2)
  assert.deepEqual(validateReadingPackage(prepared.package), [])
  assert.equal(prepared.package.onDemandEntities[0].activation, 'exact-reader-input')
  assert.equal('plot' in prepared.package.onDemandEntities[0], false)
  assert.equal('geometry' in prepared.package.onDemandEntities[1], false)
  assert.deepEqual(prepared.package.facts, [])
  const repeated = mergePersonalBookKnowledge(
    prepared.package,
    [{ name: '测试人物', kind: 'person', aliases: [] }],
    () => 'unused',
  )
  assert.equal(repeated.addedCount, 0)
})

test('book detail OCR text provides deterministic metadata before optional model cleanup', () => {
  assert.deepEqual(
    extractPersonalBookMetadataFromText([
      '飘（世界文学名著名译典藏）',
      '玛格丽特·米切尔 著 / 范纯海、夏旻 译',
      '出版社：长江文艺出版社',
      '出版时间 2018年5月',
      'ISBN 9787570202188',
    ].join('\n')),
    {
      title: '飘(世界文学名著名译典藏)',
      author: '玛格丽特·米切尔',
      translators: ['范纯海', '夏旻'],
      publisher: '长江文艺出版社',
      isbn: '9787570202188',
      publishedAt: '2018-05',
    },
  )
})

test('book detail OCR prefers colon-labeled title and translators', () => {
  assert.deepEqual(
    extractPersonalBookMetadataFromText([
      '书 名 ：飘（世界文学名著名译典藏）',
      '作者：玛格丽特·米切尔',
      '译者：范纯海、夏旻',
      '出版社：长江文艺出版社',
      '出版时间：2018年5月',
      'ISBN：9787570202188',
    ].join('\n')),
    {
      title: '飘(世界文学名著名译典藏)',
      author: '玛格丽特·米切尔',
      translators: ['范纯海', '夏旻'],
      publisher: '长江文艺出版社',
      isbn: '9787570202188',
      publishedAt: '2018-05',
    },
  )
})

test('book metadata parsing recovers labels even when OCR merged all rows', () => {
  assert.deepEqual(
    extractPersonalBookMetadataFromText(
      '书名:飘 作者:(美)玛格丽特·米切尔 译者:范纯海、夏旻 出版社:长江文艺出版社 ISBN:9787570202188',
    ),
    {
      title: '飘',
      author: '(美)玛格丽特·米切尔',
      translators: ['范纯海', '夏旻'],
      publisher: '长江文艺出版社',
      isbn: '9787570202188',
    },
  )
})

test('structured local title and translators reject noisy model overrides', () => {
  assert.deepEqual(
    mergePersonalBookMetadata(
      {
        title: '傲慢与偏见',
        author: '简·奥斯本',
        translators: ['孙致礼'],
      },
      {
        title: 'FE:傲慢与偏见',
        author: '简·奥斯丁',
        translators: [],
        publisher: '译林出版社',
      },
    ),
    {
      title: '傲慢与偏见',
      author: '简·奥斯丁',
      translators: ['孙致礼'],
      publisher: '译林出版社',
    },
  )
})

test('damaged FE and BE labels become model-correctable low-confidence fields', () => {
  const details = extractPersonalBookMetadataDetails([
    '版权信息',
    'FE: 做慢与俩见',
    '作者 : 简 - 奥斯本',
    'BE: HEAL',
    '出版社 : 译林出版社',
    '出版时间 : 2010-06-01',
    'ISBN: 9787544711302',
  ].join('\n'))
  assert.deepEqual(details, {
    metadata: {
      title: '做慢与俩见',
      author: '简 - 奥斯本',
      translators: ['HEAL'],
      publisher: '译林出版社',
      isbn: '9787544711302',
      publishedAt: '2010-06',
    },
    uncertainFields: ['title', 'translators'],
  })
  assert.deepEqual(
    mergePersonalBookMetadata(
      details.metadata,
      {
        title: '傲慢与偏见',
        author: '简·奥斯丁',
        translators: ['孙致礼'],
      },
      details.uncertainFields,
    ),
    {
      title: '傲慢与偏见',
      author: '简·奥斯丁',
      translators: ['孙致礼'],
      publisher: '译林出版社',
      isbn: '9787544711302',
      publishedAt: '2010-06',
    },
  )
})

test('reading map providers keep international fallback and require a domestic browser key', () => {
  assert.deepEqual(READING_MAP_DEFAULT_VIEW, { center: [20, 0], zoom: 2 })
  assert.equal(
    normalizeReadingMapProvider('unknown-provider'),
    READING_MAP_PROVIDER.INTERNATIONAL,
  )
  const internationalSources = readingMapTileSources(READING_MAP_PROVIDER.INTERNATIONAL)
  assert.equal(internationalSources.length, 1)
  assert.match(internationalSources[0].url, /openstreetmap/)
  assert.deepEqual(
    {
      updateWhenIdle: internationalSources[0].options.updateWhenIdle,
      updateWhenZooming: internationalSources[0].options.updateWhenZooming,
      keepBuffer: internationalSources[0].options.keepBuffer,
    },
    {
      updateWhenIdle: true,
      updateWhenZooming: false,
      keepBuffer: 1,
    },
  )

  assert.deepEqual(readingMapTileSources(READING_MAP_PROVIDER.DOMESTIC), [])
  const domesticSources = readingMapTileSources(
    READING_MAP_PROVIDER.DOMESTIC,
    ' key with spaces ',
  )
  assert.equal(domesticSources.length, 2)
  assert.match(domesticSources[0].url, /vec_w\/wmts/)
  assert.match(domesticSources[1].url, /cva_w\/wmts/)
  assert.deepEqual(domesticSources.map((source) => source.usageKind), ['base', 'labels'])
  assert.ok(domesticSources.every((source) => source.url.includes('tk=key%20with%20spaces')))
})

test('map search adapters normalize international and domestic results without guessing coordinates', async () => {
  assert.deepEqual(normalizeNominatimResults([
    {
      place_id: 42,
      display_name: 'Atlanta, Fulton County, Georgia, United States',
      lat: '33.7489924',
      lon: '-84.3902644',
    },
    { place_id: 43, display_name: 'Invalid', lat: '999', lon: '0' },
  ]), [{
    id: '42',
    label: 'Atlanta, Fulton County, Georgia, United States',
    latitude: 33.7489924,
    longitude: -84.3902644,
    providerId: READING_MAP_PROVIDER.INTERNATIONAL,
  }])

  assert.deepEqual(normalizeTiandituResults({
    pois: [{
      hotPointID: 'tdt-1',
      name: '亚特兰大',
      eaddress: 'Atlanta',
      province: 'Georgia',
      lonlat: '-84.3902644,33.7489924',
    }],
  }), [{
    id: 'tdt-1',
    label: '亚特兰大 · Atlanta · Georgia',
    latitude: 33.7489924,
    longitude: -84.3902644,
    providerId: READING_MAP_PROVIDER.DOMESTIC,
  }])

  let requestedUrl = ''
  const results = await searchReadingPlaces({
    providerId: READING_MAP_PROVIDER.INTERNATIONAL,
    query: 'Atlanta',
    fetchImpl: async (url) => {
      requestedUrl = url
      return {
        ok: true,
        json: async () => [{
          place_id: 42,
          display_name: 'Atlanta, Georgia',
          lat: '33.7489924',
          lon: '-84.3902644',
        }],
      }
    },
  })
  assert.match(requestedUrl, /^https:\/\/nominatim\.openstreetmap\.org\/search\?/)
  assert.match(requestedUrl, /q=Atlanta/)
  assert.match(requestedUrl, /accept-language=zh-CN/)
  assert.match(requestedUrl, /namedetails=1/)
  assert.equal(results[0].label, 'Atlanta, Georgia')
  await assert.rejects(
    searchReadingPlaces({
      providerId: READING_MAP_PROVIDER.DOMESTIC,
      query: '亚特兰大',
      fetchImpl: async () => ({ ok: true, json: async () => ({}) }),
    }),
    /浏览器端 Key/,
  )
})

test('international map results prefer an available Chinese name', () => {
  const [result] = normalizeNominatimResults([{
    place_id: 88,
    display_name: 'University of Virginia, Virginia, United States',
    namedetails: { 'name:zh': '弗吉尼亚大学' },
    lat: '38.0336',
    lon: '-78.5080',
  }])
  assert.equal(
    result.label,
    '弗吉尼亚大学 · University of Virginia, Virginia, United States',
  )
})

test('Gone with the Wind package preserves the confirmed edition and 63 stable chapters', () => {
  assert.deepEqual(validateReadingPackage(readingPackage), [])
  assert.equal(readingPackage.edition.isbn, '9787570202188')
  assert.deepEqual(readingPackage.edition.translators, ['范纯海', '夏旻'])
  assert.equal(readingPackage.chapters.length, 63)
  assert.equal(readingPackage.chapters[0].id, 'chapter-01')
  assert.equal(readingPackage.chapters.at(-1).id, 'chapter-63')
  assert.equal(new Set(readingPackage.chapters.map((chapter) => chapter.id)).size, 63)
})

test('Gone with the Wind exact-input dictionary recognizes audited names without pre-revealing facts', () => {
  const expectedIds = [
    'person-scarlett-ohara',
    'person-rhett-butler',
    'person-ashley-wilkes',
    'person-melanie-hamilton',
    'place-georgia-state',
    'place-clayton-county-georgia',
  ]
  const openingMatches = scanOnDemandEntities(
    '斯佳丽、瑞德、艾希礼和梅兰妮谈到了佐治亚州与克莱顿县。',
    readingPackage.onDemandEntities,
  )
  assert.deepEqual(openingMatches.map(({ entity }) => entity.id), expectedIds)
  assert.match(openingMatches[4].entity.safeNote, /1788 年/)
  assert.deepEqual(readingPackage.entities, [])
  assert.deepEqual(readingPackage.facts, [])
  const institutionMatches = scanOnDemandEntities(
    '他们提到弗吉尼亚大学、亚拉巴马大学、南卡罗来纳大学和费耶特维尔女子学院。',
    readingPackage.onDemandEntities,
  )
  assert.deepEqual(
    institutionMatches.map(({ entity }) => entity.id),
    [
      'place-university-of-virginia',
      'place-university-of-alabama',
      'place-university-of-south-carolina',
      'place-fayetteville-female-academy',
    ],
  )
  assert.equal(institutionMatches[0].entity.placeKind, OBSERVED_PLACE_KIND.REAL)
  assert.equal(
    institutionMatches.at(-1).entity.placeKind,
    OBSERVED_PLACE_KIND.PROTOTYPE,
  )
  assert.match(institutionMatches[0].entity.safeNote, /1819 年/)
  assert.match(institutionMatches[1].entity.safeNote, /1831 年首次开课/)
  assert.match(institutionMatches[2].entity.safeNote, /South Carolina College/)
  assert.match(institutionMatches[3].entity.safeNote, /虚构学校的原型/)
  const contextMatches = scanOnDemandEntities(
    '故事背景涉及美国南方的种植园、林肯和南北战争。',
    readingPackage.onDemandEntities,
  )
  assert.deepEqual(
    contextMatches.map(({ entity }) => entity.id),
    [
      'place-american-south',
      'concept-plantation',
      'person-abraham-lincoln',
      'event-american-civil-war',
    ],
  )
  assert.equal(contextMatches[0].entity.placeKind, OBSERVED_PLACE_KIND.APPROXIMATE)
  assert.equal(contextMatches[0].entity.geometry, undefined)
  assert.match(contextMatches[0].entity.safeNote, /不是单一行政区/)
  assert.match(contextMatches[1].entity.safeNote, /大规模农业用地/)
  assert.match(contextMatches[2].entity.safeNote, /美国第 16 任总统/)
  assert.match(contextMatches[3].entity.safeNote, /1861–1865 年/)
  const expandedCharacterMatches = scanOnDemandEntities(
    '杰拉尔德、艾伦、苏伦、卡琳、普里西、波克和彼得大叔都被提到了。',
    readingPackage.onDemandEntities,
  )
  assert.deepEqual(
    expandedCharacterMatches.map(({ entity }) => entity.id),
    [
      'person-gerald-ohara',
      'person-ellen-ohara',
      'person-suellen-ohara',
      'person-carreen-ohara',
      'person-prissy',
      'person-pork',
      'person-uncle-peter',
    ],
  )
  assert.ok(expandedCharacterMatches.every(({ entity }) => entity.safeNote === undefined))
  const historicalContextMatches = scanOnDemandEntities(
    '文中提到奴隶制、废奴运动、《解放奴隶宣言》、重建时期和美利坚联盟国。',
    readingPackage.onDemandEntities,
  )
  assert.deepEqual(
    historicalContextMatches.map(({ entity }) => entity.id),
    [
      'concept-enslavement',
      'concept-american-abolitionist-movement',
      'event-emancipation-proclamation',
      'concept-reconstruction-era',
      'concept-confederate-states-of-america',
    ],
  )
  assert.match(historicalContextMatches[0].entity.safeNote, /强制劳动/)
  assert.match(historicalContextMatches[2].entity.safeNote, /1863 年 1 月 1 日/)
  assert.match(historicalContextMatches[3].entity.safeNote, /1865–1877 年/)
  assert.match(historicalContextMatches[4].entity.safeNote, /1861 年/)
  assert.equal(
    historicalContextMatches.some(({ entity }) => (
      entity.revealAt || entity.plot || entity.relationships
    )),
    false,
  )
  assert.deepEqual(
    readingEntitySafeNoteSources(contextMatches[1].entity, readingPackage.sources),
    [{
      id: 'source-nps-colonial-plantation-system',
      label: 'U.S. National Park Service · Rise of the Colonial Plantation System',
      url: 'https://home.nps.gov/articles/plantationsystem.htm',
    }],
  )
})

test('package validation rejects duplicate chapters and unknown fact references', () => {
  const invalidPackage = structuredClone(readingPackage)
  invalidPackage.chapters[1].id = 'chapter-01'
  invalidPackage.onDemandEntities[0].safeNote = ' '.repeat(401)
  invalidPackage.facts = [{
    id: 'fact-invalid',
    entityIds: ['missing-entity'],
    riskLevel: 'mystery',
    revealAt: { chapterId: 'chapter-99' },
  }]
  const errors = validateReadingPackage(invalidPackage)
  assert.ok(errors.some((error) => error.includes('章节 id 重复')))
  assert.ok(errors.some((error) => error.includes('riskLevel')))
  assert.ok(errors.some((error) => error.includes('已知章节')))
  assert.ok(errors.some((error) => error.includes('未知实体')))
  assert.ok(errors.some((error) => error.includes('safeNote')))
})

test('safe reading notes expose only their explicitly assigned HTTP sources', () => {
  const plantation = readingPackage.onDemandEntities.find(
    (entity) => entity.id === 'concept-plantation',
  )
  const unsafeSources = readingPackage.sources.map((source) => (
    source.id === plantation.safeNoteSourceIds[0]
      ? { ...source, url: 'javascript:alert(1)' }
      : source
  ))
  assert.deepEqual(readingEntitySafeNoteSources(plantation, unsafeSources), [])

  const invalidPackage = structuredClone(readingPackage)
  delete invalidPackage.onDemandEntities.find(
    (entity) => entity.id === 'concept-plantation',
  ).safeNoteSourceIds
  assert.ok(
    validateReadingPackage(invalidPackage)
      .some((error) => error.includes('safeNoteSourceIds')),
  )
})

test('package validation requires auditable place boundaries and avoids fabricated fictional points', () => {
  const validPackage = structuredClone(readingPackage)
  validPackage.entities = [{
    id: 'place-real',
    name: '测试真实地点',
    kind: 'place',
    placeKind: 'real',
    aliases: [],
    revealAt: { chapterId: 'chapter-01' },
    sourceIds: ['source-weread-edition-metadata'],
    geometry: {
      type: 'point',
      latitude: 33.7,
      longitude: -84.4,
    },
  }]
  assert.deepEqual(validateReadingPackage(validPackage), [])

  const invalidPackage = structuredClone(readingPackage)
  invalidPackage.entities = [{
    id: 'place-fictional',
    name: '测试庄园',
    kind: 'place',
    placeKind: 'fictional',
    revealAt: { chapterId: 'chapter-01' },
    sourceIds: ['missing-source'],
    geometry: {
      type: 'point',
      latitude: 33.7,
      longitude: -84.4,
    },
  }]
  const errors = validateReadingPackage(invalidPackage)
  assert.ok(errors.some((error) => error.includes('未知来源')))
  assert.ok(errors.some((error) => error.includes('虚构地点不能伪造精确坐标')))
})

test('entity visibility and spatial projection are deterministic system capabilities', () => {
  const entities = [
    {
      id: 'place-real',
      name: '真实地点',
      kind: 'place',
      revealAt: { chapterId: 'chapter-01' },
      geometry: { type: 'point', latitude: 34, longitude: -85 },
    },
    {
      id: 'place-area',
      name: '模糊区域',
      kind: 'place',
      revealAt: { chapterId: 'chapter-03' },
      geometry: { type: 'area', latitude: 32, longitude: -82, radiusKm: 20 },
    },
    {
      id: 'place-unknown-boundary',
      name: '未知边界地点',
      kind: 'place',
      revealAt: null,
      geometry: { type: 'point', latitude: 33, longitude: -83 },
    },
  ]
  assert.equal(
    isRevealedAtChapter({ chapterId: 'chapter-01' }, 'chapter-02', readingPackage.chapters),
    true,
  )
  assert.deepEqual(
    visibleReadingEntities(entities, 'chapter-02', readingPackage.chapters).map(({ id }) => id),
    ['place-real'],
  )
  const projected = projectReadingPlaces(
    visibleReadingEntities(entities, 'chapter-03', readingPackage.chapters),
  )
  assert.deepEqual(projected.map(({ id }) => id), ['place-real', 'place-area'])
  assert.deepEqual(
    projected.map(({ x, y }) => [x, y]),
    [[8, 8], [92, 92]],
  )
})

test('reading place relations calculate safe straight-line distance and direction', () => {
  const places = [
    {
      id: 'place-atlanta',
      name: '亚特兰大',
      geometry: { type: 'point', latitude: 33.7628947, longitude: -84.4220844 },
    },
    {
      id: 'place-jonesboro',
      name: '琼斯伯勒',
      geometry: { type: 'point', latitude: 33.5211498, longitude: -84.3546835 },
    },
    {
      id: 'place-fictional',
      name: '虚构地点',
      geometry: null,
    },
  ]
  const relations = readingPlaceRelations(places, 'place-atlanta')
  assert.equal(relations.length, 1)
  assert.equal(relations[0].id, 'place-jonesboro')
  assert.equal(relations[0].direction, '南')
  assert.ok(relations[0].distanceKm > 27 && relations[0].distanceKm < 28)
  assert.deepEqual(readingPlaceRelations(places, 'place-fictional'), [])
  assert.deepEqual(readingPlaceRelations(places, 'missing-place'), [])
})

test('formal facts require sources, known categories, and stay unavailable before reveal chapter', () => {
  const packageWithFacts = structuredClone(readingPackage)
  packageWithFacts.entities = [{
    id: 'place-real',
    name: '测试真实地点',
    kind: 'place',
    placeKind: 'real',
    revealAt: { chapterId: 'chapter-01' },
    sourceIds: ['source-weread-edition-metadata'],
    geometry: { type: 'point', latitude: 34, longitude: -85 },
  }]
  packageWithFacts.facts = [
    {
      id: 'fact-safe',
      kind: 'spatial',
      content: '这是一条纯空间事实。',
      entityIds: ['place-real'],
      revealAt: { chapterId: 'chapter-01' },
      riskLevel: SPOILER_RISK.SAFE,
      riskCategories: [],
      sourceIds: ['source-weread-edition-metadata'],
    },
    {
      id: 'fact-potential',
      kind: 'character',
      content: '这是一条需要确认的关系事实。',
      entityIds: ['place-real'],
      revealAt: { chapterId: 'chapter-03' },
      riskLevel: SPOILER_RISK.POTENTIAL,
      riskCategories: ['character_relationship'],
      sourceIds: ['source-weread-edition-metadata'],
    },
  ]
  assert.deepEqual(validateReadingPackage(packageWithFacts), [])
  assert.deepEqual(
    visibleReadingFacts(
      packageWithFacts.facts,
      'chapter-02',
      packageWithFacts.chapters,
    ).map(({ id }) => id),
    ['fact-safe'],
  )

  packageWithFacts.facts[1].riskCategories = ['model-written-free-text']
  const errors = validateReadingPackage(packageWithFacts)
  assert.ok(errors.some((error) => error.includes('未知风险类别')))
})

test('reading state keys isolate scenes and editions without changing the Dexie schema', () => {
  assert.equal(
    readingStateKey('scene-reading', 'gone-with-the-wind-zh-9787570202188'),
    'readerState:scene-reading:gone-with-the-wind-zh-9787570202188',
  )
  assert.throws(() => readingStateKey('', 'edition'), /场景和版本/)
})

test('reader-confirmed names use chapters without requiring book text or guessed facts', () => {
  const chapters = readingPackage.chapters
  const first = upsertObservedEntity([], {
    id: 'observed-tara',
    name: '  塔拉庄园  ',
    kind: 'place',
    firstSeenChapterId: 'chapter-03',
  }, chapters)
  assert.deepEqual(first, [{
    id: 'observed-tara',
    name: '塔拉庄园',
    kind: 'place',
    firstSeenChapterId: 'chapter-03',
    encounterChapterIds: ['chapter-03'],
    placeKind: OBSERVED_PLACE_KIND.UNKNOWN,
  }])
  assert.equal(normalizeObservedEntityName('ＴＡＲＡ  '), 'tara')
  assert.deepEqual(visibleObservedEntities(first, 'chapter-02', chapters), [])
  assert.deepEqual(
    visibleObservedEntities(first, 'chapter-03', chapters).map(({ name }) => name),
    ['塔拉庄园'],
  )

  const recordedLater = upsertObservedEntity(first, {
    id: 'observed-duplicate',
    name: '塔拉庄园',
    kind: 'place',
    firstSeenChapterId: 'chapter-05',
  }, chapters)
  assert.deepEqual(recordedLater[0].encounterChapterIds, ['chapter-03', 'chapter-05'])
  assert.equal(recordedLater[0].firstSeenChapterId, 'chapter-03')

  const unchanged = upsertObservedEntity(recordedLater, {
    id: 'observed-duplicate',
    name: '塔拉庄园',
    kind: 'place',
    firstSeenChapterId: 'chapter-05',
  }, chapters)
  assert.equal(unchanged, recordedLater)

  const correctedEarlier = upsertObservedEntity(recordedLater, {
    id: 'observed-duplicate',
    name: '塔拉庄园',
    kind: 'place',
    firstSeenChapterId: 'chapter-01',
  }, chapters)
  assert.equal(correctedEarlier.length, 1)
  assert.equal(correctedEarlier[0].id, 'observed-tara')
  assert.equal(correctedEarlier[0].firstSeenChapterId, 'chapter-01')
  assert.deepEqual(
    observedEntityEncounterChapterIds(correctedEarlier[0], chapters),
    ['chapter-01', 'chapter-03', 'chapter-05'],
  )
  assert.deepEqual(
    observedEntityEncounterChapterIds({
      firstSeenChapterId: 'chapter-02',
    }, chapters),
    ['chapter-02'],
  )

  const noted = updateObservedEntityNote(correctedEarlier, 'observed-tara', '女主生活的庄园')
  assert.equal(noted[0].note, '女主生活的庄园')
  const clearedNote = updateObservedEntityNote(noted, 'observed-tara', '  ')
  assert.equal(clearedNote[0].note, undefined)
  assert.throws(
    () => updateObservedEntityNote(noted, 'observed-tara', '长'.repeat(501)),
    /不能超过 500/,
  )
  assert.throws(
    () => upsertObservedEntity([], {
      id: 'invalid',
      name: '未知名称',
      kind: 'place',
      firstSeenChapterId: 'chapter-99',
    }, chapters),
    /已知章节/,
  )
})

test('reader-confirmed translation variants share one prepared package entity', () => {
  const chapters = readingPackage.chapters
  const first = upsertObservedEntity([], {
    id: 'observed-ashley',
    name: '艾希礼',
    kind: 'person',
    firstSeenChapterId: 'chapter-01',
  }, chapters)
  const linkedAlias = upsertObservedEntity(first, {
    id: 'observed-wilkes',
    name: '卫希礼',
    kind: 'person',
    packageEntityId: 'person-ashley-wilkes',
    equivalentNames: ['艾希礼', 'Ashley Wilkes', '卫希礼'],
    firstSeenChapterId: 'chapter-02',
  }, chapters)

  assert.equal(linkedAlias.length, 1)
  assert.equal(linkedAlias[0].packageEntityId, 'person-ashley-wilkes')
  assert.deepEqual(linkedAlias[0].encounterChapterIds, ['chapter-01', 'chapter-02'])
})

test('a reader-confirmed geocoder result stays personal and follows the chapter boundary', () => {
  const observed = [{
    id: 'observed-savannah',
    name: '萨凡纳',
    kind: 'place',
    firstSeenChapterId: 'chapter-03',
    placeKind: OBSERVED_PLACE_KIND.REAL,
  }]
  const located = confirmObservedPlaceLocation(observed, 'observed-savannah', {
    id: 'nominatim-1',
    label: 'Savannah, Georgia, United States',
    providerId: READING_MAP_PROVIDER.INTERNATIONAL,
    latitude: 32.0809,
    longitude: -81.0912,
  })
  assert.equal(observed[0].mapLocation, undefined)
  assert.equal(located[0].mapLocation.providerId, READING_MAP_PROVIDER.INTERNATIONAL)
  assert.deepEqual(readerConfirmedMapEntities(
    located,
    'chapter-02',
    readingPackage.chapters,
  ), [])
  const [mapEntity] = readerConfirmedMapEntities(
    located,
    'chapter-03',
    readingPackage.chapters,
  )
  assert.equal(mapEntity.id, 'reader-map:observed-savannah')
  assert.equal(mapEntity.accessMode, 'reader-confirmed-geocoder')
  assert.equal(mapEntity.placeKind, 'real')
  assert.deepEqual(mapEntity.geometry, {
    type: 'point',
    latitude: 32.0809,
    longitude: -81.0912,
  })
  const cleared = clearObservedPlaceLocation(located, 'observed-savannah')
  assert.equal(cleared[0].mapLocation, undefined)
  assert.equal(cleared[0].name, '萨凡纳')
  assert.equal(cleared[0].firstSeenChapterId, 'chapter-03')
  assert.throws(
    () => confirmObservedPlaceLocation(observed, 'observed-savannah', {
      label: 'Invalid',
      providerId: READING_MAP_PROVIDER.INTERNATIONAL,
      latitude: 200,
      longitude: 0,
    }),
    /纬度无效/,
  )
})

test('unknown or fictional places never go to the public map until the reader marks them as real', () => {
  const observed = [{
    id: 'observed-unknown-place',
    name: '某个庄园',
    kind: 'place',
    firstSeenChapterId: 'chapter-01',
    placeKind: OBSERVED_PLACE_KIND.UNKNOWN,
  }]
  const location = {
    id: 'nominatim-2',
    label: 'An unrelated public-map result',
    providerId: READING_MAP_PROVIDER.INTERNATIONAL,
    latitude: 40,
    longitude: -80,
  }

  assert.throws(
    () => confirmObservedPlaceLocation(observed, observed[0].id, location),
    /明确标记为现实地点/,
  )
  const real = updateObservedPlaceKind(
    observed,
    observed[0].id,
    OBSERVED_PLACE_KIND.REAL,
  )
  const located = confirmObservedPlaceLocation(real, observed[0].id, location)
  assert.equal(located[0].mapLocation.label, location.label)

  const fictional = updateObservedPlaceKind(
    located,
    observed[0].id,
    OBSERVED_PLACE_KIND.FICTIONAL,
  )
  assert.equal(fictional[0].placeKind, OBSERVED_PLACE_KIND.FICTIONAL)
  assert.equal(fictional[0].mapLocation, undefined)
})

test('fictional places may use a reader-confirmed broad reference area without a fake point', () => {
  const observed = [{
    id: 'observed-fictional-place',
    name: '虚构庄园',
    kind: 'place',
    firstSeenChapterId: 'chapter-01',
    placeKind: OBSERVED_PLACE_KIND.FICTIONAL,
  }]
  const located = confirmObservedPlaceApproximateArea(
    observed,
    observed[0].id,
    {
      id: 'region-georgia',
      label: 'Georgia, United States',
      providerId: READING_MAP_PROVIDER.INTERNATIONAL,
      latitude: 32.7,
      longitude: -83.3,
    },
    100,
  )
  const [mapEntity] = readerConfirmedMapEntities(
    located,
    'chapter-01',
    readingPackage.chapters,
  )
  assert.equal(mapEntity.placeKind, OBSERVED_PLACE_KIND.FICTIONAL)
  assert.equal(mapEntity.accessMode, 'reader-confirmed-approximate-area')
  assert.deepEqual(mapEntity.geometry, {
    type: 'area',
    latitude: 32.7,
    longitude: -83.3,
    radiusKm: 100,
  })
  assert.throws(
    () => confirmObservedPlaceApproximateArea(observed, observed[0].id, {
      label: 'Georgia',
      providerId: READING_MAP_PROVIDER.INTERNATIONAL,
      latitude: 32.7,
      longitude: -83.3,
    }, 1),
    /5–1000/,
  )
})

test('a real historical place may fall back to a clearly marked reference area', () => {
  const observed = [{
    id: 'observed-historical-school',
    name: '费耶特维尔女子学院',
    kind: 'place',
    firstSeenChapterId: 'chapter-01',
    placeKind: OBSERVED_PLACE_KIND.REAL,
  }]
  const located = confirmObservedRealPlaceFallbackArea(
    observed,
    observed[0].id,
    {
      id: 'region-fayetteville',
      label: 'Fayetteville, Georgia, United States',
      providerId: READING_MAP_PROVIDER.INTERNATIONAL,
      latitude: 33.4487,
      longitude: -84.4549,
    },
    20,
  )
  const [mapEntity] = readerConfirmedMapEntities(
    located,
    'chapter-01',
    readingPackage.chapters,
  )
  assert.equal(located[0].mapLocation.mode, 'fallback-area')
  assert.equal(mapEntity.placeKind, OBSERVED_PLACE_KIND.REAL)
  assert.equal(mapEntity.accessMode, 'reader-confirmed-fallback-area')
  assert.equal(mapEntity.geometry.type, 'area')
  assert.match(mapEntity.scopeNote, /不代表该地点的精确坐标/)
})

test('reader-confirmed rivers and regions preserve safe GeoJSON geometry', () => {
  const line = {
    type: 'LineString',
    coordinates: [[-91, 35], [-90, 34], [-89, 33]],
  }
  assert.deepEqual(normalizeGeoJsonGeometry(line), line)
  assert.equal(normalizeGeoJsonGeometry({
    type: 'LineString',
    coordinates: [[999, 35], [-90, 34]],
  }), null)

  const observed = [{
    id: 'observed-river',
    name: '示例河流',
    kind: 'place',
    firstSeenChapterId: 'chapter-01',
    placeKind: OBSERVED_PLACE_KIND.REAL,
  }]
  const located = confirmObservedPlaceLocation(observed, observed[0].id, {
    id: 'nominatim-river',
    label: 'Example River',
    providerId: READING_MAP_PROVIDER.INTERNATIONAL,
    latitude: 34,
    longitude: -90,
    geometry: line,
  })
  const [mapEntity] = readerConfirmedMapEntities(
    located,
    'chapter-01',
    readingPackage.chapters,
  )
  assert.deepEqual(mapEntity.geometry, {
    type: 'geojson',
    latitude: 34,
    longitude: -90,
    geojson: line,
  })
})

test('reading model presets support domestic switching without sharing session keys', () => {
  assert.deepEqual(
    Object.keys(READING_MODEL_PROVIDERS),
    ['zhipu', 'deepseek', 'minimax', 'openai', 'custom'],
  )
  assert.equal(
    inferReadingModelProvider('https://open.bigmodel.cn/api/paas/v4/chat/completions'),
    READING_MODEL_PROVIDER.ZHIPU,
  )
  assert.equal(
    inferReadingModelProvider('https://api.deepseek.com/chat/completions'),
    READING_MODEL_PROVIDER.DEEPSEEK,
  )
  assert.equal(
    readingModelProviderDefaults(READING_MODEL_PROVIDER.ZHIPU).model,
    'glm-4-flash-250414',
  )
  assert.equal(
    readingModelProviderDefaults(READING_MODEL_PROVIDER.MINIMAX).temperature,
    0.1,
  )
  assert.notEqual(
    readingModelApiKeyStorageKey(READING_MODEL_PROVIDER.ZHIPU),
    readingModelApiKeyStorageKey(READING_MODEL_PROVIDER.DEEPSEEK),
  )
})

test('runtime model analysis stays a reader-confirmed candidate adapter', async () => {
  let request
  const knownEntities = [{
    id: 'place-atlanta',
    name: '亚特兰大',
    originalName: 'Atlanta',
    aliases: ['亚特兰大市'],
    kind: 'place',
    placeKind: 'real',
  }]
  const candidates = await analyzeReadingExcerpt({
    endpoint: 'https://model.example/v1/chat/completions',
    model: 'reader-test-model',
    apiKey: 'test-key',
    temperature: 0.1,
    excerpt: '她从亚特兰大回到了塔拉。',
    bookTitle: '测试书',
    chapterLabel: '第 1 章',
    knownEntities,
    fetchImpl: async (url, options) => {
      request = { url, options }
      return {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                candidates: [
                  {
                    name: '亚特兰大',
                    kind: 'place',
                    placeKind: 'real',
                    confidence: 0.92,
                    matchedEntityId: 'place-atlanta',
                  },
                  {
                    name: '塔拉',
                    kind: 'place',
                    placeKind: 'unknown',
                    confidence: 0.8,
                    matchedEntityId: 'invented-id',
                  },
                ],
              }),
            },
          }],
        }),
      }
    },
  })

  assert.equal(request.url, 'https://model.example/v1/chat/completions')
  assert.equal(request.options.headers.Authorization, 'Bearer test-key')
  const body = JSON.parse(request.options.body)
  assert.equal(body.model, 'reader-test-model')
  assert.equal(body.temperature, 0.1)
  assert.match(body.messages[1].content, /亚特兰大/)
  assert.match(body.messages[0].content, /matchedEntityId 只能逐字选用/)
  assert.match(body.messages[1].content, /"id":"place-atlanta"/)
  assert.equal(candidates.length, 2)
  assert.equal(candidates[0].matchedEntityId, 'place-atlanta')
  assert.equal(candidates[1].placeKind, OBSERVED_PLACE_KIND.UNKNOWN)
  assert.equal(candidates[1].matchedEntityId, null)
  assert.equal('reason' in candidates[0], false)
})

test('personal book preparation returns only bounded names and no generated facts', async () => {
  let requestBody
  const candidates = await preparePersonalBookKnowledge({
    endpoint: 'https://prepare-model.example/v1/chat/completions',
    model: 'reader-prepare-model',
    apiKey: 'test-key',
    book: { title: '测试书', author: '测试作者', originalLanguage: 'en' },
    edition: { translators: ['测试译者'], publisher: '测试出版社', isbn: '123' },
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body)
      return {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                candidates: [
                  {
                    name: '测试人物',
                    kind: 'person',
                    originalName: 'Test Person',
                    aliases: ['人物别名'],
                    relationship: 'ignored',
                  },
                  {
                    name: '测试地点',
                    kind: 'place',
                    placeKind: 'not-valid',
                    coordinates: [1, 2],
                  },
                ],
                facts: [{ content: 'ignored' }],
              }),
            },
          }],
        }),
      }
    },
  })
  assert.equal(READING_PROMPT_IDS.personalBookKnowledge, 'personal-book-knowledge-v1')
  assert.equal(
    READING_PROMPT_IDS.excerptEntityLink,
    'reading-excerpt-entity-link-v1',
  )
  assert.equal(
    READING_PROMPT_IDS.formalPackageCandidates,
    'formal-reading-package-candidates-v3',
  )
  assert.match(
    personalBookKnowledgeMessages({ title: '测试书' })[0].content,
    new RegExp(READING_PROMPT_IDS.personalBookKnowledge),
  )
  assert.match(
    requestBody.messages[0].content,
    new RegExp(READING_PROMPT_IDS.personalBookKnowledge),
  )
  assert.match(requestBody.messages[0].content, /不要返回人物关系/)
  assert.equal(candidates.length, 2)
  assert.equal(candidates[1].placeKind, OBSERVED_PLACE_KIND.UNKNOWN)
  assert.equal('relationship' in candidates[0], false)
  assert.equal('coordinates' in candidates[1], false)
  assert.deepEqual(normalizePersonalBookKnowledge({ facts: [{}] }), [])
})

test('current-reading questions answer concepts and block obvious future-plot questions', async () => {
  assert.equal(readingQuestionLooksForward('这个制度是什么意思？'), false)
  assert.equal(readingQuestionLooksForward('这个人物最后怎么样？'), true)
  assert.equal(readingAnswerLooksForward('这是一个历史时期。'), false)
  assert.equal(readingAnswerLooksForward('后来他和某人结婚。'), true)
  let requestBody
  const result = await answerReadingQuestion({
    endpoint: 'https://question-model.example/v1/chat/completions',
    model: 'reader-question-model',
    apiKey: 'test-key',
    question: '重建时期是什么意思？',
    excerpt: '当前段落提到了重建时期。',
    bookTitle: '测试书',
    chapterLabel: '第 2 章',
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body)
      return {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: '{"answer":"这是一个历史时期。","uncertain":false,"futurePlot":"ignored"}',
            },
          }],
        }),
      }
    },
  })
  assert.match(requestBody.messages[0].content, /不得补充后续章节/)
  assert.match(requestBody.messages[1].content, /当前段落提到了重建时期/)
  assert.deepEqual(result, { answer: '这是一个历史时期。', uncertain: false })
  await assert.rejects(
    answerReadingQuestion({
      endpoint: 'https://question-model.example/v1/chat/completions',
      model: 'reader-question-model',
      apiKey: 'test-key',
      question: '这个人物最后怎么样？',
    }),
    /不回答后续剧情/,
  )
})

test('identical model excerpt analysis reuses the temporary successful-result cache', async () => {
  let calls = 0
  const options = {
    endpoint: 'https://cache-model.example/v1/chat/completions',
    model: 'reader-cache-model',
    apiKey: 'test-key',
    excerpt: '缓存测试地点。',
    bookTitle: '缓存测试书',
    chapterLabel: '第 1 章',
    fetchImpl: async () => {
      calls += 1
      return {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: '{"candidates":[{"name":"缓存测试地点","kind":"place","placeKind":"unknown","confidence":0.8}]}',
            },
          }],
        }),
      }
    },
  }
  const first = await analyzeReadingExcerpt(options)
  const second = await analyzeReadingExcerpt(options)
  assert.deepEqual(second, first)
  assert.equal(calls, 1)
})

test('model place translation returns only a bounded map query', async () => {
  const translated = await translateReadingPlaceQuery({
    endpoint: 'https://model.example/v1/chat/completions',
    model: 'reader-test-model',
    apiKey: 'test-key',
    query: '弗吉尼亚大学，美国',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: '{"query":"University of Virginia, United States"}',
          },
        }],
      }),
    }),
  })
  assert.equal(translated, 'University of Virginia, United States')
})

test('model map-query suggestions include book context and preserve alternatives', async () => {
  let requestBody
  const suggestions = await suggestReadingPlaceQueries({
    endpoint: 'https://suggest-model.example/v1/chat/completions',
    model: 'reader-suggest-model',
    apiKey: 'test-key',
    query: '费耶特维尔女子学院',
    bookTitle: '飘',
    chapterLabel: '第 1 章',
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body)
      return {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: '{"queries":["Fayetteville Female Academy, Georgia","Fayetteville, Georgia"]}',
            },
          }],
        }),
      }
    },
  })
  assert.match(requestBody.messages[1].content, /书籍：飘/)
  assert.deepEqual(suggestions, [
    'Fayetteville Female Academy, Georgia',
    'Fayetteville, Georgia',
  ])
})

test('model book metadata stays limited to OCR fields', async () => {
  let requestBody
  const metadata = await analyzeReadingBookMetadata({
    endpoint: 'https://metadata-model.example/v1/chat/completions',
    model: 'reader-metadata-model',
    apiKey: 'test-key',
    ocrText: '飘 ISBN 9787570202188',
    localMetadata: { title: '票', isbn: '9787570202188' },
    uncertainFields: ['title'],
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body)
      return {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: '{"title":"飘","author":"","translators":[],"publisher":"","isbn":"9787570202188","publishedAt":"","originalLanguage":"","chapterCount":63,"plot":"ignored"}',
            },
          }],
        }),
      }
    },
  })
  assert.match(requestBody.messages[1].content, /"title":"票"/)
  assert.match(requestBody.messages[1].content, /低置信字段：\["title"\]/)
  assert.deepEqual(metadata, {
    title: '飘',
    author: '',
    translators: [],
    publisher: '',
    isbn: '9787570202188',
    publishedAt: '',
    originalLanguage: '',
    chapterCount: 63,
  })
})

test('runtime model candidates are bounded and cannot create facts', () => {
  const candidates = normalizeModelCandidates({
    candidates: [
      { name: '  某人  ', kind: 'person', confidence: 2, plot: 'future spoiler' },
      { name: '某人', kind: 'person', confidence: 0.2 },
      { name: '某地', kind: 'place', placeKind: 'not-a-kind', confidence: -1 },
    ],
    facts: [{ content: 'must not be returned' }],
  })
  assert.deepEqual(candidates, [
    {
      name: '某人',
      kind: 'person',
      confidence: 1,
      matchedEntityId: null,
    },
    {
      name: '某地',
      kind: 'place',
      placeKind: OBSERVED_PLACE_KIND.UNKNOWN,
      confidence: 0,
      matchedEntityId: null,
    },
  ])
})

test('on-demand entities unlock only after an exact reader-confirmed name match', () => {
  const onDemandEntities = [{
    id: 'place-atlanta',
    name: '亚特兰大',
    originalName: 'Atlanta',
    aliases: ['亚特兰大市'],
    kind: 'place',
    placeKind: 'real',
    activation: 'exact-reader-input',
    sourceIds: ['source-weread-edition-metadata'],
    safeNote: '亚特兰大是佐治亚州州府。',
    safeNoteSourceIds: ['source-weread-edition-metadata'],
    geometry: { type: 'point', latitude: 33.7628, longitude: -84.422 },
  }]
  assert.equal(
    matchOnDemandEntity(onDemandEntities, '亚特兰大', 'place')?.id,
    'place-atlanta',
  )
  assert.equal(
    matchOnDemandEntity(onDemandEntities, ' Atlanta ', 'place')?.id,
    'place-atlanta',
  )
  assert.equal(matchOnDemandEntity(onDemandEntities, '亚特兰', 'place'), null)
  assert.equal(
    matchOnDemandEntity(onDemandEntities, '另一个译名', 'place', 'place-atlanta')?.id,
    'place-atlanta',
  )
  assert.equal(matchOnDemandEntity(onDemandEntities, '亚特兰大', 'person'), null)

  const observed = [{
    id: 'observed-atlanta',
    name: '亚特兰大市',
    kind: 'place',
    firstSeenChapterId: 'chapter-03',
  }]
  assert.deepEqual(
    unlockedOnDemandEntities(
      onDemandEntities,
      observed,
      'chapter-02',
      readingPackage.chapters,
    ),
    [],
  )
  const [unlocked] = unlockedOnDemandEntities(
    onDemandEntities,
    observed,
    'chapter-03',
    readingPackage.chapters,
  )
  assert.equal(unlocked.id, 'place-atlanta')
  assert.equal(unlocked.readerConfirmedName, '亚特兰大市')
  assert.equal(unlocked.accessMode, 'reader-confirmed-exact-match')
  assert.equal(unlocked.safeNote, '亚特兰大是佐治亚州州府。')
  assert.deepEqual(unlocked.revealAt, { chapterId: 'chapter-03' })
})

test('local excerpt scanning only returns audited names that actually occur in the text', () => {
  const onDemandEntities = [
    {
      id: 'place-atlanta',
      name: '亚特兰大',
      originalName: 'Atlanta',
      aliases: ['亚特兰大市'],
      kind: 'place',
      placeKind: 'real',
    },
    {
      id: 'place-tara',
      name: '塔拉庄园',
      originalName: 'Tara',
      aliases: [],
      kind: 'place',
      placeKind: 'fictional',
    },
  ]

  assert.deepEqual(
    scanOnDemandEntities('她离开亚特兰大，想起塔拉庄园。', onDemandEntities)
      .map(({ entity, matchedTerm }) => [entity.id, matchedTerm]),
    [
      ['place-atlanta', '亚特兰大'],
      ['place-tara', '塔拉庄园'],
    ],
  )
  assert.deepEqual(scanOnDemandEntities('只写到亚特兰，还不是完整名称。', onDemandEntities), [])
  assert.deepEqual(scanOnDemandEntities('Atlantas is not Atlanta.', onDemandEntities)
    .map(({ entity, matchedTerm }) => [entity.id, matchedTerm]), [['place-atlanta', 'Atlanta']])
  assert.deepEqual(scanOnDemandEntities('Atlantas', onDemandEntities), [])
  assert.deepEqual(scanOnDemandEntities('这里没有任何已知名称。', onDemandEntities), [])
})

test('local scanning also marks names already saved by the reader', () => {
  const observed = [{
    id: 'observed-uva',
    name: '弗吉尼亚大学',
    kind: OBSERVED_ENTITY_KIND.PLACE,
    placeKind: OBSERVED_PLACE_KIND.REAL,
    firstSeenChapterId: 'chapter-01',
  }]
  assert.deepEqual(
    scanObservedEntities('她从弗吉尼亚大学离开。', observed),
    [{
      entity: observed[0],
      matchedTerm: '弗吉尼亚大学',
      source: 'observed',
    }],
  )
})

test('OCR cleanup joins Chinese line wraps while preserving English word spaces', () => {
  assert.equal(
    normalizeOcrText('从 弗 吉 尼 亚 大 学\n拖 了 出 来。\nUniversity of\nVirginia'),
    '从弗吉尼亚大学拖了出来。 University of Virginia',
  )
})

test('book metadata OCR cleanup preserves labeled field boundaries', () => {
  assert.equal(
    normalizeOcrText([
      '作者：玛格丽特·米切尔',
      '译者：范纯海、夏旻',
      '出版社：长江文艺出版社',
    ].join('\n'), { preserveLines: true }),
    [
      '作者:玛格丽特·米切尔',
      '译者:范纯海、夏旻',
      '出版社:长江文艺出版社',
    ].join('\n'),
  )
})

test('book metadata OCR cleans repeated Chinese spaces from a real copyright page shape', () => {
  const normalized = normalizeOcrText([
    'Tose as 四 ;',
    '版 权 信 息',
    '书 名 : 傲慢 与 偏见',
    '作者 : 简 . 奥 斯 本',
    '译 者 : 孙 致 礼',
    '出 版 社 : 译 林 出 版 社',
    '出 版 时 间 : 2010-06-01',
    'ISBN: 9787544711302',
    '品牌 方 : 江苏 译 林 出 版 社 有 限 公司',
  ].join('\n'), { preserveLines: true })
  assert.deepEqual(extractPersonalBookMetadataFromText(normalized), {
    title: '傲慢与偏见',
    author: '简·奥斯本',
    translators: ['孙致礼'],
    publisher: '译林出版社',
    isbn: '9787544711302',
    publishedAt: '2010-06',
  })
})

test('spoiler risk defaults unknown boundaries to potential and preserves high risk', () => {
  const chapters = readingPackage.chapters
  assert.equal(
    riskForDisclosure({
      riskLevel: SPOILER_RISK.SAFE,
      revealAt: { chapterId: 'chapter-03' },
      currentChapterId: 'chapter-06',
      chapters,
    }),
    SPOILER_RISK.SAFE,
  )
  assert.equal(
    riskForDisclosure({
      riskLevel: SPOILER_RISK.SAFE,
      revealAt: { chapterId: 'chapter-07' },
      currentChapterId: 'chapter-06',
      chapters,
    }),
    SPOILER_RISK.POTENTIAL,
  )
  assert.equal(
    riskForDisclosure({
      riskLevel: SPOILER_RISK.HIGH,
      revealAt: { chapterId: 'chapter-63' },
      currentChapterId: 'chapter-06',
      chapters,
    }),
    SPOILER_RISK.HIGH,
  )
  assert.equal(
    riskForDisclosure({ riskLevel: 'unknown', revealAt: null, currentChapterId: '', chapters }),
    SPOILER_RISK.POTENTIAL,
  )
})

test('spoiler gate requires the matching one-time authorization level', () => {
  assert.equal(spoilerGateAction(SPOILER_RISK.SAFE), SPOILER_GATE_ACTION.DISPLAY)
  assert.equal(spoilerGateAction(SPOILER_RISK.POTENTIAL), SPOILER_GATE_ACTION.WARN)
  assert.equal(spoilerGateAction(SPOILER_RISK.HIGH), SPOILER_GATE_ACTION.CONFIRM_TWICE)
  assert.equal(canRevealRisk(SPOILER_RISK.SAFE), true)
  assert.equal(canRevealRisk(SPOILER_RISK.POTENTIAL, 'none'), false)
  assert.equal(canRevealRisk(SPOILER_RISK.POTENTIAL, SPOILER_RISK.POTENTIAL), true)
  assert.equal(canRevealRisk(SPOILER_RISK.HIGH, SPOILER_RISK.POTENTIAL), false)
  assert.equal(canRevealRisk(SPOILER_RISK.HIGH, SPOILER_RISK.HIGH), true)
  assert.equal(
    strongestSpoilerRisk([SPOILER_RISK.SAFE, SPOILER_RISK.POTENTIAL, SPOILER_RISK.HIGH]),
    SPOILER_RISK.HIGH,
  )
})

test('reading preview publishes only approved sources and keeps candidates pending', async () => {
  const { previews, catalog } = await buildReadingPreviews()
  assert.equal(previews.length, 1)
  assert.equal(catalog.packages.length, 1)
  const [preview] = previews
  assert.deepEqual(validateReadingPackage(preview.package), [])
  assert.equal(preview.previewMeta.approvedSourceIds.length, 32)
  assert.equal(preview.previewMeta.pendingSourceIds.length, 3)
  assert.equal(preview.previewMeta.candidateEntityIds.length, 30)
  assert.equal(preview.previewMeta.candidateFactIds.length, 2)
  assert.equal(preview.previewMeta.onDemandEntityIds.length, 40)
  assert.equal(preview.researchCandidates.entities.length, 30)
  assert.equal(preview.researchCandidates.facts.length, 2)
  assert.equal(preview.package.onDemandEntities.length, 40)
  assert.deepEqual(preview.package.entities, [])
  assert.deepEqual(preview.package.facts, [])
  assert.deepEqual(preview.catalogEntry.preparedSummary, {
    entityCount: 40,
    place: 12,
    person: 21,
    concept: 5,
    event: 2,
    factCount: 0,
    sourceCount: 32,
  })
  assert.deepEqual(
    preview.package.sources.map((source) => source.id),
    preview.previewMeta.approvedSourceIds,
  )
  assert.equal(
    preview.package.sources.some((source) => source.id.startsWith('candidate-')),
    false,
  )
})

test('single-book feedback exports only whitelisted reading data', () => {
  const stored = new Map()
  const storage = {
    getItem: (key) => stored.get(key) || null,
    setItem: (key, value) => stored.set(key, value),
  }
  recordReadingTrialDiagnostic({
    area: 'model',
    action: 'model-excerpt-analysis',
    outcome: 'success',
    providerId: 'zhipu',
    at: '2026-07-28T11:58:00.000Z',
    storage,
  })
  recordReadingTrialDiagnostic({
    area: 'map',
    action: 'map-search',
    outcome: 'error',
    providerId: 'international',
    error: new Error('Failed to fetch secret-query 亚特兰大'),
    at: '2026-07-28T11:59:00.000Z',
    storage,
  })
  const diagnostics = readingTrialDiagnosticsSnapshot({
    storage,
    navigatorLike: {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/140.0.0.0 Safari/537.36',
      language: 'zh-CN',
      onLine: true,
    },
  })
  const payload = createReadingFeedbackBundle({
    appVersion: '0.1.0',
    appBuild: 'abc1234',
    scene: {
      id: 'scene-reading',
      name: '经典文学阅读',
      tools: ['reader'],
      unrelatedSecret: 'ignored',
    },
    readingPackage,
    currentChapterId: 'chapter-04',
    readingState: {
      currentChapterId: 'chapter-03',
      updatedAt: '2026-07-28T10:00:00.000Z',
      excerpt: '不应导出的原文',
      screenshot: 'data:image/png;base64,ignored',
      apiKey: 'secret',
      observedEntities: [{
        id: 'observed-atlanta',
        name: '亚特兰大',
        kind: 'place',
        placeKind: 'real',
        packageEntityId: 'place-atlanta',
        firstSeenChapterId: 'chapter-02',
        encounterChapterIds: ['chapter-02', 'chapter-04'],
        note: '个人备注',
        transientModelResult: 'ignored',
        mapLocation: {
          mode: 'exact',
          resultId: 'map-result',
          label: 'Atlanta, Georgia',
          providerId: 'international',
          latitude: 33.75,
          longitude: -84.39,
          rawProviderResponse: { ignored: true },
        },
      }],
    },
    diagnostics,
    exportedAt: '2026-07-28T12:00:00.000Z',
  })
  assert.equal(payload.kind, READING_FEEDBACK_KIND)
  assert.equal(payload.schemaVersion, READING_FEEDBACK_SCHEMA_VERSION)
  assert.equal(payload.schemaVersion, 2)
  assert.deepEqual(payload.app, { version: '0.1.0', build: 'abc1234' })
  assert.equal(payload.book.packageVersion, readingPackage.packageVersion)
  assert.equal(payload.reading.currentChapterId, 'chapter-04')
  assert.equal(payload.reading.currentChapterLabel, '第 4 章')
  assert.deepEqual(payload.summary, {
    observedCount: 1,
    noteCount: 1,
    mappedPlaceCount: 1,
    personCount: 0,
    placeCount: 1,
    conceptCount: 0,
    eventCount: 0,
    pairedEntityCount: 1,
  })
  assert.equal(payload.reading.observedEntities[0].packageEntityId, 'place-atlanta')
  assert.deepEqual(payload.reading.observedEntities[0].mapLocation, {
    mode: 'exact',
    resultId: 'map-result',
    label: 'Atlanta, Georgia',
    providerId: 'international',
    latitude: 33.75,
    longitude: -84.39,
  })
  assert.deepEqual(payload.diagnostics.runtime, {
    browser: 'Chrome',
    browserMajor: '140',
    os: 'Windows',
    language: 'zh-CN',
    online: true,
  })
  assert.deepEqual(payload.diagnostics.summary, {
    eventCount: 2,
    successCount: 1,
    errorCount: 1,
    byAction: {
      'model-excerpt-analysis': { success: 1, error: 0 },
      'map-search': { success: 0, error: 1 },
    },
  })
  assert.equal(payload.diagnostics.events[1].errorCode, 'network')
  const serialized = JSON.stringify(payload)
  for (const forbidden of [
    '不应导出的原文',
    'data:image/png',
    'secret',
    'transientModelResult',
    'rawProviderResponse',
    'unrelatedSecret',
    'secret-query',
  ]) {
    assert.equal(serialized.includes(forbidden), false)
  }
})

test('reading diagnostics classify failures without retaining messages or arbitrary fields', () => {
  assert.equal(readingDiagnosticErrorCode({ status: 429 }), 'rate-limit')
  assert.equal(readingDiagnosticErrorCode(new Error('请求超时')), 'timeout')
  assert.equal(readingDiagnosticErrorCode(new Error('请填写 API Key')), 'configuration')

  const payload = createReadingFeedbackBundle({
    appVersion: '0.1.0',
    appBuild: 'local',
    scene: { id: 'scene-reading', name: '经典文学阅读' },
    readingPackage,
    readingState: {},
    diagnostics: {
      runtime: {
        browser: 'Injected Browser',
        browserMajor: '140<script>',
        os: 'Injected OS',
        language: 'zh-CN<script>',
        online: false,
        userAgent: 'secret-user-agent',
      },
      events: [{
        at: '2026-07-28T12:00:00.000Z',
        area: 'model',
        action: 'model-question',
        outcome: 'error',
        providerId: 'openai',
        errorCode: 'authentication',
        message: 'secret question and key',
        excerpt: 'secret excerpt',
      }, {
        area: 'unknown-area',
        action: 'unknown-action',
        outcome: 'success',
      }],
    },
  })
  assert.deepEqual(payload.diagnostics.runtime, {
    browser: 'Other',
    browserMajor: '',
    os: 'Other',
    language: 'zh-CNscript',
    online: false,
  })
  assert.equal(payload.diagnostics.events.length, 1)
  assert.equal(payload.diagnostics.events[0].errorCode, 'authentication')
  const serialized = JSON.stringify(payload)
  assert.equal(serialized.includes('secret'), false)
  assert.equal(serialized.includes('userAgent'), false)
})

test('reading diagnostics stay bounded and never block when session storage is unavailable', () => {
  const stored = new Map()
  const storage = {
    getItem: (key) => stored.get(key) || null,
    setItem: (key, value) => stored.set(key, value),
  }
  for (let index = 0; index < 35; index += 1) {
    recordReadingTrialDiagnostic({
      area: 'ocr',
      action: 'ocr-excerpt',
      outcome: 'success',
      providerId: 'local',
      at: new Date(Date.UTC(2026, 6, 29, 1, index)).toISOString(),
      storage,
    })
  }
  const snapshot = readingTrialDiagnosticsSnapshot({
    storage,
    navigatorLike: null,
  })
  assert.equal(snapshot.events.length, 30)
  assert.equal(snapshot.summary.successCount, 30)
  assert.equal(snapshot.events[0].at, '2026-07-29T01:05:00.000Z')

  const unavailableStorage = {
    getItem: () => {
      throw new Error('blocked')
    },
    setItem: () => {
      throw new Error('blocked')
    },
  }
  assert.doesNotThrow(() => recordReadingTrialDiagnostic({
    area: 'ocr',
    action: 'ocr-excerpt',
    outcome: 'error',
    providerId: 'local',
    error: new Error('OCR failed'),
    storage: unavailableStorage,
  }))
  assert.equal(
    readingTrialDiagnosticsSnapshot({
      storage: unavailableStorage,
      navigatorLike: null,
    }).events.length,
    0,
  )
})

test('reading package quality audit keeps gaps and blockers inspectable', async () => {
  const { previews } = await buildReadingPreviews()
  const audit = auditReadingPackageQuality(previews[0])
  assert.equal(audit.summary.onDemandEntityCount, 40)
  assert.ok(audit.backgroundGaps.some((item) => item.id === 'place-tara'))
  assert.ok(audit.placeGeometryGaps.some((item) => item.id === 'place-american-south'))
  assert.ok(
    audit.candidateTranslationGaps.some((item) => item.id === 'person-mrs-tarleton'),
  )
  assert.equal(audit.blockerCounts.missing_edition_chapter_evidence, 32)
  assert.deepEqual(audit.pendingSourceIds, [
    'candidate-loc-america-reads-gwtw',
    'candidate-loc-general-maps',
    'candidate-openstreetmap',
  ])
  const linkResults = await checkReadingSourceLinks([
    { id: 'ok', label: '可访问', url: 'https://example.com/ok' },
    { id: 'restricted', label: '限制访问', url: 'https://example.com/restricted' },
  ], {
    fetchImpl: async (url) => new Response('', {
      status: url.endsWith('/ok') ? 200 : 403,
    }),
  })
  assert.deepEqual(linkResults.map(({ id, status }) => ({ id, status })), [
    { id: 'ok', status: 'reachable' },
    { id: 'restricted', status: 'restricted' },
  ])
})

test('a new book can build its first preview from staging without pipeline code changes', () => {
  const staging = {
    schemaVersion: 1,
    slug: 'test-book-zh-test-edition',
    order: 1,
    packageId: 'reader-package-test-book-zh-test-edition',
    packageVersion: '1.0.0',
    catalogEntry: { title: '测试书籍', editionLabel: '测试出版社 · 2026年' },
    sourceCandidates: [{
      id: 'source-test-edition',
      status: 'approved',
      kind: 'edition-metadata',
      label: '测试版本信息',
    }],
    entityCandidates: [],
    factCandidates: [],
    onDemandEntities: [],
    entities: [],
    facts: [],
    package: {
      schemaVersion: 1,
      packageVersion: '1.0.0',
      id: 'reader-package-test-book-zh-test-edition',
      book: {
        id: 'test-book',
        title: '测试书籍',
        author: '测试作者',
        originalLanguage: 'zh',
      },
      edition: {
        id: 'test-book-zh-test-edition',
        isbn: '0000000000000',
        language: 'zh-CN',
        publisher: '测试出版社',
        publishedAt: '2026',
        chapterCount: 1,
      },
      chapters: [{ id: 'chapter-01', number: 1, label: '第 1 章' }],
      entities: [],
      facts: [],
      sources: [],
    },
  }
  const preview = buildReadingPreviewFromStaging(staging)
  assert.equal(preview.package.book.title, '测试书籍')
  assert.equal(preview.previewMeta.targetPath, 'public/presets/reading-companion/test-book-zh-test-edition.json')
  assert.equal(preview.catalogEntry.path, 'presets/reading-companion/test-book-zh-test-edition.json')
  assert.deepEqual(preview.package.sources.map((source) => source.id), ['source-test-edition'])
  assert.deepEqual(preview.catalogEntry.preparedSummary, {
    entityCount: 0,
    place: 0,
    person: 0,
    concept: 0,
    event: 0,
    factCount: 0,
    sourceCount: 1,
  })
})

test('prepared package summary counts hidden and published entities without revealing names', () => {
  assert.deepEqual(summarizeReadingPackage({
    onDemandEntities: [
      { kind: 'person' },
      { kind: 'place' },
    ],
    entities: [
      { kind: 'place' },
      { kind: 'concept' },
    ],
    facts: [{ id: 'fact-1' }],
    sources: [{ id: 'source-1' }, { id: 'source-2' }],
  }), {
    entityCount: 4,
    place: 2,
    person: 1,
    concept: 1,
    event: 0,
    factCount: 1,
    sourceCount: 2,
  })
})

test('research candidates require provenance and blockers and never publish implicitly', () => {
  const staging = {
    schemaVersion: 1,
    slug: 'candidate-safety-test',
    order: 2,
    packageId: readingPackage.id,
    packageVersion: readingPackage.packageVersion,
    catalogEntry: { title: '候选安全测试', editionLabel: '测试版本' },
    sourceCandidates: [{
      id: 'candidate-source',
      status: 'candidate',
      kind: 'research',
      label: '候选来源',
    }],
    entityCandidates: [{
      status: 'candidate',
      entity: {
        id: 'place-unreviewed',
        name: '待审地点',
        kind: 'place',
        placeKind: 'real',
      },
      sourceIds: ['candidate-source'],
      blockers: ['missing_edition_chapter_evidence'],
    }],
    factCandidates: [],
    onDemandEntities: [],
    entities: [],
    facts: [],
    package: readingPackage,
  }
  const preview = buildReadingPreviewFromStaging(staging)
  assert.deepEqual(preview.previewMeta.candidateEntityIds, ['place-unreviewed'])
  assert.deepEqual(preview.package.entities, [])
  assert.deepEqual(preview.package.sources, [])

  staging.entityCandidates[0].blockers = []
  assert.throws(
    () => buildReadingPreviewFromStaging(staging),
    /待审候选必须说明阻塞项/,
  )

  staging.entityCandidates[0].blockers = ['missing_edition_chapter_evidence']
  staging.entityCandidates[0].entity.safeNote = ' '
  assert.throws(
    () => buildReadingPreviewFromStaging(staging),
    /safeNote 必须是 1–400 字符的非空字符串/,
  )
  delete staging.entityCandidates[0].entity.safeNote
  staging.entityCandidates[0].entity.safeNote = '独立背景'
  assert.throws(
    () => buildReadingPreviewFromStaging(staging),
    /safeNoteSourceIds 必须引用至少一个注释来源/,
  )
  delete staging.entityCandidates[0].entity.safeNote
  staging.factCandidates = [{
    status: 'candidate',
    fact: {
      id: 'fact-unreviewed',
      kind: 'history',
      content: '待审事实',
      riskLevel: 'potential',
      riskCategories: ['free_text_category'],
    },
    sourceIds: ['candidate-source'],
    blockers: ['spoiler_boundary_requires_review'],
  }]
  assert.throws(
    () => buildReadingPreviewFromStaging(staging),
    /风险类别无效/,
  )
})
