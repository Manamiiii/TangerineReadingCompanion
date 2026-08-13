const modelResultCache = new Map()
const MAX_MODEL_CACHE_ENTRIES = 30

function requiredText(value, message) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) throw new Error(message)
  return text
}

export function normalizeModelEndpoint(value) {
  const endpoint = requiredText(value, '请填写模型接口地址')
  let url
  try {
    url = new URL(endpoint)
  } catch {
    throw new Error('模型接口地址无效')
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new Error('模型接口必须使用 HTTPS；本机 localhost 可以使用 HTTP')
  }
  return url.href
}

function parseJsonObject(content) {
  const text = requiredText(content, '模型没有返回内容')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  try {
    return JSON.parse(text)
  } catch {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1))
    throw new Error('模型返回的不是有效 JSON')
  }
}

function cachedModelResult(key) {
  const result = modelResultCache.get(key)
  if (!result) return null
  modelResultCache.delete(key)
  modelResultCache.set(key, result)
  return structuredClone(result)
}

function storeModelResult(key, result) {
  modelResultCache.set(key, structuredClone(result))
  while (modelResultCache.size > MAX_MODEL_CACHE_ENTRIES) {
    modelResultCache.delete(modelResultCache.keys().next().value)
  }
  return result
}

export function modelCacheKey(kind, values) {
  return `${kind}:${JSON.stringify(values)}`
}

export function readCachedModelResult(key) {
  return cachedModelResult(key)
}

export function cacheModelResult(key, result) {
  return storeModelResult(key, result)
}

export async function requestModelJson({
  endpoint,
  url,
  model,
  modelName,
  apiKey,
  key,
  temperature = 0,
  messages,
  fetchImpl = globalThis.fetch,
}) {
  const requestUrl = normalizeModelEndpoint(endpoint || url)
  const requestModel = requiredText(model || modelName, '请填写模型名称')
  const requestKey = requiredText(apiKey || key, '请填写 API Key')
  if (typeof fetchImpl !== 'function') throw new Error('当前环境无法调用模型接口')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 45000)
  let response
  try {
    response = await fetchImpl(requestUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${requestKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: requestModel,
        temperature: Number.isFinite(temperature)
          ? Math.max(0, Math.min(2, temperature))
          : 0,
        messages,
      }),
      signal: controller.signal,
    })
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('模型请求超时')
    throw new Error(`模型请求失败：${error?.message || '网络不可用或接口不允许浏览器访问'}`)
  } finally {
    clearTimeout(timeout)
  }
  if (!response.ok) {
    let detail = ''
    try {
      const body = await response.json()
      detail = body?.error?.message || ''
    } catch {
      // The status is enough when a provider does not return JSON.
    }
    throw new Error(`模型接口返回 ${response.status}${detail ? `：${detail}` : ''}`)
  }
  const body = await response.json()
  return parseJsonObject(body?.choices?.[0]?.message?.content)
}
