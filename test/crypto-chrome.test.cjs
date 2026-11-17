const test = require('node:test');
const assert = require('node:assert/strict');
const { deriveChromeKey, encryptChromePassword, decryptChromePassword } = require('../shared/crypto-chrome.cjs');

test('Chrome macOS v10 passwords decrypt with the Safe Storage key', () => {
  const key = deriveChromeKey('test-key');
  const blob = encryptChromePassword('s3cret-horse', key);
  assert.equal(blob.subarray(0, 3).toString(), 'v10');
  assert.equal(decryptChromePassword(blob, key), 's3cret-horse');
});

test('other encryption versions are rejected', () => {
  const key = deriveChromeKey('test-key');
  assert.throws(() => decryptChromePassword(Buffer.from('v20not-supported'), key), /Unsupported Chrome password encryption/);
});
