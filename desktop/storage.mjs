import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

export class StorageError extends Error {
  constructor(code) { super(code); this.code = code }
}
const fail = code => { throw new StorageError(code) }
const exists = file => { try { fs.lstatSync(file); return true } catch (error) { if (error.code === 'ENOENT') return false; throw error } }

// Do not follow junctions, symlinks or ambiguous paths into another application's data.
export function checkPath(file) {
  if (!path.isAbsolute(file) || path.resolve(file) !== file) fail('unsafe-path')
  for (let current = file; ; current = path.dirname(current)) {
    if (exists(current) && fs.lstatSync(current).isSymbolicLink()) fail('linked-path')
    if (path.dirname(current) === current) break
  }
}

export function storagePaths({ local, roaming, override }) {
  if (!local || !roaming) fail('missing-system-directory')
  const root = override || path.join(local, 'Tangerine', 'Data', 'TangerineReadingCompanion')
  checkPath(root)
  const legacy = path.join(roaming, 'TangerineReadingCompanion')
  checkPath(legacy)
  if (root === legacy || root.startsWith(legacy + path.sep) || legacy.startsWith(root + path.sep)) fail('overlapping-paths')
  return { root, legacy, config: path.join(root, 'Config'), storage: path.join(root, 'Storage'), cache: path.join(root, 'Cache'), logs: path.join(root, 'Logs'), runtime: path.join(root, 'Runtime'),
    // Alternate old Electron names are conflict detectors, never silently selected.
    sources: override ? [] : [legacy, path.join(roaming, '橘子阅读伴侣'), path.join(roaming, 'tangerine-reading-companion')] }
}

const database = 'app_reading_0.indexeddb.leveldb'
const blobs = 'app_reading_0.indexeddb.blob'
function inventory(directory) {
  checkPath(directory)
  if (!exists(directory)) return null
  if (!fs.lstatSync(directory).isDirectory()) fail('invalid-directory')
  const result = {}
  const visit = (folder, prefix = '') => {
    for (const name of fs.readdirSync(folder).sort()) {
      const file = path.join(folder, name), relative = prefix + name
      const stat = fs.lstatSync(file)
      if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) fail('linked-path')
      if (stat.isDirectory()) visit(file, relative + '/')
      else result[relative] = createHash('sha256').update(fs.readFileSync(file)).digest('hex')
    }
  }
  visit(directory)
  return result
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
function sourceSnapshot(source) {
  const indexed = path.join(source, 'IndexedDB')
  checkPath(indexed)
  if (!exists(indexed)) return null
  const names = fs.readdirSync(indexed)
  if (!names.includes(database) || names.some(name => ![database, blobs].includes(name))) fail('unrecognized-legacy-data')
  const snapshot = inventory(indexed)
  if (!snapshot[database + '/CURRENT'] || !Object.keys(snapshot).some(name => name.startsWith(database + '/MANIFEST-'))) fail('invalid-legacy-data')
  return snapshot
}

// Immutable journal entries make interruption visible without replacing an existing file.
function writeNew(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2), { flag: 'wx' }) }
function readRecord(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { fail('invalid-journal') } }

export function prepareStorage(paths) {
  for (const file of [paths.root, paths.config, paths.storage, paths.runtime]) checkPath(file)
  const sources = paths.sources.map(source => ({ source, snapshot: sourceSnapshot(source) })).filter(item => item.snapshot)
  if (sources.length > 1 || (sources.length === 1 && sources[0].source !== paths.legacy)) fail('multiple-legacy-data')
  const planFile = path.join(paths.runtime, 'storage-plan.json')
  const readyFile = path.join(paths.runtime, 'storage-ready.json')
  const stage = path.join(paths.runtime, 'pending-storage')
  let plan
  if (exists(planFile)) {
    plan = readRecord(planFile)
    if (plan.version !== 1 || !['fresh', 'legacy'].includes(plan.kind)) fail('invalid-journal')
    if (plan.kind === 'legacy') {
      if (sources.length !== 1 || plan.source !== sources[0].source || !same(plan.snapshot, sources[0].snapshot)) fail('legacy-changed')
    } else if (sources.length) fail('new-legacy-conflict')
    if (exists(readyFile)) {
      if (!same(readRecord(readyFile), { version: 1, kind: plan.kind }) || !exists(paths.storage)) fail('missing-storage')
      return { migrated: false, needsValidation: plan.kind === 'legacy' }
    }
    // An interrupted copy is retained. Resume only a complete, byte-verified snapshot.
    if (exists(paths.storage)) {
      if (exists(stage) || !same(inventory(path.join(paths.storage, 'IndexedDB')), plan.snapshot ?? null)) fail('incomplete-migration')
    } else if (exists(stage)) {
      if (!same(inventory(path.join(stage, 'IndexedDB')), plan.snapshot ?? null)) fail('incomplete-migration')
      fs.renameSync(stage, paths.storage)
    } else fail('incomplete-migration')
  } else {
    if (exists(paths.storage) || exists(stage) || exists(readyFile)) fail('unmanaged-storage')
    for (const folder of [paths.config, paths.runtime]) fs.mkdirSync(folder, { recursive: true })
    plan = sources.length ? { version: 1, kind: 'legacy', ...sources[0] } : { version: 1, kind: 'fresh' }
    writeNew(planFile, plan)
    fs.mkdirSync(stage)
    if (plan.kind === 'legacy') {
      fs.cpSync(path.join(plan.source, 'IndexedDB'), path.join(stage, 'IndexedDB'), { recursive: true, errorOnExist: true, force: false })
      if (!same(inventory(path.join(stage, 'IndexedDB')), plan.snapshot) || !same(sourceSnapshot(plan.source), plan.snapshot)) fail('copy-verification-failed')
    }
    fs.renameSync(stage, paths.storage)
  }
  return { migrated: plan.kind === 'legacy', needsValidation: plan.kind === 'legacy' }
}

export function finishStorage(paths) {
  const readyFile = path.join(paths.runtime, 'storage-ready.json')
  if (!exists(readyFile)) {
    const plan = readRecord(path.join(paths.runtime, 'storage-plan.json'))
    writeNew(readyFile, { version: 1, kind: plan.kind })
  }
}

export const storageFailureMessage = '为保护书架，应用已停止启动，未覆盖旧数据。请先退出所有旧版和新版。若仍失败，请保留新旧数据目录及 Runtime 中的迁移记录，参考安装说明处理冲突或恢复；不要删除记录后反复重试。'
