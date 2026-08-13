import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { assertReadingPackage } from '../../src/features/reading-companion/domain/readingCompanion.js'

const repoRoot = path.resolve(import.meta.dirname, '../..')
const publicRoot = path.join(repoRoot, 'public')
const catalogPath = path.join(publicRoot, 'presets/reading-companion/catalog.json')
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'))

if (catalog?.schemaVersion !== 1 || !Array.isArray(catalog.packages) || catalog.packages.length === 0) {
  throw new Error('阅读资料目录格式无效或为空')
}

const ids = new Set()
for (const entry of catalog.packages) {
  if (!entry?.id || !entry?.title || !entry?.editionLabel || !entry?.path) {
    throw new Error('阅读资料目录项缺少 id、title、editionLabel 或 path')
  }
  if (!/^presets\/reading-companion\/[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(entry.path)) {
    throw new Error(`阅读资料目录路径无效：${entry.path}`)
  }
  if (ids.has(entry.id)) throw new Error(`阅读资料目录 id 重复：${entry.id}`)
  ids.add(entry.id)
  const packagePath = path.join(publicRoot, entry.path)
  const pkg = assertReadingPackage(JSON.parse(await readFile(packagePath, 'utf8')))
  if (pkg.id !== entry.id) throw new Error(`目录 id 与资料包 id 不一致：${entry.id}`)
  console.log(`✓ ${pkg.book.title} · ${pkg.edition.isbn} · ${pkg.chapters.length} 章`)
}
