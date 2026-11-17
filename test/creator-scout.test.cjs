const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCreatorScout, youtubeContext, platformContext, parseResearchPlan } = require('../electron/creator-scout.cjs');
const { creatorScoutCsv } = require('../shared/creator-scout-csv.cjs');

const idA = 'UC' + 'a'.repeat(22), idB = 'UC' + 'b'.repeat(22), idC = 'UC' + 'c'.repeat(22);
const safeStorage = { isEncryptionAvailable: () => true, encryptString: (value) => Buffer.from(value), decryptString: (value) => value.toString() };
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'creator-scout-test-'));
  const calls = [];
  const fetchImpl = async (url) => {
    const endpoint = url.pathname.split('/').pop();
    calls.push({ endpoint, query: url.searchParams.get('q'), page: url.searchParams.get('pageToken') });
    let body;
    if (endpoint === 'search') body = url.searchParams.get('q') === 'fortnite' ? { items: [
      { id: { kind: 'youtube#video', videoId: 'v'.repeat(11) }, snippet: { channelId: idA, title: 'Fortnite controller setup' } },
      { id: { kind: 'youtube#video', videoId: 'w'.repeat(11) }, snippet: { channelId: idB, title: 'Fortnite beginner guide' } },
      { id: { kind: 'youtube#video', videoId: 'x'.repeat(11) }, snippet: { channelId: idC, title: 'Minecraft survival setup' } },
    ] } : { items: [
      { id: { kind: 'youtube#video', videoId: 'v'.repeat(11) }, snippet: { channelId: idA, title: 'Desk accessories 3D print project' } },
      { id: { kind: 'youtube#channel', channelId: idA }, snippet: { channelId: idA, title: 'Creator A' } },
      { id: { kind: 'youtube#channel', channelId: idB }, snippet: { channelId: idB, title: 'Desk accessories creator' } },
    ] };
    else if (endpoint === 'channels') body = { items: (url.searchParams.get('id') || '').split(',').filter(Boolean).map((id) => ({ id, snippet: { title: id === idA ? 'Creator A' : 'Creator B', description: 'https://creator.example/contact', customUrl: '@creator' }, statistics: { subscriberCount: '1234', viewCount: '5000', videoCount: '7' }, contentDetails: { relatedPlaylists: { uploads: 'UU' + id.slice(2) } } })) };
    else if (endpoint === 'playlistItems') body = { items: [{ snippet: { resourceId: { videoId: 'v'.repeat(11) } } }] };
    else if (endpoint === 'videos') body = { items: [{ id: 'v'.repeat(11), snippet: { title: 'Recent upload', publishedAt: '2026-11-01T00:00:00Z', channelId: idA }, statistics: { viewCount: '90' } }] };
    else throw new Error(endpoint);
    return { ok: true, json: async () => body };
  };
  const scout = createCreatorScout({ dir, safeStorage, fetchImpl });
  scout.setKey('test-key');
  return { dir, scout, calls, fetchImpl };
}

test('YouTube context recognizes only supported video and channel URLs', () => {
  assert.deepEqual(youtubeContext(`https://youtube.com/channel/${idA}`), { kind: 'channel', id: idA });
  assert.deepEqual(youtubeContext('https://www.youtube.com/watch?v=' + 'v'.repeat(11)), { kind: 'video', id: 'v'.repeat(11) });
  assert.deepEqual(youtubeContext('https://www.youtube.com/results?search_query=fortnite'), { kind: 'search', query: 'fortnite' });
  assert.deepEqual(youtubeContext('https://www.youtube.com/shorts/' + 'v'.repeat(11)), { kind: 'video', id: 'v'.repeat(11) });
  assert.equal(youtubeContext('https://youtube.com.evil.example/watch?v=' + 'v'.repeat(11)), null);
});

test('page context and refinements retain Fortnite creator intent instead of searching literal filter words', () => {
  const context = platformContext('https://www.youtube.com/results?search_query=fortnite');
  const initial = parseResearchPlan('find me creators', {}, context, Date.parse('2026-11-06T00:00:00Z'));
  assert.equal(initial.topic, 'fortnite');
  assert.equal(initial.output, 'creators');
  const refined = parseResearchPlan('Ones that have over 10k subs and have made a video in the last 2 weeks with 300k views minimum', initial, context, Date.parse('2026-11-06T00:00:00Z'));
  assert.equal(refined.topic, 'fortnite');
  assert.equal(refined.output, 'creators');
  assert.equal(refined.filters.minSubscribers, 10000);
  assert.equal(refined.filters.minVideoViews, 300000);
  assert.equal(refined.filters.publishedAfter, Date.parse('2026-10-23T00:00:00Z'));
  assert.equal(platformContext('https://www.tiktok.com/tag/fortnite').platform, 'tiktok');
  const typo = parseResearchPlan('find creators abouve 10k subs and have had 500k views on a video in the last 2 weeks', {}, context, Date.parse('2026-11-06T00:00:00Z'));
  assert.equal(typo.topic, 'fortnite');
  assert.equal(typo.filters.minSubscribers, 10000);
  assert.equal(typo.filters.minVideoViews, 500000);
});

