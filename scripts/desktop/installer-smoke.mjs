import { setupPath } from './release-paths.mjs'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { _electron as electron } from '@playwright/test'
import { isolatedEnvironment, closeTestApp } from './environment.mjs'
import { createBook, assertRecovered, readRecords } from './flows.mjs'

assert.ok(process.env.GITHUB_ACTIONS === 'true' && process.env.RUNNER_ENVIRONMENT === 'github-hosted',
  'Run this production-identity installation test only on a disposable GitHub-hosted Windows runner.')
const manifest = JSON.parse(await fs.readFile('package.json', 'utf8'))
const candidate = setupPath
const previous = path.resolve('artifacts/desktop/upgrade-fixture/TangerineReadingCompanion-0.0.9-win-x64-Setup.exe')
await fs.access(candidate); await fs.access(previous)
const guid = manifest.build.nsis.guid
assert.match(guid, /^[a-f0-9-]{36}$/)
const run = promisify(execFile)
const powershell = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
async function ps(script) {
  const encoded = Buffer.from("[Console]::OutputEncoding = [Text.UTF8Encoding]::new(); $ProgressPreference = 'SilentlyContinue'; " + script, 'utf16le').toString('base64')
  return (await run(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { windowsHide: true, timeout: 30000 })).stdout.trim()
}
const registryCheck = `@('HKCU','HKLM') | ForEach-Object { $hive = $_; @('Software\\${guid}', 'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${guid}', 'Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${guid}') | ForEach-Object { if (Test-Path -LiteralPath ($hive + ':\\' + $_)) { Write-Output 'present' } } }`
assert.equal(await ps(registryCheck), '', 'Existing installation detected; use a disposable Windows account.')
assert.equal(await ps("Get-Process | Where-Object ProcessName -eq 'TangerineReadingCompanion' | ForEach-Object { 'running' }"), '', 'A real reader is running; do not terminate it for testing.')
const shortcuts = JSON.parse(await ps("ConvertTo-Json -Compress -InputObject @([IO.Path]::Combine([Environment]::GetFolderPath('Programs'), '橘子阅读伴侣.lnk'), [IO.Path]::Combine([Environment]::GetFolderPath('CommonPrograms'), '橘子阅读伴侣.lnk'))"))
for (const shortcut of shortcuts) assert.equal(await fs.stat(shortcut).then(() => true, () => false), false, 'Existing shortcut must be preserved.')
const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'reading-installer-'))
const programs = path.join(process.env.LOCALAPPDATA, 'Programs')
const legacy = path.join(programs, 'TangerineReadingCompanion')
const family = path.join(programs, 'Tangerine')
const fresh = path.join(family, 'TangerineReadingCompanion')
for (const dir of [legacy, family]) assert.equal(await fs.stat(dir).then(() => true, () => false), false, 'Runner installation directories must be unused')
await fs.mkdir(family, { recursive: true })
const sibling = path.join(family, 'sibling-sentinel.txt')
await fs.writeFile(sibling, 'preserve', { flag: 'wx' })
let installed = legacy
const env = await isolatedEnvironment(root)
const executable = () => path.join(installed, 'TangerineReadingCompanion.exe')
const uninstaller = () => path.join(installed, 'Uninstall TangerineReadingCompanion.exe')
const report = 'artifacts/desktop/installer-result.json'
await fs.rm(report, { force: true })
let app
let installedByTest = false
async function setup(file) {
  assert.ok([legacy, fresh].includes(installed))
  await run(file, ['/S', '/currentuser'], { windowsHide: true, timeout: 120000 })
  installedByTest = true
  await fs.access(executable())
  const registered = await ps(`(Get-ItemPropertyValue 'HKCU:\\Software\\${guid}' InstallLocation)`)
  assert.equal(path.normalize(registered).toLowerCase(), installed.toLowerCase())
  const link = shortcuts[0].replaceAll("'", "''")
  const shortcut = JSON.parse(await ps(`$link = (New-Object -ComObject WScript.Shell).CreateShortcut('${link}'); @{ target = $link.TargetPath; icon = $link.IconLocation } | ConvertTo-Json -Compress`))
  const identity = async file => (await fs.stat(file, { bigint: true })).ino
  assert.equal(await identity(shortcut.target), await identity(executable()))
  const icon = /^(.*),\s*0$/.exec(shortcut.icon)
  assert.ok(icon, 'Shortcut must select the first application icon')
  if (icon[1]) assert.equal(await identity(icon[1]), await identity(executable()))
}
async function remove() {
  assert.ok([legacy, fresh].includes(installed))
  await run(uninstaller(), ['/S', '/currentuser', `_?=${installed}`], { windowsHide: true, timeout: 120000 })
  installedByTest = false
  assert.equal(await ps(registryCheck), '', 'Installation registry keys remain.')
  assert.equal(await fs.stat(executable()).then(() => true, () => false), false)
}
async function open() {
  app = await electron.launch({ executablePath: executable(), args: [], env, timeout: 30000 })
  const actual = await app.evaluate(({ app }) => ({ version: app.getVersion(), data: app.getPath('userData'), packaged: app.isPackaged }))
  assert.equal(actual.packaged, true)
  assert.equal(path.resolve(actual.data).toLowerCase(), path.join(env.APPDATA, 'TangerineReadingCompanion').toLowerCase())
  const page = await app.firstWindow()
  return { page, version: actual.version }
}
async function close() { if (app) { await closeTestApp(app); app = undefined } }
try {
  await assert.rejects(run(candidate, ['/S', '/currentuser', `/D=${family}`]), error => error.code === 3)
  assert.equal(await ps(registryCheck), '')
  await setup(previous)
  assert.ok((await ps(registryCheck)).includes('present'))
  const testShortcut = path.join(env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', '橘子阅读伴侣.lnk')
  const allShortcuts = [...shortcuts, testShortcut]
  assert.ok((await Promise.all(allShortcuts.map(file => fs.stat(file).then(() => true, () => false)))).some(Boolean), 'Start menu shortcut was not created.')
  const initial = await open()
  assert.equal(initial.version, '0.0.9')
  const url = await createBook(initial.page)
  const records = await readRecords(initial.page)
  await assert.rejects(setup(candidate), error => error.code === 2)
  await assert.rejects(remove(), error => error.code === 2)
  assert.deepEqual(await readRecords(initial.page), records)
  await close()
  await setup(candidate)
  const upgraded = await open()
  assert.equal(upgraded.version, manifest.version)
  await assertRecovered(upgraded.page, url)
  assert.deepEqual(await readRecords(upgraded.page), records)
  await close()
  await remove()
  await fs.access(path.join(env.APPDATA, 'TangerineReadingCompanion', 'IndexedDB'))
  installed = fresh
  await setup(candidate)
  const reinstalled = await open()
  await assertRecovered(reinstalled.page, url)
  assert.deepEqual(await readRecords(reinstalled.page), records)
  await close()
  // A corrupt registration must never turn the shared family folder into an uninstall target.
  const locationKey = `HKCU:\\Software\\${guid}`
  const setLocation = value => ps(`Set-ItemProperty -LiteralPath '${locationKey}' -Name InstallLocation -Value '${value.replaceAll("'", "''")}'`)
  try {
    await setLocation(family)
    await assert.rejects(run(uninstaller(), ['/S', '/currentuser', `_?=${installed}`]), error => error.code === 3)
    assert.equal(await fs.readFile(sibling, 'utf8'), 'preserve')
    await fs.access(executable())
  } finally {
    await setLocation(fresh)
  }
  await remove()
  assert.equal(await fs.readFile(sibling, 'utf8'), 'preserve')
  for (const shortcut of allShortcuts) assert.equal(await fs.stat(shortcut).then(() => true, () => false), false)
  await fs.writeFile(report, JSON.stringify({ passed: true, date: new Date().toISOString(), candidate: path.basename(candidate), sha256: createHash('sha256').update(await fs.readFile(candidate)).digest('hex'), checks: ['production identity: legacy in-place upgrade and fresh family default, shortcut target and icon verified, sibling preserved', 'running app blocks upgrade and uninstall without termination', '0.0.9 fixture to current version preserves reading records', 'uninstall removes executable and registration, preserves IndexedDB', 'reinstall restores books and progress; raw input and session keys remain absent'], limitation: 'Silent install on disposable hosted Windows with isolated application profile. Older version fixture uses current application code. Interactive wizard, clean machine and real historical data migration not verified.' }, null, 2))
  console.log('Installer acceptance passed: 5 lifecycle groups, production application identity.')
} finally {
  await close()
  if (installedByTest) await remove()
  console.log('Test installation removed; isolated temporary data retained for diagnosis.')
}
