import assert from 'node:assert/strict'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { checkRepositoryPrivacy, inspectPrivacyFile } from '../check-repository-privacy.mjs'

const inspect = (file, text) => inspectPrivacyFile(file, Buffer.from(text))
const fakeToken = ['ghp', 'x'.repeat(36)].join('_')
const fakePath = 'Q:' + ['', 'Users', 'fixture-user', 'project'].join('/')

test('privacy findings flag paths, credentials and renamed reading exports without printing values', () => {
  for (const [file, value, rule] of [
    ['config.js', fakePath, 'absolute-machine-path'],
    ['config.js', fakeToken, 'credential-token'],
    ['.private/settings.json', '{}', 'private-file'],
    ['public/custom.json', JSON.stringify({ format: 'tangerine-reading-companion-backup' }), 'personal-reading-export'],
    ['public/renamed.json', JSON.stringify({ kind: 'tangerine-reading-feedback' }), 'personal-reading-export'],
  ]) {
    const findings = inspect(file, value)
    assert.ok(findings.some(finding => finding.rule === rule), rule)
    assert.ok(!JSON.stringify(findings).includes(value), 'matched values must not enter diagnostics')
  }
  assert.deepEqual(inspect('.env.example', 'EXAMPLE_OPTION=placeholder'), [])
  assert.deepEqual(inspect('data.json', '{"format":"public-example"}'), [])
})

for (const withGit of [true, false]) {
  test(`public files are checked even if ignored; local private files stay local (${withGit ? 'Git' : 'ZIP'})`, async t => {
    const root = await mkdtemp(path.join(tmpdir(), 'reading-privacy-'))
    t.after(() => {
      assert.equal(path.dirname(root), path.resolve(tmpdir()))
      assert.ok(path.basename(root).startsWith('reading-privacy-'))
      return rm(root, { recursive: true, force: true })
    })
    await mkdir(path.join(root, 'public'))
    await mkdir(path.join(root, '.private'))
    await writeFile(path.join(root, '.gitignore'), await readFile(new URL('../../.gitignore', import.meta.url)))
    await writeFile(path.join(root, '.private/config.json'), JSON.stringify({ directory: fakePath }))
    if (withGit) execFileSync('git', ['init', '--quiet', root])
    assert.deepEqual(await checkRepositoryPrivacy(root), [])
    await writeFile(path.join(root, 'public/.env.local'), `API_KEY=${fakeToken}`)
    if (withGit) assert.equal(execFileSync('git', ['check-ignore', 'public/.env.local'], { cwd: root, encoding: 'utf8' }).trim(), 'public/.env.local')
    const findings = await checkRepositoryPrivacy(root)
    assert.ok(findings.some(finding => finding.file === 'public/.env.local' && finding.rule === 'private-file'))
    assert.ok(findings.some(finding => finding.rule === 'credential-token'))
    assert.ok(!findings.some(finding => finding.file.startsWith('.private/')))
  })
}
