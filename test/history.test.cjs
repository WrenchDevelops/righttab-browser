const test = require('node:test');
const assert = require('node:assert/strict');
const { suggestHistory } = require('../shared/history.cjs');

test('omnibox history suggestions prefer frequent matching destinations', () => {
  const now = Date.UTC(2026, 10, 8);
  const matches = suggestHistory([
    { url: 'https://app.schoology.com/home', title: 'Schoology', visits: 18, visitedAt: now - 14 * 86400000 },
    { url: 'https://search.example/schoology', title: 'Schoology help', visits: 1, visitedAt: now - 86400000 },
  ], 'scho', 6, now);

  assert.equal(matches[0].url, 'https://app.schoology.com/home');
});

test('omnibox history suggestions match a word within a hostname', () => {
  const matches = suggestHistory([
    { url: 'https://app.schoology.com/home', title: 'Home', visits: 1, visitedAt: Date.now() },
  ], 'scho');

  assert.equal(matches.length, 1);
  assert.equal(matches[0].url, 'https://app.schoology.com/home');
});
