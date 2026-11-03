import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

const FALLBACK_LICENSES = {
  'tr46@0.0.3': 'licenses/tr46-0.0.3-MIT.txt',
}
const normalize = text => text.replace(/\r\n/g, '\n').trimEnd() + '\n'

export async function collectDependencyLicenses(root) {
  const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'))
  const sections = [
    'Tangerine Reading Companion — third-party software notices\n',
    'Includes all production dependencies in package-lock.json, including Node-only helpers.\n'
      + 'These components retain their original licenses and copyrights.\n',
  ]
  for (const [location, entry] of Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    if (!location || entry.dev) continue
    const directory = path.join(root, location)
    const pkg = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'))
    if (pkg.version !== entry.version) throw new Error(`License collection: run npm ci; version mismatch for ${location}`)
    const files = (await readdir(directory, { withFileTypes: true }))
      .filter(file => file.isFile() && /^(licen[sc]e|copying|notice)([.-]|$)/i.test(file.name))
      .map(file => file.name).sort()
    const texts = []
    for (const file of files) {
      const text = await readFile(path.join(directory, file), 'utf8')
      if (!text.trim()) throw new Error(`License collection: empty ${file} for ${pkg.name}@${pkg.version}`)
      texts.push(`--- ${file} ---\n${normalize(text)}`)
    }
    if (!files.some(file => /^(licen[sc]e|copying)([.-]|$)/i.test(file))) {
      const fallback = FALLBACK_LICENSES[`${pkg.name}@${pkg.version}`]
      if (!fallback) throw new Error(`License collection: missing license text for ${pkg.name}@${pkg.version}`)
      texts.push(`--- ${fallback} (upstream supplemental text; see licenses/README.md in source) ---\n`
        + normalize(await readFile(path.join(root, fallback), 'utf8')))
    }
    sections.push(`============================================================\n${pkg.name}@${pkg.version}\n`
      + `Declared license: ${entry.license || pkg.license || 'see upstream text'}\n`
      + `Package: https://www.npmjs.com/package/${pkg.name}/v/${pkg.version}\n\n${texts.join('\n')}`)
  }
  return sections.join('\n')
}

export function licenseBundlePlugin() {
  let root
  let revision
  return {
    name: 'reading-license-bundle',
    apply: 'build',
    configResolved(config) {
      root = config.root
      revision = /^[a-f0-9]{40}$/i.test(config.env.VITE_APP_BUILD || '') ? config.env.VITE_APP_BUILD : ''
    },
    async generateBundle() {
      const dependencies = await collectDependencyLicenses(root)
      const ocr = await readFile(path.join(root, 'public/reader-ocr/LICENSES.txt'), 'utf8')
      const ocrLicense = await readFile(path.join(root, 'public/reader-ocr/LICENSE-Apache-2.0.txt'), 'utf8')
      this.emitFile({ type: 'asset', fileName: 'licenses/THIRD_PARTY_LICENSES.txt',
        source: `${dependencies}\n============================================================\n${normalize(ocr)}\n${normalize(ocrLicense)}` })
      this.emitFile({ type: 'asset', fileName: 'licenses/GPL-3.0-only.txt', source: await readFile(path.join(root, 'LICENSE')) })
      this.emitFile({ type: 'asset', fileName: 'licenses/README.txt', source:
        'Tangerine Reading Companion\n\n'
        + 'Project license: GPL-3.0-only.txt\n'
        + 'Dependency and OCR notices: THIRD_PARTY_LICENSES.txt\n'
        + 'Project source: https://github.com/Manamiiii/TangerineReadingCompanion\n'
        + (revision ? `Build revision: ${revision}\nCorresponding upstream source: https://github.com/Manamiiii/TangerineReadingCompanion/tree/${revision}\n` : '')
        + '\n'
        + 'When distributing a build or a modified version, provide its corresponding source\n'
        + 'under GPL v3, including build scripts. Preserve these notices. A link to a different\n'
        + 'revision is not a substitute for the matching source. See THIRD_PARTY_NOTICES.md\n'
        + 'in the source tree for data, map and redistribution boundaries.\n' })
    },
  }
}
