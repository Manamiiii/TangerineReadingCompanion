import { appExecutable } from './release-paths.mjs'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { _electron as electron } from '@playwright/test'
import { isolatedEnvironment, closeTestApp } from './environment.mjs'
import { exerciseDesktop, assertRecovered } from './flows.mjs'

const executable = path.resolve(process.argv[2] ?? appExecutable)
const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'reading-desktop-'))
const env = await isolatedEnvironment(root)
const report = 'artifacts/desktop/smoke-result.json'
await fs.mkdir('artifacts/desktop', { recursive: true })
await fs.rm(report, { force: true })
let app
const errors = []
async function launch() {
  app = await electron.launch({ executablePath: executable, args: ['--reading-background-test'], env, timeout: 30000 })
  const info = await app.evaluate(({ app }) => ({ packaged: app.isPackaged, data: app.getPath('userData') }))
  assert.equal(info.packaged, true)
  assert.equal(path.resolve(info.data).toLowerCase(), path.join(env.LOCALAPPDATA, 'Tangerine', 'Data', 'TangerineReadingCompanion', 'Config').toLowerCase())
  const page = await app.firstWindow()
  page.on('pageerror', error => errors.push(error.message))
  page.setDefaultTimeout(20000)
  return page
}
try {
  const result = await exerciseDesktop(await launch(), app, root)
  await closeTestApp(app); app = undefined
  await assertRecovered(await launch(), result.url)
  assert.deepEqual(errors, [], 'Renderer errors occurred')
  await fs.writeFile(report, JSON.stringify({ passed: true, date: new Date().toISOString(), artifact: path.basename(executable), sha256: createHash('sha256').update(await fs.readFile(executable)).digest('hex'), checks: [...result.checks, 'process restart preserves records but clears raw input and session key'], limitation: 'Packaged executable on development Windows with isolated profile; not a clean machine.' }, null, 2))
  console.log('Desktop acceptance passed: 7 groups; real packaged application and isolated data.')
} finally {
  if (app) await closeTestApp(app)
  console.log('Test application closed; isolated temporary profile retained for diagnosis.')
}
