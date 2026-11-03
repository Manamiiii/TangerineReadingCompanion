import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { assetPath, isAppUrl, externalUrl } from '../../desktop/security.mjs'

test('desktop asset protocol confines decoded paths and rejects foreign origins and malformed URLs', () => {
  const root = path.resolve('dist')
  assert.equal(assetPath(root, 'app://reading/assets/main.js?v=1', 'reading'), path.join(root, 'assets/main.js'))
  assert.equal(assetPath(root, 'app://reading/', 'reading'), path.join(root, 'index.html'))
  for (const url of ['invalid', 'file:///etc/passwd', 'app://other/index.html', 'app://user@reading/index.html', 'app://reading:12/index.html', 'app://reading/%2e%2e%2fsecret', 'app://reading/a%5c..%5csecret', 'app://reading/file%3astream', 'app://reading/%00', 'app://reading/%zz']) {
    assert.equal(assetPath(root, url, 'reading'), null, url)
  }
})

test('desktop origin and external navigation do not admit privileged schemes or credentials', () => {
  assert.equal(isAppUrl('app://reading/index.html#book/a', 'reading'), true)
  for (const url of ['app://reading.evil/', 'app://reading:42/', 'https://reading/', 'app://user@reading/']) assert.equal(isAppUrl(url, 'reading'), false)
  assert.equal(externalUrl('https://example.org/help'), 'https://example.org/help')
  for (const url of ['file:///secret', 'javascript:alert(1)', 'ms-settings:', 'https://name:pass@example.org/', 'invalid']) assert.equal(externalUrl(url), null)
})
