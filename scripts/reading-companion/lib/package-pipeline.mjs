import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  assertReadingPackage,
  summarizeReadingPackage,
} from '../../../src/features/reading-companion/domain/readingCompanion.js'

export const repoRoot = path.resolve(import.meta.dirname, '../../..')
export const publicRoot = path.join(repoRoot, 'public/presets/reading-companion')
export const stagingRoot = path.join(repoRoot, 'scripts/reading-companion/data/staging')
export const previewRoot = path.join(repoRoot, 'scripts/reading-companion/data/preview')
export const previewCatalogPath = path.join(previewRoot, 'catalog.json')
export const publicCatalogPath = path.join(publicRoot, 'catalog.json')
export const reportPath = path.join(
  repoRoot,
  'artifacts/reading-companion/package-preview.md',
)

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const ENTITY_KINDS = new Set(['place', 'person', 'concept', 'event'])
const PLACE_KINDS = new Set(['real', 'fictional', 'prototype', 'approximate'])
const FACT_KINDS = new Set(['spatial', 'character', 'plot', 'history', 'concept'])
const RISK_LEVELS = new Set(['safe', 'potential', 'high'])
const RISK_CATEGORIES = new Set([
  'character_relationship',
  'location_significance',
  'character_fate',
  'future_event',
  'historical_plot_link',
  'route_significance',
  'ending',
  'identity_secret',
])

export async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'))
}

