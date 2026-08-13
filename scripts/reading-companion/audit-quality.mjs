import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  buildReadingPreviews,
  reportPath,
} from './lib/package-pipeline.mjs'
import {
  auditReadingPackageQuality,
  checkReadingSourceLinks,
} from './lib/quality-audit.mjs'

const checkLinks = process.argv.includes('--check-links')
const outputPath = path.join(path.dirname(reportPath), 'package-quality-report.md')
const { previews } = await buildReadingPreviews()
const audits = auditsWithDetails(previews)

function listOrNone(items, render) {
  return items.length > 0
    ? items.map((item) => `- ${render(item)}`).join('\n')
    : '- 无'
}

function auditsWithDetails(items) {
  return items.map((preview) => ({
    preview,
    audit: auditReadingPackageQuality(preview),
  }))
}

const linkResults = checkLinks
  ? new Map(await Promise.all(audits.map(async ({ preview }) => [
      preview.package.id,
      await checkReadingSourceLinks(preview.package.sources),
    ])))
  : new Map()

const sections = audits.map(({ preview, audit }) => {
  const links = linkResults.get(preview.package.id) || []
  return [
    `## ${audit.title} · ${audit.isbn}`,
    '',
    `- 资料包版本：${audit.packageVersion}`,
    `- 已批准来源：${audit.summary.sourceCount}`,
    `- 按需资料：${audit.summary.onDemandEntityCount}`,
    `- 正式实体 / 事实：${audit.summary.formalEntityCount} / ${audit.summary.formalFactCount}`,
    `- 待审来源 / 实体 / 事实：${audit.summary.pendingSourceCount} / ${audit.summary.pendingEntityCount} / ${audit.summary.pendingFactCount}`,
    '',
    '### 缺少独立背景说明',
    '',
    listOrNone(audit.backgroundGaps, (item) => (
      `\`${item.id}\` · ${item.kind} · ${item.name}`
    )),
    '',
    '### 没有几何信息的地点',
    '',
    listOrNone(audit.placeGeometryGaps, (item) => (
      `\`${item.id}\` · ${item.placeKind} · ${item.name}`
    )),
    '',
    '### 来源 URL 静态检查',
    '',
    listOrNone(audit.sourceUrlGaps, (item) => (
      `\`${item.id}\` · ${item.status} · ${item.label}`
    )),
    '',
    '### 缺少中文名称的实体候选',
    '',
    listOrNone(audit.candidateTranslationGaps, (item) => (
      `\`${item.id}\` · ${item.name} · ${item.blockers.join('、')}`
    )),
    '',
    '### 候选阻塞项统计',
    '',
    listOrNone(
      Object.entries(audit.blockerCounts),
      ([blocker, count]) => `\`${blocker}\` · ${count}`,
    ),
    '',
    '### 待审来源',
    '',
    listOrNone(audit.pendingSourceIds, (id) => `\`${id}\``),
    ...(checkLinks
      ? [
          '',
          '### 来源在线检查',
          '',
          listOrNone(links, (item) => (
            `\`${item.id}\` · ${item.status}`
            + `${item.httpStatus ? ` (${item.httpStatus})` : ''} · ${item.url}`
          )),
        ]
      : []),
  ].join('\n')
})

const report = [
  '# 阅读资料包质量报告',
  '',
  `- 生成时间：${new Date().toISOString()}`,
  `- 在线链接检查：${checkLinks ? '已执行' : '未执行；使用 npm run audit:links 单独检查'}`,
  '',
  ...sections,
  '',
].join('\n')

await mkdir(path.dirname(outputPath), { recursive: true })
await writeFile(outputPath, report, 'utf8')
console.log(report)
console.log(`\n✓ 报告：${path.relative(process.cwd(), outputPath)}`)
