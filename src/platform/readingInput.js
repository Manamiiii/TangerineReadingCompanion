// Ephemeral values only. Never serialize this envelope into URLs, storage or logs.
export const INPUT_LIMITS = Object.freeze({ text: 50000, link: 4096, imageBytes: 20 * 1024 * 1024 })
const SOURCES = new Set(['manual', 'clipboard', 'file', 'capture', 'share', 'ocr'])
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/bmp'])

export function normalizeReadingInput(input) {
  if (!input || !SOURCES.has(input.source)) throw new Error('无法识别内容来源。')
  const base = { kind: input.kind, source: input.source }
  if (input.kind === 'text') {
    if (typeof input.text !== 'string' || input.text.length > INPUT_LIMITS.text) {
      throw new Error('当前段落最多支持 50000 字，请只提供正在阅读的小段。')
    }
    return { ...base, text: input.text }
  }
  if (input.kind === 'link') {
    if (typeof input.url !== 'string' || input.url.length > INPUT_LIMITS.link) throw new Error('链接无效。')
    let url
    try { url = new URL(input.url) } catch { throw new Error('链接无效。') }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
      throw new Error('只接收不含账号密码的 HTTP(S) 链接。')
    }
    // Receiving a link never fetches its contents or turns it into book evidence.
    return { ...base, url: url.href }
  }
  if (input.kind === 'image') {
    if (!(input.blob instanceof Blob) || !IMAGE_TYPES.has(input.blob.type)
      || input.blob.size === 0 || input.blob.size > INPUT_LIMITS.imageBytes) {
      throw new Error('请选择不超过 20 MB 的 PNG、JPEG、WebP 或 BMP 图片。')
    }
    return { ...base, blob: input.blob, name: String(input.name || '阅读截图').slice(0, 200) }
  }
  throw new Error('暂不支持这种内容类型。')
}

// Generation tickets invalidate late clipboard/OCR callbacks after replacement or exit.
export function createInputRevision() {
  let revision = 0
  return {
    next: () => ++revision,
    current: () => revision,
    isCurrent: (ticket) => ticket === revision,
  }
}
