import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import assert from 'node:assert/strict'
import electronPath from 'electron'

// Verify where Electron resolves the redirected profile before any application code runs.
export async function isolatedEnvironment(root) {
  assert.equal(process.platform, 'win32')
  const env = { ...process.env }
  for (const key of Object.keys(env)) if (/^(PATH|NODE_OPTIONS|ELECTRON_RUN_AS_NODE|APPDATA|LOCALAPPDATA|USERPROFILE|HOMEDRIVE|HOMEPATH|TEMP|TMP|TANGERINE_READING_DATA_DIR|ELECTRON_LOG_FILE)$/i.test(key)) delete env[key]
  const home = path.join(root, 'home')
  const roaming = path.join(home, 'AppData', 'Roaming')
  const local = path.join(home, 'AppData', 'Local')
  for (const dir of [home, roaming, local, path.join(root, 'temp')]) await fs.mkdir(dir, { recursive: true })
  Object.assign(env, { APPDATA: roaming, LOCALAPPDATA: local, USERPROFILE: home, HOMEDRIVE: path.parse(home).root.slice(0, -1), HOMEPATH: home.slice(path.parse(home).root.length - 1), TEMP: path.join(root, 'temp'), TMP: path.join(root, 'temp'), PATH: '', READING_PROBE_RESULT: path.join(root, 'probe.json') })
  const probe = path.join(root, 'probe.cjs')
  await fs.writeFile(probe, "const {app}=require('electron');require('node:fs').writeFileSync(process.env.READING_PROBE_RESULT,JSON.stringify({home:require('node:os').homedir(),data:app.getPath('appData')}));app.exit(0)")
  await promisify(execFile)(electronPath, [probe], { env, windowsHide: true, timeout: 15000 })
  const detected = JSON.parse(await fs.readFile(env.READING_PROBE_RESULT, 'utf8'))
  const normalize = value => path.resolve(value).toLowerCase()
  assert.equal(normalize(detected.home), normalize(home))
  assert.equal(normalize(detected.data), normalize(roaming))
  delete env.READING_PROBE_RESULT
  return env
}

export async function closeTestApp(app) {
  if (!app) return
  const child = app.process()
  let timer
  const closed = await Promise.race([
    app.close().then(() => true, () => false),
    new Promise(resolve => { timer = setTimeout(() => resolve(false), 5000) }),
  ])
  clearTimeout(timer)
  if (!closed && child.exitCode === null) {
    // Only this test's own child tree, never a name-based termination of user instances.
    await promisify(execFile)(path.join(process.env.SystemRoot, 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 10000 })
    throw new Error('Test application did not close normally; its own process tree was stopped.')
  }
}
