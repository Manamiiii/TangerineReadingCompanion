import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import os from 'node:os'
import { createRequire } from 'node:module'
import { listPackage, statFile, extractFile } from '@electron/asar'
import { inspectPrivacyFile } from '../check-repository-privacy.mjs'

const archive = 'artifacts/desktop/release/win-unpacked/resources/app.asar'
const require = createRequire(import.meta.url)
const coreRoot = path.dirname(require.resolve('tesseract.js-core'))
let count = 0
for (const entry of listPackage(archive)) {
  const name = entry.replaceAll('\\', '/').replace(/^\//, '')
  const native = path.normalize(name)
  if (statFile(archive, native).files) continue
  assert.match(name, /^(dist\/|desktop\/|package\.json$|LICENSE$|THIRD_PARTY_NOTICES\.md$)/, 'Unexpected packaged file')
  const bytes = extractFile(archive, native)
  if (name === 'package.json') {
    const pkg = JSON.parse(bytes)
    const source = JSON.parse(await fs.readFile('package.json', 'utf8'))
    assert.equal(pkg.version, source.version)
    assert.equal(pkg.main, source.main)
    assert.equal(pkg.license, source.license)
  } else assert.deepEqual(bytes, await fs.readFile(name), `Packaged file differs from current build: ${name}`)
  if (/^dist\/reader-ocr\/tesseract-core(?:-simd|-relaxedsimd)?-lstm\.wasm(?:\.js)?$/.test(name)) {
    // Emscripten has virtual /home paths and encoded WASM that resembles token patterns.
    // Only exact locked upstream runtime bytes are exempt from those generic heuristics.
    assert.deepEqual(bytes, await fs.readFile(path.join(coreRoot, path.basename(name))), 'OCR runtime differs from installed upstream')
    const text = bytes.toString('utf8').toLowerCase()
    for (const privateValue of [os.homedir(), process.cwd(), os.hostname(), os.userInfo().username]) {
      if (privateValue.length > 3) assert.ok(!text.includes(privateValue.toLowerCase()), `Machine information in ${name}`)
    }
  } else assert.deepEqual(inspectPrivacyFile(name, bytes), [], `Privacy findings in ${name}`)
  count++
}
assert.ok(count > 20, 'Expected complete application payload')
for (const file of ['desktop/main.mjs', 'dist/index.html', 'dist/reader-ocr/worker.min.js', 'dist/reader-ocr/eng.traineddata.gz', 'dist/licenses/THIRD_PARTY_LICENSES.txt']) assert.ok(extractFile(archive, path.normalize(file)).length)
for (const file of ['LICENSE.electron.txt', 'LICENSES.chromium.html']) {
  assert.deepEqual(await fs.readFile(path.join('artifacts/desktop/release/win-unpacked', file)), await fs.readFile(path.join('node_modules/electron/dist', file === 'LICENSE.electron.txt' ? 'LICENSE' : file)), `Missing or modified Electron runtime notices: ${file}`)
}
console.log(`Package audit passed: ${count} allowlisted files, matching build, no detected private content.`)
