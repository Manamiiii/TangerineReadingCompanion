import {
  READING_PACKAGE_SCHEMA_VERSION,
  assertReadingPackage,
  summarizeReadingPackage,
} from './readingCompanion.js'

const MAX_PERSONAL_CHAPTERS = 1000
const MAX_COVER_DATA_URL_LENGTH = 3_000_000
const PERSONAL_MODEL_SOURCE_ID = 'source-personal-model-preparation'
const PERSONAL_PLACE_KINDS = new Set([
  'unknown',
  'real',
  'fictional',
  'prototype',
  'approximate',
])

export const PERSONAL_BOOK_COVER_THEMES = Object.freeze([
  'amber',
  'violet',
  'ocean',
  'forest',
  'ink',
])

function normalizedText(value) {
  return typeof value === 'string' ? value.normalize('NFKC').trim() : ''
}

export function extractPersonalBookMetadataDetails(value) {
  const sourceText = normalizedText(value)
  if (!sourceText) return { metadata: {}, uncertainFields: [] }
  const lines = sourceText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const allLabels = [
    '书名', '书籍名称', '作品名', '作品名称', '图书名称', '标题',
    '作者', '著者', '译者', '翻译', '译',
    '出版社', '出版方', '版权方', '出版时间', 'ISBN',
  ]
  const titleLabels = new Set(['书名', '书籍名称', '作品名', '作品名称', '图书名称', '标题'])
  const translatorLabels = new Set(['译者', '翻译', '译'])
  const normalizedLabel = (label) => label.replace(/\s/gu, '').toLocaleUpperCase()
  const splitLabeledLine = (line) => {
    const match = line.match(/^([^:：]{1,16})\s*[:：]\s*(.+)$/u)
    return match
      ? { label: normalizedLabel(match[1]), value: match[2].trim() }
      : null
  }
  const uncertainFields = []
  const authorIndex = lines.findIndex((line) => ['作者', '著者']
    .includes(splitLabeledLine(line)?.label))
  const publisherIndex = lines.findIndex((line) => ['出版社', '出版方', '版权方']
    .includes(splitLabeledLine(line)?.label))
  const hasTitleLabel = lines.some((line) => titleLabels.has(splitLabeledLine(line)?.label))
  if (!hasTitleLabel && authorIndex > 0) {
    for (let index = authorIndex - 1; index >= 0; index -= 1) {
      const candidate = splitLabeledLine(lines[index])
      if (!candidate || allLabels.map(normalizedLabel).includes(candidate.label)) continue
      lines[index] = `书名:${candidate.value}`
      uncertainFields.push('title')
      break
    }
  }
  const hasTranslatorLabel = lines.some((line) => (
    translatorLabels.has(splitLabeledLine(line)?.label)
  ))
  if (!hasTranslatorLabel && authorIndex >= 0 && publisherIndex > authorIndex + 1) {
    for (let index = authorIndex + 1; index < publisherIndex; index += 1) {
      const candidate = splitLabeledLine(lines[index])
      if (!candidate || allLabels.map(normalizedLabel).includes(candidate.label)) continue
      lines[index] = `译者:${candidate.value}`
      uncertainFields.push('translators')
      break
    }
  }
  const text = lines.join('\n')
  const escapedLabel = (label) => [...label]
    .map((character) => character.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'))
    .join('\\s*')
  const labeledValue = (...labels) => {
    const acceptedLabels = new Set(labels.map((label) => label.replace(/\s/gu, '')))
    const lineValue = lines.map((line) => {
      const match = line.match(/^([^:：]{1,16})\s*[:：]\s*(.+)$/u)
      if (!match || !acceptedLabels.has(match[1].replace(/\s/gu, ''))) return ''
      return match[2].trim()
    }).find(Boolean)
    if (lineValue && !allLabels.some((label) => (
      new RegExp(`\\s${escapedLabel(label)}\\s*[:：]`, 'iu').test(lineValue)
    ))) return lineValue
    const requestedPattern = labels.map(escapedLabel).join('|')
    const nextLabelPattern = allLabels.map(escapedLabel).join('|')
    const mergedMatch = text.match(new RegExp(
      `(?:^|\\s)(?:${requestedPattern})\\s*[:：]\\s*(.*?)(?=\\s+(?:${nextLabelPattern})\\s*[:：]|$)`,
      'iu',
    ))
    return mergedMatch?.[1]?.trim() || lineValue || ''
  }
  const isbn = text.match(/\b97[89][\d\s-]{9,18}\d\b/u)?.[0]
    ?.replace(/[^\d]/g, '')
  const published = text.match(/((?:19|20)\d{2})\s*(?:年|-)\s*(\d{1,2})(?:\s*月|-\d{1,2})?/u)
  const publisher = labeledValue('出版社', '出版方', '版权方')
    || text.match(/(?:出版社|出版方|版权方)\s*[:：]?\s*([^\n，。；]{2,30}(?:出版社|出版公司))/u)?.[1]
    || lines.find((line) => /(?:出版社|出版公司)$/u.test(line))
  const slashLine = lines.find((line) => /[/／]/u.test(line) && /(?:译|著)/u.test(line))
  const [authorPart = '', translatorPart = ''] = slashLine?.split(/[/／]/u) || []
  const author = (
    labeledValue('作者', '著者')
    || authorPart
  ).trim()
    .replace(/^(?:作者|著者)\s*[:：]?\s*/u, '')
    .replace(/\s*(?:著|作者)$/u, '')
    .trim()
  const translatorText = labeledValue('译者', '翻译', '译')
    || translatorPart
  const translators = translatorText
    .replace(/\s*译.*$/u, '')
    .split(/[、,，和]/u)
    .map((name) => name.trim())
    .filter(Boolean)
  const ignoredTitle = /^(?:简介|版权|目录|封面|字数|阅读|已完成|作者|译者|出版社|出版时间|ISBN)/iu
  const title = labeledValue('书名', '书籍名称', '作品名', '作品名称', '图书名称', '标题')
    || lines.find((line) => (
    line.length >= 1
    && line.length <= 80
    && !ignoredTitle.test(line)
    && !/^\d{1,2}:\d{2}\b/u.test(line)
    && !/[/／]/u.test(line)
    && !/^\d+(?:\.\d+)?(?:万)?[字人]?$/u.test(line)
  ))
  const metadata = {
    ...(title ? { title } : {}),
    ...(author ? { author } : {}),
    ...(translators.length > 0 ? { translators } : {}),
    ...(publisher ? { publisher } : {}),
    ...(isbn?.length === 13 ? { isbn } : {}),
    ...(published
      ? { publishedAt: `${published[1]}-${String(Number(published[2])).padStart(2, '0')}` }
      : {}),
  }
  return { metadata, uncertainFields }
}

export function extractPersonalBookMetadataFromText(value) {
  return extractPersonalBookMetadataDetails(value).metadata
}

export function mergePersonalBookMetadata(
  localMetadata = {},
  modelMetadata = {},
  uncertainFields = [],
) {
  const uncertain = new Set(uncertainFields)
  const metadata = { ...localMetadata }
  for (const [key, value] of Object.entries(modelMetadata)) {
    const modelHasValue = Array.isArray(value) ? value.length > 0 : Boolean(value)
    const localStructuredField = ['title', 'translators'].includes(key)
      && !uncertain.has(key)
      && (Array.isArray(localMetadata[key])
        ? localMetadata[key].length > 0
        : Boolean(localMetadata[key]))
    if (modelHasValue && !localStructuredField) metadata[key] = value
  }
  return metadata
}

export function buildPersonalChapters({ chapterCount, chapterText }) {
  const pastedLabels = normalizedText(chapterText)
    .split(/\r?\n/)
    .map((label) => label.trim())
    .filter(Boolean)
  const parsedCount = Number(chapterCount)
  const count = pastedLabels.length > 0 ? pastedLabels.length : parsedCount
  if (!Number.isInteger(count) || count < 1 || count > MAX_PERSONAL_CHAPTERS) {
    throw new Error(`章节数量必须是 1–${MAX_PERSONAL_CHAPTERS} 的整数`)
  }
  const width = Math.max(2, String(count).length)
  return Array.from({ length: count }, (_, index) => {
    const number = index + 1
    const pastedLabel = pastedLabels[index]
    const numericLabel = pastedLabel?.match(/^\d+$/)?.[0]
    return {
      id: `chapter-${String(number).padStart(width, '0')}`,
      number,
      label: numericLabel ? `第 ${Number(numericLabel)} 章` : pastedLabel || `第 ${number} 章`,
    }
  })
}

export function createPersonalReadingPackage(input) {
  const ids = {
    packageId: normalizedText(input?.packageId),
    bookId: normalizedText(input?.bookId),
    editionId: normalizedText(input?.editionId),
  }
  if (!ids.packageId || !ids.bookId || !ids.editionId) {
    throw new Error('个人书籍需要稳定的书籍、版本和资料包 id')
  }
  const title = normalizedText(input?.title)
  const author = normalizedText(input?.author)
  if (!title) throw new Error('请输入书名')
  if (!author) throw new Error('请输入作者')
  const chapters = buildPersonalChapters(input)
  const translators = normalizedText(input?.translators)
    .split(/[、,，]/)
    .map((name) => name.trim())
    .filter(Boolean)
  const coverTheme = PERSONAL_BOOK_COVER_THEMES.includes(input?.coverTheme)
    ? input.coverTheme
    : PERSONAL_BOOK_COVER_THEMES[0]
  const coverImage = typeof input?.coverImage === 'string'
    && /^data:image\/(?:png|jpeg|webp);base64,/i.test(input.coverImage)
    && input.coverImage.length <= MAX_COVER_DATA_URL_LENGTH
    ? input.coverImage
    : ''
  const pkg = {
    schemaVersion: READING_PACKAGE_SCHEMA_VERSION,
    packageVersion: '1.0.0-personal',
    id: ids.packageId,
    personal: true,
    book: {
      id: ids.bookId,
      title,
      author,
      originalLanguage: normalizedText(input?.originalLanguage) || 'unknown',
      cover: {
        theme: coverTheme,
        ...(coverImage ? { image: coverImage } : {}),
      },
    },
    edition: {
      id: ids.editionId,
      isbn: normalizedText(input?.isbn) || `personal-${ids.editionId}`,
      language: normalizedText(input?.language) || 'zh-CN',
      publisher: normalizedText(input?.publisher) || '个人书架',
      publishedAt: normalizedText(input?.publishedAt) || '未知',
      translators,
      chapterCount: chapters.length,
    },
    chapters,
    entities: [],
    onDemandEntities: [],
    facts: [],
    sources: [],
  }
  return assertReadingPackage(pkg)
}

export function mergePersonalBookKnowledge(pkg, candidates, createId) {
  const currentPackage = assertReadingPackage(pkg)
  if (!currentPackage.personal) throw new Error('只有个人书籍可以准备个人基础资料')
  if (!Array.isArray(candidates) || typeof createId !== 'function') {
    throw new Error('模型基础资料格式无效')
  }
  const existingKeys = new Set((currentPackage.onDemandEntities || []).map((entity) => (
    `${entity.kind}:${normalizedText(entity.name).toLocaleLowerCase()}`
  )))
  const additions = []
  for (const candidate of candidates) {
    const name = normalizedText(candidate?.name)
    const kind = ['person', 'place', 'concept', 'event'].includes(candidate?.kind)
      ? candidate.kind
      : ''
    const key = `${kind}:${name.toLocaleLowerCase()}`
    if (!name || !kind || existingKeys.has(key)) continue
    existingKeys.add(key)
    const originalName = normalizedText(candidate?.originalName)
    const aliases = (Array.isArray(candidate?.aliases) ? candidate.aliases : [])
      .map(normalizedText)
      .filter((alias, index, all) => (
        alias
        && alias !== name
        && alias !== originalName
        && all.indexOf(alias) === index
      ))
      .slice(0, 8)
    additions.push({
      id: createId(),
      name,
      ...(originalName ? { originalName } : {}),
      aliases,
      kind,
      ...(kind === 'place'
        ? {
            placeKind: PERSONAL_PLACE_KINDS.has(candidate.placeKind)
              ? candidate.placeKind
              : 'unknown',
          }
        : {}),
      activation: 'exact-reader-input',
      sourceIds: [PERSONAL_MODEL_SOURCE_ID],
      scopeNote: '由读者主动运行模型准备，只在当前原文精确出现同名内容后使用；不包含人物关系或后续剧情。',
    })
  }
  if (additions.length === 0) {
    return { package: currentPackage, addedCount: 0 }
  }
  const sources = currentPackage.sources.some((source) => source.id === PERSONAL_MODEL_SOURCE_ID)
    ? currentPackage.sources
    : [
        ...currentPackage.sources,
        {
          id: PERSONAL_MODEL_SOURCE_ID,
          kind: 'reader-requested-model-preparation',
          label: '个人书籍 AI 基础资料',
          notes: '模型生成的隐藏名称词典，只在读者当前原文精确命中后使用；不是正式资料来源或章节证据。',
        },
      ]
  const nextPackage = assertReadingPackage({
    ...currentPackage,
    packageVersion: '1.1.0-personal',
    sources,
    onDemandEntities: [
      ...(currentPackage.onDemandEntities || []),
      ...additions,
    ],
  })
  return { package: nextPackage, addedCount: additions.length }
}

export function personalCatalogEntry(pkg) {
  return {
    id: pkg.id,
    title: pkg.book.title,
    editionLabel: [
      pkg.edition.publisher,
      pkg.edition.publishedAt,
    ].filter((value) => value && value !== '未知').join(' · ') || '个人书籍',
    source: 'personal',
    cover: pkg.book.cover || { theme: PERSONAL_BOOK_COVER_THEMES[0] },
    preparedSummary: summarizeReadingPackage(pkg),
  }
}
