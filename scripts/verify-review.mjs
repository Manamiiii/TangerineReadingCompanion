import { chromium, expect } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { loadSnapshot, loadReview, prepareReview } from './review-entry.mjs'
import { startReview } from './serve-review.mjs'
import { createBook, assertRecovered } from './desktop/flows.mjs'

const running = process.argv[2] === '--running'
const review = running ? await loadReview() : process.argv[2] === '--prepare' ? await prepareReview() : await loadSnapshot(process.argv[2] || '')
let server, browser
try {
  if (!running) server = await startReview({ review, port: 0, host: '127.0.0.1' })
  const address = running ? 'http://localhost:5174/' : `http://127.0.0.1:${server.httpServer.address().port}/`
  const identity = await (await fetch(address + '__reading_review')).json()
  if (identity.manifestHash !== review.manifestHash) throw new Error('Running identity differs')
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(address)
  await expect(page.locator('meta[name="reading-review"]')).toHaveAttribute('content', review.manifestHash)
  const url = await createBook(page)
  await page.reload()
  await expect(page.getByLabel('我已经读到')).toHaveValue('chapter-03')
  await expect(page.getByLabel('粘贴当前段落')).toHaveValue('')
  await page.evaluate(() => sessionStorage.clear()) // Only this isolated synthetic browser context.
  await assertRecovered(page, url)
  await page.getByRole('tab', { name: '设置', exact: true }).click()
  await expect(page.getByRole('tabpanel')).toContainText(review.manifest.revision.slice(0, 7))
  if (await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) throw new Error('Unexpected worker in isolated review')
  const evidence = { passed: true, manifestHash: review.manifestHash, revision: review.manifest.revision, sourceHash: review.manifest.sourceHash, checkedAt: new Date().toISOString(), scope: running ? 'running server, isolated browser; real tabs not inspected' : 'isolated server and browser', checks: ['served HTML identity', 'visible settings revision', 'synthetic book and progress persistence', 'temporary input cleared on reload', 'no service worker installed by this development entry'] }
  await fs.writeFile(path.join(review.directory, running ? 'running-verified.json' : 'verified.json'), JSON.stringify(evidence, null, 2) + '\n')
  console.log(JSON.stringify(evidence))
} finally {
  if (browser) await browser.close()
  if (server) await server.close()
}
