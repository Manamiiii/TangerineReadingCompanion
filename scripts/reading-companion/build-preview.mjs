import {
  buildReadingPreviews,
  packagePaths,
  previewCatalogPath,
  writeJson,
} from './lib/package-pipeline.mjs'

const { previews, catalog } = await buildReadingPreviews()
for (const preview of previews) {
  const { previewPackagePath } = packagePaths(preview.previewMeta.slug)
  await writeJson(previewPackagePath, preview)
  console.log(`✓ preview: ${preview.package.book.title} · ${preview.package.edition.isbn}`)
  console.log(`  章节 ${preview.package.chapters.length} · 实体 ${preview.package.entities.length} · 事实 ${preview.package.facts.length}`)
  console.log(`  待审资料源 ${preview.previewMeta.pendingSourceIds.length}`)
  console.log(`  待审实体 ${preview.previewMeta.candidateEntityIds.length} · 待审事实 ${preview.previewMeta.candidateFactIds.length}`)
  console.log(`  按需精确匹配实体 ${preview.previewMeta.onDemandEntityIds.length}`)
}
await writeJson(previewCatalogPath, {
  previewMeta: { packageSlugs: previews.map((preview) => preview.previewMeta.slug) },
  catalog,
})
console.log(`✓ catalog preview: ${catalog.packages.length} 本`)
