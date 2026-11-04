import { setupPath, appDirectory } from './release-paths.mjs'
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawn, execFileSync } from 'node:child_process'
import { once } from 'node:events'
import { Data, NtExecutable, NtExecutableResource, Resource } from 'resedit'

const { build } = JSON.parse(await fs.readFile('package.json', 'utf8'))
const setup = setupPath
const executable = build.win.executableName + '.exe'
const unpacked = appDirectory
const digest = data => createHash('sha256').update(Buffer.from(data)).digest('hex')
const frameHashes = frames => frames.map(frame => digest(frame.bin)).sort()
const ico = Data.IconFile.from(await fs.readFile(build.win.icon))
const expected = frameHashes(ico.icons.map(frame => frame.data))
assert.deepEqual(ico.icons.map(frame => frame.data.width).sort((a, b) => a - b), [16, 24, 32, 48, 64, 128, 256])
for (const file of [setup, path.join(unpacked, executable)]) {
  const resources = NtExecutableResource.from(NtExecutable.from(await fs.readFile(file))).entries
  const [group] = Resource.IconGroupEntry.fromEntries(resources)
  assert.ok(group, `Missing default Windows icon: ${path.basename(file)}`)
  assert.deepEqual(frameHashes(group.getIconItemsFromEntries(resources)), expected)
}

// Verify the Setup actually embeds the same app and code we audited in win-unpacked.
const sevenZip = path.resolve('node_modules/electron-winstaller/vendor/7z-x64.exe')
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'reading-payload-'))
const archive = path.join(temp, 'app-64.7z')
async function streamHash(stream) {
  const hash = createHash('sha256')
  for await (const chunk of stream) hash.update(chunk)
  return hash.digest('hex')
}
try {
  execFileSync(sevenZip, ['e', '-y', '-o' + temp, setup, '$PLUGINSDIR\\app-64.7z'], { windowsHide: true, stdio: 'ignore' })
  for (const name of [executable, 'resources/app.asar']) {
    const child = spawn(sevenZip, ['x', '-so', archive, name.replaceAll('/', '\\')], { windowsHide: true, stdio: ['ignore', 'pipe', 'inherit'] })
    const [[code], embedded, staged] = await Promise.all([once(child, 'close'), streamHash(child.stdout), streamHash(createReadStream(path.join(unpacked, name)))])
    assert.equal(code, 0)
    assert.equal(embedded, staged, `Setup payload differs: ${name}`)
  }
} finally {
  await fs.rm(archive, { force: true })
  await fs.rmdir(temp)
}
console.log('Setup and app default PE icons match all seven master ICO frames; embedded executable and ASAR verified.')