test('strict creator refinement requires one same-video recent and view-qualified topic match', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'creator-scout-strict-'));
  const today = new Date('2026-11-06T12:00:00Z');
  const ids = [idA, idB, idC];
  const videos = ['a'.repeat(11), 'b'.repeat(11), 'c'.repeat(11)];
  const fetchImpl = async (url) => {
    const endpoint = url.pathname.split('/').pop();
    if (endpoint === 'search') return { ok: true, json: async () => ({ items: videos.map((id) => ({ id: { videoId: id } })) }) };
    if (endpoint === 'videos') return { ok: true, json: async () => ({ items: videos.map((id, i) => ({ id, snippet: { title: i === 2 ? '#fortnite unrelated mention' : 'Fortnite competitive guide', description: i === 2 ? 'Unrelated game #fortnite' : 'Fortnite guide', channelId: ids[i], channelTitle: `Channel ${i}`, publishedAt: i === 1 ? '2026-10-01T00:00:00Z' : '2026-11-02T00:00:00Z' }, statistics: { viewCount: i === 0 ? '400000' : i === 1 ? '900000' : '500000' }, contentDetails: { duration: 'PT10M' } })) }) };
    if (endpoint === 'channels') return { ok: true, json: async () => ({ items: ids.map((id) => ({ id, snippet: { title: id, description: '' }, statistics: { subscriberCount: '20000' }, contentDetails: {} })) }) };
    throw new Error(endpoint);
  };
  const scout = createCreatorScout({ dir, safeStorage, fetchImpl, now: () => today });
  scout.setKey('test-key');
  const result = await scout.runConversation({ message: 'Find Fortnite creators over 10k subscribers with a video in the last 2 weeks with 300k views minimum', context: { platform: 'youtube' } });
  assert.deepEqual(result.records.map((record) => record.id), [idA]);
  assert.equal(result.records[0].matchedVideo.id, videos[0]);
});

test('search deduplicates video and channel hits and reuses cached queries', async () => {
  const { scout, calls } = fixture();
  const first = await scout.search('desk accessories', 10);
  assert.equal(first.records.length, 2);
  assert.equal(first.records[0].matchedVideo.title, 'Desk accessories 3D print project');
  assert.equal(first.records[0].source, 'YouTube Data API v3');
  assert.equal(scout.state().searchCallsToday, 1);
  const second = await scout.search('desk accessories', 10);
  assert.equal(second.cached, true);
  assert.equal(calls.filter((call) => call.endpoint === 'search').length, 1);
});

test('topic search excludes channels without matching public metadata', async () => {
  const { scout, calls } = fixture();
  const result = await scout.search('fortnite', 10);
  assert.deepEqual(result.records.map((record) => record.id).sort(), [idA, idB].sort());
  assert.equal(result.records.some((record) => record.id === idC), false);
  assert.equal(calls.find((call) => call.endpoint === 'search').query, 'fortnite');
});

test('search stops paging after enough relevant channels', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'creator-scout-pages-'));
  let searchCalls = 0;
  const fetchImpl = async (url) => {
    const endpoint = url.pathname.split('/').pop();
    if (endpoint === 'search') {
      searchCalls++;
      return { ok: true, json: async () => ({ nextPageToken: 'another-page', items: [idA, idB].map((id, index) => ({ id: { videoId: `${index}`.repeat(11) }, snippet: { channelId: id, title: 'Fortnite gameplay' } })) }) };
    }
    if (endpoint === 'channels') {
      return { ok: true, json: async () => ({ items: [idA, idB].map((id) => ({ id, snippet: { title: 'Gaming creator', description: '' }, statistics: {} })) }) };
    }
    throw new Error(endpoint);
  };
  const scout = createCreatorScout({ dir, safeStorage, fetchImpl });
  scout.setKey('test-key');
  const result = await scout.search('fortnite', 2);
  assert.equal(result.records.length, 2);
  assert.equal(result.searchCalls, 1);
  assert.equal(searchCalls, 1);
});

