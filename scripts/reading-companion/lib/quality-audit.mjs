const CHINESE_PATTERN = /[\u3400-\u9fff]/

function sourceUrlStatus(source) {
  if (!source.url) return 'missing'
  try {
    const url = new URL(source.url)
    return url.protocol === 'https:' ? 'valid' : 'non_https'
  } catch {
    return 'invalid'
  }
}

function blockerCounts(candidates) {
  const counts = new Map()
  for (const candidate of candidates) {
    for (const blocker of candidate.blockers || []) {
      counts.set(blocker, (counts.get(blocker) || 0) + 1)
    }
  }
  return Object.fromEntries([...counts.entries()].sort((left, right) => (
    right[1] - left[1] || left[0].localeCompare(right[0])
  )))
}

function hasChineseName(entity) {
  return [entity?.name, ...(entity?.aliases || [])]
    .some((value) => CHINESE_PATTERN.test(String(value || '')))
}

export function auditReadingPackageQuality(preview) {
  const pkg = preview.package
  const onDemandEntities = pkg.onDemandEntities || []
  const places = onDemandEntities.filter((entity) => entity.kind === 'place')
  const sourceStatuses = pkg.sources.map((source) => ({
    id: source.id,
    label: source.label,
    status: sourceUrlStatus(source),
  }))
  const entityCandidates = preview.researchCandidates?.entities || []
  const factCandidates = preview.researchCandidates?.facts || []
  return {
    packageId: pkg.id,
    title: pkg.book.title,
    isbn: pkg.edition.isbn,
    packageVersion: pkg.packageVersion,
    summary: {
      sourceCount: pkg.sources.length,
      onDemandEntityCount: onDemandEntities.length,
      formalEntityCount: pkg.entities.length,
      formalFactCount: pkg.facts.length,
      pendingSourceCount: preview.previewMeta.pendingSourceIds.length,
      pendingEntityCount: entityCandidates.length,
      pendingFactCount: factCandidates.length,
    },
    backgroundGaps: onDemandEntities
      .filter((entity) => !entity.safeNote)
      .map((entity) => ({
        id: entity.id,
        name: entity.name,
        kind: entity.kind,
      })),
    placeGeometryGaps: places
      .filter((entity) => !entity.geometry)
      .map((entity) => ({
        id: entity.id,
        name: entity.name,
        placeKind: entity.placeKind,
      })),
    sourceUrlGaps: sourceStatuses.filter(({ status }) => status !== 'valid'),
    candidateTranslationGaps: entityCandidates
      .filter(({ entity }) => !hasChineseName(entity))
      .map(({ entity, blockers }) => ({
        id: entity.id,
        name: entity.name,
        blockers,
      })),
    blockerCounts: blockerCounts([...entityCandidates, ...factCandidates]),
    pendingSourceIds: [...preview.previewMeta.pendingSourceIds],
  }
}

export async function checkReadingSourceLinks(sources, {
  timeoutMs = 8000,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('当前环境不支持链接检查')
  return Promise.all(
    sources
      .filter((source) => source.url)
      .map(async (source) => {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), timeoutMs)
        try {
          const response = await fetchImpl(source.url, {
            method: 'HEAD',
            redirect: 'follow',
            signal: controller.signal,
            headers: { 'User-Agent': 'TangerineReadingCompanion-audit/1.0' },
          })
          const status = response.status
          return {
            id: source.id,
            label: source.label,
            url: source.url,
            httpStatus: status,
            status: status >= 200 && status < 400
              ? 'reachable'
              : ([401, 403, 405, 429].includes(status) ? 'restricted' : 'unavailable'),
          }
        } catch (error) {
          return {
            id: source.id,
            label: source.label,
            url: source.url,
            httpStatus: null,
            status: error?.name === 'AbortError' ? 'timeout' : 'unavailable',
          }
        } finally {
          clearTimeout(timer)
        }
      }),
  )
}
