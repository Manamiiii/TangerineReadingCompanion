import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { assertReadingPackage } from '../../src/features/reading-companion/domain/readingCompanion.js'
import {
  packagePaths,
  previewCatalogPath,
  publicCatalogPath,
  readJson,
  readJsonIfExists,
  reportPath,
  writeJson,
} from './lib/package-pipeline.mjs'

const write = process.argv.includes('--write')
const catalogPreview = await readJson(previewCatalogPath)
if (catalogPreview?.catalog?.schemaVersion !== 1 || !Array.isArray(catalogPreview.previewMeta?.packageSlugs)) {
  throw new Error('阅读资料 catalog preview 格式无效')
}

const packageResults = []
for (const slug of catalogPreview.previewMeta.packageSlugs) {
  const { publicPackagePath, previewPackagePath } = packagePaths(slug)
  const [preview, current] = await Promise.all([
    readJson(previewPackagePath),
    readJsonIfExists(publicPackagePath),
  ])
  assertReadingPackage(preview.package)
  packageResults.push({
    slug,
    preview,
    current,
    changed: JSON.stringify(current) !== JSON.stringify(preview.package),
    publicPackagePath,
  })
}

const currentCatalog = await readJsonIfExists(publicCatalogPath)
const catalogChanged = JSON.stringify(currentCatalog) !== JSON.stringify(catalogPreview.catalog)
const report = [
  '# 阅读资料包发布预览',
  '',
  `- 资料包数量：${packageResults.length}`,
  `- 目录变化：${catalogChanged ? '有' : '无'}`,
  '',
  ...packageResults.flatMap(({ preview, current, changed }) => [
    `## ${preview.package.book.title} · ${preview.package.edition.isbn}`,
    '',
    `- 版本：${current?.packageVersion || '新建'} → ${preview.package.packageVersion}`,
    `- 正式资料变化：${changed ? '有' : '无'}`,
    `- 章节：${preview.package.chapters.length}`,
    `- 实体：${preview.package.entities.length}`,
    `- 事实：${preview.package.facts.length}`,
    `- 按需精确匹配实体：${preview.package.onDemandEntities?.length || 0}`,
    `- 已批准资料源：${preview.previewMeta.approvedSourceIds.length}`,
    `- 待审资料源：${preview.previewMeta.pendingSourceIds.length}`,
    `- 待审实体：${preview.previewMeta.candidateEntityIds.length}`,
    `- 待审事实：${preview.previewMeta.candidateFactIds.length}`,
    '',
    '### 待审资料源',
    '',
    ...(preview.previewMeta.pendingSourceIds.length
      ? preview.previewMeta.pendingSourceIds.map((id) => `- \`${id}\``)
      : ['- 无']),
    '',
    '### 待审实体与阻塞项',
    '',
    ...(preview.researchCandidates.entities
      .filter((candidate) => candidate.status === 'candidate')
      .map((candidate) => `- \`${candidate.entity.id}\`：${candidate.blockers.join('、')}`)),
    ...(preview.previewMeta.candidateEntityIds.length ? [] : ['- 无']),
    '',
    '### 待审事实与阻塞项',
    '',
    ...(preview.researchCandidates.facts
      .filter((candidate) => candidate.status === 'candidate')
      .map((candidate) => `- \`${candidate.fact.id}\`：${candidate.blockers.join('、')}`)),
    ...(preview.previewMeta.candidateFactIds.length ? [] : ['- 无']),
    '',
  ]),
].join('\n')

await mkdir(path.dirname(reportPath), { recursive: true })
await writeFile(reportPath, report, 'utf8')
console.log(report)

if (write) {
  if (process.env.READING_PACKAGE_OVERWRITE !== 'CONFIRM_READING_PACKAGE') {
    throw new Error('正式发布需要 READING_PACKAGE_OVERWRITE=CONFIRM_READING_PACKAGE')
  }
  for (const result of packageResults) {
    await writeJson(result.publicPackagePath, result.preview.package)
  }
  await writeJson(publicCatalogPath, catalogPreview.catalog)
  console.log(packageResults.some((result) => result.changed) || catalogChanged
    ? '✓ 已发布阅读资料包与目录'
    : '✓ 正式阅读资料无需变更')
} else {
  console.log('dry-run：未修改正式资料包')
}
