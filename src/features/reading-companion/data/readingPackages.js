import { assertReadingCatalog } from '../domain/readingCatalog.js'
import { assertReadingPackage } from '../domain/readingCompanion.js'
import readingDataUrls from 'virtual:reading-data-urls'
import {
  listPersonalReadingPackageEntries,
  loadPersonalReadingPackage,
} from '../db/personalBooks.js'

function dataUrl(path) {
  const versioned = import.meta.env.DEV ? path : readingDataUrls[path]
  if (!versioned) throw new Error('当前页面不包含此版本资料，请刷新后重试')
  return `${import.meta.env.BASE_URL}${versioned}`
}

const catalogUrl = dataUrl('presets/reading-companion/catalog.json')

async function fetchJson(url, label) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${label}加载失败（${response.status}），可刷新页面重试；刷新会清空临时输入`)
  return response.json()
}

export async function loadReadingPackageCatalog(personalEntries) {
  const warnings = [...(personalEntries?.warnings || [])]
  if (!personalEntries) {
    try { personalEntries = await listPersonalReadingPackageEntries(); warnings.push(...personalEntries.warnings) }
    catch { personalEntries = []; warnings.push('本机书架无法读取，请检查浏览器存储权限。') }
  }
  let catalog
  try {
    catalog = await fetchJson(catalogUrl, '阅读资料目录')
    assertReadingCatalog(catalog)
  } catch { catalog = { packages: [] }; warnings.push('内置阅读资料目录暂不可用，个人书籍仍可使用。') }
  const entries = [...catalog.packages, ...personalEntries]
  entries.warnings = warnings
  return entries
}

export async function loadReadingPackage(entry) {
  if (entry?.source === 'personal') return loadPersonalReadingPackage(entry.id)
  if (!entry?.path) throw new Error('阅读资料目录缺少资料包路径')
  const url = dataUrl(entry.path)
  return assertReadingPackage(await fetchJson(url, '阅读资料包'))
}
