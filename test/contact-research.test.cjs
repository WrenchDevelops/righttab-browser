const { test } = require('node:test');
const assert = require('node:assert/strict');
const { researchCreator, parsePage, allowedUrl, isPublicAddress } = require('../electron/contact-research.cjs');

test('website research follows only creator-linked host and records public contact source', async () => {
  const visited = [];
  const pages = {
    'https://creator.example/': '<title>Creator</title><a href="/contact">Contact</a><a href="https://evil.example/contact">Other</a>',
    'https://creator.example/contact': '<title>Contact</title><p>Business: hello@creator.example<span>Technical</span></p><form><input type="email"><textarea></textarea></form>',
  };
  const result = await researchCreator({ links: [{ url: 'https://creator.example/' }] }, { fetchPage: async (url) => { visited.push(url); return { url, html: pages[url] }; } });
  assert.deepEqual(visited, ['https://creator.example/', 'https://creator.example/contact']);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].value, 'hello@creator.example');
  assert.equal(result.candidates[0].sourceUrl, 'https://creator.example/contact');
  assert.equal(result.candidates[0].ownershipStatus, 'unverified');
  assert.equal(result.candidates[0].deliverability, 'unknown');
});

test('detects contact forms without submitting and excludes scripts', () => {
  const page = parsePage('<title>Contact</title><script>"hidden@example.com"</script><form><input type="email"><textarea></textarea></form>', 'https://creator.example/contact');
  assert.equal(page.form, true);
  assert.deepEqual(page.emails, []);
});

test('rejects local, credentialed, non-HTTPS and cross-domain URLs and private addresses', () => {
  for (const url of ['http://creator.example', 'https://127.0.0.1/', 'https://localhost/', 'https://x:pass@creator.example/', 'https://creator.example:8443/']) assert.throws(() => allowedUrl(url));
  assert.throws(() => allowedUrl('https://other.example/', 'creator.example'));
  assert.equal(allowedUrl('https://www.creator.example/contact', 'creator.example').hostname, 'www.creator.example');
  for (const ip of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '::1', '::ffff:127.0.0.1']) assert.equal(isPublicAddress(ip), false);
  assert.equal(isPublicAddress('8.8.8.8'), true);
});

test('cancellation stops research before a subsequent page', async () => {
  const controller = new AbortController();
  await assert.rejects(researchCreator({ links: [{ url: 'https://creator.example/' }] }, { signal: controller.signal, fetchPage: async (url) => { controller.abort(new Error('stopped')); return { url, html: '<a href="/contact">Contact</a>' }; } }), /stopped/);
});

test('deep research can examine another creator-linked domain within budget', async () => {
  const record = { links: [{ url: 'https://first.example/' }, { url: 'https://second.example/' }] };
  const pages = { 'https://first.example/': '<title>Home</title>', 'https://second.example/': '<title>Contact</title><a href="mailto:hello@second.example">Email</a>' };
  const fetchPage = async (url) => ({ url, html: pages[url] });
  assert.equal((await researchCreator(record, { fetchPage })).status, 'no-contact-found');
  const deep = await researchCreator(record, { fetchPage, depth: 'deep' });
  assert.equal(deep.domainsVisited, 2);
  assert.equal(deep.candidates[0].value, 'hello@second.example');
  assert.equal(deep.candidates[0].sourceUrl, 'https://second.example/');
});

test('AI may rank extracted addresses but cannot introduce an address', async () => {
  const record = { links: [{ url: 'https://creator.example/contact' }] };
  const fetchPage = async (url) => ({ url, html: '<title>Contact</title><p>Business one@example.org, support two@example.org</p>' });
  const result = await researchCreator(record, { fetchPage, selectEmail: async () => 'invented@example.org' });
  assert.deepEqual(result.candidates.map((item) => item.value), ['one@example.org', 'two@example.org']);
});

test('AI errors do not discard deterministic contacts or hide the warning', async () => {
  const record = { links: [{ url: 'https://creator.example/contact' }] };
  const fetchPage = async (url) => ({ url, html: '<title>Contact</title><p>Business one@example.org, support two@example.org</p>' });
  const result = await researchCreator(record, { fetchPage, selectEmail: async () => { throw new Error('provider offline'); } });
  assert.equal(result.status, 'found');
  assert.equal(result.candidates.length, 2);
  assert.match(result.warnings[0], /provider offline/);
});

test('prioritizes contact links and counts contact pages', async () => {
  const pages = {
    'https://creator.example/': '<a href="/about">About</a><a href="/management">Management</a><a href="/contact">Contact</a>',
    'https://creator.example/contact': '<title>Contact</title><p>hello@creator.example</p>',
  };
  const seen = [];
  const result = await researchCreator({ links: [{ url: 'https://creator.example/' }] }, { fetchPage: async (url) => { seen.push(url); return { url, html: pages[url] }; } });
  assert.deepEqual(seen, ['https://creator.example/', 'https://creator.example/contact']);
  assert.equal(result.contactPagesVisited, 1);
});

test('AI ranking is attributed and preserves all source-extracted alternatives', async () => {
  const record = { links: [{ url: 'https://creator.example/contact' }] };
  const fetchPage = async (url) => ({ url, html: '<title>Contact</title><p>General one@example.org. Partnerships two@example.org.</p>' });
  const result = await researchCreator(record, { fetchPage, selectEmail: async () => 'two@example.org' });
  assert.deepEqual(result.candidates.map((item) => item.value), ['two@example.org', 'one@example.org']);
  assert.equal(result.candidates[0].selectedBy, 'deepseek');
  assert.equal(result.candidates[0].sourceUrl, 'https://creator.example/contact');
});
