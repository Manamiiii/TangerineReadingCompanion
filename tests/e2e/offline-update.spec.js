import { test, expect } from '@playwright/test'
import { startVersionServer } from './fixtures/version-server.js'

test('two tabs keep build-specific data until explicit refresh, including cache retirement', async ({ browser }) => {
  test.setTimeout(120000)
  const server = await startVersionServer()
  const context = await browser.newContext()
  try {
    const updater = await context.newPage()
    const reader = await context.newPage()
    await updater.goto(server.url)
    await expect(updater.getByText('离线阅读已准备', { exact: true })).toBeVisible()
    await reader.goto(`${server.url}#book=${server.mainId}&tab=input`)
    await expect(reader.getByRole('heading', { name: 'E2E current a', exact: true })).toBeVisible()
    await reader.getByLabel(/粘贴当前段落/).fill('KEEP-INPUT-UNTIL-EXPLICIT-REFRESH')

    server.select('b')
    await updater.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update())
    await updater.getByRole('button', { name: '更新并刷新（清空当前临时输入）', exact: true }).click()
    await expect(updater.locator('.reader-book-card').filter({ hasText: 'E2E current b' })).toBeVisible()
    await expect(reader.getByLabel(/粘贴当前段落/)).toHaveValue('KEEP-INPUT-UNTIL-EXPLICIT-REFRESH')
    await expect(reader.getByText('新版已启用，当前页面继续使用原版本')).toBeVisible()

    await context.setOffline(true)
    await reader.getByRole('button', { name: '返回书架', exact: true }).click()
    await reader.locator('.reader-book-card').filter({ hasText: 'E2E deferred a' }).click()
    await expect(reader.getByRole('heading', { name: 'E2E deferred a', exact: true })).toBeVisible()
    await reader.getByRole('tab', { name: '设置', exact: true }).click()
    await expect(reader.getByRole('tabpanel')).toContainText('模型')
    await context.setOffline(false)

    // A third build retires A; the old page must not receive C's fixed-path data.
    server.select('c')
    await updater.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update())
    await updater.getByRole('button', { name: '更新并刷新（清空当前临时输入）', exact: true }).click()
    await expect(updater.locator('.reader-book-card').filter({ hasText: 'E2E current c' })).toBeVisible()
    await expect(reader.getByText('当前页面的离线资源已失效，请联网后刷新')).toBeVisible()
    await reader.getByRole('tab', { name: '阅读输入', exact: true }).click()
    await reader.getByLabel(/粘贴当前段落/).fill('KEEP-INPUT-AFTER-LAZY-FAILURE')
    await reader.getByRole('tab', { name: /地图/ }).click()
    await expect(reader.getByRole('alert')).toContainText('此面板暂时无法加载')
    await reader.getByRole('tab', { name: '阅读输入', exact: true }).click()
    await expect(reader.getByLabel(/粘贴当前段落/)).toHaveValue('KEEP-INPUT-AFTER-LAZY-FAILURE')
    await reader.getByRole('button', { name: '返回书架', exact: true }).click()
    await reader.locator('.reader-book-card').filter({ hasText: 'E2E current a' }).click()
    await expect(reader.getByRole('alert')).toContainText('加载失败')
    await expect(reader.getByRole('heading', { name: 'E2E current c', exact: true })).toHaveCount(0)
    await reader.getByRole('button', { name: '刷新使用新版（清空当前临时输入）', exact: true }).click()
    await expect(reader.getByRole('heading', { name: 'E2E current c', exact: true })).toBeVisible()
    await expect(reader.getByLabel(/粘贴当前段落/)).toHaveValue('')
  } finally {
    await context.close()
    await server.close()
  }
})
