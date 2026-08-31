import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

export function offlineBundlePlugin() {
  let outputDir
  return {
    name: 'reading-offline-bundle',
    apply: 'build',
    configResolved(config) { outputDir = path.resolve(config.root, config.build.outDir) },
    async closeBundle() {
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
          return relative !== 'sw.js' && !relative.startsWith('reader-ocr/') && !relative.endsWith('.map')
        }).sort()
      const hash = createHash('sha256')
      for (const file of files) { hash.update(path.relative(outputDir, file)); hash.update(await readFile(file)) }
      const precache = files.map(file => './' + path.relative(outputDir, file).replaceAll('\\', '/'))
      const template = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8')
      hash.update(template)
      await writeFile(path.join(outputDir, 'sw.js'), template
        .replace('__BUILD_VERSION__', hash.digest('hex').slice(0, 16))
        .replace('/* __PRECACHE__ */ []', JSON.stringify(precache)))
    },
  }
}
