import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'

const checks = []
function command(name, args = ['--version']) {
  const result = spawnSync(name, args, { encoding: 'utf8', windowsHide: true, timeout: 10000 })
  return result.status === 0
}
const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number)
checks.push({ name: 'Node.js ^20.19.0 || >=22.12.0', available: nodeMajor > 22 || (nodeMajor === 22 && nodeMinor >= 12) || (nodeMajor === 20 && nodeMinor >= 19) })
const cargoHome = process.env.CARGO_HOME || path.join(os.homedir(), '.cargo')
const rustc = existsSync(path.join(cargoHome, 'bin', 'rustc.exe')) ? path.join(cargoHome, 'bin', 'rustc.exe') : 'rustc'
const cargo = existsSync(path.join(cargoHome, 'bin', 'cargo.exe')) ? path.join(cargoHome, 'bin', 'cargo.exe') : 'cargo'
checks.push({ name: 'Rust compiler', available: command(rustc) })
checks.push({ name: 'Cargo', available: command(cargo) })

if (process.platform === 'win32') {
  const vswhere = path.join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'Microsoft Visual Studio/Installer/vswhere.exe')
  const vs = existsSync(vswhere) ? spawnSync(vswhere, ['-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'], { encoding: 'utf8', windowsHide: true }) : null
  checks.push({ name: 'MSVC x64 C++ build tools', available: Boolean(vs?.status === 0 && vs.stdout.trim()) })
  const registry = spawnSync('powershell.exe', ['-NoProfile', '-Command', "$roots = @('HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients', 'HKCU:\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients', 'HKLM:\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients'); foreach ($root in $roots) { if (Test-Path $root) { Get-ChildItem $root | ForEach-Object { Get-ItemProperty $_.PSPath } | Where-Object { $_.name -match 'WebView2' -and $_.pv } | ForEach-Object { 'WebView2 detected' } } }"], { encoding: 'utf8', windowsHide: true, timeout: 10000 })
  checks.push({ name: 'WebView2 runtime registry', available: registry.stdout?.includes('WebView2 detected') || false })
}
const sdkPath = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(process.env.LOCALAPPDATA || os.homedir(), 'Android', 'Sdk')
const report = {
  checkedAt: new Date().toISOString(), platform: process.platform, arch: process.arch,
  windowsPrerequisites: checks,
  laterPlatforms: { java: command('java', ['-version']), androidSdk: existsSync(sdkPath), xcode: process.platform === 'darwin' && command('xcodebuild', ['-version']), huaweiDevice: 'requires user-provided model and OS version' },
  note: 'Read-only detection, not a successful native build. No installation, signing or permissions were changed.',
}
await mkdir('artifacts/native', { recursive: true })
await writeFile('artifacts/native/environment.json', JSON.stringify(report, null, 2) + '\n')
for (const item of checks) console.log(`${item.available ? 'OK' : 'MISSING'} ${item.name}`)
console.log('Report: artifacts/native/environment.json')
if (checks.some(item => !item.available)) process.exitCode = 1
