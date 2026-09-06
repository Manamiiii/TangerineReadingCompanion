import { createServer } from 'node:http'
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const base = '/reader/'
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' }

export async function startVersionServer() {
  const outputRoot = path.join(root, 'artifacts/e2e', `versions-${process.pid}-${Date.now()}`)
  const builds = new Map()
  for (const version of ['a', 'b', 'c']) {
    const publicDir = path.join(outputRoot, version, 'public')
    const outDir = path.join(outputRoot, version, 'dist')
    await mkdir(publicDir, { recursive: true })
    await cp(path.join(root, 'public'), publicDir, { recursive: true })
    const dataDir = path.join(publicDir, 'presets/reading-companion')
    const catalog = JSON.parse(await readFile(path.join(dataDir, 'catalog.json')))
    const entry = catalog.packages[0]
    const mainFile = path.join(publicDir, entry.path)
    const pkg = JSON.parse(await readFile(mainFile))
    pkg.book.title = `E2E current ${version}`
    entry.title = pkg.book.title
    await writeFile(mainFile, JSON.stringify(pkg))
    const deferred = structuredClone(pkg)
    deferred.id = 'e2e-deferred'
    deferred.book.id = 'e2e-deferred-book'
    deferred.book.title = `E2E deferred ${version}`
    deferred.edition.id = 'e2e-deferred-edition'
    deferred.entities = []
    deferred.onDemandEntities = []
    deferred.facts = []
    deferred.sources = []
    await writeFile(path.join(dataDir, 'e2e-deferred.json'), JSON.stringify(deferred))
    catalog.packages.push({ ...entry, id: deferred.id, title: deferred.book.title, path: 'presets/reading-companion/e2e-deferred.json', preparedSummary: { entityCount: 0, place: 0, person: 0, concept: 0, event: 0, factCount: 0, sourceCount: 0 } })
    await writeFile(path.join(dataDir, 'catalog.json'), JSON.stringify(catalog))
    await build({ root, configFile: path.join(root, 'vite.config.js'), publicDir, logLevel: 'silent', build: { outDir, emptyOutDir: false } })
    builds.set(version, { outDir, mainId: pkg.id })
  }
  let current = builds.get('a')
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost')
    const relative = decodeURIComponent(url.pathname.slice(base.length)) || 'index.html'
    const file = path.resolve(current.outDir, relative)
    if (!url.pathname.startsWith(base) || !file.startsWith(current.outDir + path.sep)) {
      response.writeHead(404).end(); return
    }
    try {
      const bytes = await readFile(file)
      response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(bytes)
    } catch { response.writeHead(404).end() }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return {
    url: `http://127.0.0.1:${server.address().port}${base}`,
    mainId: current.mainId,
    select(version) { current = builds.get(version) },
    close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }),
  }
}
