const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createYouTubeJsProvider, countFromText } = require('../electron/youtubejs-provider.cjs');
const id = 'UC' + 'x'.repeat(22);

test('YouTube.js provider merges independent channel and video search by canonical ID', async () => {
  const calls = [];
  const provider = createYouTubeJsProvider({ createClient: async () => ({ search: async (_query, { type }) => {
    calls.push(type);
    if (type === 'channel') return { results: [{ id, author: { name: 'Creator', endpoint: { payload: { canonicalBaseUrl: '/@creator' } } }, video_count: { text: '12.3K subscribers' } }] };
    return { results: [{ video_id: 'v'.repeat(11), title: { text: 'Video' }, author: { id, name: 'Creator' }, view_count: { text: '500K views' }, published: { text: '2 days ago' } }] };
  } }) });
  const updates = [];
  const result = await provider.discover('test', (u) => updates.push(u.records.length));
  assert.deepEqual(calls.sort(), ['channel', 'video']);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].handle, '@creator');
  assert.equal(result.records[0].subscribers, 12300);
  assert.equal(result.records[0].subscribersStatus, 'approximate');
  assert.equal(result.records[0].recentVideos[0].publishedAt, '');
  assert.equal(result.records[0].recentVideos[0].views, 500000);
  assert.deepEqual(result.records[0].discoverySources, ['channel search', 'video search']);
  assert.deepEqual(updates, [1, 1]);
  assert.equal(countFromText('@handle', 'subscribers?'), null);
});

test('continues channel search until the target, deduplicating across pages', async () => {
  const makeId = (letter) => 'UC' + letter.repeat(22);
  const channel = (letter) => ({ id: makeId(letter), author: { name: letter } });
  let nextCalls = 0;
  const first = { results: [channel('a')], has_continuation: true, getContinuation: async () => { nextCalls++; return { results: [channel('a'), channel('b')], has_continuation: false }; } };
  const provider = createYouTubeJsProvider({ createClient: async () => ({ search: async (_q, { type }) => type === 'channel' ? first : { results: [], has_continuation: false } }) });
  const result = await provider.discover('gaming', () => {}, { target: 2, maxPages: 3 });
  assert.equal(nextCalls, 1);
  assert.deepEqual(result.records.map((r) => r.id), [makeId('a'), makeId('b')]);
  assert.deepEqual(result.pages, [2, 1]);
});

test('aborting a search stops the provider and rejects without fallback', async () => {
  const abort = new AbortController();
  const provider = createYouTubeJsProvider({ createClient: async ({ signal }) => ({ search: () => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })) }) });
  const pending = provider.discover('gaming', () => {}, { signal: abort.signal });
  await new Promise(setImmediate);
  abort.abort(new Error('stopped'));
  await assert.rejects(pending, /stopped/);
});
