import { existsSync } from 'node:fs'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import path from 'node:path'

const [major, minor] = process.versions.node.split('.').map(Number)
const checks = [{ name: 'Node.js ^20.19.0 || >=22.12.0', available: major > 22 || (major === 22 && minor >= 12) || (major === 20 && minor >= 19) }]
for (const name of ['electron', 'electron-builder']) {
  let version
  try { version = JSON.parse(await readFile(path.join('node_modules', name, 'package.json'), 'utf8')).version } catch { /* Missing local dependency. */ }
  checks.push({ name, available: Boolean(version), version })
}
checks.push({ name: 'Windows x64 build host', available: process.platform === 'win32' && process.arch === 'x64' })
checks.push({ name: 'Electron Windows runtime', available: existsSync('node_modules/electron/dist/electron.exe') })
const report = { checkedAt: new Date().toISOString(), platform: process.platform, arch: process.arch, checks, note: 'Read-only dependency check, not installation acceptance. Electron packages Chromium; Rust, MSVC and WebView2 are not prerequisites for this desktop wrapper.' }
await mkdir('artifacts/native', { recursive: true })
await writeFile('artifacts/native/environment.json', JSON.stringify(report, null, 2) + '\n')
for (const item of checks) console.log(`${item.available ? 'OK' : 'MISSING'} ${item.name}${item.version ? ' ' + item.version : ''}`)
console.log('Report: artifacts/native/environment.json')
if (checks.some(item => !item.available)) process.exitCode = 1
