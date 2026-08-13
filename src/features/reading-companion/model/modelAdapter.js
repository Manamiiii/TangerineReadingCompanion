import {
  OBSERVED_ENTITY_KIND,
  OBSERVED_PLACE_KIND,
} from '../domain/readingCompanion.js'
import {
  READING_PROMPT_IDS,
  excerptEntityLinkMessages,
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

function cachedModelResult(key) {
  return readCachedModelResult(key)
}

function storeModelResult(key, result) {
  return cacheModelResult(key, result)
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
  return candidates.slice(0, 60).flatMap((candidate) => {
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
}) {
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
  const cached = cachedModelResult(cacheKey)
  if (cached) return cached
  const payload = await requestModelJson({
    url,
    modelName,
    key,
    temperature,
    fetchImpl,
    messages: personalBookKnowledgeMessages(bookContext),
  })
  const result = normalizePersonalBookKnowledge(payload)
  if (result.length === 0) throw new Error('模型没有准备出可用的基础名称')
  return storeModelResult(cacheKey, result)
}

export function readingQuestionLooksForward(value) {
  const text = typeof value === 'string' ? value.normalize('NFKC').trim() : ''
  return /(?:后来|以后|接下来|下一章|最终|最后|结局|会不会|是否会|怎么死|谁死|真相|身份秘密)/u
    .test(text)
}

export function readingAnswerLooksForward(value) {
  const text = typeof value === 'string' ? value.normalize('NFKC').trim() : ''
  return /(?:第\s*\d+\s*章|最终|结局|身份其实|真相是|后来.{0,30}(?:去世|死亡|结婚|成为|发现|揭示))/u
    .test(text)
}

export async function answerReadingQuestion({
  endpoint,
  model,
  apiKey,
  temperature = 0,
  question,
  excerpt = '',
  bookTitle = '',
  chapterLabel = '',
  fetchImpl = globalThis.fetch,
}) {
  const url = normalizeModelEndpoint(endpoint)
  const modelName = requiredText(model, '请填写模型名称')
  const key = requiredText(apiKey, '请填写 API Key')
  const text = requiredText(question, '请输入想了解的概念或当前段落问题')
  if (text.length > 500) throw new Error('单次问题最多 500 个字符')
  if (readingQuestionLooksForward(text)) {
    throw new Error('这里先只解释概念和当前段落，不回答后续剧情或结局')
  }
  const currentExcerpt = typeof excerpt === 'string' ? excerpt.trim().slice(0, 6000) : ''
  if (typeof fetchImpl !== 'function') throw new Error('当前环境无法调用模型接口')
  const cacheKey = modelCacheKey('reading-question-v1', [
    url,
    modelName,
    text,
    currentExcerpt,
    bookTitle,
    chapterLabel,
  ])
  const cached = cachedModelResult(cacheKey)
  if (cached) return cached
  const payload = await requestModelJson({
    url,
    modelName,
    key,
    temperature,
    fetchImpl,
    messages: [
      {
        role: 'system',
        content: [
          '你是阅读伴侣中的无剧透概念解释助手。',
          '只解释用户询问的词语、历史文化背景、语言含义，或用户当前提供段落中已经出现的内容。',
          '不得补充后续章节、人物未来关系、身份秘密、命运、结局或当前段落之外的剧情。',
          '如果问题必须依赖后续剧情才能回答，请明确说“这涉及后续剧情，这里先不展开”。',
          '回答使用简洁中文，优先让普通读者一遍看懂；不确定时明确说明。',
          '只返回 JSON：{"answer":"回答","uncertain":false}。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `书籍：${bookTitle || '未知'}`,
          `当前阅读位置：${chapterLabel || '未知章节'}`,
          `问题：${text}`,
          currentExcerpt ? `当前段落：\n${currentExcerpt}` : '当前段落：未提供',
        ].join('\n'),
      },
    ],
  })
  const answer = typeof payload?.answer === 'string'
    ? payload.answer.normalize('NFKC').trim().slice(0, 4000)
    : ''
  if (!answer) throw new Error('模型没有返回可用的解释')
  if (readingAnswerLooksForward(answer)) {
    throw new Error('模型回答可能涉及后续剧情，已停止显示')
  }
  return storeModelResult(cacheKey, {
    answer,
    uncertain: payload?.uncertain === true,
  })
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
}) {
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
  const cached = cachedModelResult(cacheKey)
  if (cached) return cached
  const payload = await requestModelJson({
    url,
    modelName,
    key,
    temperature,
    fetchImpl,
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
    .map((candidate) => {
      const matchedEntity = knownEntitiesById.get(candidate.matchedEntityId)
      if (!matchedEntity) return candidate
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
  return storeModelResult(cacheKey, result)
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
}) {
  const url = normalizeModelEndpoint(endpoint)
  const modelName = requiredText(model, '请填写模型名称')
  const key = requiredText(apiKey, '请填写 API Key')
  const text = requiredText(query, '请先填写地点搜索词')
  if (text.length > 120) throw new Error('地点搜索词不能超过 120 个字符')
  if (typeof fetchImpl !== 'function') throw new Error('当前环境无法调用模型接口')
  const cacheKey = modelCacheKey('place-query', [
    url,
    modelName,
    text,
    bookTitle,
    chapterLabel,
  ])
  const cached = cachedModelResult(cacheKey)
  if (cached) return cached
  const payload = await requestModelJson({
    url,
    modelName,
    key,
    temperature,
    fetchImpl,
    messages: [
          {
            role: 'system',
            content: [
              '你只为国际地图生成地点检索词候选。',
              '书名只用于判断历史译名、英文原名和可能的州或国家，不得输出剧情。',
              '候选按从精确到宽泛排序：优先给出现代英文名或历史机构名，最后一个候选给出其所在城市、州或地区，供精确对象未被地图收录时定位参考区域。',
              '最多返回 3 个互不重复的候选，不确定所在区域时不要猜测。',
              '只返回 JSON：{"queries":["候选1","候选2"]}。',
            ].join('\n'),
          },
          {
            role: 'user',
            content: [
              `书籍：${bookTitle || '未知'}`,
              `阅读章节：${chapterLabel || '未知'}`,
              `作品中的地点名称：${text}`,
            ].join('\n'),
          },
    ],
  })
  const queries = (Array.isArray(payload?.queries)
    ? payload.queries
    : [payload?.query])
    .map((item) => (typeof item === 'string' ? item.normalize('NFKC').trim() : ''))
    .filter((item, index, all) => item && item.length <= 120 && all.indexOf(item) === index)
    .slice(0, 3)
  if (queries.length === 0) throw new Error('模型没有返回可用的地图搜索词')
  return storeModelResult(cacheKey, queries)
}

export async function translateReadingPlaceQuery(options) {
  const [query] = await suggestReadingPlaceQueries(options)
  return query
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
}) {
  const url = normalizeModelEndpoint(endpoint)
  const modelName = requiredText(model, '请填写模型名称')
  const key = requiredText(apiKey, '请填写 API Key')
  const text = requiredText(ocrText, '截图没有识别出文字')
  if (text.length > 12000) throw new Error('单次书籍信息识别最多发送 12000 个字符')
  if (typeof fetchImpl !== 'function') throw new Error('当前环境无法调用模型接口')
  const cacheKey = modelCacheKey('book-metadata-v4', [
    url,
    modelName,
    text,
    localMetadata,
    uncertainFields,
  ])
  const cached = cachedModelResult(cacheKey)
  if (cached) return cached
  const payload = await requestModelJson({
    url,
    modelName,
    key,
    temperature,
    fetchImpl,
    messages: [
      {
        role: 'system',
        content: [
          '你负责校对书籍版权页 OCR 并整理书目信息，不得生成剧情或无关内容。',
          '优先读取书名、作者、译者、出版社等明确字段标签后的值；忽略状态栏、页码、按钮、乱码和版权说明。',
          'OCR 可能把“书名”“译者”等标签识别成 FE、BE 等短字母，也可能把中文值识别成形近字或拉丁字母；请利用字段顺序、作者、出版社、ISBN 和同页其他书目信息交叉纠正。',
          '可以使用你掌握的公开书目知识核对准确 ISBN 对应版本的书名、作者和译者；不要简单照抄已标记为低置信的 OCR 值。',
          '例如常见作品作者中的形近字、译者被识别为拉丁字母时，应优先依据 ISBN、出版社、出版日期与作品信息校正。',
          '只有交叉信息足以确定时才纠错；无法确定的字段返回空值，不得猜测。',
          '字段值不得带回字段标签，也不得在书名前添加无法确认的字母、符号或 OCR 噪声。',
          '日期使用 YYYY-MM；译者使用字符串数组；没有的字段返回空值。',
          '只返回 JSON：{"title":"","author":"","translators":[],"publisher":"","isbn":"","publishedAt":"","originalLanguage":"","chapterCount":null}。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `本机候选：${JSON.stringify(localMetadata)}`,
          `低置信字段：${JSON.stringify(uncertainFields)}`,
          'OCR 原文：',
          text,
        ].join('\n'),
      },
    ],
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
  return storeModelResult(cacheKey, metadata)
}
