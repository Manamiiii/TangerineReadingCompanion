import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  projectReadingPlaces,
  scanOnDemandEntities,
  unlockedOnDemandEntities,
  upsertObservedEntity,
} from '../../../src/features/reading-companion/domain/readingCompanion.js'
import {
  READING_FEEDBACK_SCHEMA_VERSION,
  createReadingFeedbackBundle,
} from '../../../src/features/reading-companion/domain/feedbackBundle.js'
import {
  readingTrialDiagnosticsSnapshot,
  recordReadingTrialDiagnostic,
} from '../../../src/features/reading-companion/domain/trialDiagnostics.js'

const repoUrl = new URL('../../../', import.meta.url)
const readingPackage = JSON.parse(
  await readFile(
    new URL(
      'public/presets/reading-companion/gone-with-the-wind-zh-9787570202188.json',
      repoUrl,
    ),
    'utf8',
  ),
)

function memoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  }
}

test('reader trial flow scans, records, unlocks, maps, and exports one chapter safely', () => {
  const excerpt = '斯佳丽从亚特兰大回到塔拉庄园，并听人谈起南北战争。'
  const scanResults = scanOnDemandEntities(excerpt, readingPackage.onDemandEntities)
  assert.deepEqual(
    scanResults.map((result) => result.entity.id),
    [
      'person-scarlett-ohara',
      'event-american-civil-war',
      'place-atlanta',
      'place-tara',
    ],
  )

  const observedEntities = scanResults.reduce((current, { entity, matchedTerm }, index) => (
    upsertObservedEntity(current, {
      id: `trial-observed-${index + 1}`,
      name: matchedTerm,
      kind: entity.kind,
      placeKind: entity.placeKind,
      packageEntityId: entity.id,
      equivalentNames: [entity.name, entity.originalName, ...(entity.aliases || [])],
      firstSeenChapterId: 'chapter-04',
    }, readingPackage.chapters)
  ), [])
  assert.equal(observedEntities.length, 4)
  assert.equal(observedEntities.every((entity) => entity.packageEntityId), true)

  const unlocked = unlockedOnDemandEntities(
    readingPackage.onDemandEntities,
    observedEntities,
    'chapter-04',
    readingPackage.chapters,
  )
  assert.deepEqual(
    unlocked.map((entity) => entity.id),
    [
      'person-scarlett-ohara',
      'event-american-civil-war',
      'place-atlanta',
      'place-tara',
    ],
  )
  assert.deepEqual(
    projectReadingPlaces(unlocked).map((place) => place.id),
    ['place-atlanta'],
  )

  const storage = memoryStorage()
  recordReadingTrialDiagnostic({
    area: 'model',
    action: 'model-excerpt-analysis',
    outcome: 'success',
    providerId: 'zhipu',
    at: '2026-07-29T01:00:00.000Z',
    storage,
  })
  const payload = createReadingFeedbackBundle({
    appVersion: '0.1.0',
    appBuild: 'trial',
    scene: { id: 'scene-reading-companion', name: '经典文学阅读' },
    readingPackage,
    readingState: {
      currentChapterId: 'chapter-04',
      observedEntities,
      excerpt,
      modelResult: { content: excerpt },
    },
    diagnostics: readingTrialDiagnosticsSnapshot({
      storage,
      navigatorLike: {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/140.0.0.0 Safari/537.36',
        language: 'zh-CN',
        onLine: true,
      },
    }),
    exportedAt: '2026-07-29T01:05:00.000Z',
  })

  assert.equal(payload.schemaVersion, READING_FEEDBACK_SCHEMA_VERSION)
  assert.equal(payload.reading.currentChapterId, 'chapter-04')
  assert.equal(payload.summary.observedCount, 4)
  assert.equal(payload.summary.pairedEntityCount, 4)
  assert.equal(payload.diagnostics.summary.successCount, 1)
  assert.equal(JSON.stringify(payload).includes(excerpt), false)
  assert.equal(JSON.stringify(payload).includes('modelResult'), false)
})
