import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const reviewDirectory = path.join(project, 'artifacts', 'review')
export const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const git = (...args) => execFileSync('git', args, { cwd: project, encoding: 'utf8', windowsHide: true }).trim()
export async function dependencyDigest() {
  return digest(await fs.readFile(path.join(project, 'node_modules', '.package-lock.json')))
}
export async function verifySnapshot(directory, manifest) {
  if (manifest.format !== 'reading-review-v1' || !/^[a-f0-9]{40}$/.test(manifest.revision) || !manifest.files || !Object.keys(manifest.files).length) throw new Error('Invalid review manifest')
  for (const [name, hash] of Object.entries(manifest.files)) {
    if (name.includes('\\') || name.startsWith('/') || name.split('/').some(part => ['.', '..', ''].includes(part))) throw new Error('Unsafe snapshot path')
    if (digest(await fs.readFile(path.join(directory, name))) !== hash) throw new Error(`Review snapshot changed: ${name}`)
  }
  if (digest(JSON.stringify(manifest.files)) !== manifest.sourceHash) throw new Error('Invalid review content digest')
}
export async function loadSnapshot(name) {
  if (!/^[a-f0-9]{40}-[a-f0-9]{12}$/.test(name)) throw new Error('Invalid selected review')
  const directory = path.join(reviewDirectory, 'releases', name)
  const bytes = await fs.readFile(path.join(directory, 'review.json'))
  const manifest = JSON.parse(bytes)
  await verifySnapshot(directory, manifest)
  for (const name of ['scripts/review-entry.mjs', 'scripts/serve-review.mjs', 'scripts/launch-desktop.ps1', 'TangerineReadingCompanion.vbs']) {
    if (digest(await fs.readFile(path.join(project, name))) !== manifest.files[name]) throw new Error('Desktop entry code changed; validate a new review before starting')
  }
  if (await dependencyDigest() !== manifest.dependencies) throw new Error('Installed dependencies changed; validate and prepare a new review first')
  return { directory, manifest, manifestHash: digest(bytes) }
}
export async function loadReview() {
  const selected = JSON.parse(await fs.readFile(path.join(reviewDirectory, 'selected.json'), 'utf8'))
  const result = await loadSnapshot(selected.directory)
  if (result.manifestHash !== selected.manifestHash) throw new Error('Selected manifest changed')
  return result
}

export async function prepareReview() {
  if (git('status', '--porcelain')) throw new Error('Commit and validate the scoped changes before preparing a desktop review')
  await fs.mkdir(path.join(reviewDirectory, 'releases'), { recursive: true })
  const revision = git('rev-parse', 'HEAD')
  execFileSync(process.execPath, ['scripts/check-repository-privacy.mjs'], { cwd: project, stdio: 'pipe', windowsHide: true })
  const names = git('ls-files', '-z').split('\0').filter(name => /^(src\/|public\/|licenses\/|scripts\/|(?:package(?:-lock)?\.json|vite\.config\.js|index\.html|LICENSE|TangerineReadingCompanion\.vbs)$)/.test(name)).sort()
  const files = {}, contents = new Map()
  for (const name of names) { const bytes = await fs.readFile(path.join(project, name)); files[name] = digest(bytes); contents.set(name, bytes) }
  const sourceHash = digest(JSON.stringify(files))
  const manifest = { format: 'reading-review-v1', revision, version: JSON.parse(contents.get('package.json')).version, sourceHash, dependencies: await dependencyDigest(), files }
  const directory = path.join(reviewDirectory, 'releases', `${revision}-${sourceHash.slice(0, 12)}`)
  try {
    await fs.mkdir(directory, { recursive: false })
    for (const [name, bytes] of contents) { const target = path.join(directory, name); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, bytes, { flag: 'wx' }) }
    await fs.writeFile(path.join(directory, 'review.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' })
  } catch (error) { if (error.code !== 'EEXIST') throw error }
  const bytes = await fs.readFile(path.join(directory, 'review.json'))
  const recorded = JSON.parse(bytes)
  await verifySnapshot(directory, recorded)
  if (recorded.sourceHash !== sourceHash || recorded.dependencies !== manifest.dependencies) throw new Error('Existing snapshot differs; preserve it and investigate')
  return { directory, manifest: recorded, manifestHash: digest(bytes) }
}

async function main() {
  const command = process.argv[2]
  if (command === 'prepare') {
    const result = await prepareReview()
    console.log(JSON.stringify({ directory: path.basename(result.directory), revision: result.manifest.revision, sourceHash: result.manifest.sourceHash, manifestHash: result.manifestHash }))
  } else if (command === 'check') {
    const { manifest, manifestHash } = await loadReview()
    const response = await fetch('http://localhost:5174/__reading_review', { cache: 'no-store', signal: AbortSignal.timeout(3000) })
    const actual = await response.json()
    if (actual.manifestHash !== manifestHash || actual.revision !== manifest.revision || actual.sourceHash !== manifest.sourceHash) throw new Error('Running service differs from selected review; preserve any active session')
    const page = await (await fetch('http://localhost:5174/', { cache: 'no-store' })).text()
    if (!page.includes(`content="${manifestHash}"`)) throw new Error('Served page has no matching review identity')
    console.log(JSON.stringify({ ...actual, browserSession: 'not-inspected' }))
  } else throw new Error('Expected prepare or check')
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1 })
