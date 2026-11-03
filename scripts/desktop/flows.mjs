import fs from 'node:fs/promises'
import path from 'node:path'
import { expect } from '@playwright/test'

export const entry = 'app://reading/index.html'
export const title = '桌面验收示例'
export const raw = 'TRANSIENT-READING-INPUT-NOT-FOR-STORAGE'
const excerpt = page => page.getByRole('textbox', { name: /粘贴当前段落/ })

export async function readRecords(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('tangerine-reading-companion')
    open.onerror = () => reject(new Error('Cannot open test database'))
    open.onsuccess = () => {
      const db = open.result
      const request = db.transaction('meta').objectStore('meta').getAll()
      request.onsuccess = () => { db.close(); resolve(request.result) }
      request.onerror = () => { db.close(); reject(new Error('Cannot read test database')) }
    }
  }))
}

export async function createBook(page) {
  await expect(page.getByRole('heading', { name: '我的书架' })).toBeVisible()
  await page.getByRole('button', { name: '添加书籍', exact: true }).click()
  await page.getByLabel('书名 *', { exact: true }).fill(title)
  await page.getByLabel('作者 *', { exact: true }).fill('合成测试作者')
  await page.getByLabel('章节数', { exact: true }).fill('4')
  await expect(page.getByRole('checkbox', { name: /创建后用 AI/ })).not.toBeChecked()
  await page.getByRole('button', { name: '创建并开始阅读', exact: true }).click()
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  await page.getByLabel('我已经读到').selectOption('chapter-03')
  await expect(page.getByText(/已保存到本机/)).toBeVisible()
  await excerpt(page).fill(raw)
  await page.evaluate(() => sessionStorage.setItem('desktop-test-session', 'temporary-key-placeholder'))
  return page.url()
}

export async function assertRecovered(page, url) {
  await page.goto(url)
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  await expect(page.getByLabel('我已经读到')).toHaveValue('chapter-03')
  await expect(excerpt(page)).toHaveValue('')
  expect(await page.evaluate(() => sessionStorage.getItem('desktop-test-session'))).toBeNull()
  expect(JSON.stringify(await readRecords(page))).not.toContain(raw)
}

export async function exerciseDesktop(page, app, root) {
  await expect(page.getByText('阅读界面与资料已随应用安装')).toBeVisible()
  expect(await page.evaluate(() => typeof window.require)).toBe('undefined')
  expect(await page.evaluate(() => location.protocol)).toBe('app:')
  // Fail external network requests, including workers, without altering OS network settings.
  await app.evaluate(({ session }) => session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => callback({ cancel: true })))
  const url = await createBook(page)
  console.log('Desktop: personal book created.')
  await page.reload()
  await expect(page.getByLabel('我已经读到')).toHaveValue('chapter-03')
  await expect(excerpt(page)).toHaveValue('')
  const backupPath = path.join(root, 'backup.json')
  await app.evaluate(({ session }, target) => {
    session.defaultSession.on('will-download', (_event, item) => item.setSavePath(target))
  }, backupPath)
  const legacy = { schemaVersion: 1, data: { scenes: [], catalogTables: [], catalogFields: [], catalogRows: [], meta: [{ key: 'readerState:old:acceptance-edition', value: { editionId: 'acceptance-edition', currentChapterId: 'chapter-01' } }] } }
  await page.getByLabel('选择阅读备份').setInputFiles({ name: 'legacy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacy)) })
  const preview = page.getByRole('dialog', { name: '备份导入预览' })
  await expect(preview.getByRole('button', { name: '确认合并导入' })).toBeDisabled()
  await preview.getByRole('button', { name: '先下载本机备份' }).click()
  await expect.poll(async () => fs.readFile(backupPath, 'utf8').then(text => JSON.parse(text).format, () => null)).toBe('tangerine-reading-companion-backup')
  expect(await fs.readFile(backupPath, 'utf8')).not.toContain(raw)
  await preview.getByRole('checkbox').check()
  await preview.getByRole('button', { name: '确认合并导入' }).click()
  await expect(page.getByRole('dialog', { name: '导入结果' })).toBeVisible()
  await page.getByRole('button', { name: '刷新并使用导入数据' }).click()
  await expect(page.getByLabel('我已经读到')).toHaveValue('chapter-03')
  const records = await readRecords(page)
  expect(records.some(record => record.key === 'readerState:acceptance-edition')).toBe(true)
  expect(records.some(record => record.key.startsWith('readerPersonalPackage:'))).toBe(true)
  console.log('Desktop: backup saved and legacy import merged.')
  // Previously unopened panels and formal data must load from the installed payload.
  const pkg = JSON.parse(await fs.readFile('public/presets/reading-companion/gone-with-the-wind-zh-9787570202188.json', 'utf8'))
  await page.goto(`${entry}#book=${pkg.id}&tab=input`)
  await expect(excerpt(page)).toBeVisible()
  await page.getByRole('tab', { name: '设置', exact: true }).click()
  await expect(page.getByRole('tabpanel')).toContainText('模型')
  await page.getByRole('tab', { name: /地图/ }).click()
  await expect(page.getByRole('tabpanel')).toContainText('探索已读地点')
  console.log('Desktop: offline formal data and lazy panels loaded.')
  await page.getByRole('tab', { name: '阅读输入', exact: true }).click()
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 900; canvas.height = 140
    const context = canvas.getContext('2d')
    context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = 'black'; context.font = '64px Arial'; context.fillText('READING TEST', 30, 90)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /从截图提取/ }).click()
  await (await chooser).setFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
  await page.getByRole('button', { name: '提取文字', exact: true }).click()
  await expect(excerpt(page)).toHaveValue(/READING.*TEST/i, { timeout: 90000 })
  console.log('Desktop: offline OCR recognized synthetic text.')
  await page.screenshot({ path: 'artifacts/desktop/reading-smoke.png' })
  await page.goto(url)
  await excerpt(page).fill(raw)
  return { url, backupPath, checks: ['sandbox and stable app origin', 'offline startup and personal book persistence', 'ephemeral input cleared on reload', 'JSON export and merge import preserve local books', 'bundled formal data and lazy settings/map panels', 'local OCR worker and WASM with external networking blocked'] }
}