export async function readJsonIfExists(filePath) {
  try {
    return await readJson(filePath)
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

export async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

export function packagePaths(slug) {
  if (!SLUG_PATTERN.test(slug)) throw new Error(`资料包 slug 无效：${slug}`)
  return {
    publicPackagePath: path.join(publicRoot, `${slug}.json`),
    previewPackagePath: path.join(previewRoot, `${slug}.json`),
  }
}

function validateSourceCandidates(sourceCandidates) {
  if (!Array.isArray(sourceCandidates) || sourceCandidates.length === 0) {
    throw new Error('staging.sourceCandidates 必须是非空数组')
  }
  const ids = new Set()
  for (const source of sourceCandidates) {
    if (!source?.id || !source?.kind || !source?.label) {
      throw new Error('资料源候选必须包含 id、kind 和 label')
    }
    if (!['approved', 'candidate', 'rejected'].includes(source.status)) {
      throw new Error(`资料源状态无效：${source.id}`)
    }
    if (ids.has(source.id)) throw new Error(`资料源 id 重复：${source.id}`)
    ids.add(source.id)
    if (source.url) new URL(source.url)
  }
}

function validateResearchCandidates(kind, candidates, sourceIds) {
  if (!Array.isArray(candidates)) {
    throw new Error(`staging.${kind}Candidates 必须是数组`)
  }
  const ids = new Set()
  const itemKey = kind === 'entity' ? 'entity' : 'fact'
  for (const candidate of candidates) {
    const item = candidate?.[itemKey]
    if (!['candidate', 'rejected'].includes(candidate?.status)) {
      throw new Error(`${kind} 候选状态无效：${item?.id || 'unknown'}`)
    }
    if (!item?.id) throw new Error(`${kind} 候选必须包含 ${itemKey}.id`)
    if (ids.has(item.id)) throw new Error(`${kind} 候选 id 重复：${item.id}`)
    ids.add(item.id)
    if (!Array.isArray(candidate.sourceIds) || candidate.sourceIds.length === 0) {
      throw new Error(`${kind} 候选必须引用至少一个资料源：${item.id}`)
    }
    for (const sourceId of candidate.sourceIds) {
      if (!sourceIds.has(sourceId)) {
        throw new Error(`${kind} 候选引用未知资料源：${item.id} → ${sourceId}`)
      }
    }
    if (candidate.status === 'candidate'
      && (!Array.isArray(candidate.blockers) || candidate.blockers.length === 0)) {
      throw new Error(`${kind} 待审候选必须说明阻塞项：${item.id}`)
    }
    if (kind === 'entity') {
      if (!item.name || !item.kind) throw new Error(`实体候选缺少名称或类型：${item.id}`)
      if (!ENTITY_KINDS.has(item.kind)) throw new Error(`实体候选类型无效：${item.id}`)
      if (item.safeNote !== undefined
        && (typeof item.safeNote !== 'string'
          || item.safeNote.trim().length === 0
          || item.safeNote.length > 400)) {
        throw new Error(`实体候选 safeNote 必须是 1–400 字符的非空字符串：${item.id}`)
      }
      if (item.safeNote !== undefined) {
        if (!Array.isArray(item.safeNoteSourceIds) || item.safeNoteSourceIds.length === 0) {
          throw new Error(`实体候选 safeNoteSourceIds 必须引用至少一个注释来源：${item.id}`)
        }
        for (const sourceId of item.safeNoteSourceIds) {
          if (!candidate.sourceIds.includes(sourceId)) {
            throw new Error(`实体候选 safeNoteSourceIds 必须属于 sourceIds：${item.id} → ${sourceId}`)
          }
        }
      } else if (item.safeNoteSourceIds !== undefined) {
        throw new Error(`实体候选 safeNoteSourceIds 不能脱离 safeNote 单独存在：${item.id}`)
      }
      if (item.kind === 'place' && !PLACE_KINDS.has(item.placeKind)) {
        throw new Error(`地点候选分类无效：${item.id}`)
      }
      const geometry = item.geometry
      if (item.placeKind === 'fictional' && geometry) {
        throw new Error(`虚构地点候选不能伪造坐标：${item.id}`)
      }
      if (geometry) {
        if (!['point', 'area'].includes(geometry.type)
          || !Number.isFinite(geometry.latitude)
          || !Number.isFinite(geometry.longitude)
          || geometry.latitude < -90
          || geometry.latitude > 90
          || geometry.longitude < -180
          || geometry.longitude > 180) {
          throw new Error(`实体候选坐标无效：${item.id}`)
        }
      }
    } else {
      if (!item.content || !FACT_KINDS.has(item.kind)) {
        throw new Error(`事实候选缺少内容或类型无效：${item.id}`)
      }
      if (!RISK_LEVELS.has(item.riskLevel)) {
        throw new Error(`事实候选风险等级无效：${item.id}`)
      }
      if (!Array.isArray(item.riskCategories)
        || item.riskCategories.some((category) => !RISK_CATEGORIES.has(category))) {
        throw new Error(`事实候选风险类别无效：${item.id}`)
      }
    }
  }
}

function runtimeSource(source) {
  return Object.fromEntries(
    ['id', 'kind', 'label', 'organization', 'url', 'accessedAt', 'useFor', 'rightsStatus', 'notes']
      .filter((key) => source[key] !== undefined)
      .map((key) => [key, source[key]]),
  )
}

function validateStaging(staging) {
  if (staging?.schemaVersion !== 1) throw new Error('staging.schemaVersion 必须为 1')
  if (!SLUG_PATTERN.test(staging.slug || '')) throw new Error('staging.slug 无效')
  if (!staging.packageId || !staging.packageVersion) {
    throw new Error('staging.packageId 和 staging.packageVersion 不能为空')
  }
  if (!staging.catalogEntry?.editionLabel) {
    throw new Error('staging.catalogEntry.editionLabel 不能为空')
  }
  if (!Number.isInteger(staging.order) || staging.order < 0) {
    throw new Error('staging.order 必须是非负整数')
  }
  validateSourceCandidates(staging.sourceCandidates)
  const sourceIds = new Set(staging.sourceCandidates.map((source) => source.id))
  validateResearchCandidates('entity', staging.entityCandidates, sourceIds)
  validateResearchCandidates('fact', staging.factCandidates, sourceIds)
  if (!Array.isArray(staging.onDemandEntities)
    || !Array.isArray(staging.entities)
    || !Array.isArray(staging.facts)) {
    throw new Error('staging.onDemandEntities、entities 和 facts 必须是数组')
  }
  if (!staging.package && !staging.basePackagePath) {
    throw new Error('新书 staging 必须包含 package；已有书更新可以使用 basePackagePath')
  }
}

export function buildReadingPreviewFromStaging(staging, basePackage = null) {
  validateStaging(staging)
  const packageTemplate = staging.package || basePackage
  if (!packageTemplate) throw new Error(`资料包 ${staging.slug} 缺少基础 package`)
  if (packageTemplate.id !== staging.packageId) {
    throw new Error(`资料包 ${staging.slug} 的 packageId 与 package.id 不一致`)
  }

  const approvedSources = staging.sourceCandidates
    .filter((source) => source.status === 'approved')
    .map(runtimeSource)
  const nextPackage = assertReadingPackage({
    ...packageTemplate,
    packageVersion: staging.packageVersion,
    sources: approvedSources,
    onDemandEntities: staging.onDemandEntities,
    entities: staging.entities,
    facts: staging.facts,
  })
  const { publicPackagePath } = packagePaths(staging.slug)
  return {
    previewMeta: {
      slug: staging.slug,
      order: staging.order,
      packageId: nextPackage.id,
      targetPath: path.relative(repoRoot, publicPackagePath).replaceAll('\\', '/'),
      approvedSourceIds: approvedSources.map((source) => source.id),
      pendingSourceIds: staging.sourceCandidates
        .filter((source) => source.status === 'candidate')
        .map((source) => source.id),
      rejectedSourceIds: staging.sourceCandidates
        .filter((source) => source.status === 'rejected')
        .map((source) => source.id),
      candidateEntityIds: staging.entityCandidates
        .filter((candidate) => candidate.status === 'candidate')
        .map((candidate) => candidate.entity.id),
      rejectedEntityIds: staging.entityCandidates
        .filter((candidate) => candidate.status === 'rejected')
        .map((candidate) => candidate.entity.id),
      candidateFactIds: staging.factCandidates
        .filter((candidate) => candidate.status === 'candidate')
        .map((candidate) => candidate.fact.id),
      rejectedFactIds: staging.factCandidates
        .filter((candidate) => candidate.status === 'rejected')
        .map((candidate) => candidate.fact.id),
      onDemandEntityIds: staging.onDemandEntities.map((entity) => entity.id),
    },
    researchCandidates: {
      entities: staging.entityCandidates,
      facts: staging.factCandidates,
    },
    catalogEntry: {
      id: nextPackage.id,
      title: staging.catalogEntry.title || nextPackage.book.title,
      editionLabel: staging.catalogEntry.editionLabel,
      path: `presets/reading-companion/${staging.slug}.json`,
      preparedSummary: summarizeReadingPackage(nextPackage),
    },
    package: nextPackage,
  }
}

async function loadBasePackage(staging) {
  if (staging.package) return null
  const basePath = path.resolve(repoRoot, staging.basePackagePath)
  const expectedRoot = `${path.resolve(publicRoot)}${path.sep}`
  if (!basePath.startsWith(expectedRoot)) {
    throw new Error(`basePackagePath 必须位于 public/presets/reading-companion：${staging.slug}`)
  }
  return readJson(basePath)
}

export async function discoverReadingStaging() {
  const files = (await readdir(stagingRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort()
  if (files.length === 0) throw new Error('没有可用的阅读资料 staging')

  const stagingItems = await Promise.all(
    files.map((file) => readJson(path.join(stagingRoot, file))),
  )
  const slugs = new Set()
  const orders = new Set()
  for (const staging of stagingItems) {
    validateStaging(staging)
    if (slugs.has(staging.slug)) throw new Error(`staging.slug 重复：${staging.slug}`)
    if (orders.has(staging.order)) throw new Error(`staging.order 重复：${staging.order}`)
    slugs.add(staging.slug)
    orders.add(staging.order)
  }
  return stagingItems.sort((a, b) => a.order - b.order)
}

export async function buildReadingPreviews() {
  const stagingItems = await discoverReadingStaging()
  const previews = []
  for (const staging of stagingItems) {
    const basePackage = await loadBasePackage(staging)
    previews.push(buildReadingPreviewFromStaging(staging, basePackage))
  }
  const packageIds = new Set()
  for (const preview of previews) {
    if (packageIds.has(preview.package.id)) {
      throw new Error(`资料包 id 重复：${preview.package.id}`)
    }
    packageIds.add(preview.package.id)
  }
  return {
    previews,
    catalog: {
      schemaVersion: 1,
      packages: previews.map((preview) => preview.catalogEntry),
    },
  }
}
