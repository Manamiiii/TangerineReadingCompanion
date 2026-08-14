import {
  inferReadingModelProvider,
  legacyReadingModelApiKeyStorageKey,
  legacyReadingModelProfileStorageKey,
  normalizeReadingModelProvider,
  READING_MODEL_PROVIDER,
  READING_MODEL_PROVIDERS,
  readingModelApiKeyStorageKey,
  readingModelProfileStorageKey,
  readingModelProviderDefaults,
} from './modelProviders.js'

export const MODEL_STORAGE_KEYS = {
  provider: 'tangerine-reading-companion:model:provider',
  endpoint: 'tangerine-reading-companion:model:endpoint',
  model: 'tangerine-reading-companion:model:name',
  apiKey: 'tangerine-reading-companion:model:api-key',
}

const LEGACY_MODEL_STORAGE_KEYS = Object.freeze({
  provider: 'readerModelProvider',
  endpoint: 'readerModelEndpoint',
  model: 'readerModelName',
  apiKey: 'readerModelApiKey',
})

export const MODEL_CONFIG_SCOPE = Object.freeze({
  READING: 'reading',
})

export const MODEL_CONFIG_CHANGED_EVENT = 'tangerine-reading-companion:model-config-changed'

function readStoredValue(storage, key, legacyKey, allowLegacy) {
  const current = storage.getItem(key)
  if (current !== null) return current
  if (!allowLegacy) return ''
  const legacy = storage.getItem(legacyKey)
  if (legacy === null) return ''
  storage.setItem(key, legacy)
  return legacy
}

export function loadStoredModelConfig(
  providerId = '',
  allowLegacy = true,
  browserWindow = window,
) {
  const { localStorage, sessionStorage } = browserWindow
  const useReadingLegacy = allowLegacy
  const legacyEndpoint = useReadingLegacy
    ? readStoredValue(
        localStorage,
        MODEL_STORAGE_KEYS.endpoint,
        LEGACY_MODEL_STORAGE_KEYS.endpoint,
        true,
      )
    : ''
  const storedProviderId = readStoredValue(
    localStorage,
    MODEL_STORAGE_KEYS.provider,
    LEGACY_MODEL_STORAGE_KEYS.provider,
    useReadingLegacy,
  )
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
    endpoint: readStoredValue(
      localStorage,
      readingModelProfileStorageKey(selectedProviderId, 'endpoint'),
      legacyReadingModelProfileStorageKey(selectedProviderId, 'endpoint'),
      useReadingLegacy,
    ) || (useReadingLegacy && legacyMatchesProvider ? legacyEndpoint : '') || defaults.endpoint,
    model: readStoredValue(
      localStorage,
      readingModelProfileStorageKey(selectedProviderId, 'model'),
      legacyReadingModelProfileStorageKey(selectedProviderId, 'model'),
      useReadingLegacy,
    ) || (useReadingLegacy && legacyMatchesProvider
      ? readStoredValue(
          localStorage,
          MODEL_STORAGE_KEYS.model,
          LEGACY_MODEL_STORAGE_KEYS.model,
          true,
        )
      : '') || defaults.model,
    apiKey: readStoredValue(
      sessionStorage,
      readingModelApiKeyStorageKey(selectedProviderId),
      legacyReadingModelApiKeyStorageKey(selectedProviderId),
      useReadingLegacy,
    ) || (useReadingLegacy && legacyMatchesProvider
      ? readStoredValue(
          sessionStorage,
          MODEL_STORAGE_KEYS.apiKey,
          LEGACY_MODEL_STORAGE_KEYS.apiKey,
          true,
        )
      : ''),
  }
}

export function saveStoredModelConfig(
  nextConfig,
  browserWindow = window,
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
  browserWindow.localStorage.setItem(MODEL_STORAGE_KEYS.provider, providerId)
  browserWindow.localStorage.setItem(
    readingModelProfileStorageKey(providerId, 'endpoint'),
    normalized.endpoint,
  )
  browserWindow.localStorage.setItem(
    readingModelProfileStorageKey(providerId, 'model'),
    normalized.model,
  )
  if (normalized.endpoint) {
    browserWindow.localStorage.setItem(MODEL_STORAGE_KEYS.endpoint, normalized.endpoint)
  } else {
    browserWindow.localStorage.removeItem(MODEL_STORAGE_KEYS.endpoint)
  }
  if (normalized.model) {
    browserWindow.localStorage.setItem(MODEL_STORAGE_KEYS.model, normalized.model)
  } else {
    browserWindow.localStorage.removeItem(MODEL_STORAGE_KEYS.model)
  }
  if (normalized.apiKey) {
    browserWindow.sessionStorage.setItem(readingModelApiKeyStorageKey(providerId), normalized.apiKey)
    browserWindow.sessionStorage.setItem(MODEL_STORAGE_KEYS.apiKey, normalized.apiKey)
  } else {
    browserWindow.sessionStorage.removeItem(readingModelApiKeyStorageKey(providerId))
    browserWindow.sessionStorage.removeItem(MODEL_STORAGE_KEYS.apiKey)
  }
  browserWindow.dispatchEvent(new browserWindow.CustomEvent(MODEL_CONFIG_CHANGED_EVENT, {
    detail: { scope: MODEL_CONFIG_SCOPE.READING, config: normalized },
  }))
  return normalized
}

export function modelConfigIsComplete(config = {}) {
  return Boolean(config.endpoint?.trim() && config.model?.trim() && config.apiKey?.trim())
}
