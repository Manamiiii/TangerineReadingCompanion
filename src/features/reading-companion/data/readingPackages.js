import { assertReadingPackage } from '../domain/readingCompanion.js'
import {
  listPersonalReadingPackageEntries,
  loadPersonalReadingPackage,
} from '../db/personalBooks.js'

const catalogUrl = `${import.meta.env.BASE_URL}presets/reading-companion/catalog.json`

async function fetchJson(url, label) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${label}加载失败（${response.status}）`)
  return response.json()
}

export async function loadReadingPackageCatalog() {
  const [catalog, personalEntries] = await Promise.all([
    fetchJson(catalogUrl, '阅读资料目录'),
    listPersonalReadingPackageEntries(),
  ])
  if (catalog?.schemaVersion !== 1 || !Array.isArray(catalog.packages)) {
    throw new Error('阅读资料目录格式无效')
  }
  for (const entry of catalog.packages) {
    if (!entry?.id || !entry?.title || !entry?.editionLabel) {
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
  return [...catalog.packages, ...personalEntries]
}

export async function loadReadingPackage(entry) {
  if (entry?.source === 'personal') return loadPersonalReadingPackage(entry.id)
  if (!entry?.path) throw new Error('阅读资料目录缺少资料包路径')
  const url = `${import.meta.env.BASE_URL}${entry.path}`
  return assertReadingPackage(await fetchJson(url, '阅读资料包'))
}
