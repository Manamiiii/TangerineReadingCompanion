import { normalizeReadingInput } from './readingInput.js'
import { requestAppInstall, subscribeInstallPrompt } from '../pwaInstall.js'

function unsupported(message) { throw new Error(message) }

export function createWebPlatform(environment = globalThis) {
  return {
    id: 'web',
    capabilities: {
      clipboard: Boolean(environment.navigator?.clipboard?.readText),
      capture: false,
      shareInbox: false,
      fileExport: true,
    },
    clipboard: {
      async read() {
        if (!environment.navigator?.clipboard?.readText) {
          return unsupported('当前环境无法直接读取剪贴板，请在文本框中粘贴。')
        }
        try {
          const text = await environment.navigator.clipboard.readText()
          return normalizeReadingInput({ kind: 'text', source: 'clipboard', text })
        } catch {
          throw new Error('无法读取剪贴板，请在文本框中粘贴，或检查剪贴板权限。')
        }
      },
    },
    capture: { async region() { return unsupported('区域截图需要原生安装版；当前可选择截图文件。') } },
    // No Web Share Target: its POST/cache handoff would persist raw content.
    shareInbox: { subscribe() { return () => {} } },
    fileExport: {
      async save({ name, blob }) {
        const url = environment.URL.createObjectURL(blob)
        const anchor = environment.document.createElement('a')
        anchor.href = url
        anchor.download = name.replace(/[\\/:*?"<>|]/g, '-')
        environment.document.body.append(anchor)
        try { anchor.click() } finally {
          anchor.remove()
          environment.setTimeout(() => environment.URL.revokeObjectURL(url), 1000)
        }
        return { status: 'requested' } // Browser download completion cannot be verified.
      },
    },
    appLifecycle: {
      subscribe(listener) {
        const pagehide = () => listener('exit')
        const visibility = () => listener(environment.document.hidden ? 'background' : 'foreground')
        environment.addEventListener('pagehide', pagehide)
        environment.document.addEventListener('visibilitychange', visibility)
        return () => {
          environment.removeEventListener('pagehide', pagehide)
          environment.document.removeEventListener('visibilitychange', visibility)
        }
      },
      reload: () => environment.location.reload(),
    },
    install: { subscribe: subscribeInstallPrompt, request: requestAppInstall },
  }
}