test('inspect uses uploads and videos once, counts one lookup, and survives restart', async () => {
  const { scout, calls, dir, fetchImpl } = fixture();
  const [first, concurrent] = await Promise.all([scout.inspect(idA), scout.inspect(idA)]);
  assert.equal(first.recentVideos[0].views, 90);
  assert.equal(first.id, concurrent.id);
  assert.equal(scout.state().used, 1);
  assert.equal(calls.filter((call) => call.endpoint === 'playlistItems').length, 1);
  const list = scout.createList('KAPO keycaps').lists[0];
  scout.save(first, { listId: list.id, notes: 'Possible collaborator', outreach: 'researching' });
  const reopened = createCreatorScout({ dir, safeStorage, fetchImpl });
  assert.equal(reopened.state().saved[idA].notes, 'Possible collaborator');
  assert.equal(reopened.state().saved[idA].listId, list.id);
  assert.equal((await reopened.inspect(idA)).cached, true);
  reopened.remove(idA);
  assert.equal(Object.keys(reopened.state().saved).length, 0);
  reopened.deleteList(list.id);
  assert.equal(reopened.state().lists.length, 0);
});

test('monthly cap stops enrichment before an API call', async () => {
  const { dir, fetchImpl } = fixture();
  const file = path.join(dir, 'creator-scout.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  data.usage[new Date().toISOString().slice(0, 7)] = 750;
  fs.writeFileSync(file, JSON.stringify(data));
  let calls = 0;
  const scout = createCreatorScout({ dir, safeStorage, fetchImpl: (...args) => { calls++; return fetchImpl(...args); } });
  await assert.rejects(scout.inspect(idA), /750 creator lookup limit/);
  assert.equal(calls, 0);
});

test('saved API metadata expires while user notes remain', async () => {
  const { dir, scout, fetchImpl } = fixture();
  const record = await scout.inspect(idA);
  scout.save(record, { notes: 'Keep my note' });
  const file = path.join(dir, 'creator-scout.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  data.saved[idA].record.refreshedAt = '2020-01-01T00:00:00Z';
  fs.writeFileSync(file, JSON.stringify(data));
  const reopened = createCreatorScout({ dir, safeStorage, fetchImpl });
  const saved = reopened.state().saved[idA];
  assert.equal(saved.notes, 'Keep my note');
  assert.equal(saved.record.expired, true);
  assert.equal(saved.record.description, '');
  assert.equal(saved.record.subscribers, undefined);
});

test('saved records must come from an API result already seen by the connector', () => {
  const { scout } = fixture();
  assert.throws(() => scout.save({ id: idA, name: 'Invented creator' }), /Search or inspect/);
});

test('contact route keeps the page source and distinguishes manual confirmation', async () => {
  const { scout } = fixture();
  const record = await scout.inspect(idA);
  scout.save(record, { contact: { type: 'public email', value: 'hello@creator.example', sourceUrl: 'https://creator.example/contact', sourceTitle: 'Contact' } });
  assert.deepEqual(scout.state().saved[idA].contact, { type: 'public email', value: 'hello@creator.example', sourceUrl: 'https://creator.example/contact', sourceTitle: 'Contact', status: 'found' });
  scout.save(record, { contact: { type: 'manual YouTube email', value: 'business@example.com', sourceUrl: record.url, sourceTitle: 'About' } });
  assert.equal(scout.state().saved[idA].contact.status, 'user-confirmed');
});

test('CSV preview contains only selected saved creators and escapes spreadsheet formulas', async () => {
  const { scout } = fixture();
  const results = await scout.search('desk accessories', 10);
  scout.save(results.records[0], { notes: '=HYPERLINK("bad")' });
  scout.save(results.records[1], { notes: 'Other creator' });
  const csv = creatorScoutCsv(scout.state(), [idA], ['Channel','Notes','Data source']);
  assert.match(csv, /Creator A/);
  assert.doesNotMatch(csv, /Creator B/);
  assert.match(csv, /'\=HYPERLINK/);
  assert.match(csv, /YouTube Data API v3/);
  assert.throws(() => creatorScoutCsv(scout.state(), []), /Select saved/);
});

test('video research maps public fields, preserves unavailable values, and saves an attributed reference', async () => {
  const { scout } = fixture();
  const results = await scout.searchVideos('desk accessories', { limit: 10, order: 'date' });
  assert.equal(results.records.length, 1);
  const video = results.records[0];
  assert.equal(video.id, 'v'.repeat(11));
  assert.equal(video.views, 90);
  assert.equal(video.likes, null);
  assert.equal(video.comments, null);
  assert.equal(video.url, `https://www.youtube.com/watch?v=${'v'.repeat(11)}`);
  const board = scout.createBoard('Thumbnail ideas').boards[0];
  scout.saveVideoReference(video, board.id);
  assert.equal(scout.state().videoReferences[video.id].boardId, board.id);
  assert.equal(scout.state().videoReferences[video.id].record.source, 'YouTube Data API v3');
});

test('private analytics remain explicitly gated without OAuth credentials', () => {
  const { scout } = fixture();
  assert.equal(scout.analyticsStatus().connected, false);
  assert.throws(() => scout.analyticsQuery(), /authorized OAuth backend/);
});

test('channel records classify creator-published contact and social links without inventing email', async () => {
  const { scout } = fixture();
  const record = await scout.inspect(idA);
  assert.equal(record.contacts.email, null);
  assert.equal(record.contacts.website.url, 'https://creator.example/contact');
  assert.equal(record.contacts.contactPage.url, 'https://creator.example/contact');
  assert.equal(record.contacts.status, 'checked-links-found');
});

test('125 video results retain discovered channel IDs, apply the range and save qualified creators', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'creator-scout-125-'));
  const now = new Date('2026-11-09T12:00:00Z');
  const ids = Array.from({ length: 125 }, (_, i) => String(i).padStart(11, '0'));
  const fetchImpl = async (url) => {
    const endpoint = url.pathname.split('/').pop();
    if (endpoint === 'search') {
      const offset = Number(url.searchParams.get('pageToken') || 0);
      const page = ids.slice(offset, offset + 50);
      return { ok: true, json: async () => ({ nextPageToken: offset + 50 < ids.length ? String(offset + 50) : undefined, items: page.map((id, index) => ({ id: { videoId: id }, snippet: { channelId: index % 2 ? idB : idA } })) }) };
    }
    if (endpoint === 'videos') return { ok: true, json: async () => ({ items: url.searchParams.get('id').split(',').map((id) => ({ id, snippet: { title: 'Gaming guide', publishedAt: '2026-11-08T00:00:00Z' }, statistics: { viewCount: id === ids[0] ? '600000' : '100' } })) }) };
    if (endpoint === 'channels') return { ok: true, json: async () => ({ items: url.searchParams.get('id').split(',').map((id) => ({ id, snippet: { title: 'Gaming creator' }, statistics: { subscriberCount: '20000' } })) }) };
    throw new Error(endpoint);
  };
  const scout = createCreatorScout({ dir, safeStorage, fetchImpl, now: () => now });
  scout.setKey('key');
  const updates = [];
  const result = await scout.runConversation({ message: 'Find 25 gaming YouTubers with 10K–1M subscribers who have posted a video with over 500K views in the last 14 days', context: { platform: 'youtube' } }, (update) => updates.push(update));
  assert.equal(updates[0].progress.pages, 1);
  assert.equal(updates[0].records[0].id, idA);
  assert.ok(updates.length >= 3);
  assert.equal(result.plan.topic, 'gaming');
  assert.equal(result.plan.filters.minSubscribers, 10000);
  assert.equal(result.plan.filters.maxSubscribers, 1000000);
  assert.equal(result.progress.videosChecked, 125);
  assert.equal(result.progress.channelsDiscovered, 2);
  assert.equal(result.progress.channelsChecked, 1);
  assert.equal(result.progress.channelsWithQualifyingVideos, 1);
  assert.equal(result.records[0].id, idA);
  assert.equal(result.records[0].matchedVideo.views, 600000);
  scout.save(result.records[0], { notes: 'Follow up' });
  assert.equal(scout.state().saved[idA].notes, 'Follow up');
});

