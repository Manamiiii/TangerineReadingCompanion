import { appExecutable } from './release-paths.mjs'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { _electron as electron, expect } from '@playwright/test'
import { isolatedEnvironment, closeTestApp } from './environment.mjs'
import { createBook, assertRecovered, readRecords } from './flows.mjs'

const executable = path.resolve(appExecutable)
const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'reading-local-model-'))
const env = await isolatedEnvironment(root)
const report = 'artifacts/desktop/local-model-result.json'
await fs.rm(report, { force: true })
const requests = []
const key = 'reading-local-test-key'
const providerSecret = 'PRIVATE-PROVIDER-ERROR-FIXTURE'
const server = createServer(async (request, response) => {
  if (request.url !== '/no-cors') {
    response.setHeader('Access-Control-Allow-Origin', 'app://reading')
    response.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  }
  if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return }
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  requests.push({ method: request.method, authorization: request.headers.authorization, body: Buffer.concat(chunks).toString() })
  response.setHeader('Content-Type', 'application/json')
  if (request.url === '/unavailable') { response.writeHead(503); response.end(JSON.stringify({ error: providerSecret })); return }
  response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ candidates: [{ name: '阿橘', kind: 'person', confidence: 1 }] }) } }] }))
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`
let app
async function launch() {
  app = await electron.launch({ executablePath: executable, args: ['--reading-background-test'], env, timeout: 30000 })
  const info = await app.evaluate(({ app }) => ({ packaged: app.isPackaged, data: app.getPath('userData') }))
  assert.equal(info.packaged, true)
  assert.equal(path.resolve(info.data).toLowerCase(), path.join(env.LOCALAPPDATA, 'Tangerine', 'Data', 'TangerineReadingCompanion', 'Config').toLowerCase())
  const page = await app.firstWindow()
  page.setDefaultTimeout(15000)
  return page
}
async function configure(page, endpoint) {
  await page.getByRole('tab', { name: '设置', exact: true }).click()
  await page.getByLabel(/模型供应商/).selectOption('custom')
  await page.getByLabel('Chat Completions 兼容地址', { exact: true }).fill(endpoint)
  await page.getByLabel(/模型 ID/).fill('synthetic-local-model')
  await page.getByLabel('API Key', { exact: true }).fill(key)
  await page.getByRole('button', { name: '保存并切换到此模型', exact: true }).click()
  await page.getByRole('tab', { name: '阅读输入', exact: true }).click()
}
try {
  let page = await launch()
  const url = await createBook(page)
  await configure(page, base + '/v1/chat/completions')
  const records = await readRecords(page)
  await page.getByRole('textbox', { name: /粘贴当前段落/ }).fill('阿橘正在读书。')
  await page.getByRole('button', { name: '用模型发现新名称', exact: true }).click()
  await expect(page.locator('.reader-model-candidate input').first()).toHaveValue('阿橘')
  assert.equal(requests.length, 1)
  assert.equal(requests[0].method, 'POST')
  assert.equal(requests[0].authorization, `Bearer ${key}`)
  assert.equal(JSON.parse(requests[0].body).model, 'synthetic-local-model')
  assert.ok(requests[0].body.includes('阿橘正在读书。'))
  assert.deepEqual(await readRecords(page), records, 'Unconfirmed model candidates must stay temporary')
  await configure(page, base + '/no-cors')
  await page.getByRole('button', { name: '用模型发现新名称', exact: true }).click()
  await expect(page.locator('.reader-model-message')).toContainText('模型请求失败')
  assert.equal(requests.length, 1, 'CORS preflight must still prevent an unauthorized POST')
  await configure(page, base + '/unavailable')
  await page.getByRole('button', { name: '用模型发现新名称', exact: true }).click()
  await expect(page.locator('.reader-model-message')).toContainText('503')
  assert.equal((await page.locator('body').innerText()).includes(providerSecret), false)
  await configure(page, base + '/v1/chat/completions')
  await page.getByRole('textbox', { name: /粘贴当前段落/ }).fill('阿橘继续读书。')
  await page.getByRole('button', { name: '用模型发现新名称', exact: true }).click()
  await expect(page.locator('.reader-model-candidate input').first()).toHaveValue('阿橘')
  assert.equal(requests.length, 3)
  assert.equal(JSON.stringify(await readRecords(page)).includes(key), false)
  assert.equal(await page.evaluate(secret => JSON.stringify(localStorage).includes(secret), key), false)
  await closeTestApp(app); app = undefined
  page = await launch()
  await assertRecovered(page, url)
  assert.equal(await page.evaluate(secret => JSON.stringify(sessionStorage).includes(secret), key), false)
  await page.getByRole('textbox', { name: /粘贴当前段落/ }).fill('阿橘再次读书。')
  await expect(page.getByRole('button', { name: '用模型发现新名称', exact: true })).toBeDisabled()
  await page.getByRole('tab', { name: '设置', exact: true }).click()
  await expect(page.getByLabel('Chat Completions 兼容地址', { exact: true })).toHaveValue(base + '/v1/chat/completions')
  await expect(page.getByLabel('API Key', { exact: true })).toHaveValue('')
  assert.equal(requests.length, 3)
  await fs.writeFile(report, JSON.stringify({ passed: true, date: new Date().toISOString(), sha256: createHash('sha256').update(await fs.readFile(executable)).digest('hex'), checks: ['real model UI completes loopback POST with temporary candidates', 'CORS preflight prevents unauthorized POST', 'HTTP error is sanitized and retry recovers', 'process restart preserves configuration but clears session key'], limitation: 'Synthetic loopback HTTP service using IPv4; no real model, IPv6 or provider compatibility claim.' }, null, 2))
  console.log('Local model acceptance passed: 4 groups; real packaged permission handlers and synthetic HTTP service.')
} finally {
  try { if (app) await closeTestApp(app) }
  finally {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
}
