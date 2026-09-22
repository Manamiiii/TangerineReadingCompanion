import {
  OBSERVED_ENTITY_KIND,
  scanOnDemandEntities,
  OBSERVED_PLACE_KIND,
} from '../domain/readingCompanion.js'
import {
  READING_PROMPT_IDS,
  PERSONAL_KNOWLEDGE_LIMIT,
  placeQueryMessages,
  bookMetadataMessages,
  excerptEntityLinkMessages,
  readingEvidenceMessages,
  personalBookKnowledgeMessages,
} from './promptCatalog.js'
import {
  cacheModelResult,
  modelCacheKey,
  normalizeModelEndpoint,
  readCachedModelResult,
  requestModelJson,
} from '../../model/modelClient.js'

const VALID_KINDS = new Set(Object.values(OBSERVED_ENTITY_KIND))
const VALID_PLACE_KINDS = new Set(Object.values(OBSERVED_PLACE_KIND))

export { MODEL_STORAGE_KEYS as READING_MODEL_STORAGE_KEYS } from '../../model/modelConfig.js'

function requiredText(value, message) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) throw new Error(message)
  return text
}

export function nameOccursInExcerpt(excerpt, name) {
  return scanOnDemandEntities(excerpt, [{ id: 'candidate', name, aliases: [] }]).length > 0
}

export function normalizeModelCandidates(payload, allowedEntityIds = null) {
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : []
  const allowedIds = allowedEntityIds instanceof Set
    ? allowedEntityIds
    : new Set(Array.isArray(allowedEntityIds) ? allowedEntityIds : [])
  const seen = new Set()
  return candidates.slice(0, 20).flatMap((candidate) => {
    const name = typeof candidate?.name === 'string'
      ? candidate.name.normalize('NFKC').trim()
      : ''
    const kind = VALID_KINDS.has(candidate?.kind)
      ? candidate.kind
      : OBSERVED_ENTITY_KIND.CONCEPT
    const normalizedName = name.toLocaleLowerCase()
    if (!name || name.length > 80 || seen.has(`${kind}:${normalizedName}`)) return []
    seen.add(`${kind}:${normalizedName}`)
    const confidence = Number(candidate?.confidence)
    const matchedEntityId = typeof candidate?.matchedEntityId === 'string'
      && allowedIds.has(candidate.matchedEntityId)
      ? candidate.matchedEntityId
      : null
    return [{
      name,
      kind,
      ...(kind === OBSERVED_ENTITY_KIND.PLACE
        ? {
            placeKind: VALID_PLACE_KINDS.has(candidate?.placeKind)
              ? candidate.placeKind
              : OBSERVED_PLACE_KIND.UNKNOWN,
          }
        : {}),
      confidence: Number.isFinite(confidence)
        ? Math.max(0, Math.min(1, confidence))
        : null,
      matchedEntityId,
    }]
  })
}

function modelKnownEntityIndex(knownEntities) {
  if (!Array.isArray(knownEntities)) return []
  const seen = new Set()
  return knownEntities.slice(0, 60).flatMap((entity) => {
    const id = typeof entity?.id === 'string' ? entity.id.trim() : ''
    const name = typeof entity?.name === 'string'
      ? entity.name.normalize('NFKC').trim().slice(0, 80)
      : ''
    if (!id || !name || seen.has(id) || !VALID_KINDS.has(entity?.kind)) return []
    seen.add(id)
    const originalName = typeof entity?.originalName === 'string'
      ? entity.originalName.normalize('NFKC').trim().slice(0, 120)
      : ''
    const aliases = (Array.isArray(entity?.aliases) ? entity.aliases : [])
      .map((alias) => (typeof alias === 'string'
        ? alias.normalize('NFKC').trim().slice(0, 80)
        : ''))
      .filter((alias, index, all) => alias && all.indexOf(alias) === index)
      .slice(0, 8)
    return [{
      id,
      name,
      kind: entity.kind,
      ...(originalName ? { originalName } : {}),
      ...(aliases.length > 0 ? { aliases } : {}),
      ...(entity.kind === OBSERVED_ENTITY_KIND.PLACE
        && VALID_PLACE_KINDS.has(entity.placeKind)
        ? { placeKind: entity.placeKind }
        : {}),
    }]
  })
}