test('missing YouTube channel statistics remain unknown', () => {
  const { channelRecord } = require('../electron/creator-scout.cjs');
  const record = channelRecord({ id: idA, statistics: { subscriberCount: null, viewCount: '', videoCount: undefined } });
  assert.equal(record.subscribers, null);
  assert.equal(record.views, null);
  assert.equal(record.videoCount, null);
});

test('YouTube.js discovery retains unverified candidates without a key and can save them', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'creator-scout-youtubejs-'));
  const record = { id: idA, name: 'Gaming', url: `https://www.youtube.com/channel/${idA}`, subscribers: null, recentVideos: [], qualification: { status: 'needs-verification' } };
  const youtubeProvider = { discover: async (_q, progress) => { progress({ records: [record], videosScanned: 1 }); return { records: [record], videosScanned: 1, failures: [] }; } };
  const scout = createCreatorScout({ dir, safeStorage, youtubeProvider });
  const updates = [];
  const result = await scout.runConversation({ message: 'Find gaming creators with 10K–1M subscribers and 500K views in the last 14 days' }, (value) => updates.push(value));
  assert.equal(result.records[0].qualification.status, 'needs-verification');
  assert.match(result.coverage, /add a YouTube Data API key/i);
  assert.equal(updates.length, 1);
  scout.save(record, { notes: 'test' });
  assert.equal(scout.state().saved[idA].notes, 'test');
});

