// Shared provider catalog. Reading-compatible export names stay stable for existing imports.
export const READING_MODEL_PROVIDER = Object.freeze({
  ZHIPU: 'zhipu',
  DEEPSEEK: 'deepseek',
  MINIMAX: 'minimax',
  OPENAI: 'openai',
  CUSTOM: 'custom',
})

export const READING_MODEL_PROVIDERS = Object.freeze({
  [READING_MODEL_PROVIDER.ZHIPU]: Object.freeze({
    id: READING_MODEL_PROVIDER.ZHIPU,
    label: '智谱 GLM',
    description: '国内直连 · GLM-4-Flash 提供免费 API',
    endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    defaultModel: 'glm-4-flash-250414',
    models: Object.freeze([
      Object.freeze({ id: 'glm-4-flash-250414', label: 'GLM-4-Flash-250414 · 免费' }),
    ]),
    temperature: 0,
    consoleUrl: 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys',
    docsUrl: 'https://docs.bigmodel.cn/cn/guide/models/free/glm-4-flash-250414',
  }),
  [READING_MODEL_PROVIDER.DEEPSEEK]: Object.freeze({
    id: READING_MODEL_PROVIDER.DEEPSEEK,
    label: 'DeepSeek',
    description: '国内直连 · 按 Token 计费，价格较低',
    endpoint: 'https://api.deepseek.com/chat/completions',
    defaultModel: 'deepseek-v4-flash',
    models: Object.freeze([
      Object.freeze({ id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' }),
      Object.freeze({ id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' }),
    ]),
    temperature: 0,
    consoleUrl: 'https://platform.deepseek.com/api_keys',
    docsUrl: 'https://api-docs.deepseek.com/quick_start/pricing-details-usd/',
  }),
  [READING_MODEL_PROVIDER.MINIMAX]: Object.freeze({
    id: READING_MODEL_PROVIDER.MINIMAX,
    label: 'MiniMax',
    description: '国内直连 · 当前文本 API 按量或套餐计费',
    endpoint: 'https://api.minimaxi.com/v1/chat/completions',
    defaultModel: 'MiniMax-M2.7',
    models: Object.freeze([
      Object.freeze({ id: 'MiniMax-M2.7', label: 'MiniMax M2.7' }),
      Object.freeze({ id: 'MiniMax-M2.7-highspeed', label: 'MiniMax M2.7 Highspeed' }),
    ]),
    temperature: 0.1,
    consoleUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
    docsUrl: 'https://platform.minimaxi.com/docs/api-reference/text-chat-openai',
  }),
  [READING_MODEL_PROVIDER.OPENAI]: Object.freeze({
    id: READING_MODEL_PROVIDER.OPENAI,
    label: 'OpenAI',
    description: '国际服务 · 需要可访问 OpenAI API 的网络',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    defaultModel: '',
    models: Object.freeze([]),
    temperature: 0,
    consoleUrl: 'https://platform.openai.com/api-keys',
    docsUrl: 'https://developers.openai.com/api/docs/models',
  }),
  [READING_MODEL_PROVIDER.CUSTOM]: Object.freeze({
    id: READING_MODEL_PROVIDER.CUSTOM,
    label: '自定义兼容接口',
    description: '适用于其他 OpenAI Chat Completions 兼容服务或本机模型',
    endpoint: '',
    defaultModel: '',
    models: Object.freeze([]),
    temperature: 0,
    consoleUrl: '',
    docsUrl: '',
  }),
})

export function normalizeReadingModelProvider(providerId) {
  return READING_MODEL_PROVIDERS[providerId]
    ? providerId
    : READING_MODEL_PROVIDER.CUSTOM
}

export function inferReadingModelProvider(endpoint) {
  const value = typeof endpoint === 'string' ? endpoint.toLowerCase() : ''
  if (value.includes('open.bigmodel.cn')) return READING_MODEL_PROVIDER.ZHIPU
  if (value.includes('deepseek.com')) return READING_MODEL_PROVIDER.DEEPSEEK
  if (value.includes('minimaxi.com') || value.includes('minimax.chat')) {
    return READING_MODEL_PROVIDER.MINIMAX
  }
  if (value.includes('api.openai.com')) return READING_MODEL_PROVIDER.OPENAI
  return READING_MODEL_PROVIDER.CUSTOM
}

export function readingModelProviderDefaults(providerId) {
  const normalized = normalizeReadingModelProvider(providerId)
  const provider = READING_MODEL_PROVIDERS[normalized]
  return {
    providerId: normalized,
    endpoint: provider.endpoint,
    model: provider.defaultModel,
    apiKey: '',
    temperature: provider.temperature,
  }
}

export function readingModelProfileStorageKey(providerId, field) {
  return `readerModelProfile:${normalizeReadingModelProvider(providerId)}:${field}`
}

export function readingModelApiKeyStorageKey(providerId) {
  return `readerModelApiKey:${normalizeReadingModelProvider(providerId)}`
}
