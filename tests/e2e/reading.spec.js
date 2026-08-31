import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const pkg = JSON.parse(await readFile(new URL('../../public/presets/reading-companion/gone-with-the-wind-zh-9787570202188.json', import.meta.url)))
const bookHash = `/#book=${pkg.id}&tab=input`
const excerpt = page => page.getByRole('textbox', { name: /粘贴当前段落/ })

async function openBook(page) {
  await page.goto(bookHash)
  await expect(excerpt(page)).toBeVisible()
}

async function seedRecords(page, records) {
  await page.evaluate(async entries => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('tangerine-reading-companion')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise((resolve, reject) => {
      const transaction = db.transaction('meta', 'readwrite')
      entries.forEach(entry => transaction.objectStore('meta').put(entry))
      transaction.oncomplete = resolve
      transaction.onerror = () => reject(transaction.error)
    })
    db.close()
  }, records)
}

test('creates a personal book and restores saved progress without restoring raw input', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '添加书籍', exact: true }).click()
  await page.getByLabel('书名 *', { exact: true }).fill('E2E 阅读测试')
  await page.getByLabel('作者 *', { exact: true }).fill('测试作者')
  await page.getByLabel('章节数', { exact: true }).fill('4')
  await page.getByRole('checkbox', { name: /创建后用 AI/ }).uncheck()
  await page.getByRole('button', { name: '创建并开始阅读', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'E2E 阅读测试', exact: true })).toBeVisible()
  await page.getByLabel('我已经读到').selectOption('chapter-03')
  await expect(page.getByText(/已保存到本机/)).toBeVisible()
  await excerpt(page).fill('TEMP-RAW-INPUT-DO-NOT-PERSIST')
  await page.reload()
  await expect(page.getByLabel('我已经读到')).toHaveValue('chapter-03')
  await expect(excerpt(page)).toHaveValue('')
  await page.getByRole('button', { name: '返回书架', exact: true }).click()
  await expect(page.getByRole('button', { name: '继续上次阅读 E2E 阅读测试', exact: true })).toBeVisible()
})

test('records only confirmed names, searches visible memories and gates later chapters', async ({ page }) => {
  await openBook(page)
  await page.getByLabel('我已经读到').selectOption('chapter-03')
  await excerpt(page).fill('亚特兰大')
  await expect(page.getByText('本机已知名称匹配', { exact: true })).toBeVisible()
  await expect(page.getByRole('tab', { name: '已遇到 0', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '记在第 3 章', exact: true }).click()
  await page.getByRole('tab', { name: '已遇到 1', exact: true }).click()
  await page.getByLabel('检索已遇到记录').fill('不存在')
  await expect(page.getByRole('button', { name: '查看详情', exact: true })).toHaveCount(0)
  await page.getByLabel('检索已遇到记录').fill('亚特')
  await page.getByRole('button', { name: '查看详情', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('资料与背景')
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).last().click()
  await page.getByLabel('我已经读到').selectOption('chapter-01')
  await expect(page.getByRole('tabpanel')).not.toContainText('亚特兰大')
  await expect(page.getByRole('tab', { name: /背景资料/ })).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('tabpanel')).not.toContainText('亚特兰大')
})

test('hash navigation clears transient input and restores task selection', async ({ page }) => {
  await openBook(page)
  await excerpt(page).fill('临时段落')
  await page.getByRole('button', { name: '返回书架', exact: true }).click()
  await page.goBack()
  await expect(excerpt(page)).toHaveValue('')
  await page.getByRole('tab', { name: /已遇到/ }).click()
  await expect(page).toHaveURL(/tab=records/)
  await page.reload()
  await expect(page.getByRole('tab', { name: /已遇到/ })).toHaveAttribute('aria-selected', 'true')
})

test('legacy scene state migrates without deleting the original record', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '我的书架' })).toBeVisible()
  const legacyKey = `readerState:legacy-scene:${pkg.edition.id}`
  await seedRecords(page, [{ key: legacyKey, value: { editionId: pkg.edition.id, currentChapterId: 'chapter-04', updatedAt: '2026-08-31T00:00:00Z' } }])
  await openBook(page)
  await expect(page.getByLabel('我已经读到')).toHaveValue('chapter-04')
  const keys = await page.evaluate(() => new Promise(resolve => {
    const open = indexedDB.open('tangerine-reading-companion')
    open.onsuccess = () => {
      const db = open.result
      const request = db.transaction('meta').objectStore('meta').getAllKeys()
      request.onsuccess = () => { db.close(); resolve(request.result) }
    }
  }))
  expect(keys).toContain(legacyKey)
  expect(keys).toContain(`readerState:${pkg.edition.id}`)
})