test('YouTube.js failure falls back to YouTube Data API when configured', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'creator-scout-fallback-'));
  const youtubeProvider = { discover: async () => { throw new Error('provider offline'); } };
  const fetchImpl = async (url) => ({ ok: true, json: async () => url.pathname.endsWith('/search') ? { items: [] } : { items: [] } });
  const scout = createCreatorScout({ dir, safeStorage, fetchImpl, youtubeProvider });
  scout.setKey('key');
  const result = await scout.runConversation({ message: 'Find gaming creators' });
  assert.match(result.coverage, /provider offline.*using YouTube Data API/);
  assert.equal(result.source, 'YouTube Data API v3');
});

test('public email in channel description retains source and is not marked verified', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'creator-scout-contact-'));
  const fetchImpl = async (url) => ({ ok: true, json: async () => url.pathname.endsWith('/search') ? { items: [{ id: { channelId: idA }, snippet: { channelId: idA, title: 'Gaming creator' } }] } : { items: [{ id: idA, snippet: { title: 'Gaming creator', description: 'Business: hello@example.org' }, statistics: {} }] } });
  const scout = createCreatorScout({ dir, safeStorage, fetchImpl });
  scout.setKey('key');
  const result = await scout.search('gaming');
  assert.equal(result.records[0].contacts.email.value, 'hello@example.org');
  assert.equal(result.records[0].contacts.email.sourceUrl, `https://www.youtube.com/channel/${idA}`);
  assert.equal(result.records[0].contacts.email.status, 'unverified');
});

test('cancelling strict search aborts an in-flight Data API request', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'creator-scout-cancel-'));
  const fetchImpl = (_url, { signal }) => new Promise((_resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  const scout = createCreatorScout({ dir, safeStorage, fetchImpl });
  scout.setKey('key');
  const controller = new AbortController();
  const task = scout.runConversation({ message: 'Find gaming creators over 10k subscribers' }, null, controller.signal);
  await new Promise(setImmediate);
  controller.abort(new Error('cancelled by user'));
  await assert.rejects(task, /cancelled by user/);
});

test('contact search target counts only qualified creators with a creator-published business email', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-contact-target-'));
  const videoIds = ['a'.repeat(11), 'b'.repeat(11)];
  const calls = [];
  const fetchImpl = async (url) => {
    const endpoint = url.pathname.split('/').pop();
    if (endpoint === 'search') {
      const second = url.searchParams.get('pageToken') === 'next';
      calls.push(second ? 2 : 1);
      return { ok: true, json: async () => ({ nextPageToken: second ? undefined : 'next', items: [{ id: { videoId: videoIds[second ? 1 : 0] }, snippet: { channelId: second ? idB : idA } }] }) };
    }
    if (endpoint === 'videos') return { ok: true, json: async () => ({ items: url.searchParams.get('id').split(',').map((id) => ({ id, snippet: { channelId: id === videoIds[0] ? idA : idB, title: 'Fortnite guide', description: '', publishedAt: '2026-11-08T00:00:00Z' }, statistics: { viewCount: '600000' } })) }) };
    if (endpoint === 'channels') return { ok: true, json: async () => ({ items: url.searchParams.get('id').split(',').map((id) => ({ id, snippet: { title: 'Fortnite creator', description: id === idB ? 'Business inquiries: creator@example.com' : 'No contact listed' }, statistics: { subscriberCount: '20000' } })) }) };
    throw new Error(endpoint);
  };
  const scout = createCreatorScout({ dir, safeStorage, fetchImpl, now: () => new Date('2026-11-09T12:00:00Z') });
  scout.setKey('key');
  const result = await scout.runConversation({ message: 'Find 1 Fortnite YouTubers with 10K–1M subscribers, 500K views in the last 14 days and a public business contact' });
  assert.equal(result.plan.topic.toLowerCase(), 'fortnite');
  assert.equal(result.plan.targetCount, 1);
  assert.equal(result.plan.filters.requireContact, true);
  assert.deepEqual(calls, [1, 2]);
  assert.equal(result.progress.qualified, 2);
  assert.equal(result.progress.contactable, 1);
  assert.deepEqual(result.records.map((record) => record.id), [idB]);
  assert.equal(result.records[0].bestContact.value, 'creator@example.com');
  assert.equal(result.records[0].bestContact.sourceUrl, `https://www.youtube.com/channel/${idB}`);
  assert.equal(result.records[0].bestContact.deliverability, 'unverified');
  scout.save(result.records[0], { notes: 'Keep me' });
  scout.save(result.records[0]);
  assert.equal(scout.state().saved[idB].notes, 'Keep me');
  let saved = scout.outreachDraft(idB).saved[idB];
  assert.equal(saved.draft.to, 'creator@example.com');
  assert.match(saved.draft.body, /Fortnite guide/);
  saved = scout.outreachDraft(idB, { to: saved.draft.to, subject: 'Edited', body: 'My draft' }).saved[idB];
  assert.equal(saved.draft.subject, 'Edited');
  scout.save(result.records[0]);
  assert.equal(scout.state().saved[idB].draft.body, 'My draft');
  assert.equal(scout.state().saved[idB].notes, 'Keep me');
});

