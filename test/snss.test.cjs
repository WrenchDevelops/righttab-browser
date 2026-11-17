const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSnss, buildSampleSession } = require('../shared/snss.cjs');

test('a Chrome session command round-trips the open tab URL and title', () => {
  const buffer = buildSampleSession({ url: 'https://example.com/tab', title: 'Open tab' });
  const parsed = parseSnss(buffer);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.method, 'snss');
  assert.equal(parsed.windows[0].tabs[0].url, 'https://example.com/tab');
  assert.equal(parsed.windows[0].tabs[0].title, 'Open tab');
});

test('URL scanning recovers pages when the command stream is truncated', () => {
  const buffer = Buffer.concat([
    Buffer.from('SNSS'),
    Buffer.from([1, 0, 0, 0]),
    Buffer.from('noise https://example.com/recovered more'),
  ]);
  const parsed = parseSnss(buffer);
  assert.equal(parsed.method, 'url-scan');
  assert.equal(parsed.windows[0].tabs[0].url, 'https://example.com/recovered');
});
