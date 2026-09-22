import { normalizeReadingInput } from '../../../platform/readingInput.js'
import { modelConfigIsComplete } from '../../model/modelConfig.js'
import { extractPersonalBookMetadataDetails, mergePersonalBookMetadata } from '../domain/personalBooks.js'

export async function scanBookMetadata({ file, recognize, recognizeStructured, analyze, modelConfig, onProgress, signal }) {
  normalizeReadingInput({ kind: 'image', source: 'file', blob: file, name: file.name })
  signal?.throwIfAborted()
  let text = await recognize(file, onProgress, { preserveLines: true, signal })
  signal?.throwIfAborted()
  if (!text) throw new Error('截图中没有识别出文字')
  let details = extractPersonalBookMetadataDetails(text)
  const warnings = []
  const quality = value => Object.keys(value.metadata).length * 2 - value.uncertainFields.length * 3
    + (value.metadata.title ? 2 : 0) + (value.metadata.translators?.length ? 2 : 0)
  if (!details.metadata.title || !details.metadata.translators?.length || details.uncertainFields.length) {
    try {
      const retryText = await recognizeStructured(file, onProgress, { signal })
      signal?.throwIfAborted()
      const retry = extractPersonalBookMetadataDetails(retryText)
      if (quality(retry) > quality(details)) { text = retryText; details = retry }
    } catch {
      signal?.throwIfAborted()
      warnings.push('增强识别失败，保留初次识别结果。')
    }
  }
  let modelMetadata = {}
  let modelUsed = false
  if (modelConfigIsComplete(modelConfig)) {
    try {
      modelMetadata = await analyze({ ...modelConfig, ocrText: text, localMetadata: details.metadata, uncertainFields: details.uncertainFields, signal })
      signal?.throwIfAborted()
      modelUsed = true
    } catch {
      signal?.throwIfAborted()
      warnings.push('模型整理失败，保留本机识别结果。')
    }
  }
  const metadata = mergePersonalBookMetadata(details.metadata, modelMetadata, details.uncertainFields)
  const correctedFields = Object.keys(metadata).filter(key => metadata[key]
    && JSON.stringify(metadata[key]) !== JSON.stringify(details.metadata[key] ?? null))
  return { text, metadata, correctedFields, warnings, modelUsed }
}

export function mergeScannedMetadata(current, metadata, before, after) {
  return { ...current, ...Object.fromEntries(Object.entries(metadata)
    .filter(([key, value]) => value && (after[key] || 0) === (before[key] || 0))
    .map(([key, value]) => [key, key === 'translators' ? value.join('、') : value])) }
}
