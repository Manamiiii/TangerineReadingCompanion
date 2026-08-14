const READING_TRIAL_DIAGNOSTICS_STORAGE_KEY = 'tangerine-reading-companion:trial-diagnostics:v1'
const MAX_DIAGNOSTIC_EVENTS = 30

const VALID_AREAS = new Set([
  'book',
  'feedback',
  'map',
  'model',
  'ocr',
])

const VALID_ACTIONS = new Set([
  'book-create',
  'book-metadata-scan',
  'feedback-export',
  'map-query-suggestion',
  'map-result-confirmation',
  'map-search',
  'model-excerpt-analysis',
  'model-personal-book-preparation',
  'model-question',
  'ocr-excerpt',
])

const VALID_OUTCOMES = new Set(['success', 'error'])
const VALID_PROVIDERS = new Set([
  'custom',
  'deepseek',
  'domestic',
  'international',
  'local',
  'minimax',
  'openai',
  'unknown',
  'zhipu',
])

const VALID_ERROR_CODES = new Set([
  'authentication',
  'configuration',
  'empty-result',
  'network',
  'rate-limit',
  'timeout',
  'unavailable',
  'unknown',
  'validation',
])

function safeStorage(storage) {
  return storage
    && typeof storage.getItem === 'function'
    && typeof storage.setItem === 'function'
    ? storage
    : null
}

function browserSessionStorage() {
  try {
    return globalThis.sessionStorage
  } catch {
    return null
  }
}

function browserNavigator() {
  try {
    return globalThis.navigator
  } catch {
    return null
  }
}

function normalizeDiagnosticEvent(event) {
  const area = VALID_AREAS.has(event?.area) ? event.area : ''
  const action = VALID_ACTIONS.has(event?.action) ? event.action : ''
  const outcome = VALID_OUTCOMES.has(event?.outcome) ? event.outcome : ''
  if (!area || !action || !outcome) return null
  const at = typeof event?.at === 'string' && !Number.isNaN(Date.parse(event.at))
    ? new Date(event.at).toISOString()
    : ''
  if (!at) return null
  return {
    at,
    area,
    action,
    outcome,
    providerId: VALID_PROVIDERS.has(event?.providerId) ? event.providerId : 'unknown',
    ...(outcome === 'error'
      ? {
          errorCode: VALID_ERROR_CODES.has(event?.errorCode)
            ? event.errorCode
            : 'unknown',
        }
      : {}),
  }
}

function readEvents(storage) {
  const target = safeStorage(storage)
  if (!target) return []
  try {
    const payload = JSON.parse(target.getItem(READING_TRIAL_DIAGNOSTICS_STORAGE_KEY) || '[]')
    if (!Array.isArray(payload)) return []
    return payload
      .map(normalizeDiagnosticEvent)
      .filter(Boolean)
      .slice(-MAX_DIAGNOSTIC_EVENTS)
  } catch {
    return []
  }
}

function writeEvents(storage, events) {
  const target = safeStorage(storage)
  if (!target) return
  try {
    target.setItem(
      READING_TRIAL_DIAGNOSTICS_STORAGE_KEY,
      JSON.stringify(events.slice(-MAX_DIAGNOSTIC_EVENTS)),
    )
  } catch {
    // Diagnostics must never interrupt the reading workflow.
  }
}

export function readingDiagnosticErrorCode(error) {
  const status = Number(error?.status)
  const text = `${error?.name || ''} ${error?.message || ''}`.toLocaleLowerCase()
  if (status === 401 || status === 403) {
    return 'authentication'
  }
  if (/请填写|未配置|缺少配置|需要填写/u.test(text)) return 'configuration'
  if (/unauthorized|forbidden|鉴权|api key|密钥/u.test(text)) return 'authentication'
  if (status === 429 || /rate.?limit|请求过于频繁|频率限制/u.test(text)) return 'rate-limit'
  if (/timeout|timed out|超时/u.test(text)) return 'timeout'
  if (/failed to fetch|network|网络|enotfound|econn/u.test(text)) return 'network'
  if (/没有.*结果|没有识别|empty/u.test(text)) return 'empty-result'
  if (/不支持|无法调用|不可用|unavailable/u.test(text)) return 'unavailable'
  if (/无效|不能超过|请先|必须|invalid/u.test(text)) return 'validation'
  return 'unknown'
}

