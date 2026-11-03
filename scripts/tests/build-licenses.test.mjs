import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { collectDependencyLicenses, licenseBundlePlugin } from '../build-licenses.mjs'

test('license bundle retains full licenses and NOTICE, excluding development-only packages', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'reading-licenses-'))
  t.after(() => {
    assert.equal(path.dirname(root), path.resolve(tmpdir()))
    assert.ok(path.basename(root).startsWith('reading-licenses-'))
    return rm(root, { recursive: true, force: true })
  })
  await mkdir(path.join(root, 'node_modules/example'), { recursive: true })
  await writeFile(path.join(root, 'package-lock.json'), JSON.stringify({ packages: {
    '': { name: 'app' },
    'node_modules/example': { version: '1.0.0', license: 'Apache-2.0' },
    'node_modules/dev-only': { version: '1.0.0', dev: true },
  } }))
  const directory = path.join(root, 'node_modules/example')
  await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: 'example', version: '1.0.0' }))
  await writeFile(path.join(directory, 'LICENSE'), 'License text\r\nSecond line\r\n')
  await writeFile(path.join(directory, 'NOTICE'), 'Required attribution\n')
  const bundled = await collectDependencyLicenses(root)
  assert.ok(bundled.includes('License text\nSecond line\n'))
  assert.ok(bundled.includes('Required attribution\n'))
  assert.ok(!bundled.includes('dev-only'))
  await rm(path.join(directory, 'LICENSE'))
  await assert.rejects(collectDependencyLicenses(root), /missing license text for example@1.0.0/)
  await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: 'example', version: '2.0.0' }))
  await assert.rejects(collectDependencyLicenses(root), /version mismatch/)
})

test('installed runtime dependencies include upstream attribution and the pinned fallback', async () => {
  const root = path.resolve(import.meta.dirname, '../..')
  const bundled = await collectDependencyLicenses(root)
  for (const file of ['node_modules/dexie/NOTICE', 'node_modules/lucide-react/LICENSE', 'licenses/tr46-0.0.3-MIT.txt']) {
    assert.ok(bundled.includes((await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n').trimEnd()), file)
  }
})

test('production license assets preserve GPL and OCR text and identify a CI source revision', async () => {
  const root = path.resolve(import.meta.dirname, '../..')
  const plugin = licenseBundlePlugin()
  const revision = 'a'.repeat(40)
  plugin.configResolved({ root, env: { VITE_APP_BUILD: revision } })
  const assets = new Map()
  await plugin.generateBundle.call({ emitFile: asset => assets.set(asset.fileName, String(asset.source)) })
  assert.equal(assets.get('licenses/GPL-3.0-only.txt'), await readFile(path.join(root, 'LICENSE'), 'utf8'))
  assert.ok(assets.get('licenses/README.txt').includes(`/tree/${revision}`))
  assert.ok(assets.get('licenses/THIRD_PARTY_LICENSES.txt').includes('tessdata_best'))
  assert.ok(assets.get('licenses/THIRD_PARTY_LICENSES.txt').includes('Apache License'))
})
