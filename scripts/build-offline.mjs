import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const DATA_MODULE = 'virtual:reading-data-urls'
const DATA_DIRECTORY = 'presets/reading-companion/'

export async function snapshotReadingData(publicDir) {
  const directory = path.join(publicDir, DATA_DIRECTORY)
  const names = (await readdir(directory)).filter(name => name.endsWith('.json')).sort()
  return Promise.all(names.map(async name => {
    const source = await readFile(path.join(directory, name))
    const hash = createHash('sha256').update(source).digest('hex')
    return {
      original: DATA_DIRECTORY + name,
      versioned: DATA_DIRECTORY + name.replace(/\.json$/, `.${hash}.json`),
      source,
    }
  }))
}

export function offlineBundlePlugin() {
  let outputDir
  let publicDir
  let production
  let snapshot
  return {
    name: 'reading-offline-bundle',
    configResolved(config) {
      outputDir = path.resolve(config.root, config.build.outDir)
      publicDir = config.publicDir
      production = config.command === 'build'
    },
    async buildStart() { snapshot = await snapshotReadingData(publicDir) },
    resolveId(id) { if (id === DATA_MODULE) return '\0' + DATA_MODULE },
    load(id) {
      if (id !== '\0' + DATA_MODULE) return
      return `export default ${JSON.stringify(Object.fromEntries(snapshot.map(file => [
        file.original, production ? file.versioned : file.original,
      ])))}`
    },
    generateBundle() {
      if (!production) return
      for (const file of snapshot) this.emitFile({ type: 'asset', fileName: file.versioned, source: file.source })
    },
    async closeBundle() {
      if (!production) return
      async function filesIn(directory) {
        const entries = await readdir(directory, { withFileTypes: true })
        const nested = await Promise.all(entries.map(entry => entry.isDirectory()
          ? filesIn(path.join(directory, entry.name))
          : [path.join(directory, entry.name)]))
        return nested.flat()
      }
      const files = (await filesIn(outputDir))
        .filter(file => {
          const relative = path.relative(outputDir, file).replaceAll('\\', '/')
          return relative !== 'sw.js' && relative !== 'offline-manifest.json'
            && !relative.startsWith('reader-ocr/') && !relative.endsWith('.map')
            && !snapshot.some(item => item.original === relative)
        }).sort()
      const hash = createHash('sha256')
      for (const file of files) { hash.update(path.relative(outputDir, file).replaceAll('\\', '/')); hash.update(await readFile(file)) }
      const precache = files.map(file => './' + path.relative(outputDir, file).replaceAll('\\', '/'))
      const template = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8')
      hash.update(template)
      const version = hash.digest('hex').slice(0, 16)
      precache.push('./offline-manifest.json')
      await writeFile(path.join(outputDir, 'offline-manifest.json'), JSON.stringify({ version, files: precache }))
      await writeFile(path.join(outputDir, 'sw.js'), template
        .replace('__BUILD_VERSION__', version)
        .replace('/* __PRECACHE__ */ []', JSON.stringify(precache)))
    },
  }
}
