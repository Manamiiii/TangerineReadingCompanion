import path from 'node:path'

export function assetPath(root, input, host) {
  let url
  try { url = new URL(input) } catch { return null }
  if (url.protocol !== 'app:' || url.hostname !== host || url.port || url.username || url.password) return null
  let pathname
  try { pathname = decodeURIComponent(url.pathname) } catch { return null }
  const segments = pathname.split('/').filter(Boolean)
  if (segments.some(segment => segment === '..' || segment === '.' || /[\\:<>"|?*]/.test(segment) || [...segment].some(char => char.codePointAt(0) < 32))) return null
  const target = path.resolve(root, ...(segments.length ? segments : ['index.html']))
  return target.startsWith(path.resolve(root) + path.sep) ? target : null
}

export function isAppUrl(input, host) {
  try { const url = new URL(input); return url.protocol === 'app:' && url.host === host && !url.username && !url.password } catch { return false }
}

export function externalUrl(input) {
  try {
    const url = new URL(input)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null
  } catch { return null }
}