export function normalizePersonalBookKnowledge(payload) {
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : []
  const seen = new Set()
  return candidates.slice(0, PERSONAL_KNOWLEDGE_LIMIT).flatMap((candidate) => {
    const name = typeof candidate?.name === 'string'
      ? candidate.name.normalize('NFKC').trim()
      : ''
    const kind = VALID_KINDS.has(candidate?.kind)
      ? candidate.kind
      : OBSERVED_ENTITY_KIND.CONCEPT
    const normalizedName = name.toLocaleLowerCase()
    if (!name || name.length > 80 || seen.has(`${kind}:${normalizedName}`)) return []
    seen.add(`${kind}:${normalizedName}`)
    const originalName = typeof candidate?.originalName === 'string'
      ? candidate.originalName.normalize('NFKC').trim().slice(0, 120)
      : ''
    const aliases = (Array.isArray(candidate?.aliases) ? candidate.aliases : [])
      .map((alias) => (typeof alias === 'string' ? alias.normalize('NFKC').trim() : ''))
      .filter((alias, index, all) => (
        alias
        && alias.length <= 80
        && alias !== name
        && alias !== originalName
        && all.indexOf(alias) === index
      ))
      .slice(0, 8)
    return [{
      name,
      kind,
      ...(originalName ? { originalName } : {}),
      aliases,
      ...(kind === OBSERVED_ENTITY_KIND.PLACE
        ? {
            placeKind: VALID_PLACE_KINDS.has(candidate?.placeKind)
              ? candidate.placeKind
              : OBSERVED_PLACE_KIND.UNKNOWN,
          }
        : {}),
    }]
  })
}

export async function preparePersonalBookKnowledge({
  endpoint,
  model,
  apiKey,
  temperature = 0,
  book,
  edition,
  fetchImpl = globalThis.fetch,
  signal,
}) {
  signal?.throwIfAborted()
  const url = normalizeModelEndpoint(endpoint)
  const modelName = requiredText(model, '请填写模型名称')
  const key = requiredText(apiKey, '请填写 API Key')
  const title = requiredText(book?.title, '书籍缺少书名')
  if (typeof fetchImpl !== 'function') throw new Error('当前环境无法调用模型接口')
  const bookContext = {
    title,
    author: book?.author || '',
    originalLanguage: book?.originalLanguage || '',
    translators: edition?.translators || [],
    publisher: edition?.publisher || '',
    publishedAt: edition?.publishedAt || '',
    isbn: String(edition?.isbn || '').startsWith('personal-') ? '' : edition?.isbn || '',
  }
  const cacheKey = modelCacheKey(READING_PROMPT_IDS.personalBookKnowledge, [
    url,
    modelName,
    bookContext,
  ])
  const cached = readCachedModelResult(cacheKey)
  if (cached) return cached
  const payload = await requestModelJson({
    url,
    modelName,
    key,
    temperature,
    fetchImpl,
    signal,
    messages: personalBookKnowledgeMessages(bookContext),
  })
  const result = normalizePersonalBookKnowledge(payload)
  if (result.length === 0) throw new Error('模型没有准备出可用的基础名称')
  return cacheModelResult(cacheKey, result)
}

export function readingQuestionLooksForward(value) {
  const text = typeof value === 'string' ? value.normalize('NFKC').trim() : ''
  return /(?:后来|以后|接下来|下一章|最终|最后|结局|会不会|是否会|怎么死|谁死|真相|身份秘密)/u
    .test(text)
}

