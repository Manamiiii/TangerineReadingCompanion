function cleanOcrLine(value) {
  let line = value
  let previous = ''
  while (line !== previous) {
    previous = line
    line = line
      .replace(/([\p{Script=Han}，。！？；：、“”‘’（）《》【】])\s+(?=[\p{Script=Han}，。！？；：、“”‘’（）《》【】])/gu, '$1')
      .replace(/\s+([，。！？；：、”’）》】])/gu, '$1')
      .replace(/([“‘（《【])\s+/gu, '$1')
  }
  return line
    .replace(/([\p{Script=Han}])\s*[.·]\s*(?=[\p{Script=Han}])/gu, '$1·')
    .replace(/[ \t]{2,}/g, ' ')
}

export function normalizeOcrText(value, { preserveLines = false } = {}) {
  if (typeof value !== 'string') return ''
  const lines = value
    .normalize('NFKC')
    .replace(/\r/g, '\n')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
  const cleaned = lines
    .map(cleanOcrLine)
    .join(preserveLines ? '\n' : ' ')
  return (preserveLines
    ? cleaned
    : cleaned.replace(/([\p{Script=Han}，。！？；：、“”‘’（）《》【】])\s+(?=[\p{Script=Han}，。！？；：、“”‘’（）《》【】])/gu, '$1'))
    .trim()
}

function localLanguagePath() {
  return new URL('reader-ocr/', document.baseURI).href.replace(/\/$/, '')
}

// A worker belongs to one operation; termination releases the image and OCR heap.
export async function runOcrWorker(createWorker, image, { signal, parameters } = {}) {
  signal?.throwIfAborted()
  let worker
  let termination
  const terminate = () => worker && (termination ||= Promise.resolve(worker.terminate()))
  let rejectAbort
  const aborted = new Promise((_, reject) => { rejectAbort = reject })
  const cancel = () => rejectAbort(new DOMException('OCR 已取消', 'AbortError'))
  signal?.addEventListener('abort', cancel, { once: true })
  const operation = (async () => {
    worker = await createWorker()
    if (signal?.aborted) { await terminate(); signal.throwIfAborted() }
    if (parameters) await worker.setParameters(parameters)
    signal?.throwIfAborted()
    const result = await worker.recognize(image)
    signal?.throwIfAborted()
    return result
  })()
  try {
    return await Promise.race([operation, aborted])
  } finally {
    signal?.removeEventListener('abort', cancel)
    await terminate()
  }
}

async function recognize(image, onProgress, options = {}, languages = ['chi_sim', 'eng'], parameters) {
  if (!image) throw new Error('请先选择一张截图')
  const { signal } = options
  const result = await runOcrWorker(async () => {
    const { createWorker, OEM } = await import('tesseract.js')
    signal?.throwIfAborted()
    return createWorker(languages, OEM.LSTM, {
      langPath: localLanguagePath(),
      logger: message => { if (!signal?.aborted) onProgress?.(message) },
    })
  }, image, { signal, parameters })
  return normalizeOcrText(result?.data?.text, options)
}

export function recognizeImageText(image, onProgress, options) {
  return recognize(image, onProgress, options)
}

export function recognizeStructuredImageText(image, onProgress, { pageSegmentationMode = '6', characterWhitelist = '', signal } = {}) {
  return recognize(image, onProgress, { preserveLines: true, signal }, ['chi_sim'], {
    tessedit_pageseg_mode: pageSegmentationMode, tessedit_char_whitelist: characterWhitelist,
  })
}
