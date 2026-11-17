const WEBKIT_EPOCH_OFFSET_MS = 11644473600000;

function chromeTimeToMs(value) {
  const raw = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(raw) || raw <= 0) return null;
  const ms = raw > 1e14 ? raw / 1000 - WEBKIT_EPOCH_OFFSET_MS : raw;
  if (ms < Date.UTC(1990, 0, 1) || ms > Date.now() + 1000 * 60 * 60 * 24 * 366) return null;
  return Math.round(ms);
}

function msToChromeTime(ms) {
  return Math.round((ms + WEBKIT_EPOCH_OFFSET_MS) * 1000);
}

module.exports = { chromeTimeToMs, msToChromeTime, WEBKIT_EPOCH_OFFSET_MS };
