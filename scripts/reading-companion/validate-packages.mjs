import { assertReadingCatalog } from '../../src/features/reading-companion/domain/readingCatalog.js'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { assertReadingPackage, summarizeReadingPackage } from '../../src/features/reading-companion/domain/readingCompanion.js'

const repoRoot = path.resolve(import.meta.dirname, '../..')
const publicRoot = path.join(repoRoot, 'public')
const catalogPath = path.join(publicRoot, 'presets/reading-companion/catalog.json')
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'))

assertReadingCatalog(catalog)
for (const entry of catalog.packages) {
  const packagePath = path.join(publicRoot, entry.path)
  const pkg = assertReadingPackage(JSON.parse(await readFile(packagePath, 'utf8')))
  if (pkg.id !== entry.id) throw new Error(`目录 id 与资料包 id 不一致：${entry.id}`)
  const summary = summarizeReadingPackage(pkg)
  if (Object.keys(summary).some(key => summary[key] !== entry.preparedSummary[key])) throw new Error(`目录摘要与资料包不一致：${entry.id}`)
  console.log(`✓ ${pkg.book.title} · ${pkg.edition.isbn} · ${pkg.chapters.length} 章`)
}
