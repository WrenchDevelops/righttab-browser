const test = require('node:test');
const assert = require('node:assert/strict');
const { explainLoadError, errorPageUrl } = require('../electron/error-page.cjs');

test('certificate failures preserve the error category without claiming a filtering response', () => {
  const mismatch = explainLoadError(-200, 'ERR_CERT_COMMON_NAME_INVALID');
  assert.match(mismatch, /ERR_CERT_COMMON_NAME_INVALID/);
  assert.match(mismatch, /certificate does not match/);
  assert.doesNotMatch(mismatch, /Securly|blocked|filter/i);
  const authority = explainLoadError(-202, 'ERR_CERT_AUTHORITY_INVALID');
  assert.match(authority, /ERR_CERT_AUTHORITY_INVALID/);
  assert.doesNotMatch(authority, /COMMON_NAME/);
  assert.equal(explainLoadError(-105, 'ERR_NAME_NOT_RESOLVED'), 'ERR_NAME_NOT_RESOLVED');
  const page = decodeURIComponent(errorPageUrl({ description: mismatch, url: 'https://example.test/?x=<script>', dark: false }));
  assert.match(page, /ERR_CERT_COMMON_NAME_INVALID/);
  assert.doesNotMatch(page, /<script>/);
});
