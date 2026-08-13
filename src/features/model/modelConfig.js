import {
  inferReadingModelProvider,
  normalizeReadingModelProvider,
  READING_MODEL_PROVIDER,
  READING_MODEL_PROVIDERS,
  readingModelApiKeyStorageKey,
  readingModelProfileStorageKey,
  readingModelProviderDefaults,
} from './modelProviders.js'

export const MODEL_STORAGE_KEYS = {
  provider: 'readerModelProvider',
  endpoint: 'readerModelEndpoint',
  model: 'readerModelName',
  apiKey: 'readerModelApiKey',
}

export const MODEL_CONFIG_SCOPE = Object.freeze({
  READING: 'reading',
})

export const MODEL_CONFIG_CHANGED_EVENT = 'tangerine:model-config-changed'

export function loadStoredModelConfig(
  providerId = '',
  allowLegacy = true,
) {
  const useReadingLegacy = allowLegacy
  const legacyEndpoint = useReadingLegacy
    ? window.localStorage.getItem(MODEL_STORAGE_KEYS.endpoint) || ''
    : ''
  const storedProviderId = window.localStorage.getItem(
    MODEL_STORAGE_KEYS.provider,
  ) || ''
  const selectedProviderId = providerId
    ? normalizeReadingModelProvider(providerId)
    : storedProviderId
      ? normalizeReadingModelProvider(storedProviderId)
      : legacyEndpoint
        ? inferReadingModelProvider(legacyEndpoint)
        : READING_MODEL_PROVIDER.ZHIPU
  const defaults = readingModelProviderDefaults(selectedProviderId)
  const legacyMatchesProvider = inferReadingModelProvider(legacyEndpoint) === selectedProviderId
  return {
    ...defaults,
    endpoint: window.localStorage.getItem(
      readingModelProfileStorageKey(selectedProviderId, 'endpoint'),
    ) || (useReadingLegacy && legacyMatchesProvider ? legacyEndpoint : '') || defaults.endpoint,
    model: window.localStorage.getItem(
      readingModelProfileStorageKey(selectedProviderId, 'model'),
    ) || (useReadingLegacy && legacyMatchesProvider
      ? window.localStorage.getItem(MODEL_STORAGE_KEYS.model) || ''
      : '') || defaults.model,
    apiKey: window.sessionStorage.getItem(
      readingModelApiKeyStorageKey(selectedProviderId),
    ) || (useReadingLegacy && legacyMatchesProvider
      ? window.sessionStorage.getItem(MODEL_STORAGE_KEYS.apiKey) || ''
      : ''),
  }
}

export function saveStoredModelConfig(
  nextConfig,
) {
  const providerId = normalizeReadingModelProvider(nextConfig.providerId)
  const provider = READING_MODEL_PROVIDERS[providerId]
  const normalized = {
    providerId,
    endpoint: nextConfig.endpoint.trim(),
    model: nextConfig.model.trim(),
    apiKey: nextConfig.apiKey.trim(),
    temperature: provider.temperature,
  }
  window.localStorage.setItem(MODEL_STORAGE_KEYS.provider, providerId)
  window.localStorage.setItem(
    readingModelProfileStorageKey(providerId, 'endpoint'),
    normalized.endpoint,
  )
  window.localStorage.setItem(
    readingModelProfileStorageKey(providerId, 'model'),
    normalized.model,
  )
  if (normalized.endpoint) {
    window.localStorage.setItem(MODEL_STORAGE_KEYS.endpoint, normalized.endpoint)
  } else {
    window.localStorage.removeItem(MODEL_STORAGE_KEYS.endpoint)
  }
  if (normalized.model) {
    window.localStorage.setItem(MODEL_STORAGE_KEYS.model, normalized.model)
  } else {
    window.localStorage.removeItem(MODEL_STORAGE_KEYS.model)
  }
  if (normalized.apiKey) {
    window.sessionStorage.setItem(readingModelApiKeyStorageKey(providerId), normalized.apiKey)
    window.sessionStorage.setItem(MODEL_STORAGE_KEYS.apiKey, normalized.apiKey)
  } else {
    window.sessionStorage.removeItem(readingModelApiKeyStorageKey(providerId))
    window.sessionStorage.removeItem(MODEL_STORAGE_KEYS.apiKey)
  }
  window.dispatchEvent(new CustomEvent(MODEL_CONFIG_CHANGED_EVENT, {
    detail: { scope: MODEL_CONFIG_SCOPE.READING, config: normalized },
  }))
  return normalized
}

export function modelConfigIsComplete(config = {}) {
  return Boolean(config.endpoint?.trim() && config.model?.trim() && config.apiKey?.trim())
}
