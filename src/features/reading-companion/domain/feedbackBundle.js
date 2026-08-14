import { sanitizeReadingTrialDiagnostics } from './trialDiagnostics.js'

export const READING_FEEDBACK_KIND = 'tangerine-reading-feedback'
export const READING_FEEDBACK_SCHEMA_VERSION = 3

const OBSERVED_ENTITY_FIELDS = [
  'id',
  'name',
  'kind',
  'placeKind',
  'firstSeenChapterId',
  'encounterChapterIds',
  'note',
  'packageEntityId',
]

const MAP_LOCATION_FIELDS = [
  'mode',
  'resultId',
  'label',
  'providerId',
  'latitude',
  'longitude',
  'radiusKm',
  'geometry',
]

function pickDefined(source, keys) {
  return Object.fromEntries(
    keys
      .filter((key) => source?.[key] !== undefined)
      .map((key) => [key, structuredClone(source[key])]),
  )
}

function feedbackObservedEntity(entity) {
  const result = pickDefined(entity, OBSERVED_ENTITY_FIELDS)
  if (entity?.mapLocation) {
    result.mapLocation = pickDefined(entity.mapLocation, MAP_LOCATION_FIELDS)
  }
  return result
}

export function summarizeReadingFeedback(observedEntities = []) {
  const entities = Array.isArray(observedEntities) ? observedEntities : []
  return {
    observedCount: entities.length,
    noteCount: entities.filter((entity) => (
      typeof entity?.note === 'string' && entity.note.trim()
    )).length,
    mappedPlaceCount: entities.filter((entity) => entity?.mapLocation).length,
    personCount: entities.filter((entity) => entity?.kind === 'person').length,
    placeCount: entities.filter((entity) => entity?.kind === 'place').length,
    conceptCount: entities.filter((entity) => entity?.kind === 'concept').length,
    eventCount: entities.filter((entity) => entity?.kind === 'event').length,
    pairedEntityCount: entities.filter((entity) => (
      typeof entity?.packageEntityId === 'string' && entity.packageEntityId
    )).length,
  }
}

export function createReadingFeedbackBundle({
  appVersion,
  appBuild,
  readingPackage,
  readingState,
  currentChapterId,
  diagnostics,
  exportedAt = new Date().toISOString(),
}) {
  if (!readingPackage?.id || !readingPackage?.book?.id || !readingPackage?.edition?.id) {
    throw new Error('缺少可导出的阅读资料包')
  }
  const observedEntities = (Array.isArray(readingState?.observedEntities)
    ? readingState.observedEntities
    : []).map(feedbackObservedEntity)
  const chapterId = currentChapterId || readingState?.currentChapterId || ''
  return {
    kind: READING_FEEDBACK_KIND,
    schemaVersion: READING_FEEDBACK_SCHEMA_VERSION,
    exportedAt,
    app: {
      version: typeof appVersion === 'string' && appVersion.trim()
        ? appVersion.trim()
        : 'unknown',
      build: typeof appBuild === 'string' && appBuild.trim()
        ? appBuild.trim()
        : 'local',
    },
    book: {
      packageId: readingPackage.id,
      packageVersion: readingPackage.packageVersion,
      bookId: readingPackage.book.id,
      title: readingPackage.book.title,
      author: readingPackage.book.author,
      editionId: readingPackage.edition.id,
      translators: structuredClone(readingPackage.edition.translators || []),
      publisher: readingPackage.edition.publisher,
      publishedAt: readingPackage.edition.publishedAt,
      isbn: readingPackage.edition.isbn,
      chapterCount: Array.isArray(readingPackage.chapters)
        ? readingPackage.chapters.length
        : 0,
    },
    reading: {
      currentChapterId: chapterId,
      currentChapterLabel: readingPackage.chapters
        ?.find((chapter) => chapter.id === chapterId)?.label || '',
      updatedAt: readingState?.updatedAt || null,
      observedEntities,
    },
    summary: summarizeReadingFeedback(observedEntities),
    diagnostics: sanitizeReadingTrialDiagnostics(diagnostics),
  }
}
