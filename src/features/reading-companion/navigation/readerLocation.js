export const LAST_READING_PACKAGE_STORAGE_KEY = 'tangerine-reading-companion:last-package-id'

const READER_TABS = new Set(['input', 'records', 'map', 'facts', 'settings'])

function validPackageId(value) {
  return typeof value === 'string' && value.trim() && value.length <= 200
    ? value.trim()
    : ''
}

export function parseReaderLocation(hash = '') {
  const params = new URLSearchParams(String(hash).replace(/^#/, ''))
  const packageId = validPackageId(params.get('book'))
  const requestedTab = params.get('tab')
  return {
    packageId,
    tab: packageId && READER_TABS.has(requestedTab) ? requestedTab : 'input',
  }
}

export function readerLocationHash({ packageId = '', tab = 'input' } = {}) {
  const normalizedPackageId = validPackageId(packageId)
  if (!normalizedPackageId) return ''
  const params = new URLSearchParams({
    book: normalizedPackageId,
    tab: READER_TABS.has(tab) ? tab : 'input',
  })
  return `#${params}`
}

export function writeReaderLocation(location, { replace = false, browserWindow = window } = {}) {
  const hash = readerLocationHash(location)
  const nextUrl = `${browserWindow.location.pathname}${browserWindow.location.search}${hash}`
  browserWindow.history[replace ? 'replaceState' : 'pushState'](null, '', nextUrl)
}

export function loadLastReadingPackageId(storage = localStorage) {
  try {
    return validPackageId(storage.getItem(LAST_READING_PACKAGE_STORAGE_KEY))
  } catch {
    return ''
  }
}

export function saveLastReadingPackageId(packageId, storage = localStorage) {
  try {
    const normalizedPackageId = validPackageId(packageId)
    if (normalizedPackageId) storage.setItem(LAST_READING_PACKAGE_STORAGE_KEY, normalizedPackageId)
    else storage.removeItem(LAST_READING_PACKAGE_STORAGE_KEY)
    return normalizedPackageId
  } catch {
    return ''
  }
}
