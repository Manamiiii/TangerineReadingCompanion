import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { storagePaths, prepareStorage, finishStorage } from '../../desktop/storage.mjs'

function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'reading-layout-unit-'))
  const paths = storagePaths({ local: path.join(base, 'local'), roaming: path.join(base, 'roaming') })
  const seed = (source = paths.legacy) => {
    const db = path.join(source, 'IndexedDB', 'app_reading_0.indexeddb.leveldb')
    fs.mkdirSync(db, { recursive: true })
    fs.writeFileSync(path.join(db, 'CURRENT'), 'MANIFEST-000001\n')
    fs.writeFileSync(path.join(db, 'MANIFEST-000001'), 'synthetic database fixture')
    return db
  }
  return { paths, seed }
}

test('fresh layout is stable; missing storage is refused instead of reset', () => {
  const { paths } = fixture()
  assert.equal(prepareStorage(paths).needsValidation, false)
  finishStorage(paths)
  assert.equal(prepareStorage(paths).needsValidation, false)
  fs.renameSync(paths.storage, paths.storage + '-preserved')
  assert.throws(() => prepareStorage(paths), /missing-storage/)
})

test('legacy migration copies only IndexedDB; source stays intact and later edits block', () => {
  const { paths, seed } = fixture(), db = seed()
  fs.mkdirSync(path.join(paths.legacy, 'Session Storage'))
  fs.writeFileSync(path.join(paths.legacy, 'Session Storage', 'secret'), 'ephemeral fixture')
  fs.mkdirSync(path.join(paths.legacy, 'Local Storage'))
  fs.writeFileSync(path.join(paths.legacy, 'Local Storage', 'settings'), 'unreviewed legacy config')
  assert.equal(prepareStorage(paths).needsValidation, true)
  assert.deepEqual(fs.readdirSync(paths.storage), ['IndexedDB'])
  assert.equal(fs.readFileSync(path.join(db, 'CURRENT'), 'utf8'), 'MANIFEST-000001\n')
  finishStorage(paths)
  fs.writeFileSync(path.join(db, 'MANIFEST-000001'), 'old version wrote again')
  assert.throws(() => prepareStorage(paths), /legacy-changed/)
})

test('multiple legacy stores, unknown origins and existing destinations are never chosen or overwritten', () => {
  const first = fixture(); first.seed(); first.seed(first.paths.sources[1])
  assert.throws(() => prepareStorage(first.paths), /multiple-legacy-data/)
  const second = fixture(); second.seed()
  fs.mkdirSync(path.join(second.paths.legacy, 'IndexedDB', 'unknown-origin'))
  assert.throws(() => prepareStorage(second.paths), /unrecognized-legacy-data/)
  const third = fixture(); third.seed(); fs.mkdirSync(third.paths.storage, { recursive: true })
  assert.throws(() => prepareStorage(third.paths), /unmanaged-storage/)
})

test('interrupted verified copy resumes; partial copy and damaged journal remain for recovery', () => {
  const first = fixture(); first.seed(); prepareStorage(first.paths)
  fs.renameSync(first.paths.storage, path.join(first.paths.runtime, 'pending-storage'))
  assert.equal(prepareStorage(first.paths).needsValidation, true)
  finishStorage(first.paths)
  const second = fixture(); second.seed(); prepareStorage(second.paths)
  fs.renameSync(second.paths.storage, path.join(second.paths.runtime, 'pending-storage'))
  fs.writeFileSync(path.join(second.paths.runtime, 'pending-storage', 'IndexedDB', 'app_reading_0.indexeddb.leveldb', 'CURRENT'), 'partial')
  assert.throws(() => prepareStorage(second.paths), /incomplete-migration/)
  fs.writeFileSync(path.join(second.paths.runtime, 'storage-plan.json'), '{')
  assert.throws(() => prepareStorage(second.paths), /invalid-journal/)
})

test('junctions, relative overrides and legacy overlap are refused; explicit root does not discover other libraries', () => {
  const { paths, seed } = fixture(); seed()
  const options = { local: path.dirname(paths.root), roaming: path.dirname(paths.legacy) }
  assert.throws(() => storagePaths({ ...options, override: './relative' }), /unsafe-path/)
  assert.throws(() => storagePaths({ ...options, override: paths.legacy }), /overlapping-paths/)
  fs.mkdirSync(paths.root, { recursive: true })
  fs.symlinkSync(paths.legacy, paths.storage, process.platform === 'win32' ? 'junction' : 'dir')
  assert.throws(() => prepareStorage(paths), /linked-path/)
  const explicit = storagePaths({ ...options, override: paths.root + '-explicit' })
  assert.equal(prepareStorage(explicit).needsValidation, false)
})