test('rounded subscriber counts overlapping a boundary require verification', () => {
  const { subscriberQualification } = require('../electron/creator-scout.cjs');
  assert.equal(subscriberQualification(1000000, 10000, 1000000), 'needs-verification');
  assert.equal(subscriberQualification(999000, 10000, 1000000), 'qualified');
  assert.equal(subscriberQualification(9990, 10000, 1000000), 'rejected');
  assert.equal(subscriberQualification(null, 10000, 1000000), 'needs-verification');
});

test('full contact-focused prompt overrides an earlier niche and retains thresholds', () => {
  const plan = parseResearchPlan('Find 25 Fortnite creators with 10K–1M subscribers, a video with 500K+ views in the last 14 days, and a publicly available business contact.', { topic: '3d printing' }, null, Date.parse('2026-11-09T00:00:00Z'));
  assert.equal(plan.topic.toLowerCase(), 'fortnite');
  assert.equal(plan.targetCount, 25);
  assert.equal(plan.filters.minSubscribers, 10000);
  assert.equal(plan.filters.maxSubscribers, 1000000);
  assert.equal(plan.filters.minVideoViews, 500000);
  assert.equal(plan.filters.requireContact, true);
  assert.equal(plan.filters.publishedAfter, Date.parse('2026-10-26T00:00:00Z'));
});

test('qualified creators use website contact research and retain its source in the CRM', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-website-contact-'));
  const fetchImpl = async (url) => {
    const endpoint = url.pathname.split('/').pop();
    const body = endpoint === 'search' ? { items: [{ id: { videoId: 'v'.repeat(11) }, snippet: { channelId: idA } }] }
      : endpoint === 'videos' ? { items: [{ id: 'v'.repeat(11), snippet: { channelId: idA, title: 'Fortnite guide', publishedAt: '2026-11-08T00:00:00Z' }, statistics: { viewCount: '700000' } }] }
      : { items: [{ id: idA, snippet: { title: 'Fortnite Creator', description: 'https://creator.example/' }, statistics: { subscriberCount: '30000' } }] };
    return { ok: true, json: async () => body };
  };
  let researchCalls = 0;
  const contactResearch = async () => { researchCalls++; return { status: 'found', pagesVisited: 2, candidates: [{ type: 'contact_form', value: 'https://creator.example/contact', sourceUrl: 'https://creator.example/contact', ownershipStatus: 'unverified', deliverability: 'unknown' }] }; };
  const scout = createCreatorScout({ dir, safeStorage, fetchImpl, contactResearch, now: () => new Date('2026-11-09T12:00:00Z') });
  scout.setKey('key');
  const result = await scout.runConversation({ message: 'Find 1 Fortnite YouTubers with 10K–1M subscribers and 500K views in the last 14 days and a public business contact' });
  assert.equal(researchCalls, 1);
  assert.equal(result.records[0].bestContact.type, 'contact_form');
  assert.equal(result.records[0].bestContact.sourceUrl, 'https://creator.example/contact');
  scout.save(result.records[0]);
  assert.equal(scout.state().saved[idA].record.bestContact.sourceUrl, 'https://creator.example/contact');
  assert.equal(scout.outreachDraft(idA).saved[idA].draft.to, '');
  scout.save(result.records[0], { notes: 'Keep note', contact: { type: 'manual email', value: 'manual@example.org' } });
  await scout.researchContact(idA);
  assert.equal(scout.state().saved[idA].contact.value, 'manual@example.org');
  assert.equal(scout.state().saved[idA].notes, 'Keep note');
});

