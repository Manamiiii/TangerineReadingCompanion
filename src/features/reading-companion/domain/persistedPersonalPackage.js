import { assertReadingPackage } from './readingCompanion.js'

// The backup contract projects every object, including nested metadata. Unknown
// fields are intentionally omitted; permitted prose remains reader-owned data.
const geometry = { type: 'string', latitude: 'number', longitude: 'number', radiusKm: 'number', geojson: { type: 'string', coordinates: 'coordinates' } }
const entity = {
  id: 'string', name: 'string', originalName: 'string', kind: 'string', placeKind: 'string',
  aliases: ['string'], parentLabel: 'string', activation: 'string', scopeNote: 'string',
  revealAt: { chapterId: 'string', anchor: 'nullableString' }, sourceIds: ['string'],
  safeNote: 'string', safeNoteSourceIds: ['string'], geometry,
}
const contract = {
  schemaVersion: 'number', packageVersion: 'string', id: 'string', personal: 'boolean',
  book: { id: 'string', title: 'string', author: 'string', originalLanguage: 'string', cover: { theme: 'string', image: 'string' } },
  edition: { id: 'string', isbn: 'string', language: 'string', publisher: 'string', publishedAt: 'string', translators: ['string'], chapterCount: 'number' },
  chapters: [{ id: 'string', number: 'number', label: 'string' }],
  entities: [entity], onDemandEntities: [entity],
  facts: [{ id: 'string', bookId: 'string', editionId: 'string', kind: 'string', content: 'string', entityIds: ['string'], revealAt: { chapterId: 'string', anchor: 'nullableString' }, riskLevel: 'string', riskCategories: ['string'], sourceIds: ['string'], confidence: 'number' }],
  sources: [{ id: 'string', kind: 'string', label: 'string', url: 'string', organization: 'string', accessedAt: 'string', useFor: ['string'], rightsStatus: 'string', notes: 'string' }],
}

function project(value, shape, depth = 0) {
  if (depth > 12) throw new Error('个人书籍数据嵌套过深')
  if (shape === 'coordinates') {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (Array.isArray(value)) return value.map(item => project(item, shape, depth + 1))
    throw new Error('个人书籍坐标无效')
  }
  if (shape === 'nullableString' && value === null) return null
  if (typeof shape === 'string') {
    const type = shape === 'nullableString' ? 'string' : shape
    if (typeof value !== type || (type === 'number' && !Number.isFinite(value))) throw new Error('个人书籍字段类型无效')
    return value
  }
  if (Array.isArray(shape)) {
    if (!Array.isArray(value)) throw new Error('个人书籍数组无效')
    return value.map(item => project(item, shape[0], depth + 1))
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('个人书籍对象无效')
  return Object.fromEntries(Object.entries(shape).flatMap(([key, child]) => (
    value[key] === undefined ? [] : [[key, project(value[key], child, depth + 1)]]
  )))
}

export function normalizePersonalPackage(value) {
  const pkg = assertReadingPackage(project(value, contract))
  if (!pkg.personal || !Array.isArray(pkg.edition.translators)) throw new Error('个人书籍版本无效')
  const image = pkg.book.cover?.image
  if (image !== undefined && (image.length > 3_000_000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(image))) throw new Error('个人书籍封面无效')
  return pkg
}
