import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const launcher = 'scripts/launch-desktop.ps1'
const appName = 'TangerineReadingCompanion'
const title = 'Tangerine Reading Companion'
const url = 'http://localhost:5174/'
const quote = value => `'${value.replaceAll("'", "''")}'`

function runFixture(state, interactive = false) {
  const fixture = mkdtempSync(join(tmpdir(), 'tangerine launcher '))
  try {
    const script = join(fixture, launcher)
    mkdirSync(dirname(script), { recursive: true })
    writeFileSync(script, readFileSync(join(root, launcher)))
    mkdirSync(join(fixture, 'node_modules/vite/bin'), { recursive: true })
    writeFileSync(join(fixture, 'node_modules/vite/bin/vite.js'), '')
    // The window's dispatcher/worker is exercised by the shared WPF regression
    // suite. This fixture checks entry routing without opening a visible window.
    writeFileSync(join(dirname(script), 'startup_window.ps1'), `
function Show-TangerineStartup {
  param($AppName, $ServiceLauncher, $StartupParameters, $IconFile, $OnReady)
  if ($AppName -ne ${quote(appName)}) { throw 'WrongAppName' }
  if (-not $StartupParameters.NoOpenBrowser) { throw 'MissingNoBrowser' }
  Write-Host 'WINDOW'
  & $ServiceLauncher @StartupParameters -OnProgress { param($Stage); Write-Host "STAGE:$Stage" }
  & $OnReady
  return $true
}
`)
    const command = `
$ErrorActionPreference='Stop'
$global:starts=0
function Invoke-WebRequest {
  param($Uri, $TimeoutSec, [switch]$UseBasicParsing)
  if ($Uri -ne ${quote(url)}) { throw 'WrongOrigin' }
  if ('${state}' -eq 'warm' -or ('${state}' -eq 'cold' -and $global:starts -gt 0)) {
    return [pscustomobject]@{StatusCode=200;Content='<title>${title}</title>'}
  }
  throw 'NotReady'
}
function Get-NetTCPConnection {
  param($LocalPort, $State, $ErrorAction)
  if ('${state}' -eq 'foreign') { return [pscustomobject]@{State='Listen'} }
}
function Start-Process {
  param($FilePath, $ArgumentList, $WorkingDirectory, $WindowStyle, $RedirectStandardOutput, $RedirectStandardError, [switch]$PassThru)
  if ($FilePath -eq ${quote(url)}) {
    if (-not ${interactive ? '$true' : '$false'}) { throw 'UnexpectedBrowser' }
    Write-Host 'BROWSER'
    return
  }
  if ($WindowStyle -ne 'Hidden') { throw 'VisibleServer' }
  if (($ArgumentList -join ' ') -notmatch '--strictPort') { throw 'OriginMayChange' }
  $global:starts++
  Write-Host 'SERVER'
  $process=[pscustomobject]@{HasExited=('${state}' -eq 'failed')}
  $process | Add-Member ScriptMethod Refresh {}
  $process | Add-Member ScriptMethod Kill { throw 'MustNotKillService' }
  return $process
}
& ${quote(script)} ${interactive ? '' : '-NoOpenBrowser -OnProgress {param($Stage); Write-Host "STAGE:$Stage"}'}
`
    return spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { encoding: 'utf8', windowsHide: true, timeout: 20000 })
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
}

test('ready service is reused and the interactive entry opens after ready', { skip: process.platform !== 'win32' }, () => {
  const result = runFixture('warm', true)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /WINDOW/)
  assert.doesNotMatch(result.stdout, /SERVER/)
  assert.ok(result.stdout.indexOf('STAGE:ready') < result.stdout.indexOf('BROWSER'))
})

test('cold start reports waiting and starts only one hidden service', { skip: process.platform !== 'win32' }, () => {
  const result = runFixture('cold')
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.match(/SERVER/g)?.length, 1)
  assert.match(result.stdout, /STAGE:waiting-review/)
  assert.match(result.stdout, /STAGE:ready/)
})

test('occupied port does not start or open anything', { skip: process.platform !== 'win32' }, () => {
  const result = runFixture('foreign')
  assert.notEqual(result.status, 0)
  assert.doesNotMatch(result.stdout, /SERVER|BROWSER|STAGE:ready/)
  assert.match(result.stderr, /another service/)
})

test('server failure propagates to the status window', { skip: process.platform !== 'win32' }, () => {
  const result = runFixture('failed')
  assert.notEqual(result.status, 0)
  assert.match(result.stdout, /STAGE:waiting-review/)
  assert.doesNotMatch(result.stdout, /BROWSER|STAGE:ready/)
  assert.doesNotMatch(result.stderr, /MustNotKillService/)
})
