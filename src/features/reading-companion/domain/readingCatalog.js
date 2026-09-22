export function assertReadingCatalog(catalog) {
  if (catalog?.schemaVersion !== 1 || !Array.isArray(catalog.packages)) {
    throw new Error('阅读资料目录格式无效')
  }
  const ids = new Set()
  for (const entry of catalog.packages) {
    if (ids.has(entry?.id)) throw new Error('阅读资料目录 id 重复')
    ids.add(entry?.id)
    if (!['id', 'title', 'editionLabel'].every(key => typeof entry?.[key] === 'string' && entry[key].trim())) {
      throw new Error('阅读资料目录项缺少必要信息')
    }
    if (!/^presets\/reading-companion\/[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(entry.path || '')) {
      throw new Error(`阅读资料目录路径无效：${entry.id}`)
    }
    const summary = entry.preparedSummary
    if (!summary
      || !['entityCount', 'place', 'person', 'concept', 'event', 'factCount', 'sourceCount']
        .every((key) => Number.isInteger(summary[key]) && summary[key] >= 0)) {
      throw new Error(`阅读资料目录缺少有效的准备摘要：${entry.id}`)
    }
  }
  return catalog
}
