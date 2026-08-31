const BACKUP_STATUS_KEY = 'tangerine-reading-companion:last-backup-request'

export async function inspectStorage(storage = globalThis.navigator?.storage) {
  if (!storage) return { supported: false, persisted: false }
  try {
    const [persisted, estimate] = await Promise.all([
      storage.persisted?.() ?? false,
      storage.estimate?.() ?? {},
    ])
    return { supported: typeof storage.persist === 'function', persisted, ...estimate }
  } catch { return { supported: false, persisted: false } }
}

export async function requestPersistentStorage() {
  try { await globalThis.navigator?.storage?.persist?.() } catch { /* Remains best effort. */ }
  return inspectStorage()
}

export function lastBackupRequest() {
  try { return localStorage.getItem(BACKUP_STATUS_KEY) || '' } catch { return '' }
}

export function recordBackupRequest() {
  const timestamp = new Date().toISOString()
  try { localStorage.setItem(BACKUP_STATUS_KEY, timestamp) } catch { /* Export still works. */ }
  return timestamp
}
