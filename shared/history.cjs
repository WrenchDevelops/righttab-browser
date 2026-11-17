const { isWebUrl } = require('./url.cjs');
const { chromeTimeToMs } = require('./chrome-time.cjs');

const HISTORY_LIMIT = 5000;

function emptyHistory() {
  return { entries: [] };
}

function mergeHistory(current, incoming) {
  const map = new Map();
  for (const entry of current?.entries || []) {
    if (entry && isWebUrl(entry.url)) map.set(entry.url, { ...entry });
  }
  let added = 0;
  let updated = 0;
  let skipped = 0;
  for (const entry of incoming || []) {
    if (!entry || !isWebUrl(entry.url)) {
      skipped += 1;
      continue;
    }
    const visitedAt = Number.isFinite(entry.visitedAt) ? entry.visitedAt : Date.now();
    const visits = Number.isFinite(entry.visits) ? entry.visits : 1;
    const title = String(entry.title || entry.url).slice(0, 300);
    const existing = map.get(entry.url);
    if (!existing) {
      map.set(entry.url, {
        id: entry.id || globalThis.crypto.randomUUID(),
        url: entry.url,
        title,
        visitedAt,
        visits,
      });
      added += 1;
      continue;
    }
    existing.visits = Math.max(existing.visits || 0, visits);
    if (visitedAt > (existing.visitedAt || 0)) {
      existing.visitedAt = visitedAt;
      if (title) existing.title = title;
    }
    updated += 1;
  }
  const entries = [...map.values()]
    .sort((a, b) => b.visitedAt - a.visitedAt)
    .slice(0, HISTORY_LIMIT);
  return { entries, added, updated, skipped };
}

function chromeRowsToHistory(rows) {
  const entries = [];
  for (const row of rows || []) {
    if (!isWebUrl(row.url)) continue;
    entries.push({
      url: row.url,
      title: row.title || row.url,
      visits: Number(row.visit_count) || 1,
      visitedAt: chromeTimeToMs(row.last_visit_time) || Date.now(),
    });
  }
  return entries;
}

function searchHistory(entries, query, limit = 200) {
  const q = String(query || '').trim().toLowerCase();
  const sorted = [...(entries || [])].sort((a, b) => b.visitedAt - a.visitedAt);
  const filtered = q
    ? sorted.filter((entry) => entry.url.toLowerCase().includes(q) || (entry.title || '').toLowerCase().includes(q))
    : sorted;
  return filtered.slice(0, limit);
}

// Address-bar matches should feel different from the History screen: a site
// that someone repeatedly opens by a short prefix belongs ahead of a one-off,
// more recent match. Keep this separate so the full History view remains
// ordered strictly by recency.
function suggestHistory(entries, query, limit = 6, now = Date.now()) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];

  return (entries || [])
    .filter((entry) => {
      const title = String(entry.title || '').toLowerCase();
      const url = String(entry.url || '').toLowerCase();
      return title.includes(q) || url.includes(q);
    })
    .map((entry) => {
      let hostname = '';
      try { hostname = new URL(entry.url).hostname.replace(/^www\./, '').toLowerCase(); } catch { /* invalid rows are ignored elsewhere */ }
      const title = String(entry.title || '').toLowerCase();
      const prefix = hostname.startsWith(q) || title.startsWith(q);
      const wordStart = hostname.split(/[.-]/).some((part) => part.startsWith(q))
        || title.split(/\s+/).some((part) => part.startsWith(q));
      const visits = Math.max(1, Number(entry.visits) || 1);
      const ageDays = Math.max(0, now - (Number(entry.visitedAt) || 0)) / 86400000;
      const score = (prefix ? 1000 : wordStart ? 700 : 400)
        + Math.min(visits, 100) * 10
        + Math.max(0, 90 - Math.min(ageDays, 90));
      return { entry, score };
    })
    .sort((a, b) => b.score - a.score || (b.entry.visitedAt || 0) - (a.entry.visitedAt || 0))
    .slice(0, limit)
    .map(({ entry }) => entry);
}

module.exports = {
  HISTORY_LIMIT,
  emptyHistory,
  mergeHistory,
  chromeRowsToHistory,
  searchHistory,
  suggestHistory,
};
