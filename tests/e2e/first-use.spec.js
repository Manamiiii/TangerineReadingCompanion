import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test('a new reader can create, record, revisit and back up without a model', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const external = []
  page.on('request', request => {
    if (!request.url().startsWith('http://127.0.0.1:4174/')) external.push(request.url())
  })
  await page.goto('/')
  await expect(page.getByText('第一次使用：不用 AI 也能开始')).toBeVisible()
  await page.getByRole('button', { name: '添加书籍', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: /创建后用 AI/ })).not.toBeChecked()
  await page.getByLabel('书名 *', { exact: true }).fill('山间来信（测试）')
  await page.getByLabel('作者 *', { exact: true }).fill('示例作者')
  await page.getByLabel('章节数', { exact: true }).fill('3')
  await page.getByRole('button', { name: '创建并开始阅读', exact: true }).click()
  await page.getByLabel('我已经读到').selectOption('chapter-02')
  await expect(page.getByText(/已保存到本机/)).toBeVisible()
  await page.getByLabel('粘贴当前段落').fill('本段临时文字，不进入备份。')
  await page.getByRole('tab', { name: /已遇到/ }).click()
  await page.getByLabel('名称', { exact: true }).fill('林舟')
  await page.getByRole('combobox', { name: '类型', exact: true }).selectOption('person')
  await page.getByRole('button', { name: '记在第 2 章', exact: true }).click()
  await page.getByRole('button', { name: '查看详情', exact: true }).click()
  await page.getByLabel('个人备注').fill('带着一封信来到小镇；这是合成测试笔记。')
  await page.getByRole('button', { name: '保存备注', exact: true }).click()
  await expect(page.getByRole('button', { name: '保存备注', exact: true })).toBeDisabled()
  await page.reload()
  await page.getByRole('button', { name: '查看详情', exact: true }).click()
  await expect(page.getByLabel('个人备注')).toHaveValue('带着一封信来到小镇；这是合成测试笔记。')
  await page.keyboard.press('Escape')
  await page.getByRole('tab', { name: '阅读输入', exact: true }).click()
  await expect(page.getByLabel('粘贴当前段落')).toHaveValue('')
  await page.getByText('数据管理', { exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出备份', exact: true }).click()
  const backup = JSON.parse(await readFile(await (await download).path(), 'utf8'))
  expect(backup.format).toBe('tangerine-reading-companion-backup')
  expect(backup.data.meta.some(row => row.value.observedEntities?.some(entity => entity.name === '林舟' && entity.note.includes('合成测试')))).toBe(true)
  expect(JSON.stringify(backup)).not.toContain('本段临时文字')
  expect(external).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('cancelling memory deletion preserves notes and location, confirming deletes only that memory', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '添加书籍', exact: true }).click()
  await page.getByLabel('书名 *', { exact: true }).fill('删除确认测试')
  await page.getByLabel('作者 *', { exact: true }).fill('测试作者')
  await page.getByRole('button', { name: '创建并开始阅读', exact: true }).click()
  await page.getByRole('tab', { name: /已遇到/ }).click()
  for (const name of ['旧书店', '保留记录']) {
    await page.getByLabel('名称', { exact: true }).fill(name)
    await page.getByRole('button', { name: '记在第 1 章', exact: true }).click()
    await expect(page.getByLabel('名称', { exact: true })).toHaveValue('')
  }
  const records = () => page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('tangerine-reading-companion')
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const db = open.result
      const request = db.transaction('meta').objectStore('meta').getAll()
      request.onsuccess = () => { db.close(); resolve(request.result) }
    }
  }))
  const before = await records()
  const state = before.find(record => record.key.startsWith('readerState:'))
  const target = state.value.observedEntities.find(entity => entity.name === '旧书店')
  target.placeKind = 'fictional'
  target.note = '不能误删的备注'
  target.mapLocation = { mode: 'approximate-area', latitude: 30, longitude: 40, radiusKm: 20, label: '合成参考区域', providerId: 'openstreetmap' }
  await page.evaluate(record => new Promise(resolve => {
    const open = indexedDB.open('tangerine-reading-companion')
    open.onsuccess = () => {
      const db = open.result
      const transaction = db.transaction('meta', 'readwrite')
      transaction.objectStore('meta').put(record)
      transaction.oncomplete = () => { db.close(); resolve() }
    }
  }), state)
  await page.reload()
  page.once('dialog', async dialog => {
    expect(dialog.message()).toContain('个人备注和地图位置')
    await dialog.dismiss()
  })
  await page.getByRole('button', { name: '删除旧书店的遇见记录', exact: true }).click()
  expect(await records()).toEqual(before)
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: '删除旧书店的遇见记录', exact: true }).click()
  await expect(page.getByRole('button', { name: '删除旧书店的遇见记录', exact: true })).toHaveCount(0)
  await page.reload()
  const after = await records()
  const remaining = after.find(record => record.key === state.key).value.observedEntities
  expect(remaining.map(entity => entity.name)).toEqual(['保留记录'])
  expect(after.filter(record => record.key !== state.key)).toEqual(before.filter(record => record.key !== state.key))
})

test('creating a book with a configured provider still requires opting into AI', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('tangerine-reading-companion:model:provider', 'custom')
    localStorage.setItem('tangerine-reading-companion:model:profile:custom:endpoint', 'https://model.example/chat/completions')
    localStorage.setItem('tangerine-reading-companion:model:profile:custom:model', 'synthetic')
    sessionStorage.setItem('tangerine-reading-companion:model:api-key:custom', 'synthetic-key')
  })
  let modelRequests = 0
  await page.route('https://model.example/**', route => { modelRequests++; return route.abort() })
  await page.goto('/')
  await page.getByRole('button', { name: '添加书籍', exact: true }).click()
  await expect(page.getByText(/识别文字还会发送到所选接口/)).toBeVisible()
  await expect(page.getByRole('checkbox', { name: /创建后用 AI/ })).not.toBeChecked()
  await page.getByLabel('书名 *', { exact: true }).fill('不自动外发')
  await page.getByLabel('作者 *', { exact: true }).fill('测试作者')
  await page.getByRole('button', { name: '创建并开始阅读', exact: true }).click()
  await expect(page.getByRole('heading', { name: '不自动外发', exact: true })).toBeVisible()
  expect(modelRequests).toBe(0)
})
