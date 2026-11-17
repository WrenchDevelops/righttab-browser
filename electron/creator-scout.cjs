const fs = require('fs');
const path = require('path');
const { setTimeout: delay } = require('node:timers/promises');
const { createYouTubeJsProvider } = require('./youtubejs-provider.cjs');
const { writeJsonAtomic } = require('./atomic-json.cjs');

const MONTHLY_LIMIT = 750;
const DAILY_SEARCH_LIMIT = 80;
const CACHE_MS = 24 * 60 * 60 * 1000;
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const CONVERSATION_RETENTION = 90 * 24 * 60 * 60 * 1000;
const STATUSES = new Set(['not contacted', 'researching', 'contacted elsewhere', 'interested', 'not a fit']);
const PLATFORMS = {
  youtube: { source: 'YouTube Data API v3', live: false, auth: 'Local app main-process API key', fields: ['Channel title', 'description', 'thumbnail', 'public statistics', 'recent public uploads'], unavailable: ['Business email', 'creator website links outside API descriptions', 'verified status'] },
  tiktok: { source: 'No connected source', live: false, auth: 'Platform approval and creator authorization required', fields: [], unavailable: ['Platform-wide discovery', 'public creator enrichment'] },
  instagram: { source: 'No connected source', live: false, auth: 'Approved Meta access and creator authorization required', fields: [], unavailable: ['Platform-wide discovery', 'public creator enrichment'] },
};

