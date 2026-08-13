let deferredInstallPrompt = null
const listeners = new Set()

function notify() {
  listeners.forEach((listener) => listener(Boolean(deferredInstallPrompt)))
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredInstallPrompt = event
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null
    notify()
  })
}

export function subscribeInstallPrompt(listener) {
  listeners.add(listener)
  listener(Boolean(deferredInstallPrompt))
  return () => listeners.delete(listener)
}

export async function requestAppInstall() {
  if (!deferredInstallPrompt) return null
  const prompt = deferredInstallPrompt
  deferredInstallPrompt = null
  notify()
  await prompt.prompt()
  return prompt.userChoice
}