test('DeepSeek is disabled by default and key is not returned in state', () => {
  const { scout } = fixture();
  assert.equal(scout.state().deepseek.enabled, false);
  assert.throws(() => scout.setDeepSeek({ enabled: true }), /API key/);
  const enabled = scout.setDeepSeek({ key: 'secret-for-test', enabled: true });
  assert.equal(enabled.deepseek.enabled, true);
  assert.equal(enabled.deepseek.configured, true);
  assert.doesNotMatch(JSON.stringify(enabled), /secret-for-test/);
  const disabled = scout.setDeepSeek({ enabled: false });
  assert.equal(disabled.deepseek.enabled, false);
  assert.equal(disabled.deepseek.configured, true);
  assert.equal(scout.setDeepSeek({ clear: true }).deepseek.configured, false);
});

test('standard search proceeds beyond three pages and diversifies within its call budget', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-diversified-'));
  const queries = [];
  const fetchImpl = async (url) => {
    const endpoint = url.pathname.split('/').pop();
    if (endpoint === 'search') {
      const query = url.searchParams.get('q'); queries.push(query);
      const id = String(queries.length).padStart(11, '0');
      return { ok: true, json: async () => ({ nextPageToken: `page-${queries.length}`, items: [{ id: { videoId: id }, snippet: { channelId: idA } }] }) };
    }
    if (endpoint === 'videos') return { ok: true, json: async () => ({ items: url.searchParams.get('id').split(',').map((id) => ({ id, snippet: { channelId: idA, title: 'Fortnite match', publishedAt: '2026-11-08T00:00:00Z' }, statistics: { viewCount: '100' } })) }) };
    throw new Error(endpoint);
  };
  const scout = createCreatorScout({ dir, safeStorage, fetchImpl, now: () => new Date('2026-11-09T12:00:00Z') });
  scout.setKey('key');
  const result = await scout.runConversation({ message: 'Find 25 Fortnite creators with 10K–1M subscribers and 500K views in the last 14 days and a public business contact', limit: 25 });
  assert.equal(result.progress.searchCalls, 6);
  assert.equal(result.progress.videosChecked, 6);
  assert.ok(queries.some((query) => /gameplay/i.test(query)));
  assert.equal(result.progress.stopReason, '6-page search limit reached');
  assert.equal(result.progress.contactable, 0);
});

test('video metadata cache reuses fresh responses without exposing mutable cache objects', async () => {
  const { scout, calls } = fixture();
  const [first] = await scout.fetchVideos(['v'.repeat(11)]);
  first.channelId = 'mutated';
  const [second] = await scout.fetchVideos(['v'.repeat(11)]);
  assert.equal(second.channelId, idA);
  assert.equal(calls.filter((call) => call.endpoint === 'videos').length, 1);
});

test('OpenRouter settings are separate, encrypted through safeStorage, and not returned in state', () => {
  const { scout, dir, fetchImpl } = fixture();
  assert.equal(scout.state().openrouter.enabled, false);
  assert.throws(() => scout.setOpenRouter({ enabled: true }), /OpenRouter key/);
  const state = scout.setOpenRouter({ key: 'fixture-openrouter-key', enabled: true });
  assert.equal(state.openrouter.enabled, true);
  assert.doesNotMatch(JSON.stringify(state), /fixture-openrouter-key/);
  assert.doesNotMatch(fs.readFileSync(path.join(dir, 'openrouter-credentials.json'), 'utf8'), /fixture-openrouter-key/);
  const reopened = createCreatorScout({ dir, safeStorage, fetchImpl });
  assert.equal(reopened.state().openrouter.enabled, true);
  assert.equal(reopened.setOpenRouter({ clear: true }).openrouter.configured, false);
});

test('channel-first discovery verifies recent uploads and contributes an exclusive creator', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-channel-first-'));
  const vid = 'c'.repeat(11);
  const youtubeProvider = { discover: async () => ({ records: [{ id: idB, discoverySources: ['channel search'] }], videosScanned: 0, failures: [] }) };
  const fetchImpl = async (url) => {
    const ep = url.pathname.split('/').pop();
    const body = ep === 'search' ? { items: [] }
      : ep === 'channels' ? { items: [{ id: idB, snippet: { title: 'Fortnite Creator', description: 'Business: creator@example.com' }, statistics: { subscriberCount: '20000' }, contentDetails: { relatedPlaylists: { uploads: 'UU' + 'b'.repeat(22) } } }] }
      : ep === 'playlistItems' ? { items: [{ snippet: { resourceId: { videoId: vid } } }] }
      : ep === 'videos' ? { items: [{ id: vid, snippet: { channelId: idB, title: 'Fortnite guide', publishedAt: '2026-11-08T00:00:00Z' }, statistics: { viewCount: '600000' } }] }
      : null;
    if (!body) throw new Error(ep);
    return { ok: true, json: async () => body };
  };
  const scout = createCreatorScout({ dir, safeStorage, fetchImpl, youtubeProvider, now: () => new Date('2026-11-09T12:00:00Z') }); scout.setKey('key');
  const result = await scout.runConversation({ message: 'Find 1 Fortnite YouTuber with 10K–1M subscribers, 500K views in the last 14 days and a business email', limit: 25 });
  assert.equal(result.progress.channelFirstExclusive, 1);
  assert.equal(result.progress.channelFirstQualified, 1);
  assert.equal(result.records[0].id, idB);
  assert.equal(result.records[0].matchedVideo.channelId, idB);
});

