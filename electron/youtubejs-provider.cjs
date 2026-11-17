// Unauthenticated YouTube.js provider. Never supplies browser cookies or API keys.
const CHANNEL = /^UC[\w-]{22}$/;
const VIDEO = /^[\w-]{11}$/;
function countFromText(text, suffix) {
  const m = String(text || '').match(new RegExp(`([\\d,.]+)\\s*([KMB])?\\s+${suffix}\\b`, 'i'));
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) ? Math.round(n * ({ k: 1e3, m: 1e6, b: 1e9 }[(m[2] || '').toLowerCase()] || 1)) : null;
}
function createYouTubeJsProvider({ createClient } = {}) {
  let clientPromise;
  async function makeClient(signal) {
    if (createClient) return createClient({ signal });
    const { Innertube } = await import('youtubei.js');
    return Innertube.create({ generate_session_locally: true, fetch: (input, init = {}) => {
      const signals = [init.signal, signal, AbortSignal.timeout(12000)].filter(Boolean);
      return fetch(input, { ...init, signal: AbortSignal.any(signals) });
    } });
  }
  async function client() {
    if (!clientPromise) clientPromise = makeClient().catch((error) => { clientPromise = null; throw error; });
    return clientPromise;
  }
  async function discover(query, onProgress = () => {}, options = {}) {
    const signal = options.signal;
    signal?.throwIfAborted();
    // Per-search client binds all provider network requests to this search's signal.
    const yt = signal ? await makeClient(signal) : await client();
    signal?.throwIfAborted();
    const seen = new Map();
    const stamp = new Date().toISOString();
    let videosScanned = 0;
    const toRecord = (id, name, handle = '', description = '', subscribers = null, image = '') => ({
      id, platform: 'youtube', name: name || '', handle, url: `https://www.youtube.com/channel/${id}`,
      source: 'YouTube.js (public search)', refreshedAt: stamp, description, image: image.startsWith('//') ? `https:${image}` : image,
      subscribers, subscribersStatus: subscribers == null ? 'unknown' : 'approximate', views: null, videoCount: null,
      links: [], recentVideos: [], contacts: { status: 'not-checked' }, discoverySources: [], qualification: { status: 'needs-verification', reason: 'Search metadata is incomplete or approximate.' },
    });
    const add = (id, data, source, video = null) => {
      if (!CHANNEL.test(id || '')) return;
      let record = seen.get(id);
      if (!record) { record = toRecord(id, data.name, data.handle, data.description, data.subscribers, data.image); seen.set(id, record); }
      if (!record.name && data.name) record.name = data.name;
      if (!record.handle && data.handle) record.handle = data.handle;
      if (record.subscribers == null && data.subscribers != null) { record.subscribers = data.subscribers; record.subscribersStatus = 'approximate'; }
      if (!record.discoverySources.includes(source)) record.discoverySources.push(source);
      if (video && !record.recentVideos.some((v) => v.id === video.id)) record.recentVideos.push(video);
    };
    // Channel and video paths each retain their own continuation state.
    const pending = ['channel', 'video'].map((type) => yt.search(query, { type }).then((value) => ({ status: 'fulfilled', value }), (reason) => ({ status: 'rejected', reason })));
    const results = [await pending[0], await pending[1]];
    signal?.throwIfAborted();
    if (results.every((r) => r.status === 'rejected')) throw new Error(`YouTube.js search failed: ${results[0].reason?.message || 'provider unavailable'}`);
    const failures = results.map((r, i) => r.status === 'rejected' ? `${i ? 'video' : 'channel'} search: ${r.reason?.message || 'failed'}` : '').filter(Boolean);
    const feeds = results.map((r) => r.status === 'fulfilled' ? r.value : null);
    const pages = [0, 0];
    const maxPages = Math.max(1, Math.min(5, Number(options.maxPages) || 3));
    const target = Math.max(1, Math.min(150, Number(options.target) || 25));
    function consume(feed, index) {
      for (const item of feed?.results || []) {
        if (index === 0) {
          const id = item.id || item.author?.id;
          const handle = (item.author?.endpoint?.payload?.canonicalBaseUrl || '').replace(/^\//, '');
          const stat = [item.subscriber_count?.text, item.video_count?.text].map((s) => countFromText(s, 'subscribers?')).find((n) => n != null) ?? null;
          add(id, { name: item.author?.name || item.long_byline?.text, handle, description: item.description_snippet?.text, subscribers: stat, image: item.author?.thumbnails?.[0]?.url || '' }, 'channel search');
        } else {
          const videoId = item.video_id || item.id;
          if (!VIDEO.test(videoId || '')) continue;
          videosScanned++;
          add(item.author?.id, { name: item.author?.name, handle: (item.author?.endpoint?.payload?.canonicalBaseUrl || '').replace(/^\//, ''), image: item.author?.thumbnails?.[0]?.url || '' }, 'video search', {
            id: videoId, title: item.title?.text || '', url: `https://www.youtube.com/watch?v=${videoId}`,
            views: countFromText(item.view_count?.text, 'views?'), viewsStatus: 'approximate', publishedAt: '', publishedText: item.published?.text || '', source: 'YouTube.js (public search)', refreshedAt: stamp,
          });
        }
      }
      pages[index]++;
      onProgress({ stage: index ? 'video search' : 'channel search', records: [...seen.values()], videosScanned, pages: [...pages] });
    }
    for (let index = 0; index < 2; index++) if (feeds[index]) consume(feeds[index], index);
    while (seen.size < target && feeds.some((feed, i) => feed?.has_continuation && pages[i] < maxPages)) {
      for (let i = 0; i < feeds.length && seen.size < target; i++) {
        signal?.throwIfAborted();
        if (!feeds[i]?.has_continuation || pages[i] >= maxPages) continue;
        try { feeds[i] = await feeds[i].getContinuation(); signal?.throwIfAborted(); consume(feeds[i], i); }
        catch (error) { signal?.throwIfAborted(); failures.push(`${i ? 'video' : 'channel'} continuation: ${error.message}`); feeds[i] = null; }
      }
    }
    if (!seen.size) throw new Error('YouTube.js returned no recognizable channel IDs.');
    return { records: [...seen.values()], videosScanned, pages, failures };
  }
  async function inspect(id) {
    if (!CHANNEL.test(id || '')) throw new Error('Invalid YouTube channel ID.');
    const yt = await client();
    const channel = await yt.getChannel(id);
    const meta = channel.metadata || {};
    const stamp = new Date().toISOString();
    const headerParts = (channel.header?.metadata?.metadata_rows || []).flatMap((row) => (row.metadata_parts || []).map((part) => part.text?.text || ''));
    const subscribers = headerParts.map((text) => countFromText(text, 'subscribers?')).find((n) => n != null) ?? null;
    const record = { id, platform: 'youtube', name: meta.title || '', handle: (() => { try { return new URL(meta.vanity_channel_url).pathname.replace(/^\//, ''); } catch { return ''; } })(), url: `https://www.youtube.com/channel/${id}`, description: meta.description || '', image: meta.avatar?.[0]?.url || '', subscribers, subscribersStatus: subscribers == null ? 'unknown' : 'approximate', views: null, videoCount: null, source: 'YouTube.js (public channel)', refreshedAt: stamp, recentVideos: [], links: [], contacts: { status: 'not-checked' }, qualification: { status: 'needs-verification', reason: 'Search metadata is incomplete or approximate.' } };
    const feed = await channel.getVideos();
    for (const item of (feed.videos || []).slice(0, 5)) {
      const videoId = item.content_id || item.video_id;
      if (!VIDEO.test(videoId || '')) continue;
      const parts = (item.metadata?.metadata?.metadata_rows || []).flatMap((row) => (row.metadata_parts || []).map((part) => part.text?.text || ''));
      const views = parts.map((part) => countFromText(part, 'views?')).find((n) => n != null) ?? null;
      const publishedText = parts.find((part) => /\b(?:ago|streamed|premiered)\b/i.test(part)) || '';
      record.recentVideos.push({ id: videoId, title: item.metadata?.title?.text || item.title?.text || '', url: `https://www.youtube.com/watch?v=${videoId}`, views, viewsStatus: views == null ? 'unknown' : 'approximate', publishedAt: '', publishedText, source: 'YouTube.js (public channel)', refreshedAt: stamp });
    }
    return record;
  }
  return { discover, inspect };
}
module.exports = { createYouTubeJsProvider, countFromText };
