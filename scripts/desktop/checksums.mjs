import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

const directory = path.resolve('artifacts/desktop/release')
const files = (await fs.readdir(directory)).filter(name => /^TangerineReadingCompanion-.*-win-x64-Setup\.exe$/.test(name)).sort()
if (!files.length) throw new Error('No Windows installer found')
const lines = []
for (const name of files) lines.push(`${createHash('sha256').update(await fs.readFile(path.join(directory, name))).digest('hex')}  ${name}`)
await fs.writeFile(path.join(directory, 'SHA256SUMS.txt'), lines.join('\n') + '\n')
console.log(`Checksums written for ${files.length} installer(s).`)
