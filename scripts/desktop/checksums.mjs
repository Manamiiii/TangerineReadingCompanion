import { release, setupPath } from './release-paths.mjs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

const name = path.basename(setupPath)
const digest = createHash('sha256').update(await fs.readFile(setupPath)).digest('hex')
await fs.writeFile(path.join(release, 'SHA256SUMS.txt'), `${digest}  ${name}\n`)
console.log('Checksum written for the current installer.')
