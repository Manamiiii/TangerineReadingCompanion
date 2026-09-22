import { db } from '../../../db/core.js'
import { nowIso } from '../../../utils.js'
import {
  personalCatalogEntry,
} from '../domain/personalBooks.js'
import { assertReadingPackage } from '../domain/readingCompanion.js'
import { normalizePersonalPackage } from '../domain/persistedPersonalPackage.js'

export const PERSONAL_READING_PACKAGE_KEY_PREFIX = 'readerPersonalPackage:'

function personalPackageKey(packageId) {
  return `${PERSONAL_READING_PACKAGE_KEY_PREFIX}${packageId}`
}

export async function savePersonalReadingPackage(pkg) {
  const validatedPackage = normalizePersonalPackage(pkg)
  if (!validatedPackage.personal) throw new Error('只能保存个人书籍资料包')
  const key = personalPackageKey(validatedPackage.id)
  const current = await db.meta.get(key)
  const timestamp = nowIso()
  await db.meta.put({
    key,
    value: {
      package: validatedPackage,
      createdAt: current?.value?.createdAt || timestamp,
      updatedAt: timestamp,
    },
  })
  return validatedPackage
}

export async function loadPersonalReadingPackage(packageId) {
  const record = await db.meta.get(personalPackageKey(packageId))
  if (!record?.value?.package) throw new Error('个人书籍不存在或已经移除')
  return normalizePersonalPackage(record.value.package)
}

export async function updatePersonalReadingPackage(packageId, update) {
  return db.transaction('rw', db.meta, async () => {
    const current = await loadPersonalReadingPackage(packageId)
    return savePersonalReadingPackage(update(current))
  })
}

export async function deletePersonalReadingPackage(packageId) {
  return db.transaction('rw', db.meta, async () => {
    const packageRecord = await db.meta.get(personalPackageKey(packageId))
    const pkg = packageRecord?.value?.package
    if (!pkg?.personal) throw new Error('找不到要删除的个人书籍')
    const relatedStateKeys = await db.meta
      .filter((record) => (
        record.key.startsWith('readerState:')
        && record.value?.editionId === pkg.edition?.id
      ))
      .primaryKeys()
    await db.meta.delete(personalPackageKey(packageId))
    if (relatedStateKeys.length > 0) await db.meta.bulkDelete(relatedStateKeys)
  })
}

export async function listPersonalReadingPackageEntries() {
  const records = await db.meta.where('key').startsWith(PERSONAL_READING_PACKAGE_KEY_PREFIX).toArray()
  const entries = []
  const warnings = []
  for (const record of records) {
    try { entries.push({ ...personalCatalogEntry(assertReadingPackage(record.value?.package)), createdAt: record.value.createdAt }) }
    catch { warnings.push('一本个人书籍数据异常，已隔离；原记录保留，请勿清理浏览器数据。') }
  }
  entries.sort((left, right) => String(left.createdAt || '').localeCompare(String(right.createdAt || '')))
  entries.warnings = warnings
  return entries
}
