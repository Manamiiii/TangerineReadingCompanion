import { app, BrowserWindow, Menu, protocol, net, session, shell, dialog } from 'electron'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { assetPath, isAppUrl, externalUrl } from './security.mjs'

const directory = path.dirname(fileURLToPath(import.meta.url))
const config = JSON.parse(readFileSync(path.join(directory, 'config.json'), 'utf8'))
const root = path.join(directory, '../dist')
const entry = `app://${config.host}/index.html`
app.setName(config.productName)
app.setPath('userData', path.join(app.getPath('appData'), config.dataDirectory))
app.commandLine.appendSwitch('disable-http-cache')
if (process.platform === 'win32') app.setAppUserModelId(config.appId)
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }])
let window
const csp = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; media-src 'self' blob:; connect-src 'self' https: http://localhost:* http://127.0.0.1:* http://[::1]:*; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus() } })
  app.whenReady().then(async () => {
    protocol.handle('app', async request => {
      const target = assetPath(root, request.url, config.host)
      if (!target || !['GET', 'HEAD'].includes(request.method)) return new Response('Not found', { status: 404 })
      try {
        const response = await net.fetch(pathToFileURL(target).href, { method: request.method })
        const headers = new Headers(response.headers)
        headers.set('Content-Security-Policy', csp)
        headers.set('X-Content-Type-Options', 'nosniff')
        return new Response(response.body, { status: response.status, headers })
      } catch { return new Response('Not found', { status: 404 }) }
    })
    const trusted = contents => contents && contents === window?.webContents && isAppUrl(contents.getURL(), config.host)
    const permissionAllowed = (contents, permission) => trusted(contents) && ['clipboard-read', 'clipboard-sanitized-write', 'persistent-storage'].includes(permission)
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => callback(Boolean(permissionAllowed(contents, permission) && isAppUrl(details.requestingUrl, config.host))))
    session.defaultSession.setPermissionCheckHandler((contents, permission, origin) => Boolean(permissionAllowed(contents, permission) && isAppUrl(origin, config.host)))
    session.defaultSession.on('will-download', (event, item, contents) => {
      if (!trusted(contents) || !(isAppUrl(item.getURL(), config.host) || item.getURL().startsWith(`blob:app://${config.host}/`))) { event.preventDefault(); return }
      item.setSaveDialogOptions({ title: '保存导出文件', defaultPath: path.basename(item.getFilename()) })
    })
    const openExternal = async url => {
      const safe = externalUrl(url)
      if (safe) await shell.openExternal(safe).catch(() => dialog.showMessageBox(window, { type: 'error', message: '无法打开外部链接，请检查默认浏览器。' }))
    }
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: '文件', submenu: [
        { label: '备份与迁移说明', click: () => dialog.showMessageBox(window, { message: '安装版与网页版各自保存数据，不会自动同步。请通过应用内 JSON 导出／导入迁移。升级和卸载保留本机数据；仍建议定期备份。' }) },
        { type: 'separator' }, { role: 'quit', label: '退出' },
      ] },
      { label: '编辑', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
      { label: '查看', submenu: [{ role: 'resetZoom', label: '实际大小' }, { role: 'zoomIn', label: '放大' }, { role: 'zoomOut', label: '缩小' }, { role: 'togglefullscreen', label: '全屏' }] },
      { label: '帮助', submenu: [
        { label: '版本与下载', click: () => openExternal(config.releases) },
        { label: '关于', click: () => dialog.showMessageBox(window, { message: `${config.productName} ${app.getVersion()}`, detail: '本地优先 · GPL-3.0-only\n数据由本应用独立保存。更新需手动下载并退出后安装。' }) },
      ] },
    ]))
    async function createWindow() {
      window = new BrowserWindow({ width: 1280, height: 900, minWidth: 800, minHeight: 600, title: config.productName, show: false, autoHideMenuBar: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, spellcheck: false } })
      window.webContents.setWindowOpenHandler(({ url }) => { void openExternal(url); return { action: 'deny' } })
      window.webContents.on('will-navigate', (event, url) => { if (!isAppUrl(url, config.host)) { event.preventDefault(); void openExternal(url) } })
      window.webContents.on('will-attach-webview', event => event.preventDefault())
      window.on('closed', () => { window = undefined })
      await window.loadURL(entry)
      window.show()
    }
    await createWindow()
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) void createWindow() })
  }).catch(() => { dialog.showErrorBox('启动失败', '无法加载应用。请确认安装完整、用户数据目录可写，或重新安装。无需先删除个人数据。'); app.quit() })
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
}
