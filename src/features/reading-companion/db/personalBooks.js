import { db } from '../../../db/core.js'
import { nowIso } from '../../../utils.js'
import {
  personalCatalogEntry,
} from '../domain/personalBooks.js'
import { assertReadingPackage } from '../domain/readingCompanion.js'

export const PERSONAL_READING_PACKAGE_KEY_PREFIX = 'readerPersonalPackage:'

function personalPackageKey(packageId) {
  return `${PERSONAL_READING_PACKAGE_KEY_PREFIX}${packageId}`
}

export async function savePersonalReadingPackage(pkg) {
  const validatedPackage = assertReadingPackage(pkg)
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
  return assertReadingPackage(record.value.package)
}

export async function deletePersonalReadingPackage(packageId) {
  const packageRecord = await db.meta.get(personalPackageKey(packageId))
  const pkg = packageRecord?.value?.package
  if (!pkg?.personal) throw new Error('找不到要删除的个人书籍')
  const relatedStateKeys = await db.meta
    .filter((record) => (
      record.key.startsWith('readerState:')
      && record.value?.editionId === pkg.edition?.id
    ))
    .primaryKeys()
  await db.transaction('rw', db.meta, async () => {
    await db.meta.delete(personalPackageKey(packageId))
    if (relatedStateKeys.length > 0) await db.meta.bulkDelete(relatedStateKeys)
  })
}

export async function listPersonalReadingPackageEntries() {
  const records = await db.meta
    .filter((record) => record.key.startsWith(PERSONAL_READING_PACKAGE_KEY_PREFIX))
    .toArray()
  return records
    .map((record) => record.value?.package)
    .filter(Boolean)
    .map((pkg) => ({
      ...personalCatalogEntry(assertReadingPackage(pkg)),
      createdAt: records.find((record) => record.value?.package?.id === pkg.id)?.value?.createdAt,
    }))
    .sort((left, right) => String(left.createdAt || '').localeCompare(String(right.createdAt || '')))
}
