import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import electronPath from 'electron'
import { _electron as electron, expect } from '@playwright/test'
import { appExecutable } from './release-paths.mjs'
import { isolatedEnvironment, closeTestApp } from './environment.mjs'
import { createBook, assertRecovered, readRecords } from './flows.mjs'

const run = promisify(execFile)
const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'reading-storage-'))
const env = await isolatedEnvironment(root)
const legacy = path.join(env.APPDATA, 'TangerineReadingCompanion')
const target = path.join(env.LOCALAPPDATA, 'Tangerine', 'Data', 'TangerineReadingCompanion')
const fixture = path.join(root, 'legacy.cjs')
// Synthetic pre-consolidation host: original singleton and profile layout, current
// frontend schema, hidden window. Not a claim of testing an old released binary.
await fs.writeFile(fixture, `const {app,BrowserWindow,protocol,net}=require('electron');
const path=require('node:path');const {pathToFileURL}=require('node:url');
app.setName('橘子阅读伴侣');app.setPath('userData',path.join(app.getPath('appData'),'TangerineReadingCompanion'));
protocol.registerSchemesAsPrivileged([{scheme:'app',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
if(!app.requestSingleInstanceLock())app.exit(0);else app.whenReady().then(async()=>{
 protocol.handle('app',request=>net.fetch(pathToFileURL(path.join(${JSON.stringify(path.resolve('dist'))},new URL(request.url).pathname)).href));
 const win=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
 await win.loadURL('app://reading/index.html');
});app.on('window-all-closed',()=>app.quit());`)
let app
let url, records
try {
  app = await electron.launch({ executablePath: electronPath, args: [fixture], env })
  let page = await app.firstWindow()
  url = await createBook(page)
  await page.getByRole('tab', { name: /已遇到/ }).click()
  await page.getByLabel('名称', { exact: true }).fill('测试旅人')
  await page.getByRole('button', { name: '记在第 3 章', exact: true }).click()
  await page.getByRole('button', { name: '查看详情', exact: true }).click()
  await page.getByLabel('个人备注').fill('迁移前的合成备注')
  await page.getByRole('button', { name: '保存备注', exact: true }).click()
  await expect(page.getByRole('button', { name: '保存备注', exact: true })).toBeDisabled()
  // Both safe and unsafe old browser storage are deliberately excluded.
  await page.evaluate(() => { localStorage.setItem('legacy-config-fixture', 'do-not-copy'); sessionStorage.setItem('model-key-fixture', 'do-not-copy') })
  records = await readRecords(page)
  await run(appExecutable, ['--reading-background-test'], { env, windowsHide: true, timeout: 15000 })
  assert.equal(await fs.stat(target).then(() => true, () => false), false, 'Old active singleton must block new migration')
  await closeTestApp(app); app = undefined
  const snapshot = async dir => {
    const result = {}
    for (const entry of await fs.readdir(dir, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue
      const file = path.join(entry.parentPath, entry.name)
      result[path.relative(dir, file)] = createHash('sha256').update(await fs.readFile(file)).digest('hex')
    }
    return result
  }
  const before = await snapshot(path.join(legacy, 'IndexedDB'))
  const launch = async () => {
    app = await electron.launch({ executablePath: appExecutable, args: ['--reading-background-test'], env })
    const actual = await app.evaluate(({ app, session, BrowserWindow }) => ({ user: app.getPath('userData'), session: app.getPath('sessionData'), storage: session.defaultSession.storagePath, logs: app.getPath('logs'), visible: BrowserWindow.getAllWindows().some(win => win.isVisible()) }))
    assert.equal(actual.user, path.join(target, 'Config'))
    assert.equal(actual.session, path.join(target, 'Storage'))
    assert.equal(actual.storage, path.join(target, 'Storage'))
    assert.equal(actual.logs, path.join(target, 'Logs'))
    assert.equal(actual.visible, false)
    await expect.poll(() => app.windows().some(page => page.url() === 'app://reading/index.html'), { timeout: 30000 }).toBe(true)
    return app.windows().find(page => page.url() === 'app://reading/index.html')
  }
  page = await launch()
  await assertRecovered(page, url)
  assert.deepEqual(await readRecords(page), records)
  assert.ok(JSON.stringify(records).includes('迁移前的合成备注'))
  assert.equal(await page.evaluate(() => localStorage.getItem('legacy-config-fixture')), null)
  assert.equal(await page.evaluate(() => sessionStorage.getItem('model-key-fixture')), null)
  await run(electronPath, [fixture], { env, windowsHide: true, timeout: 15000 })
  await run(appExecutable, ['--reading-background-test'], { env, windowsHide: true, timeout: 15000 })
  assert.deepEqual(await snapshot(path.join(legacy, 'IndexedDB')), before, 'Old source bytes must not change')
  await closeTestApp(app); app = undefined
  await assertRecovered(await launch(), url)
  assert.deepEqual(await readRecords(await app.firstWindow()), records)
  await closeTestApp(app); app = undefined
  // Reopening an old binary after migration can change its retained source. The
  // new binary must then refuse, not overwrite either branch or show an empty shelf.
  await fs.writeFile(path.join(legacy, 'IndexedDB', 'app_reading_0.indexeddb.leveldb', 'synthetic-old-write'), 'changed')
  await assert.rejects(run(appExecutable, ['--reading-background-test'], { env, windowsHide: true, timeout: 15000 }), error => error.code === 4)
  await fs.access(path.join(target, 'Storage', 'IndexedDB'))
  const brokenEnv = await isolatedEnvironment(path.join(root, 'broken-fixture'))
  const brokenSource = path.join(brokenEnv.APPDATA, 'TangerineReadingCompanion', 'IndexedDB', 'app_reading_0.indexeddb.leveldb')
  await fs.mkdir(brokenSource, { recursive: true })
  await fs.writeFile(path.join(brokenSource, 'CURRENT'), 'MANIFEST-000001\n')
  await fs.writeFile(path.join(brokenSource, 'MANIFEST-000001'), 'synthetic corrupt data')
  const brokenBefore = await snapshot(brokenSource)
  await assert.rejects(run(appExecutable, ['--reading-background-test'], { env: brokenEnv, windowsHide: true, timeout: 15000 }), error => error.code === 4)
  assert.deepEqual(await snapshot(brokenSource), brokenBefore)
  assert.equal(await fs.stat(path.join(brokenEnv.LOCALAPPDATA, 'Tangerine', 'Data', 'TangerineReadingCompanion', 'Runtime', 'storage-ready.json')).then(() => true, () => false), false)
  await fs.writeFile('artifacts/desktop/storage-result.json', JSON.stringify({ passed: true, date: new Date().toISOString(), executableSha256: createHash('sha256').update(await fs.readFile(appExecutable)).digest('hex'), checks: ['legacy/current mutual exclusion in both directions', 'copy of real synthetic IndexedDB preserves books and progress, original bytes unchanged', 'session storage and old localStorage excluded', 'userData, sessionData, session storagePath and logs match central layout', 'restart and duplicate startup', 'old subsequent writes cause safe refusal', 'corrupt database never becomes an empty ready shelf; original retained'], limitation: 'Synthetic legacy host with current schema, hidden packaged candidate; no real user migration or historical released binary execution.' }, null, 2))
  console.log('Storage acceptance passed: 7 migration and isolation groups, including corrupt database refusal.')
} finally {
  if (app) await closeTestApp(app)
}