export async function answerReadingQuestion({
  endpoint, model, apiKey, temperature = 0, question, excerpt = '', backgrounds = [],
  fetchImpl = globalThis.fetch, signal,
}) {
  signal?.throwIfAborted()
  const text = requiredText(question, '请输入当前阅读问题')
  if (text.length > 500) throw new Error('单次问题最多 500 个字符')
  if (excerpt.trim().length > 6000) throw new Error('依据查找最多处理 6000 个字符，请缩短当前原文')
  if (readingQuestionLooksForward(text)) throw new Error('这里不回答后续剧情或结局')
  const sources = [
    ...(excerpt.trim() ? [{ id: 'excerpt', text: excerpt.trim(), label: '当前段落' }] : []),
    ...backgrounds.slice(0, 20).filter(item => typeof item?.safeNote === 'string').map((item, index) => ({
      id: 'background-' + index, text: item.safeNote.slice(0, 400), label: '已解锁背景 · ' + item.name,
    })),
  ]
  if (!sources.length) throw new Error('请先提供当前段落，或确认带有已审核背景的名称')
  const payload = await requestModelJson({
    endpoint, model, apiKey, temperature, fetchImpl, signal,
    messages: readingEvidenceMessages(text, sources),
  })
  if (!Array.isArray(payload?.evidence) || payload.evidence.length === 0 || payload.evidence.length > 3) {
    throw new Error('当前内容中没有足够依据，暂不补充解释')
  }
  const evidence = payload.evidence.map(item => {
    const source = sources.find(source => source.id === item?.sourceId)
    const quote = typeof item?.quote === 'string' ? item.quote.trim() : ''
    if (!source || !quote || quote.length > 800 || !source.text.includes(quote)) {
      throw new Error('模型返回了当前依据之外的内容，已停止显示')
    }
    return { quote, label: source.label }
  })
  return { evidence }
}

export async function analyzeReadingExcerpt({
  endpoint,
  model,
  apiKey,
  temperature = 0,
  excerpt,
  bookTitle,
  chapterLabel,
  knownEntities = [],
  fetchImpl = globalThis.fetch,
  signal,
}) {
  signal?.throwIfAborted()
  const url = normalizeModelEndpoint(endpoint)
  const modelName = requiredText(model, '请填写模型名称')
  const key = requiredText(apiKey, '请填写 API Key')
  const text = requiredText(excerpt, '请先放入当前正在阅读的小段文字')
  if (text.length > 12000) throw new Error('单次模型识别最多发送 12000 个字符')
  if (typeof fetchImpl !== 'function') throw new Error('当前环境无法调用模型接口')
  const knownEntityIndex = modelKnownEntityIndex(knownEntities)
  const allowedEntityIds = new Set(knownEntityIndex.map((entity) => entity.id))
  const cacheKey = modelCacheKey(READING_PROMPT_IDS.excerptEntityLink, [
    url,
    modelName,
    text,
    bookTitle || '',
    chapterLabel || '',
    knownEntityIndex,
  ])
  const cached = readCachedModelResult(cacheKey)
  if (cached) return cached
  const payload = await requestModelJson({
    url,
    modelName,
    key,
    temperature,
    fetchImpl,
    signal,
    messages: excerptEntityLinkMessages({
      bookTitle,
      chapterLabel,
      excerpt: text,
      knownEntities: knownEntityIndex,
    }),
  })
  const knownEntitiesById = new Map(
    knownEntityIndex.map((entity) => [entity.id, entity]),
  )
  const result = normalizeModelCandidates(payload, allowedEntityIds)
    .filter(candidate => nameOccursInExcerpt(text, candidate.name))
    .map((candidate) => {
      const matchedEntity = knownEntitiesById.get(candidate.matchedEntityId)
      const normalizeName = value => typeof value === 'string'
        ? value.normalize('NFKC').trim().toLocaleLowerCase() : ''
      const matchesName = matchedEntity && [matchedEntity.name, matchedEntity.originalName, ...(matchedEntity.aliases || [])]
        .some(name => normalizeName(name) === normalizeName(candidate.name))
      if (!matchesName) return { ...candidate, matchedEntityId: null }
      return {
        ...candidate,
        kind: matchedEntity.kind,
        ...(matchedEntity.kind === OBSERVED_ENTITY_KIND.PLACE
          ? {
              placeKind: VALID_PLACE_KINDS.has(matchedEntity.placeKind)
                ? matchedEntity.placeKind
                : OBSERVED_PLACE_KIND.UNKNOWN,
            }
          : {}),
      }
    })
  return cacheModelResult(cacheKey, result)
}

