import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const privateFile = /(?:^|\/)(?:\.private|\.codex|\.codex-remote-attachments|\.idea|artifacts|logs)(?:\/|$)|(?:^|\/)(?:\.env(?:\..*)?|\.npmrc|\.netrc|\.git-credentials|auth\.json)$|\.(?:local(?:\..*)?|log|lnk|pem|key|p12|pfx|db|sqlite3?)$|(?:^|\/)(?:tangerine-reading-companion-\d+|reading-feedback-[^/]+)\.json$/i
const contentRules = [
  ['credential-token', /(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{25,}|sk-(?:proj-)?[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/g],
  ['absolute-machine-path', /\b[A-Za-z]:[\\/][^\s"'`<>]*/g],
  ['user-home-path', /\/(?:Users|home)\/[^\s"'`<>]+/g],
  ['private-network-url', /https?:\/\/(?:10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)(?=[:/\s"'])/g],
]

export function inspectPrivacyFile(file, buffer) {
  const findings = []
  const add = (rule, line = 1) => findings.push({ file, line, rule })
  if (privateFile.test(file) && path.posix.basename(file) !== '.env.example') add('private-file')
  if (buffer.includes(0)) return findings
  const text = buffer.toString('utf8')
  for (const [rule, pattern] of contentRules) {
    for (const match of text.matchAll(pattern)) {
      // This is a public container default, not the developer's own home directory.
      if (file === '.devcontainer/devcontainer.json' && /^[/]home[/]codespace[/]\.codex(?:,type=volume)?$/.test(match[0])) continue
      add(rule, text.slice(0, match.index).split('\n').length)
    }
  }
  if (file.endsWith('.json')) {
    try {
      const value = JSON.parse(text)
      if (value.format === 'tangerine-reading-companion-backup' || value.kind === 'tangerine-reading-feedback'
        || value.data?.meta?.some?.(entry => /^reader(?:State|PersonalPackage):/.test(entry?.key))) add('personal-reading-export')
    } catch { /* Non-JSON content is covered by the text rules. */ }
  }
  return findings
}

async function walk(root, directory, skipped = new Set()) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (skipped.has(entry.name)) continue
    const absolute = path.join(directory, entry.name)
    if (entry.isSymbolicLink()) throw new Error('Privacy check does not follow symlinks; review the publish inputs.')
    if (entry.isDirectory()) files.push(...await walk(root, absolute, skipped))
    else files.push(path.relative(root, absolute).replaceAll('\\', '/'))
  }
  return files
}

export async function checkRepositoryPrivacy(root) {
  const files = existsSync(path.join(root, '.git'))
    ? execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)
    : await walk(root, root, new Set(['.git', 'node_modules', 'dist', 'dist-ssr', 'artifacts', '.private', '.codex', '.codex-remote-attachments', '.idea']))
  // Vite copies public/ even when a local file is ignored by Git.
  const publishFiles = existsSync(path.join(root, 'public')) ? await walk(root, path.join(root, 'public')) : []
  const findings = []
  for (const file of new Set([...files, ...publishFiles])) {
    const absolute = path.join(root, file)
    if (existsSync(absolute)) findings.push(...inspectPrivacyFile(file, await readFile(absolute)))
  }
  return findings
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const findings = await checkRepositoryPrivacy(path.resolve(import.meta.dirname, '..'))
  for (const finding of findings) console.error(`${finding.file}:${finding.line} [${finding.rule}]`)
  console.log(findings.length ? `Privacy check failed: ${findings.length} finding(s); values are not logged.`
    : 'Privacy check passed for tracked/source files and all public assets (heuristic check, not a secrecy guarantee).')
  if (findings.length) process.exitCode = 1
}
