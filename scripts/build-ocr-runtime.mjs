import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
export function ocrRuntimePlugin() {
  return {
    name: 'local-ocr-runtime',
    apply: 'build',
    async generateBundle() {
      const core = path.dirname(require.resolve('tesseract.js-core'))
      const files = [['worker.min.js', require.resolve('tesseract.js/dist/worker.min.js')]]
      for (const variant of ['', '-simd', '-relaxedsimd']) {
        for (const extension of ['wasm.js', 'wasm']) {
          const name = `tesseract-core${variant}-lstm.${extension}`
          files.push([name, path.join(core, name)])
        }
      }
      for (const [name, file] of files) this.emitFile({ type: 'asset', fileName: `reader-ocr/${name}`, source: await readFile(file) })
    },
  }
}