export async function suggestReadingPlaceQueries({
  endpoint,
  model,
  apiKey,
  temperature = 0,
  query,
  bookTitle = '',
  chapterLabel = '',
  fetchImpl = globalThis.fetch,
  signal,
}) {
  signal?.throwIfAborted()
  const url = normalizeModelEndpoint(endpoint)
  const modelName = requiredText(model, '请填写模型名称')
  const key = requiredText(apiKey, '请填写 API Key')
  const text = requiredText(query, '请先填写地点搜索词')
  if (text.length > 120) throw new Error('地点搜索词不能超过 120 个字符')
  if (typeof fetchImpl !== 'function') throw new Error('当前环境无法调用模型接口')
  const cacheKey = modelCacheKey(READING_PROMPT_IDS.placeQuery, [
    url,
    modelName,
    text,
    bookTitle,
    chapterLabel,
  ])
  const cached = readCachedModelResult(cacheKey)
  if (cached) return cached
  const payload = await requestModelJson({
    url,
    modelName,
    key,
    temperature,
    fetchImpl,
    signal,
    messages: placeQueryMessages(text, bookTitle, chapterLabel),
  })
  const queries = (Array.isArray(payload?.queries)
    ? payload.queries
    : [payload?.query])
    .map((item) => (typeof item === 'string' ? item.normalize('NFKC').trim() : ''))
    .filter((item, index, all) => item && item.length <= 120 && all.indexOf(item) === index)
    .slice(0, 3)
  if (queries.length === 0) throw new Error('模型没有返回可用的地图搜索词')
  return cacheModelResult(cacheKey, queries)
}

export async function analyzeReadingBookMetadata({
  endpoint,
  model,
  apiKey,
  temperature = 0,
  ocrText,
  localMetadata = {},
  uncertainFields = [],
  fetchImpl = globalThis.fetch,
  signal,
}) {
  signal?.throwIfAborted()
  const url = normalizeModelEndpoint(endpoint)
  const modelName = requiredText(model, '请填写模型名称')
  const key = requiredText(apiKey, '请填写 API Key')
  const text = requiredText(ocrText, '截图没有识别出文字')
  if (text.length > 12000) throw new Error('单次书籍信息识别最多发送 12000 个字符')
  if (typeof fetchImpl !== 'function') throw new Error('当前环境无法调用模型接口')
  const cacheKey = modelCacheKey(READING_PROMPT_IDS.bookMetadata, [
    url,
    modelName,
    text,
    localMetadata,
    uncertainFields,
  ])
  const cached = readCachedModelResult(cacheKey)
  if (cached) return cached
  const payload = await requestModelJson({
    url,
    modelName,
    key,
    temperature,
    fetchImpl,
    signal,
    messages: bookMetadataMessages(text, localMetadata, uncertainFields),
  })
  const metadata = {
    title: typeof payload?.title === 'string' ? payload.title.trim().slice(0, 120) : '',
    author: typeof payload?.author === 'string' ? payload.author.trim().slice(0, 120) : '',
    translators: Array.isArray(payload?.translators)
      ? payload.translators
        .filter((item) => typeof item === 'string' && item.trim())
        .map((item) => item.trim())
        .slice(0, 12)
      : [],
    publisher: typeof payload?.publisher === 'string' ? payload.publisher.trim().slice(0, 120) : '',
    isbn: typeof payload?.isbn === 'string' ? payload.isbn.replace(/[^\dX]/gi, '').slice(0, 13) : '',
    publishedAt: /^(?:19|20)\d{2}-(?:0[1-9]|1[0-2])$/u.test(payload?.publishedAt)
      ? payload.publishedAt
      : '',
    originalLanguage: typeof payload?.originalLanguage === 'string'
      ? payload.originalLanguage.trim().slice(0, 20)
      : '',
    chapterCount: Number.isInteger(Number(payload?.chapterCount))
      && Number(payload.chapterCount) >= 1
      && Number(payload.chapterCount) <= 1000
      ? Number(payload.chapterCount)
      : null,
  }
  return cacheModelResult(cacheKey, metadata)
}