test('backup preview requires a prior backup and merges old reading records without clearing local data', async ({ page }) => {
  await openBook(page)
  await page.getByLabel('我已经读到').selectOption('chapter-02')
  await expect(page.getByText(/已保存到本机/)).toBeVisible()
  const payload = { schemaVersion: 1, data: { scenes: [], catalogTables: [], catalogFields: [], catalogRows: [], meta: [
    { key: 'readerState:old:other-edition', value: { editionId: 'other-edition', currentChapterId: 'chapter-01' } },
    { key: 'game-data', value: 'ignored' },
  ] } }
  await page.getByLabel('选择阅读备份').setInputFiles({ name: 'legacy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)) })
  const dialog = page.getByRole('dialog', { name: '备份导入预览' })
  await expect(dialog).toContainText('新增 1 条 · 覆盖 0 条 · 保留本机其他 1 条')
  await expect(dialog.getByRole('button', { name: '确认合并导入' })).toBeDisabled()
  const download = page.waitForEvent('download')
  await dialog.getByRole('button', { name: '先下载本机备份' }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/tangerine-reading-companion/)
  await dialog.getByRole('checkbox').check()
  await dialog.getByRole('button', { name: '确认合并导入' }).click()
  await expect(page.getByRole('dialog', { name: '导入结果' })).toContainText('新增 1 条，覆盖 0 条，保留 1 条')
  await page.getByRole('button', { name: '刷新并使用导入数据' }).click()
  await expect(page.getByLabel('我已经读到')).toHaveValue('chapter-02')
})

test('offline startup loads the entire reading core including previously unopened lazy panels', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('离线阅读已准备', { exact: true })).toBeVisible({ timeout: 30000 })
  await page.evaluate(() => navigator.serviceWorker.ready)
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: '我的书架' })).toBeVisible()
  await openBook(page)
  await page.getByRole('tab', { name: '设置', exact: true }).click()
  await expect(page.getByRole('tabpanel')).toContainText('模型')
  await page.getByRole('tab', { name: /地图/ }).click()
  await expect(page.getByRole('tabpanel')).toContainText('探索已读地点')
  await page.screenshot({ path: 'artifacts/e2e/offline-reading.png', fullPage: true })
})


test.describe('formal spoiler gates with synthetic test facts', () => {
  test.use({ serviceWorkers: 'block' })
  test('high-risk content is absent before two confirmations and authorization is not restored', async ({ page }) => {
    const fixture = structuredClone(pkg)
    fixture.facts = [{
      id: 'e2e-high-risk', kind: 'character', content: 'SYNTHETIC-HIDDEN-FACT', entityIds: [],
      revealAt: { chapterId: 'chapter-02' }, riskLevel: 'high', riskCategories: ['character_relationship'],
      sourceIds: ['source-weread-edition-metadata'],
    }]
    await page.route('**/gone-with-the-wind-zh-9787570202188.json', route => route.fulfill({ json: fixture }))
    await openBook(page)
    await expect(page.getByText('SYNTHETIC-HIDDEN-FACT', { exact: true })).toHaveCount(0)
    await page.getByLabel('我已经读到').selectOption('chapter-02')
    await page.getByRole('tab', { name: /背景资料/ }).click()
    await page.getByRole('button', { name: '请求查看', exact: true }).click()
    await expect(page.getByText('SYNTHETIC-HIDDEN-FACT', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: '仍然查看', exact: true }).click()
    await expect(page.getByText('SYNTHETIC-HIDDEN-FACT', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: '确认显示', exact: true }).click()
    await expect(page.getByText('SYNTHETIC-HIDDEN-FACT', { exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name: '请求查看', exact: true })).toBeVisible()
    await expect(page.getByText('SYNTHETIC-HIDDEN-FACT', { exact: true })).toHaveCount(0)
  })
})
