import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { digest, verifySnapshot } from '../review-entry.mjs'

test('review snapshot detects changed bytes and rejects escaping manifest paths', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'reading-review-unit-'))
  await fs.writeFile(path.join(root, 'index.html'), 'verified fixture')
  const files = { 'index.html': digest('verified fixture') }
  const manifest = { format: 'reading-review-v1', revision: 'a'.repeat(40), files, sourceHash: digest(JSON.stringify(files)) }
  await verifySnapshot(root, manifest)
  await fs.writeFile(path.join(root, 'index.html'), 'unverified change')
  await assert.rejects(verifySnapshot(root, manifest), /snapshot changed/)
  await assert.rejects(verifySnapshot(root, { ...manifest, files: { '../outside': digest('') } }), /Unsafe/)
})