export function recordReadingTrialDiagnostic({
  area,
  action,
  outcome,
  providerId,
  error,
  at = new Date().toISOString(),
  storage,
}) {
  const event = normalizeDiagnosticEvent({
    at,
    area,
    action,
    outcome,
    providerId,
    errorCode: outcome === 'error' ? readingDiagnosticErrorCode(error) : undefined,
  })
  if (!event) return null
  const targetStorage = storage === undefined ? browserSessionStorage() : storage
  writeEvents(targetStorage, [...readEvents(targetStorage), event])
  return event
}

function runtimeSummary(navigatorLike = browserNavigator()) {
  const userAgent = typeof navigatorLike?.userAgent === 'string'
    ? navigatorLike.userAgent
    : ''
  const browserMatch = userAgent.match(/Edg\/(\d+)/u)
    || userAgent.match(/Chrome\/(\d+)/u)
    || userAgent.match(/Firefox\/(\d+)/u)
    || userAgent.match(/Version\/(\d+).+Safari/u)
  const browser = /Edg\//u.test(userAgent)
    ? 'Edge'
    : /Chrome\//u.test(userAgent)
      ? 'Chrome'
      : /Firefox\//u.test(userAgent)
        ? 'Firefox'
        : /Safari\//u.test(userAgent)
          ? 'Safari'
          : 'Other'
  const os = /Windows NT/u.test(userAgent)
    ? 'Windows'
    : /Android/u.test(userAgent)
      ? 'Android'
      : /iPhone|iPad/u.test(userAgent)
        ? 'iOS'
        : /Mac OS X/u.test(userAgent)
          ? 'macOS'
          : /Linux/u.test(userAgent)
            ? 'Linux'
            : 'Other'
  return {
    browser,
    browserMajor: browserMatch?.[1] || '',
    os,
    language: typeof navigatorLike?.language === 'string'
      ? navigatorLike.language.slice(0, 20)
      : '',
    online: navigatorLike?.onLine !== false,
  }
}

function diagnosticsSummary(events) {
  const byAction = {}
  for (const event of events) {
    if (!byAction[event.action]) byAction[event.action] = { success: 0, error: 0 }
    byAction[event.action][event.outcome] += 1
  }
  return {
    eventCount: events.length,
    successCount: events.filter((event) => event.outcome === 'success').length,
    errorCount: events.filter((event) => event.outcome === 'error').length,
    byAction,
  }
}

export function sanitizeReadingTrialDiagnostics(value) {
  const events = (Array.isArray(value?.events) ? value.events : [])
    .map(normalizeDiagnosticEvent)
    .filter(Boolean)
    .slice(-MAX_DIAGNOSTIC_EVENTS)
  const runtime = value?.runtime || {}
  return {
    runtime: {
      browser: ['Edge', 'Chrome', 'Firefox', 'Safari', 'Other'].includes(runtime.browser)
        ? runtime.browser
        : 'Other',
      browserMajor: /^\d{1,4}$/u.test(runtime.browserMajor) ? runtime.browserMajor : '',
      os: ['Windows', 'Android', 'iOS', 'macOS', 'Linux', 'Other'].includes(runtime.os)
        ? runtime.os
        : 'Other',
      language: typeof runtime.language === 'string'
        ? runtime.language.replace(/[^a-zA-Z0-9-]/gu, '').slice(0, 20)
        : '',
      online: runtime.online !== false,
    },
    events,
    summary: diagnosticsSummary(events),
  }
}

export function readingTrialDiagnosticsSnapshot({
  storage,
  navigatorLike,
} = {}) {
  const targetStorage = storage === undefined ? browserSessionStorage() : storage
  const targetNavigator = navigatorLike === undefined ? browserNavigator() : navigatorLike
  return sanitizeReadingTrialDiagnostics({
    runtime: runtimeSummary(targetNavigator),
    events: readEvents(targetStorage),
  })
}