function monthKey(date = new Date()) { return date.toISOString().slice(0, 7); }
function dayKey(date = new Date()) { return date.toISOString().slice(0, 10); }
function cleanText(value, max = 2000) { return String(value || '').trim().slice(0, max); }
function linksIn(text) {
  return [...new Set((String(text || '').match(/https?:\/\/[^\s<>"'()]+/g) || []).map((url) => url.replace(/[.,;!?]+$/, '')))];
}
function youtubeContext(raw) {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (!['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(host)) return null;
    if (host === 'youtu.be') return /^[\w-]{11}$/.test(url.pathname.slice(1)) ? { kind: 'video', id: url.pathname.slice(1) } : null;
    if (url.pathname === '/watch' && /^[\w-]{11}$/.test(url.searchParams.get('v') || '')) return { kind: 'video', id: url.searchParams.get('v') };
    if (url.pathname === '/results') {
      const query = cleanText(url.searchParams.get('search_query'), 120);
      if (query) return { kind: 'search', query };
    }
    const short = url.pathname.match(/^\/shorts\/([\w-]{11})(?:\/|$)/);
    if (short) return { kind: 'video', id: short[1] };
    const channel = url.pathname.match(/^\/channel\/(UC[\w-]{22})(?:\/|$)/);
    if (channel) return { kind: 'channel', id: channel[1] };
    const handle = url.pathname.match(/^\/@([\w.-]+)(?:\/|$)/);
    if (handle) return { kind: 'handle', id: handle[1] };
  } catch {}
  return null;
}
function platformContext(raw) {
  const youtube = youtubeContext(raw); if (youtube) return { ...youtube, platform: 'youtube' };
  try {
    const url = new URL(raw), host = url.hostname.toLowerCase(), path = url.pathname;
    if (/(^|\.)instagram\.com$/.test(host)) {
      const tag = path.match(/^\/explore\/tags\/([^/?#]+)/); const profile = path.match(/^\/([A-Za-z0-9._]+)\/?$/);
      return tag ? { platform: 'instagram', kind: 'hashtag', id: tag[1], query: tag[1] } : profile && !['explore', 'reels', 'p'].includes(profile[1].toLowerCase()) ? { platform: 'instagram', kind: 'handle', id: profile[1] } : { platform: 'instagram', kind: 'other' };
    }
    if (/(^|\.)tiktok\.com$/.test(host)) { const handle = path.match(/^\/@([\w.-]+)/); const tag = path.match(/^\/tag\/([\w-]+)/); return tag ? { platform: 'tiktok', kind: 'hashtag', id: tag[1], query: tag[1] } : handle ? { platform: 'tiktok', kind: 'handle', id: handle[1] } : { platform: 'tiktok', kind: 'other' }; }
  } catch {}
  return null;
}
const SEARCH_STOP_WORDS = new Set(['a', 'an', 'and', 'about', 'best', 'channel', 'channels', 'creator', 'creators', 'find', 'for', 'in', 'of', 'on', 'page', 'scout', 'the', 'to', 'video', 'videos', 'with']);
function stem(word) {
  return word.replace(/ies$/u, 'y').replace(/ing$/u, '').replace(/ed$/u, '').replace(/s$/u, '');
}
function searchWords(value) {
  return [...new Set((String(value || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter((word) => !SEARCH_STOP_WORDS.has(word)).map(stem).filter((word) => word.length > 1))];
}
function topicMatch(query, text) {
  const terms = searchWords(query);
  if (!terms.length) return { matched: 0, required: 1 };
  const haystack = new Set(searchWords(text));
  const matched = terms.filter((term) => haystack.has(term)).length;
  return { matched, required: Math.max(1, Math.ceil(terms.length / 2)) };
}
function channelRecord(item, matchedBy = '') {
  const s = item.snippet || {}, stats = item.statistics || {};
  const refreshedAt = new Date().toISOString();
  return {
    id: item.id, platform: 'youtube', source: 'YouTube Data API v3', refreshedAt,
    fieldMeta: Object.fromEntries(['name','description','image','handle','country','subscribers','views','videoCount','uploadsPlaylist'].map((field) => [field, { source: 'YouTube Data API v3', refreshedAt }])),
    name: s.title || '', description: s.description || '', image: s.thumbnails?.medium?.url || s.thumbnails?.default?.url || '',
    handle: s.customUrl || '', url: `https://www.youtube.com/channel/${item.id}`,
    country: s.country || '', subscribers: stats.hiddenSubscriberCount ? null : numberOrNull(stats.subscriberCount), subscribersStatus: stats.hiddenSubscriberCount || numberOrNull(stats.subscriberCount) == null ? 'unknown' : 'rounded-down',
    views: numberOrNull(stats.viewCount),
    videoCount: numberOrNull(stats.videoCount),
    uploadsPlaylist: item.contentDetails?.relatedPlaylists?.uploads || '',
    links: linksIn(s.description).map((url) => ({ url, sourceUrl: `https://www.youtube.com/channel/${item.id}`, source: 'Channel description via YouTube Data API', refreshedAt })),
    recentVideos: [], matchedBy,
  };
}
function contactSummary(record) {
  const links = record.links || [];
  const pick = (pattern) => links.find((item) => pattern.test(item.url));
  const website = links.find((item) => !/(instagram\.com|tiktok\.com|twitter\.com|x\.com|facebook\.com|youtube\.com)/i.test(item.url));
  const contact = links.find((item) => /contact|business|media.?kit|press|sponsor/i.test(item.url));
  const instagram = pick(/instagram\.com/i), tiktok = pick(/tiktok\.com/i);
  const emailValue = (record.description || '').match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0] || '';
  const email = emailValue ? { value: emailValue, sourceUrl: record.url, source: 'YouTube channel description', refreshedAt: record.refreshedAt, status: 'unverified' } : null;
  return { status: links.length || email ? 'checked-links-found' : 'no-public-links-returned', checkedAt: record.refreshedAt, email, website: website || null, contactPage: contact || null, instagram: instagram || null, tiktok: tiktok || null, source: `YouTube channel description via ${record.source || 'YouTube'}` };
}
// YouTube reports counts of 1,000+ rounded down to three significant figures.
function subscriberQualification(count, min, max) {
  if (min == null && max == null) return 'qualified';
  if (count == null) return 'needs-verification';
  const step = count >= 1000 ? 10 ** (Math.floor(Math.log10(count)) - 2) : 1;
  const upper = count + step - 1;
  if ((min != null && upper < min) || (max != null && count > max)) return 'rejected';
  if ((min != null && count < min) || (max != null && upper > max)) return 'needs-verification';
  return 'qualified';
}
function bestPublishedContact(record, video) {
  const sources = [
    { text: record.description, url: record.url, label: 'Creator channel description' },
    { text: video?.description, url: video?.url, label: 'Creator video description' },
  ];
  for (const source of sources) {
    if (!source.text || !source.url) continue;
    for (const line of String(source.text).split(/[\r\n]+/)) {
      if (!/\b(business|inquir(?:y|ies)|sponsor(?:ship)?|booking|management|partnerships?|collab(?:oration)?s?)\b/i.test(line)) continue;
      const email = line.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0];
      if (email) return { type: 'business_email', value: email, sourceUrl: source.url, source: source.label, sourceRelationship: 'official_creator_profile', ownershipStatus: 'unverified', deliverability: 'unverified', checkedAt: record.refreshedAt, provider: 'YouTube Data API v3' };
    }
  }
  return null;
}
function numberOrNull(value) {
  return value === undefined || value === null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
}
function videoRecord(item) {
  const s = item.snippet || {}, stats = item.statistics || {}, details = item.contentDetails || {};
  const refreshedAt = new Date().toISOString();
  const thumbnails = s.thumbnails || {};
  const thumbnail = thumbnails.maxres?.url || thumbnails.standard?.url || thumbnails.high?.url || thumbnails.medium?.url || thumbnails.default?.url || '';
  return {
    id: item.id, kind: 'video', platform: 'youtube', source: 'YouTube Data API v3', refreshedAt,
    title: s.title || '', description: s.description || '', channelId: s.channelId || '', channelName: s.channelTitle || '',
    publishedAt: s.publishedAt || '', thumbnail, thumbnails: Object.fromEntries(Object.entries(thumbnails).filter(([, value]) => value?.url).map(([key, value]) => [key, value.url])),
    duration: details.duration || null, views: numberOrNull(stats.viewCount), likes: numberOrNull(stats.likeCount), comments: numberOrNull(stats.commentCount),
    tags: Array.isArray(s.tags) ? s.tags.slice(0, 25) : [], categoryId: s.categoryId || null,
    url: `https://www.youtube.com/watch?v=${item.id}`,
    fieldMeta: Object.fromEntries(['title', 'description', 'channelName', 'publishedAt', 'thumbnail', 'duration', 'views', 'likes', 'comments', 'tags', 'categoryId'].map((field) => [field, { source: 'YouTube Data API v3', refreshedAt }])),
  };
}
function topicFromText(value) {
  return cleanText(String(value || '')
    .replace(/(\d(?:\.\d+)?\s*(?:k|m)?)\+/gi, '$1 ')
    .replace(/\bat least one\b/gi, ' ')
    .replace(/\b\d+(?:\.\d+)?\s*(?:k|m|million|thousand)?\s*[-–—]\s*\d+(?:\.\d+)?\s*(?:k|m|million|thousand)?\s*(?:subs(?:cribers?)?)?/gi, ' ')
    .replace(/\b\d+(?:\.\d+)?\s*(?:k|m|million|thousand|days?|weeks?)?\b/gi, ' ')
    .replace(/\b(find|show|me|creators?|channels?|youtubers?|ones?|in|this|the|niche|with|that|who|have|has|had|posted|made|a|video|videos?|over|above|abouve|under|below|between|minimum|at|least|subs?|subscribers?|views?|last|past|within|from|only|their|thumbnails?|compare|save|more|like|these|recent|and|on|public(?:ly)?|available|business|contact(?:able)?|email|addresses?|way|to|reach)\b/gi, ' ')
    .replace(/[^\p{L}\p{N}+#]+/gu, ' ').replace(/\s+/g, ' '), 120);
}
function numberWithSuffix(value) {
  const match = String(value || '').toLowerCase().match(/(\d+(?:\.\d+)?)\s*(k|m|thousand|million)?/);
  if (!match) return null;
  const factor = /^(k|thousand)$/.test(match[2] || '') ? 1000 : /^(m|million)$/.test(match[2] || '') ? 1000000 : 1;
  return Math.round(Number(match[1]) * factor);
}
function parseResearchPlan(message, previous = {}, context = null, nowMs = Date.now()) {
  const text = cleanText(message, 500), lower = text.toLowerCase();
  const filters = { ...(previous.filters || {}) };
  const normalized = lower.replace(/\babouve\b/g, 'above').replace(/\babv\b/g, 'above');
  const subscriber = normalized.match(/(?:over|above|more than|at least|≥)\s+([\d.]+\s*(?:k|m|thousand|million)?)\s*(?:subs?|subscribers?)/);
  const range = normalized.match(/([\d.]+\s*(?:k|m|thousand|million)?)\s*[-–—]\s*([\d.]+\s*(?:k|m|thousand|million)?)\s*(?:subs?|subscribers?)/);
  const maxSubscriber = normalized.match(/(?:under|below|less than|fewer than)\s+([\d.]+\s*(?:k|m|thousand|million)?)\s*(?:subs?|subscribers?)/);
  const views = normalized.match(/(?:(?:over|above|more than|at least|≥)\s+)?([\d.]+\s*(?:k|m|thousand|million)?)\s*\+?\s*(?:video\s*)?views?(?:\s+minimum)?/);
  const targetMatch = lower.match(/\b(?:find|show|discover|identify)\s+(\d{1,3})\b/);
  const targetCount = targetMatch ? Math.max(1, Math.min(50, Number(targetMatch[1]))) : null;
  if (/\b(?:public(?:ly)?(?:\s+available)?\s+)?(?:business\s+)?(?:contact(?:able)?|email|inquir(?:y|ies))\b/.test(lower)) filters.requireContact = true;
  if (/\b(?:business|management)\s+emails?\b/.test(lower)) filters.contactMode = 'email';
  else if (/\b(?:any|legitimate)\b.{0,35}\bcontact(?:\s+method)?\b/.test(lower)) filters.contactMode = 'any';
  if (/\b(?:no|without|remove)\s+(?:(?:public|business)\s+)*(?:contact|email)(?:\s+(?:requirement|filter))?\b/.test(lower)) { delete filters.requireContact; delete filters.contactMode; }
  const days = lower.match(/(?:last|past|within)\s+(\d+)\s*(day|days|week|weeks)/);
  if (/remove.*(?:views?|view requirement)|no (?:views?|view requirement)/.test(lower)) delete filters.minVideoViews;
  else if (views) filters.minVideoViews = numberWithSuffix(views[1]);
  if (/remove.*(?:subs?|subscribers?)|no (?:subs?|subscribers?)/.test(lower)) delete filters.minSubscribers;
  else if (range) filters.minSubscribers = numberWithSuffix(range[1]);
  else if (subscriber) filters.minSubscribers = numberWithSuffix(subscriber[1]);
  if (/remove.*(?:subs?|subscribers?)|no (?:subs?|subscribers?)/.test(lower)) delete filters.maxSubscribers;
  else if (range) filters.maxSubscribers = numberWithSuffix(range[2]);
  else if (maxSubscriber) filters.maxSubscribers = numberWithSuffix(maxSubscriber[1]);
  if (/remove.*(?:last|recent|date)|any date/.test(lower)) delete filters.publishedAfter;
  else if (days) filters.publishedAfter = nowMs - Number(days[1]) * (/week/.test(days[2]) ? 7 : 1) * 86400000;
  const explicitTopic = topicFromText(text);
  const contextualTopic = context?.kind === 'search' ? context.query : '';
  const refers = /\b(this niche|this page|this search|those|ones|their|smaller|more like|find more|save them)\b/.test(lower) || !!subscriber || !!range || !!maxSubscriber || !!views || !!days || /remove.*(?:views?|subs?|date)/.test(lower);
  const hasConstraint = !!subscriber || !!range || !!maxSubscriber || !!views || !!days || /remove.*(?:views?|subs?|date)/.test(lower);
  const topic = explicitTopic || (hasConstraint || refers ? previous.topic || contextualTopic : contextualTopic || previous.topic);
  const output = /\b(thumbnails?|show their thumbnails?)\b/.test(lower) ? 'thumbnails' : /\b(compare)\b/.test(lower) ? 'comparison' : previous.output === 'creators' && refers ? 'creators' : /\b(creators?|channels?|find me)\b/.test(lower) ? 'creators' : previous.output || 'creators';
  return { targetCount, intent: output === 'creators' ? 'creator-discovery' : output, platform: context?.platform || previous.platform || 'youtube', topic, output, filters, refine: refers || !!previous.topic, sort: /recent|newest/.test(lower) ? 'date' : 'relevance' };
}
function discoveryQueries(topic, depth) {
  const q = cleanText(topic, 120);
  if (depth === 'quick') return [q];
  const suffixes = /\bfortnite\b/i.test(q) ? ['gameplay', 'competitive', 'tutorial'] : ['tutorial', 'review', 'creators'];
  const queries = [q];
  for (const suffix of suffixes) if (!q.toLowerCase().split(/\s+/).includes(suffix)) queries.push(`${q} ${suffix}`.slice(0, 120));
  return [...new Set(queries)].slice(0, depth === 'deep' ? 4 : 3);
}
function searchBudget(limit) {
  const depth = Number(limit) >= 50 ? 'deep' : Number(limit) <= 10 ? 'quick' : 'standard';
  return depth === 'deep' ? { depth, maxPages: 10, candidateBudget: 500, pagesPerQuery: 3, channelFirstLimit: 8 }
    : depth === 'quick' ? { depth, maxPages: 3, candidateBudget: 150, pagesPerQuery: 3, channelFirstLimit: 0 }
      : { depth, maxPages: 6, candidateBudget: 300, pagesPerQuery: 3, channelFirstLimit: 4 };
}
function createCreatorScout({ dir, safeStorage, fetchImpl = fetch, now = () => new Date(), youtubeProvider = fetchImpl === fetch ? createYouTubeJsProvider() : null, contactResearch = fetchImpl === fetch ? (record, options) => require('./contact-research.cjs').researchCreator(record, options) : null }) {
  const file = path.join(dir, 'creator-scout.json');
  const openrouterFile = path.join(dir, 'openrouter-credentials.json');
  let openrouter = { key: '', enabled: false };
  try { const stored = JSON.parse(fs.readFileSync(openrouterFile, 'utf8')); openrouter = { key: stored.key || '', enabled: stored.enabled === true }; } catch {}
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { data = {}; }
  data = { key: data.key || '', deepseek: data.deepseek && typeof data.deepseek === 'object' ? data.deepseek : { key: '', enabled: false }, verifiedAt: data.verifiedAt || '', usage: data.usage || {}, searches: data.searches || {}, lists: Array.isArray(data.lists) ? data.lists : [], saved: data.saved || {}, boards: Array.isArray(data.boards) ? data.boards : [], videoReferences: data.videoReferences || {}, conversations: data.conversations || {}, cache: data.cache || {} };
  let lastRequest = 0;
  let queue = Promise.resolve();
  const searchFlights = new Map();
  const inspectFlights = new Map();
  let pendingLookups = 0;
  function persist({ required = false } = {}) {
    if (writeJsonAtomic(file, data)) return true;
    if (required) throw new Error('Could not save Creator Scout data. Free some disk space and try again.');
    return false;
  }
  function expire() {
    let changed = false;
    for (const [key, value] of Object.entries(data.cache)) {
      if (!value || !Number.isFinite(value.at) || Date.now() - value.at >= CACHE_MS) { delete data.cache[key]; changed = true; }
    }
    for (const [id, saved] of Object.entries(data.saved)) {
      const refreshed = Date.parse(saved?.record?.refreshedAt || '');
      if (Number.isFinite(refreshed) && Date.now() - refreshed < RETENTION_MS) continue;
      if (saved?.record?.expired) continue;
      saved.record = { id, platform: 'youtube', source: 'YouTube Data API v3', name: 'Refresh required', url: `https://www.youtube.com/channel/${id}`, description: '', recentVideos: [], links: [], refreshedAt: '', expired: true };
      changed = true;
    }
    if (changed) persist();
  }
  function apiKey() {
    if (process.env.RIGHTTAB_YOUTUBE_API_KEY) return process.env.RIGHTTAB_YOUTUBE_API_KEY;
    if (!data.key || !safeStorage.isEncryptionAvailable()) return '';
    try { return safeStorage.decryptString(Buffer.from(data.key, 'base64')); } catch { return ''; }
  }
  function deepseekKey() {
    if (!data.deepseek.key || !safeStorage.isEncryptionAvailable()) return '';
    try { return safeStorage.decryptString(Buffer.from(data.deepseek.key, 'base64')); } catch { return ''; }
  }
  function openrouterKey() {
    if (!openrouter.key || !safeStorage.isEncryptionAvailable()) return '';
    try { return safeStorage.decryptString(Buffer.from(openrouter.key, 'base64')); } catch { return ''; }
  }
  function state() {
    expire();
    const month = monthKey(now()), day = dayKey(now());
    const recentQueries = Object.entries(data.cache).filter(([key]) => key.startsWith('search:')).map(([, entry]) => ({ query: entry.value?.query || '', at: entry.at })).filter((entry) => entry.query).sort((a, b) => b.at - a.at).slice(0, 12);
    const conversations = Object.values(data.conversations).filter((item) => Date.now() - Date.parse(item.updatedAt || 0) < CONVERSATION_RETENTION).map(({ id, title, updatedAt, research }) => ({ id, title, updatedAt, research })).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 20);
    return { connected: !!apiKey(), openrouter: { configured: !!openrouterKey(), enabled: openrouter.enabled && !!openrouterKey(), model: 'deepseek/deepseek-v4.1-flash-1017' }, deepseek: { configured: !!deepseekKey(), enabled: !!data.deepseek.enabled && !!deepseekKey(), model: 'deepseek-flash', maxCallsPerSearch: 3, estimatedBudgetUsd: 0.01, pricingDate: '2026-11-09' }, month, used: data.usage[month] || 0, limit: MONTHLY_LIMIT, remaining: Math.max(0, MONTHLY_LIMIT - (data.usage[month] || 0)), searchCallsToday: data.searches[day] || 0, dailySearchLimit: DAILY_SEARCH_LIMIT, lists: data.lists, saved: data.saved, boards: data.boards, videoReferences: data.videoReferences, conversations, recentQueries, analytics: { connected: false, status: process.env.RIGHTTAB_GOOGLE_OAUTH_CLIENT_ID ? 'OAuth backend required' : 'OAuth client not configured', scopes: ['https://www.googleapis.com/auth/yt-analytics.readonly'], privateDataModelUse: false }, platforms: { ...PLATFORMS, youtube: { ...PLATFORMS.youtube, live: !!data.verifiedAt && !!apiKey(), verifiedAt: data.verifiedAt } }, price: { label: 'Lite concept — billing inactive', monthly: 49, overage: 0.07, overageEnabled: false } };
  }
  function setKey(value) {
    const key = cleanText(value, 256);
    if (key && !safeStorage.isEncryptionAvailable()) throw new Error('Secure OS key storage is unavailable. Set RIGHTTAB_YOUTUBE_API_KEY in the app environment instead.');
    data.key = key ? safeStorage.encryptString(key).toString('base64') : '';
    data.verifiedAt = '';
    persist({ required: true }); return state();
  }
  function setDeepSeek({ key = '', enabled = false, clear = false } = {}) {
    const next = { ...data.deepseek };
    if (clear) { next.key = ''; next.enabled = false; }
    else {
      if (key) {
        if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure OS key storage is unavailable.');
        next.key = safeStorage.encryptString(cleanText(key, 256)).toString('base64');
      }
      if (enabled && !next.key) throw new Error('Enter a DeepSeek API key before enabling paid research.');
      next.enabled = !!enabled;
    }
    data.deepseek = next; persist({ required: true }); return state();
  }
  function setOpenRouter({ key = '', enabled = false, clear = false } = {}) {
    const next = { ...openrouter };
    if (clear) { next.key = ''; next.enabled = false; }
    else {
      if (key) {
        if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure OS key storage is unavailable.');
        next.key = safeStorage.encryptString(cleanText(key, 256)).toString('base64');
      }
      if (enabled && !next.key) throw new Error('Enter an OpenRouter key before enabling paid research.');
      next.enabled = !!enabled;
    }
    if (!writeJsonAtomic(openrouterFile, next, { mode: 0o600 })) {
      throw new Error('Could not save OpenRouter credentials. Free some disk space and try again.');
    }
    openrouter = next;
    return state();
  }
  async function request(endpoint, params, { search = false, signal } = {}) {
    const key = apiKey();
    if (!key) throw new Error('Add a YouTube Data API key in Creator Scout Settings first.');
    const day = dayKey(now());
    const run = async () => {
      signal?.throwIfAborted();
      if (search && (data.searches[day] || 0) >= DAILY_SEARCH_LIMIT) throw new Error('Creator Scout has reached its daily search-call safety limit. Try again tomorrow.');
      const wait = Math.max(0, 700 - (Date.now() - lastRequest));
      if (wait) await delay(wait, undefined, signal ? { signal } : undefined);
      signal?.throwIfAborted();
      lastRequest = Date.now();
      if (search) { data.searches[day] = (data.searches[day] || 0) + 1; persist(); }
      const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
      for (const [name, value] of Object.entries({ ...params, key })) if (value !== undefined && value !== '') url.searchParams.set(name, String(value));
      const response = await fetchImpl(url, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000) });
      const json = await response.json();
      if (!response.ok) {
        const reason = json.error?.errors?.[0]?.reason || '';
        if (['quotaExceeded', 'dailyLimitExceeded', 'rateLimitExceeded'].includes(reason)) throw new Error('YouTube API quota or rate limit reached. Retry after the provider resets it.');
        throw new Error(cleanText(json.error?.message || `YouTube API error ${response.status}`, 240));
      }
      if (!data.verifiedAt) { data.verifiedAt = new Date().toISOString(); persist(); }
      return json;
    };
    const pending = queue.then(run, run);
    queue = pending.catch(() => {});
    return pending;
  }
  async function channels(ids, signal) {
    const cleanIds = [...new Set((ids || []).filter((id) => /^UC[\w-]{22}$/.test(id || '')))];
    const byId = new Map(), missing = [];
    for (const id of cleanIds) {
      const hit = data.cache[`channel:${id}`];
      if (hit && Date.now() - hit.at < CACHE_MS) byId.set(id, structuredClone(hit.value));
      else missing.push(id);
    }
    for (let offset = 0; offset < missing.length; offset += 50) {
      const batch = missing.slice(offset, offset + 50);
      const result = await request('channels', { part: 'snippet,statistics,contentDetails', id: batch.join(','), fields: 'items(id,snippet(title,description,customUrl,country,thumbnails(default(url),medium(url))),statistics(subscriberCount,hiddenSubscriberCount,viewCount,videoCount),contentDetails(relatedPlaylists(uploads)))' }, { signal });
      for (const item of result.items || []) {
        if (!batch.includes(item.id)) continue;
        const record = channelRecord(item); record.contacts = contactSummary(record);
        byId.set(item.id, record);
        data.cache[`channel:${item.id}`] = { at: Date.now(), value: structuredClone(record) };
      }
      persist();
    }
    return cleanIds.map((id) => byId.get(id)).filter(Boolean);
  }
  async function searchUncached(query, limit = 25) {
    const q = cleanText(query, 120);
    if (!q) throw new Error('Enter a topic or creator name.');
    limit = Math.max(1, Math.min(50, Math.floor(Number(limit) || 25)));
    const cacheKey = `v2|${q.toLowerCase()}|${limit}`;
    const hit = data.cache[`search:${cacheKey}`];
    if (hit && Date.now() - hit.at < CACHE_MS) return { ...hit.value, cached: true };
    const seen = new Map(), tokens = new Set(), channelRecords = new Map(), attempted = new Set();
    const rankedRecords = () => [...channelRecords.values()].map((item) => {
      const evidence = seen.get(item.id);
      const videoText = evidence.matchedVideos.map((video) => video.title).join(' ');
      const match = topicMatch(q, `${item.name} ${item.description} ${videoText} ${evidence.searchTitles.join(' ')}`);
      const channelMatch = topicMatch(q, `${item.name} ${item.description}`);
      const matchedVideos = evidence.matchedVideos.filter((video) => topicMatch(q, video.title).matched > 0);
      return { ...item, matchedBy: q, matchedVideo: matchedVideos[0] || null, matchedVideos: matchedVideos.slice(0, 3), channelTopicMatched: channelMatch.matched > 0, relevanceEstimate: match.matched * 10 + channelMatch.matched * 3 + matchedVideos.length, topicMatched: match.matched >= match.required };
    }).filter((record) => record.topicMatched).sort((a, b) => b.relevanceEstimate - a.relevanceEstimate);
    let pageToken = '', calls = 0;
    while (calls < 3) {
      const result = await request('search', { part: 'snippet', q, type: 'video,channel', maxResults: Math.min(50, limit), pageToken, fields: 'nextPageToken,items(id, snippet(channelId,channelTitle,title,publishedAt))' }, { search: true });
      calls++;
      for (const item of result.items || []) {
        const id = item.id?.channelId || item.snippet?.channelId;
        if (!id) continue;
        if (!seen.has(id)) seen.set(id, { matchedBy: q, matchedVideo: null, matchedVideos: [], searchTitles: [] });
        const evidence = seen.get(id);
        const title = item.snippet?.title || '';
        if (title && evidence.searchTitles.length < 5) evidence.searchTitles.push(title);
        if (item.id?.videoId && evidence.matchedVideos.length < 5) {
          evidence.matchedVideos.push({ id: item.id.videoId, title });
          if (!evidence.matchedVideo) evidence.matchedVideo = { id: item.id.videoId, title };
        }
      }
      const newIds = [...seen.keys()].filter((id) => !attempted.has(id));
      newIds.forEach((id) => attempted.add(id));
      for (const record of await channels(newIds)) channelRecords.set(record.id, record);
      if (rankedRecords().length >= limit) break;
      if (!result.nextPageToken || tokens.has(result.nextPageToken)) break;
      pageToken = result.nextPageToken; tokens.add(pageToken);
    }
    const records = rankedRecords().slice(0, limit);
    const value = { query: q, records, source: 'YouTube Data API v3', refreshedAt: new Date().toISOString(), searchCalls: calls };
    data.cache[`search:${cacheKey}`] = { at: Date.now(), value };
    persist(); return value;
  }
  function search(query, limit = 25) {
    const key = `${String(query || '').trim().toLowerCase()}|${Math.max(1, Math.min(50, Math.floor(Number(limit) || 25)))}`;
    if (searchFlights.has(key)) return searchFlights.get(key);
    const pending = searchUncached(query, limit).finally(() => searchFlights.delete(key));
    searchFlights.set(key, pending);
    return pending;
  }
  async function videos(ids, signal) {
    const cleanIds = [...new Set((ids || []).filter((id) => /^[\w-]{11}$/.test(id)))];
    const byId = new Map(), missing = [];
    for (const id of cleanIds) {
      const hit = data.cache[`video:${id}`];
      if (hit && Date.now() - hit.at < 6 * 60 * 60 * 1000) byId.set(id, structuredClone(hit.value));
      else missing.push(id);
    }
    for (let offset = 0; offset < missing.length; offset += 50) {
      const batch = missing.slice(offset, offset + 50);
      const result = await request('videos', { part: 'snippet,statistics,contentDetails', id: batch.join(','), fields: 'items(id,snippet(title,description,channelId,channelTitle,publishedAt,thumbnails(default(url),medium(url),high(url),standard(url),maxres(url)),tags,categoryId),statistics(viewCount,likeCount,commentCount),contentDetails(duration))' }, { signal });
      for (const item of result.items || []) {
        if (!batch.includes(item.id)) continue;
        const record = videoRecord(item);
        byId.set(item.id, record);
        data.cache[`video:${item.id}`] = { at: Date.now(), value: structuredClone(record) };
      }
      persist();
    }
    return cleanIds.map((id) => byId.get(id)).filter(Boolean);
  }
  async function searchVideosUncached(query, options = {}) {
    const q = cleanText(query, 120);
    if (!q) throw new Error('Enter a video topic.');
    const limit = Math.max(1, Math.min(50, Math.floor(Number(options.limit) || 12)));
    const order = ['date', 'relevance', 'viewCount'].includes(options.order) ? options.order : 'relevance';
    const publishedAfter = /^\d{4}-\d{2}-\d{2}$/.test(options.publishedAfter || '') ? `${options.publishedAfter}T00:00:00Z` : '';
    const cacheKey = `videos|${q.toLowerCase()}|${limit}|${order}|${publishedAfter}`;
    const hit = data.cache[cacheKey];
    if (hit && Date.now() - hit.at < CACHE_MS) return { ...hit.value, cached: true };
    const result = await request('search', { part: 'snippet', q, type: 'video', maxResults: limit, order, publishedAfter, fields: 'items(id(videoId))' }, { search: true });
    const records = await videos((result.items || []).map((item) => item.id?.videoId));
    const value = { query: q, records, source: 'YouTube Data API v3', retrievedAt: new Date().toISOString() };
    data.cache[cacheKey] = { at: Date.now(), value }; persist(); return value;
  }
  function searchVideos(query, options = {}) { return searchVideosUncached(query, options); }
  async function fetchVideos(ids) { return videos(ids); }
  function conversation(id = '') {
    if (id && data.conversations[id]) return data.conversations[id];
    const createdAt = new Date().toISOString();
    const item = { id: crypto.randomUUID(), title: 'New research', createdAt, updatedAt: createdAt, messages: [], research: { topic: '', platform: 'youtube', output: 'creators', filters: {}, resultIds: [], selectedIds: [] } };
    data.conversations[item.id] = item; persist(); return item;
  }
  function getConversation(id) { return conversation(id); }
  function newConversation() { return conversation(''); }
  async function searchCreatorsForPlan(plan, limit = 25, options = {}) {
    if (plan.platform !== 'youtube') throw new Error(`${plan.platform} page context was recognized, but Creator Scout has no permitted ${plan.platform} discovery connector configured. Choose YouTube research or configure that connector.`);
    if (!plan.topic) throw new Error('Open a supported search page or name a topic before finding creators.');
    const wanted = Math.max(1, Math.min(50, Number(limit) || 25));
    const candidateBudget = Math.max(wanted, Math.min(500, Number(options.candidateBudget) || 100));
    const maxPages = Math.max(1, Math.min(10, Number(options.maxPages) || 3));
    const queries = discoveryQueries(plan.topic, options.depth || 'quick');
    const pagesPerQuery = Math.max(1, Math.min(maxPages, Number(options.pagesPerQuery) || maxPages));
    const checked = [], seenVideos = new Set(), discoveredChannels = new Set(), attemptedChannels = new Set(), qualified = new Map(), tokens = new Set();
    let pageToken = '', pages = 0, exhausted = false, queryIndex = 0, queryPages = 0, overlapStopped = 0, cappedQueries = 0, lastQuery = '', lastQueryIndex = -1;
    let needsVerification = 0, rejected = 0, websitePages = 0, contactPages = 0, contactErrors = 0, aiWarnings = 0;
    let channelFirstDiscovered = 0, channelFirstInspected = 0, channelFirstQualified = 0, channelFirstExclusive = 0, channelFirstError = '';
    const contactTasks = new Set(), channelExclusiveIds = new Set();
    const routerKey = openrouter.enabled ? openrouterKey() : '';
    const paidKey = routerKey || (data.deepseek.enabled ? deepseekKey() : '');
    const aiProvider = routerKey ? 'openrouter' : 'deepseek';
    const aiBudget = paidKey ? require('./deepseek-contact.cjs').createBudget() : null;
    const cutoff = plan.filters.publishedAfter || 0;
    const businessContact = (record) => [record.bestContact, ...(record.contactResearch?.candidates || [])].find((item) => item && ['business_email', 'management_email'].includes(item.type)) || null;
    const matchesTarget = (record) => !plan.filters.requireContact || (plan.filters.contactMode === 'email' ? !!businessContact(record) : !!record.bestContact);
    const progress = () => {
      const records = [...qualified.values()].map((item) => item.record).filter(Boolean);
      const contacts = records.flatMap((record) => [record.bestContact, ...(record.contactResearch?.candidates || [])].filter(Boolean));
      const unique = (types) => new Set(contacts.filter((item) => types.includes(item.type)).map((item) => String(item.value || '').toLowerCase())).size;
      return { channelFirstDiscovered, channelFirstInspected, channelFirstQualified, channelFirstExclusive, channelFirstError, activeContactTasks: contactTasks.size, videosChecked: checked.length, channelsDiscovered: discoveredChannels.size, channelsChecked: attemptedChannels.size, channelsWithQualifyingVideos: qualified.size, qualified: records.length, contactable: records.filter((record) => record.bestContact).length, generallyContactable: records.filter((record) => record.bestContact).length, emailContactable: records.filter((record) => businessContact(record)).length, requireEmail: plan.filters.contactMode === 'email', emailsFound: unique(['business_email', 'public_email']), businessEmailsFound: unique(['business_email']), formsFound: unique(['contact_form']), needsVerification, rejected, websitePages, contactPages, contactErrors, aiWarnings, aiCalls: aiBudget?.calls || 0, aiEstimatedUsd: aiBudget?.reservedUsd || 0, aiActualUsd: aiBudget?.actualCostKnown ? aiBudget.actualUsd : null, searchCalls: pages, currentQuery: lastQuery, queryIndex: lastQueryIndex + 1, queryCount: queries.length, overlapStopped, cappedQueries, matches: records.filter(matchesTarget).length, pages, candidateBudget, exhausted };
    };
    const output = () => [...qualified.values()].filter((item) => item.record && matchesTarget(item.record)).map((item) => item.record).slice(0, wanted);
    const emit = (coverage) => options.onProgress?.({ records: output(), progress: progress(), plan, coverage });
    const channelDiscovery = youtubeProvider && options.channelFirstLimit > 0
      ? youtubeProvider.discover(plan.topic, () => {}, { signal: options.signal, target: 20, maxPages: 1 }).then((value) => ({ value }), (error) => ({ error }))
      : Promise.resolve(null);
    async function promote(record, matchedVideo, strategy) {
      const subscriberStatus = subscriberQualification(record.subscribers, plan.filters.minSubscribers, plan.filters.maxSubscribers);
      if (subscriberStatus === 'needs-verification') { needsVerification++; return; }
      if (subscriberStatus === 'rejected') { rejected++; return; }
      const bestContact = bestPublishedContact(record, matchedVideo);
      const resultRecord = { ...record, matchedVideo, bestContact, contactResearch: null, discoveryStrategy: strategy, qualification: { status: 'qualified', subscriberStatus: record.subscribersStatus, source: record.source }, matchReason: `Reported subscribers ${record.subscribers == null ? 'unknown' : record.subscribers.toLocaleString()}${cutoff ? `; matching ${plan.topic} video published ${matchedVideo.publishedAt.slice(0, 10)}` : ''}${plan.filters.minVideoViews ? ` with ${matchedVideo.views.toLocaleString()} public views` : ''}.` };
      qualified.set(record.id, { video: matchedVideo, record: resultRecord });
      if (strategy === 'channel-first') { channelFirstQualified++; if (channelExclusiveIds.has(record.id)) channelFirstExclusive++; }
      data.cache[`creator:${record.id}`] = { at: Date.now(), value: resultRecord };
      if (matchesTarget(resultRecord) || !contactResearch) return;
      while (contactTasks.size >= 3) { await Promise.race(contactTasks); options.signal?.throwIfAborted(); }
      const task = (async () => {
        emit(`Researching public creator-linked pages; ${progress().contactable} contact methods found so far.`);
        const cacheKey = `contact:${record.id}`;
        const fingerprint = JSON.stringify({ links: (record.links || []).map((link) => link.url), depth: options.depth || 'quick', aiProvider: paidKey ? aiProvider : 'disabled' });
        const cached = data.cache[cacheKey];
        const cacheHit = cached && cached.fingerprint === fingerprint && Date.now() - cached.at < 24 * 60 * 60 * 1000;
        const research = cacheHit ? cached.value : await contactResearch(record, { signal: options.signal, depth: options.depth || 'quick', selectEmail: paidKey ? (input) => require('./deepseek-contact.cjs').selectEmail(input, { apiKey: paidKey, budget: aiBudget, signal: options.signal, provider: aiProvider }) : null });
        options.signal?.throwIfAborted();
        if (research.status !== 'provider-error' && !research.warnings?.length) data.cache[cacheKey] = { at: Date.now(), fingerprint, value: research };
        if (!cacheHit) { websitePages += research.pagesVisited || 0; contactPages += research.contactPagesVisited || 0; }
        contactErrors += research.errors?.length || (research.status === 'provider-error' ? 1 : 0);
        aiWarnings += research.warnings?.length || 0;
        resultRecord.contactResearch = research;
        resultRecord.bestContact = (plan.filters.contactMode === 'email' && businessContact(resultRecord)) || bestContact || research.candidates?.[0] || null;
        data.cache[`creator:${record.id}`] = { at: Date.now(), value: resultRecord };
        persist();
        emit(`Found ${progress().qualified} qualified creators and ${progress().contactable} with a public contact method.`);
      })().catch((error) => { if (!options.signal?.aborted) { contactErrors++; resultRecord.contactResearch = { status: 'provider-error', errors: [error.message] }; } });
      contactTasks.add(task);
      task.finally(() => contactTasks.delete(task));
    }
    while (checked.length < candidateBudget && pages < maxPages && queryIndex < queries.length) {
      options.signal?.throwIfAborted();
      lastQuery = queries[queryIndex]; lastQueryIndex = queryIndex;
      const result = await request('search', { part: 'snippet', q: lastQuery, type: 'video', maxResults: Math.min(50, candidateBudget - checked.length), order: plan.sort, publishedAfter: cutoff ? new Date(cutoff).toISOString() : '', pageToken, fields: 'nextPageToken,items(id(videoId),snippet(channelId))' }, { search: true, signal: options.signal });
      const items = result.items || [];
      const returnedIds = items.map((item) => item.id?.videoId).filter((id) => /^[\w-]{11}$/.test(id || ''));
      const overlap = returnedIds.length ? returnedIds.filter((id) => seenVideos.has(id)).length / returnedIds.length : 0;
      const searchChannel = new Map(items.filter((item) => /^[\w-]{11}$/.test(item.id?.videoId || '') && /^UC[\w-]{22}$/.test(item.snippet?.channelId || '')).map((item) => [item.id.videoId, item.snippet.channelId]));
      for (const id of searchChannel.values()) discoveredChannels.add(id);
      const videosOnPage = await videos(items.map((item) => item.id?.videoId).filter((id) => id && !seenVideos.has(id)), options.signal);
      for (const video of videosOnPage) {
        seenVideos.add(video.id);
        if (!video.channelId && searchChannel.has(video.id)) video.channelId = searchChannel.get(video.id);
        if (/^UC[\w-]{22}$/.test(video.channelId)) discoveredChannels.add(video.channelId);
        const evidence = `${video.title} ${video.description}`.replace(/#[\p{L}\p{N}_-]+/gu, '');
        const relevant = topicMatch(plan.topic, evidence).matched >= topicMatch(plan.topic, plan.topic).required;
        if (relevant && /^UC[\w-]{22}$/.test(video.channelId) && (!cutoff || (Number.isFinite(Date.parse(video.publishedAt)) && Date.parse(video.publishedAt) >= cutoff && Date.parse(video.publishedAt) <= now().getTime())) && (plan.filters.minVideoViews == null || (video.views != null && video.views >= plan.filters.minVideoViews)) && !qualified.has(video.channelId)) qualified.set(video.channelId, { video, record: null });
      }
      checked.push(...videosOnPage); pages++; queryPages++;
      const newIds = [...qualified.keys()].filter((id) => !attemptedChannels.has(id));
      newIds.forEach((id) => attemptedChannels.add(id));
      for (const record of await channels(newIds, options.signal)) {
        const matchedVideo = qualified.get(record.id)?.video;
        if (!matchedVideo) continue;
        await promote(record, matchedVideo, 'video-first');
      }
      persist();
      const exhaustedQuery = !result.nextPageToken || tokens.has(result.nextPageToken);
      const highOverlap = queryIndex > 0 && returnedIds.length >= 5 && overlap >= 0.9;
      const current = output();
      options.onProgress?.({ records: current, progress: progress(), plan, coverage: `Found ${progress().qualified} qualified creators and ${progress().contactable} with a public contact method after checking ${checked.length} videos and ${discoveredChannels.size} channels. Search ${queryIndex + 1}/${queries.length}: ${queries[queryIndex]}.` });
      if (current.length >= wanted) break;
      if (exhaustedQuery || highOverlap || queryPages >= pagesPerQuery) {
        if (highOverlap) overlapStopped++;
        if (!exhaustedQuery && !highOverlap && queryPages >= pagesPerQuery) cappedQueries++;
        queryIndex++; queryPages = 0; pageToken = ''; tokens.clear();
        exhausted = queryIndex >= queries.length && cappedQueries === 0 && overlapStopped === 0;
      } else { pageToken = result.nextPageToken; tokens.add(pageToken); }
    }
    // Channel search runs alongside video discovery; only a bounded number of
    // additional channels are inspected, and every upload is verified by API.
    const channelResult = await channelDiscovery;
    options.signal?.throwIfAborted();
    if (channelResult?.error) channelFirstError = String(channelResult.error.message || 'Channel discovery failed').slice(0, 160);
    const candidates = (channelResult?.value?.records || []).filter((item) => item.discoverySources?.includes('channel search') && /^UC[\w-]{22}$/.test(item.id));
    const candidateIds = [...new Set(candidates.map((item) => item.id))];
    channelFirstDiscovered = candidateIds.length;
    for (const id of candidateIds) { if (!discoveredChannels.has(id)) channelExclusiveIds.add(id); discoveredChannels.add(id); }
    const newChannelIds = output().length >= wanted ? [] : candidateIds.filter((id) => !attemptedChannels.has(id)).slice(0, options.channelFirstLimit || 0);
    for (const id of newChannelIds) attemptedChannels.add(id);
    const channelRecords = await channels(newChannelIds, options.signal);
    for (const record of channelRecords) {
      options.signal?.throwIfAborted();
      if (output().length >= wanted) break;
      const subscriberStatus = subscriberQualification(record.subscribers, plan.filters.minSubscribers, plan.filters.maxSubscribers);
      if (subscriberStatus === 'rejected') { rejected++; continue; }
      if (subscriberStatus === 'needs-verification') { needsVerification++; continue; }
      if (!record.uploadsPlaylist) continue;
      channelFirstInspected++;
      try {
        const uploads = await request('playlistItems', { part: 'snippet', playlistId: record.uploadsPlaylist, maxResults: 5, fields: 'items(snippet(resourceId(videoId)))' }, { signal: options.signal });
        const recent = await videos((uploads.items || []).map((item) => item.snippet?.resourceId?.videoId), options.signal);
        const match = recent.find((video) => {
          const published = Date.parse(video.publishedAt);
          const evidence = `${video.title} ${video.description}`.replace(/#[\p{L}\p{N}_-]+/gu, '');
          return video.channelId === record.id && topicMatch(plan.topic, evidence).matched >= topicMatch(plan.topic, plan.topic).required && (!cutoff || (Number.isFinite(published) && published >= cutoff && published <= now().getTime())) && (plan.filters.minVideoViews == null || (video.views != null && video.views >= plan.filters.minVideoViews));
        });
        if (match) await promote(record, match, 'channel-first');
      } catch (error) { options.signal?.throwIfAborted(); channelFirstError = `Recent uploads unavailable: ${String(error.message || error).slice(0, 120)}`; }
      emit(`Checked ${channelFirstInspected} channel-first creators; found ${progress().contactable} public contact methods.`);
    }
    await Promise.allSettled([...contactTasks]);
    options.signal?.throwIfAborted();
    const records = output();
    const stopReason = records.length >= wanted ? 'target reached' : exhausted ? 'available result pages exhausted' : checked.length >= candidateBudget ? 'candidate limit reached' : queryIndex >= queries.length ? 'per-query page or overlap budget reached' : `${maxPages}-page search limit reached`;
    return { query: plan.topic, records, source: 'YouTube Data API v3', retrievedAt: new Date().toISOString(), coverage: `Found ${progress().qualified} qualified creators and ${progress().contactable} with a public contact method after checking ${checked.length} videos and ${discoveredChannels.size} channels${exhausted ? '; available result pages were exhausted' : ` across ${pages} result pages`}. ${needsVerification} need subscriber verification. Channel-first: ${channelFirstDiscovered} discovered, ${channelFirstInspected} inspected, ${channelFirstExclusive} exclusively qualified${channelFirstError ? `; ${channelFirstError}` : ''}. ${pages} YouTube search calls; website research visited ${websitePages} pages and had ${contactErrors} provider errors. DeepSeek calls: ${aiBudget?.calls || 0}; estimated maximum reserved: $${(aiBudget?.reservedUsd || 0).toFixed(4)}. Stop reason: ${stopReason}. ${plan.filters.requireContact ? `Returned ${records.length} of ${wanted} requested ${plan.filters.contactMode === 'email' ? 'business-email' : 'public-contact'} creators; contacts are from creator-published descriptions or creator-linked websites; ownership and deliverability may be unverified.` : ''}`, progress: { ...progress(), stopReason }, plan };
  }

  async function runConversation({ conversationId, message, context, limit = 25, contactMode = 'auto' }, onProgress = null, signal = null) {
    signal?.throwIfAborted();
    const item = conversation(conversationId);
    const page = context && typeof context === 'object' ? { platform: context.platform || 'youtube', kind: context.kind || '', query: cleanText(context.query, 120), url: cleanText(context.url, 600), title: cleanText(context.title, 200), tabId: cleanText(context.tabId, 100), capturedAt: new Date().toISOString() } : null;
    const plan = parseResearchPlan(message, item.research, page, now().getTime());
    if (['email', 'any'].includes(contactMode)) { plan.filters.requireContact = true; plan.filters.contactMode = contactMode; }
    item.messages.push({ role: 'user', text: cleanText(message, 500), context: page, at: new Date().toISOString() });
    let result;
    const effectiveLimit = plan.targetCount || limit;
    const budget = searchBudget(limit);
    if (plan.output === 'thumbnails') {
      const ids = item.research.resultIds || [];
      const records = ids.length ? await videos(ids) : (await searchVideosUncached(plan.topic, { limit, order: plan.sort })).records;
      result = { records, source: 'YouTube Data API v3', retrievedAt: new Date().toISOString(), plan, coverage: `Showing thumbnails for ${records.length} prior or topic-matched videos.` };
    } else if (plan.output === 'creators') {
      if (plan.platform !== 'youtube') throw new Error(`${plan.platform} discovery is not configured; choose YouTube.`);
      if (!plan.topic) throw new Error('Open a supported search page or name a topic before finding creators.');
      const hasStrictFilters = !!plan.filters.requireContact || plan.filters.minSubscribers != null || plan.filters.maxSubscribers != null || plan.filters.minVideoViews != null || plan.filters.publishedAfter != null;
      if (youtubeProvider && (!hasStrictFilters || !apiKey())) {
        try {
          const publish = (update) => {
            const records = update.records.slice(0, Math.max(1, Math.min(50, Number(effectiveLimit) || 25)));
            for (const record of records) data.cache[`creator:${record.id}`] = { at: Date.now(), value: record };
            persist();
            onProgress?.({ records, plan, progress: { videosChecked: update.videosScanned, channelsDiscovered: update.records.length, pages: update.pages || [], matches: 0 }, coverage: `YouTube.js: ${update.records.length} channels discovered, ${update.videosScanned} videos scanned, ${(update.pages || []).reduce((a, b) => a + b, 0)} pages checked. Search results need verification.` });
          };
          const found = await youtubeProvider.discover(plan.topic, publish, { signal, target: Math.max(1, Math.min(50, Number(effectiveLimit) || 25)) });
          const records = found.records.slice(0, Math.max(1, Math.min(50, Number(effectiveLimit) || 25)));
          for (const record of records) data.cache[`creator:${record.id}`] = { at: Date.now(), value: record };
          persist();
          result = { records, plan, source: 'YouTube.js (public search)', retrievedAt: new Date().toISOString(), progress: { videosChecked: found.videosScanned, channelsDiscovered: found.records.length, pages: found.pages || [], matches: 0 }, coverage: `Discovered ${found.records.length} channels across ${(found.pages || []).reduce((a, b) => a + b, 0)} pages using YouTube.js. Search counts are approximate; ${hasStrictFilters ? 'add a YouTube Data API key to verify the requested filters.' : 'verify each creator before relying on statistics.'}${found.failures.length ? ` Partial provider failure: ${found.failures.join('; ')}` : ''}` };
        } catch (error) {
          signal?.throwIfAborted();
          if (!apiKey()) throw new Error(`YouTube.js unavailable: ${error.message}. Add a YouTube Data API key to enable fallback.`);
          result = await searchCreatorsForPlan(plan, effectiveLimit, { ...budget, onProgress, signal });
          result.coverage = `YouTube.js failed (${error.message}); using YouTube Data API. ${result.coverage}`;
        }
      } else result = await searchCreatorsForPlan(plan, effectiveLimit, { ...budget, onProgress, signal });
    }
    else result = { records: [], source: 'YouTube Data API v3', retrievedAt: new Date().toISOString(), plan };
    item.research = { ...plan, resultIds: result.records.map((record) => record.id), selectedIds: item.research.selectedIds || [] };
    item.title = plan.topic || item.title;
    item.messages.push({ role: 'assistant', resultType: plan.output, resultIds: item.research.resultIds, plan, at: new Date().toISOString() });
    item.messages = item.messages.slice(-40); item.updatedAt = new Date().toISOString(); persist();
    return { conversation: item, ...result };
  }
  async function resolveContext(context) {
    if (!context) throw new Error('Select a YouTube video or channel tab.');
    if (context.kind === 'channel') return context.id;
    if (context.kind === 'video') {
      const result = await request('videos', { part: 'snippet', id: context.id, fields: 'items(snippet(channelId))' });
      return result.items?.[0]?.snippet?.channelId || '';
    }
    if (context.kind === 'handle') {
      const result = await request('channels', { part: 'id', forHandle: context.id, fields: 'items(id)' });
      return result.items?.[0]?.id || '';
    }
    return '';
  }
  async function inspectUncached(id) {
    if (!/^UC[\w-]{22}$/.test(id || '')) throw new Error('Invalid YouTube channel ID.');
    const hit = data.cache[`inspect:${id}`];
    if (hit && Date.now() - hit.at < CACHE_MS) return { ...hit.value, cached: true };
    if (!apiKey() && youtubeProvider?.inspect) {
      const record = await youtubeProvider.inspect(id);
      record.links = linksIn(record.description).map((url) => ({ url, sourceUrl: record.url, source: record.source, refreshedAt: record.refreshedAt }));
      record.contacts = contactSummary(record);
      data.cache[`inspect:${id}`] = { at: Date.now(), value: record };
      persist();
      return record;
    }
    const month = monthKey(now());
    if ((data.usage[month] || 0) + pendingLookups >= MONTHLY_LIMIT) throw new Error('Monthly 750 creator lookup limit reached. Overages are disabled.');
    pendingLookups++;
    try {
      const record = (await channels([id]))[0];
      if (!record) throw new Error('YouTube did not return this public channel.');
      if (record.uploadsPlaylist) {
      const uploads = await request('playlistItems', { part: 'snippet', playlistId: record.uploadsPlaylist, maxResults: 5, fields: 'items(snippet(resourceId(videoId),title,publishedAt,description))' });
      const ids = (uploads.items || []).map((item) => item.snippet?.resourceId?.videoId).filter(Boolean);
      if (ids.length) {
        const videos = await request('videos', { part: 'snippet,statistics', id: ids.join(','), fields: 'items(id,snippet(title,description,publishedAt),statistics(viewCount,likeCount,commentCount))' });
        record.recentVideos = (videos.items || []).map((video) => ({ id: video.id, title: video.snippet?.title || '', description: video.snippet?.description || '', publishedAt: video.snippet?.publishedAt || '', views: numberOrNull(video.statistics?.viewCount), likes: numberOrNull(video.statistics?.likeCount), url: `https://www.youtube.com/watch?v=${video.id}`, source: 'YouTube Data API v3', refreshedAt: record.refreshedAt }));
        record.fieldMeta.recentVideos = { source: 'YouTube Data API v3', refreshedAt: record.refreshedAt };
      }
      }
      data.usage[month] = (data.usage[month] || 0) + 1;
      data.cache[`inspect:${id}`] = { at: Date.now(), value: record };
      persist(); return record;
    } finally { pendingLookups--; }
  }
  function inspect(id) {
    if (inspectFlights.has(id)) return inspectFlights.get(id);
    const pending = inspectUncached(id).finally(() => inspectFlights.delete(id));
    inspectFlights.set(id, pending);
    return pending;
  }
  function createList(name) {
    name = cleanText(name, 80);
    if (!name) throw new Error('Enter a list name.');
    const list = { id: crypto.randomUUID(), name, createdAt: new Date().toISOString() };
    data.lists.push(list); persist(); return state();
  }
  function deleteList(id) {
    data.lists = data.lists.filter((list) => list.id !== id);
    for (const saved of Object.values(data.saved)) if (saved.listId === id) saved.listId = '';
    persist(); return state();
  }
  function save(record, patch = {}) {
    if (!record || !/^UC[\w-]{22}$/.test(record.id || '')) throw new Error('Select a YouTube creator.');
    const old = data.saved[record.id] || {};
    const inspected = data.cache[`inspect:${record.id}`]?.value;
    const searched = Object.entries(data.cache).filter(([key]) => key.startsWith('search:')).flatMap(([, entry]) => entry.value?.records || []).find((item) => item.id === record.id);
    const known = data.cache[`creator:${record.id}`]?.value || inspected || searched || old.record;
    if (!known) throw new Error('Search or inspect this creator before saving.');
    record = known;
    const listId = data.lists.some((list) => list.id === patch.listId) ? patch.listId : (old.listId || '');
    const contact = patch.contact && typeof patch.contact === 'object' ? {
      type: ['public email', 'contact page', 'manual YouTube email', 'manual email'].includes(patch.contact.type) ? patch.contact.type : '',
      value: cleanText(patch.contact.value, 300), sourceUrl: cleanText(patch.contact.sourceUrl, 500), sourceTitle: cleanText(patch.contact.sourceTitle, 160),
      status: patch.contact.type?.startsWith('manual') ? 'user-confirmed' : 'found',
    } : old.contact || null;
    data.saved[record.id] = { ...old, record: { ...record, recentVideos: (record.recentVideos || []).slice(0, 5) }, listId, tags: cleanText(patch.tags ?? old.tags, 250), notes: cleanText(patch.notes ?? old.notes, 5000), outreach: STATUSES.has(patch.outreach) ? patch.outreach : (old.outreach || 'not contacted'), contact, addedAt: old.addedAt || new Date().toISOString(), lastChecked: record.refreshedAt || old.lastChecked || '' };
    persist(); return state();
  }
  async function researchContact(id, signal, depth = 'quick') {
    if (!contactResearch) throw new Error('Public website research is unavailable.');
    const saved = data.saved[id];
    const searched = Object.entries(data.cache).filter(([key]) => key.startsWith('search:')).flatMap(([, entry]) => entry.value?.records || []).find((item) => item.id === id);
    const record = data.cache[`creator:${id}`]?.value || data.cache[`inspect:${id}`]?.value || searched || saved?.record;
    if (!record || !/^UC[\w-]{22}$/.test(id)) throw new Error('Search or inspect this creator first.');
    const actualDepth = ['quick', 'standard', 'deep'].includes(depth) ? depth : 'quick';
    const routerKey = openrouter.enabled ? openrouterKey() : '';
    const paidKey = routerKey || (data.deepseek.enabled ? deepseekKey() : '');
    const aiProvider = routerKey ? 'openrouter' : 'deepseek';
    const budget = paidKey ? require('./deepseek-contact.cjs').createBudget() : null;
    const fingerprint = JSON.stringify({ links: (record.links || []).map((link) => link.url), depth: actualDepth, aiProvider: paidKey ? aiProvider : 'disabled' });
    const cached = data.cache[`contact:${id}`];
    const cacheHit = cached && cached.fingerprint === fingerprint && Date.now() - cached.at < CACHE_MS;
    const result = cacheHit ? cached.value : await contactResearch(record, { signal, depth: actualDepth, selectEmail: paidKey ? (input) => require('./deepseek-contact.cjs').selectEmail(input, { apiKey: paidKey, budget, signal, provider: aiProvider }) : null });
    signal?.throwIfAborted();
    if (!cacheHit && result.status !== 'provider-error' && !result.warnings?.length) data.cache[`contact:${id}`] = { at: Date.now(), fingerprint, value: result };
    result.aiUsage = cacheHit ? { cached: true, calls: 0 } : { cached: false, calls: budget?.calls || 0, inputTokens: budget?.inputTokens || 0, outputTokens: budget?.outputTokens || 0, actualUsd: budget?.actualCostKnown ? budget.actualUsd : null, estimatedReservationUsd: budget?.reservedUsd || 0 };
    const updated = { ...record, contactResearch: result, bestContact: record.bestContact || result.candidates?.[0] || null };
    data.cache[`creator:${id}`] = { at: Date.now(), value: updated };
    if (saved) saved.record = { ...saved.record, contactResearch: result, bestContact: saved.record.bestContact || updated.bestContact };
    persist();
    return { record: updated, research: result, state: state() };
  }
  function outreachDraft(id, patch) {
    const saved = data.saved[id];
    if (!saved?.record) throw new Error('Save this creator before preparing a draft.');
    const record = saved.record;
    const manualEmail = ['public email', 'manual YouTube email', 'manual email'].includes(saved.contact?.type) ? saved.contact.value : '';
    const contact = manualEmail || (['business_email', 'public_email'].includes(record.bestContact?.type) ? record.bestContact.value : '') || record.contacts?.email?.value || '';
    if (patch) {
      saved.draft = { to: cleanText(patch.to, 300), subject: cleanText(patch.subject, 200), body: cleanText(patch.body, 5000), updatedAt: new Date().toISOString() };
    } else {
      const title = cleanText(record.matchedVideo?.title, 200);
      saved.draft = { to: contact, subject: 'Partnership inquiry', body: `Hi ${cleanText(record.name, 120) || 'there'},\n\nI found your channel${title ? ` and your video “${title}”` : ''} while researching potential creator partnerships. Would you be open to discussing a collaboration?\n\nBest,\n[Your name]`, updatedAt: new Date().toISOString() };
    }
    persist();
    return state();
  }
  function remove(id) { delete data.saved[id]; persist(); return state(); }
  function clear() { data.lists = []; data.saved = {}; persist(); return state(); }
  function createBoard(name) { name = cleanText(name, 80); if (!name) throw new Error('Enter a board name.'); const board = { id: crypto.randomUUID(), name, createdAt: new Date().toISOString() }; data.boards.push(board); persist(); return state(); }
  function saveVideoReference(record, boardId = '') {
    if (!record || !/^[\w-]{11}$/.test(record.id || '')) throw new Error('Select a YouTube video.');
    if (boardId && !data.boards.some((board) => board.id === boardId)) throw new Error('Select a valid inspiration board.');
    data.videoReferences[record.id] = { record: { ...record }, boardId, addedAt: new Date().toISOString(), lastChecked: record.refreshedAt || new Date().toISOString() };
    persist(); return state();
  }
  function removeVideoReference(id) { delete data.videoReferences[id]; persist(); return state(); }
  function analyticsStatus() { return state().analytics; }
  function analyticsQuery() { throw new Error('Private analytics require an authorized OAuth backend. Configure RIGHTTAB_GOOGLE_OAUTH_CLIENT_ID and backend token storage; public research remains available without it.'); }
  return { state, outreachDraft, researchContact, setKey, setDeepSeek, setOpenRouter, search, searchVideos, fetchVideos, getConversation, newConversation, runConversation, inspect, resolveContext, createList, deleteList, save, remove, clear, createBoard, saveVideoReference, removeVideoReference, analyticsStatus, analyticsQuery, request };
}
module.exports = { createCreatorScout, youtubeContext, platformContext, linksIn, channelRecord, videoRecord, parseResearchPlan, subscriberQualification, bestPublishedContact, discoveryQueries, searchBudget, MONTHLY_LIMIT };