test('video discovery continues while a qualified creator contact check is pending', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-overlap-'));
  const ids = ['a'.repeat(11), 'b'.repeat(11)]; let page = 0, pendingContact = false, overlapped = false, release;
  const held = new Promise((resolve) => { release = resolve; });
  const contactResearch = async (record) => {
    if (record.id === idA) { pendingContact = true; await held; }
    return { status: 'found', candidates: [{ type: 'public_email', value: 'business@example.org', sourceUrl: 'https://creator.example/contact' }] };
  };
  const fetchImpl = async (url) => {
    const ep = url.pathname.split('/').pop();
    if (ep === 'search') {
      page++; if (page === 2) { overlapped = pendingContact; release(); }
      return { ok: true, json: async () => ({ nextPageToken: page === 1 ? 'next' : undefined, items: [{ id: { videoId: ids[page - 1] }, snippet: { channelId: page === 1 ? idA : idB } }] }) };
    }
    if (ep === 'videos') return { ok: true, json: async () => ({ items: url.searchParams.get('id').split(',').map((id) => ({ id, snippet: { channelId: id === ids[0] ? idA : idB, title: 'Fortnite guide', publishedAt: '2026-11-08T00:00:00Z' }, statistics: { viewCount: '600000' } })) }) };
    if (ep === 'channels') return { ok: true, json: async () => ({ items: url.searchParams.get('id').split(',').map((id) => ({ id, snippet: { title: 'Fortnite', description: 'https://creator.example/' }, statistics: { subscriberCount: '20000' } })) }) };
    throw new Error(ep);
  };
  const scout = createCreatorScout({ dir, safeStorage, fetchImpl, contactResearch, now: () => new Date('2026-11-09T12:00:00Z') }); scout.setKey('key');
  const result = await scout.runConversation({ message: 'Find 2 Fortnite creators with 10K–1M subscribers, 500K views in the last 14 days and a public contact', limit: 10 });
  assert.equal(overlapped, true);
  assert.equal(result.progress.contactable, 2);
});

test('business-email-only targets exclude contact forms while general contact targets include them', async () => {
  const makeScout = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-contact-modes-'));
    const fetchImpl = async (url) => {
      const ep = url.pathname.split('/').pop();
      const body = ep === 'search' ? { items: [{ id: { videoId: 'v'.repeat(11) }, snippet: { channelId: idA } }] }
        : ep === 'videos' ? { items: [{ id: 'v'.repeat(11), snippet: { channelId: idA, title: 'Fortnite guide', publishedAt: '2026-11-08T00:00:00Z' }, statistics: { viewCount: '600000' } }] }
        : { items: [{ id: idA, snippet: { title: 'Fortnite', description: 'https://creator.example/' }, statistics: { subscriberCount: '20000' } }] };
      return { ok: true, json: async () => body };
    };
    const contactResearch = async () => ({ status: 'found', candidates: [{ type: 'contact_form', value: 'https://creator.example/contact', sourceUrl: 'https://creator.example/contact' }] });
    const scout = createCreatorScout({ dir, safeStorage, fetchImpl, contactResearch, now: () => new Date('2026-11-09T12:00:00Z') }); scout.setKey('key'); return scout;
  };
  const prompt = 'Find 1 Fortnite creator with 10K–1M subscribers, 500K views in the last 14 days and a public contact';
  const email = await makeScout().runConversation({ message: prompt, limit: 10, contactMode: 'email' });
  assert.equal(email.records.length, 0);
  assert.equal(email.progress.generallyContactable, 1);
  assert.equal(email.progress.emailContactable, 0);
  const any = await makeScout().runConversation({ message: prompt, limit: 10, contactMode: 'any' });
  assert.equal(any.records.length, 1);
  assert.equal(any.records[0].bestContact.type, 'contact_form');
});
