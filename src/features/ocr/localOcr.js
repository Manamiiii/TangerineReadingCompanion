let workerPromise = null
let metadataWorkerPromise = null
let numericWorkerPromise = null
let progressListener = null

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

async function createOcrWorker(languages = ['chi_sim', 'eng']) {
  const { createWorker, OEM } = await import('tesseract.js')
  return createWorker(languages, OEM.LSTM, {
    langPath: localLanguagePath(),
    logger: (message) => {
      if (typeof progressListener === 'function') progressListener(message)
    },
  })
}

async function createStructuredOcrWorker() {
  const worker = await createOcrWorker(['chi_sim'])
  await worker.setParameters({ tessedit_pageseg_mode: '6' })
  return worker
}

async function createNumericOcrWorker() {
  const worker = await createOcrWorker(['eng'])
  await worker.setParameters({
    tessedit_pageseg_mode: '7',
    tessedit_char_whitelist: '0123456789',
  })
  return worker
}

export async function recognizeImageText(image, onProgress, options) {
  if (!image) throw new Error('请先选择一张截图')
  progressListener = onProgress
  if (!workerPromise) {
    workerPromise = createOcrWorker().catch((error) => {
      workerPromise = null
      throw error
    })
  }
  try {
    const worker = await workerPromise
    const result = await worker.recognize(image)
    return normalizeOcrText(result?.data?.text, options)
  } finally {
    progressListener = null
  }
}

export async function recognizeStructuredImageText(
  image,
  onProgress,
  { pageSegmentationMode = '6', characterWhitelist = '' } = {},
) {
  if (!image) throw new Error('请先选择一张截图')
  progressListener = onProgress
  if (!metadataWorkerPromise) {
    metadataWorkerPromise = createStructuredOcrWorker().catch((error) => {
      metadataWorkerPromise = null
      throw error
    })
  }
  try {
    const worker = await metadataWorkerPromise
    await worker.setParameters({
      tessedit_pageseg_mode: pageSegmentationMode,
      tessedit_char_whitelist: characterWhitelist,
    })
    const result = await worker.recognize(image)
    return normalizeOcrText(result?.data?.text, { preserveLines: true })
  } finally {
    progressListener = null
  }
}

export async function recognizeNumericImageText(
  image,
  onProgress,
  { pageSegmentationMode = '7' } = {},
) {
  if (!image) throw new Error('请先选择一张截图')
  progressListener = onProgress
  if (!numericWorkerPromise) {
    numericWorkerPromise = createNumericOcrWorker().catch((error) => {
      numericWorkerPromise = null
      throw error
    })
  }
  try {
    const worker = await numericWorkerPromise
    await worker.setParameters({
      tessedit_pageseg_mode: pageSegmentationMode,
      tessedit_char_whitelist: '0123456789',
    })
    const result = await worker.recognize(image)
    return normalizeOcrText(result?.data?.text, { preserveLines: true })
  } finally {
    progressListener = null
  }
}
