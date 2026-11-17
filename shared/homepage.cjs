const WALLPAPERS = Object.freeze([
  Object.freeze({ id: 'summit', name: 'Summit', kind: 'image', file: 'summit.jpg', tone: 'dark' }),
  Object.freeze({ id: 'alpine', name: 'Alpine', kind: 'image', file: 'alpine.jpg', tone: 'light' }),
  Object.freeze({ id: 'coast', name: 'Poppies', kind: 'image', file: 'coast.jpg', tone: 'dark' }),
  Object.freeze({ id: 'dusk', name: 'Dusk', kind: 'gradient', tone: 'dark', gradient: 'linear-gradient(168deg, #241733 0%, #4c3b68 46%, #c98484 100%)' }),
  Object.freeze({ id: 'dawn', name: 'Dawn', kind: 'gradient', tone: 'light', gradient: 'linear-gradient(168deg, #f7f1e8 0%, #ead4c4 48%, #d5e0ea 100%)' }),
  Object.freeze({ id: 'ink', name: 'Ink', kind: 'color', tone: 'dark', color: '#14161c' }),
  Object.freeze({ id: 'paper', name: 'Paper', kind: 'color', tone: 'light', color: '#f3f0e8' }),
  Object.freeze({ id: 'none', name: 'None', kind: 'none', tone: 'dark' }),
]);

const DEFAULT_SHORTCUTS = Object.freeze([
  Object.freeze({ id: 'youtube', title: 'YouTube', url: 'https://www.youtube.com/', icon: '', openInNewTab: false }),
  Object.freeze({ id: 'gmail', title: 'Gmail', url: 'https://mail.google.com/', icon: '', openInNewTab: false }),
  Object.freeze({ id: 'drive', title: 'Google Drive', url: 'https://drive.google.com/', icon: '', openInNewTab: false }),
  Object.freeze({ id: 'github', title: 'GitHub', url: 'https://github.com/', icon: '', openInNewTab: false }),
  Object.freeze({ id: 'discord', title: 'Discord', url: 'https://discord.com/', icon: '', openInNewTab: false }),
]);

const WEATHER_LABELS = {
  0: 'Clear',
  1: 'Mostly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  56: 'Freezing drizzle',
  57: 'Freezing drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  66: 'Freezing rain',
  67: 'Freezing rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Light showers',
  81: 'Showers',
  82: 'Heavy showers',
  85: 'Snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm',
  99: 'Thunderstorm',
};

const PAGE_FILES = Object.freeze({
  '/': 'index.html',
  '/index.html': 'index.html',
  '/newtab.css': 'newtab.css',
  '/newtab.js': 'newtab.js',
  '/logo.png': 'logo.png',
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function cleanLine(value, max) {
  return String(value || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);
}

function defaultShortcuts() {
  return DEFAULT_SHORTCUTS.map((item) => ({ ...item }));
}

function wallpaperById(id) {
  return WALLPAPERS.find((item) => item.id === id) || null;
}

function webShortcutUrl(value) {
  const text = cleanLine(value, 500);
  if (!text) return '';
  let url;
  try { url = new URL(text); } catch { return ''; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
  if (url.username || url.password) return '';
  return url.href;
}

function shortcutIcon(value) {
  const text = cleanLine(value, 400);
  if (!text) return '';
  if (/^righttab:\/\/newtab\/user\/icon\/[a-z0-9-]{8,80}\.(png|jpe?g|webp)$/.test(text)) return text;
  try {
    const url = new URL(text);
    if (url.protocol === 'https:' && !url.username && !url.password) return url.href;
  } catch { /* ignore */ }
  return '';
}

function normalizeShortcut(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const url = webShortcutUrl(input.url);
  const title = cleanLine(input.title, 40);
  const id = cleanLine(input.id, 80);
  if (!url || !title || !/^[a-z0-9-]{1,80}$/i.test(id)) return null;
  return { id, title, url, icon: shortcutIcon(input.icon), openInNewTab: input.openInNewTab === true };
}

function normalizeShortcuts(value) {
  if (!Array.isArray(value)) return defaultShortcuts();
  const seen = new Set();
  const items = [];
  for (const item of value) {
    const shortcut = normalizeShortcut(item);
    if (!shortcut || seen.has(shortcut.id)) continue;
    seen.add(shortcut.id);
    items.push(shortcut);
    if (items.length >= 24) break;
  }
  return items;
}

function sanitizeLocation(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return {
    name: cleanLine(input.name, 80),
    region: cleanLine(input.region, 80),
    latitude: Math.round(latitude * 1000) / 1000,
    longitude: Math.round(longitude * 1000) / 1000,
  };
}

function locationKey(location) {
  if (!location) return '';
  return `${location.latitude.toFixed(3)},${location.longitude.toFixed(3)}`;
}

function weatherLabel(code) {
  return Object.prototype.hasOwnProperty.call(WEATHER_LABELS, code) ? WEATHER_LABELS[code] : '';
}

function weatherIcon(code, isDay) {
  if (code === 0) return isDay === false ? 'clear-night' : 'clear';
  if (code === 1 || code === 2) return isDay === false ? 'partly-night' : 'partly';
  if (code === 3) return 'cloud';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 71 && code <= 77 || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'thunder';
  if (code >= 51 && code <= 67 || code >= 80 && code <= 82) return 'rain';
  return '';
}

function normalizePoint(input) {
  if (!input || typeof input !== 'object') return null;
  const temperature = Number(input.temperature);
  const code = Number(input.code);
  if (!Number.isFinite(temperature) || !Number.isInteger(code) || !weatherLabel(code)) return null;
  const time = cleanLine(input.time, 40);
  if (!time) return null;
  return { time, temperature: Math.round(temperature), code };
}

function normalizeReport(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const temperature = Number(input.temperature);
  const code = Number(input.code);
  const label = weatherLabel(code);
  if (!Number.isFinite(temperature) || !label) return null;
  const icon = weatherIcon(code, input.isDay === false ? false : input.isDay === true ? true : null);
  const hourly = (Array.isArray(input.hourly) ? input.hourly : []).map(normalizePoint).filter(Boolean).slice(0, 24);
  const daily = (Array.isArray(input.daily) ? input.daily : []).map((item) => {
    if (!item || typeof item !== 'object') return null;
    const high = Number(item.high);
    const low = Number(item.low);
    const dayCode = Number(item.code);
    const time = cleanLine(item.time, 40);
    if (!Number.isFinite(high) || !Number.isFinite(low) || !time || !weatherLabel(dayCode)) return null;
    return { time, high: Math.round(high), low: Math.round(low), code: dayCode };
  }).filter(Boolean).slice(0, 5);
  return {
    temperature: Math.round(temperature),
    code,
    label,
    icon,
    isDay: input.isDay === false ? false : input.isDay === true ? true : null,
    unit: input.unit === 'celsius' ? 'celsius' : 'fahrenheit',
    locationName: cleanLine(input.locationName, 80),
    region: cleanLine(input.region, 80),
    observedAt: cleanLine(input.observedAt, 40),
    hourly,
    daily,
  };
}

function normalizeCache(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const report = normalizeReport(input.report);
  const fetchedAt = Number(input.fetchedAt);
  const key = cleanLine(input.locationKey, 40);
  if (!report || !Number.isFinite(fetchedAt) || !key) return null;
  return {
    fetchedAt,
    unit: input.unit === 'celsius' ? 'celsius' : 'fahrenheit',
    locationKey: key,
    report,
  };
}

function readCachedWeather(cache, location, unit, now, { maxAge = 30 * 60 * 1000, allowStale = false } = {}) {
  const stored = normalizeCache(cache);
  if (!stored || stored.unit !== (unit === 'celsius' ? 'celsius' : 'fahrenheit')) return null;
  if (stored.locationKey !== locationKey(location)) return null;
  if (!Number.isFinite(now) || stored.fetchedAt > now + 60 * 1000) return null;
  if (!allowStale && now - stored.fetchedAt > maxAge) return null;
  return stored.report;
}

function validTimeZone(value) {
  const text = cleanLine(value, 80);
  if (!text) return '';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: text }).format(new Date());
    return text;
  } catch {
    return '';
  }
}

function customWallpaperUrl(value) {
  const text = cleanLine(value, 180);
  return /^righttab:\/\/newtab\/user\/wallpaper\/[a-z0-9-]{8,80}\.(png|jpe?g|webp)$/.test(text) ? text : '';
}

function normalizeHomepage(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const flag = (key, fallback) => (typeof source[key] === 'boolean' ? source[key] : fallback);
  const wallpaper = wallpaperById(source.wallpaper) ? source.wallpaper : (source.wallpaper === 'custom' ? 'custom' : 'summit');
  const glass = Number(source.glass);
  const dimming = Number(source.dimming);
  const shift = Number(source.contentShift);
  const density = Number(source.shortcutDensity);
  const accent = typeof source.accent === 'string' && /^#[0-9a-f]{6}$/i.test(source.accent) ? source.accent.toUpperCase() : '';
  const recent = (Array.isArray(source.recentSearches) ? source.recentSearches : [])
    .map((item) => cleanLine(item, 120))
    .filter(Boolean)
    .slice(0, 8);
  return {
    showLogo: flag('showLogo', true),
    showShortcuts: flag('showShortcuts', true),
    showWeather: flag('showWeather', true),
    showClock: flag('showClock', true),
    wallpaper,
    customWallpaper: customWallpaperUrl(source.customWallpaper),
    glass: Number.isFinite(glass) ? clamp(glass, 0.08, 0.42) : 0.16,
    dimming: Number.isFinite(dimming) ? clamp(dimming, 0, 0.7) : 0.22,
    shortcutSize: ['compact', 'regular', 'large'].includes(source.shortcutSize) ? source.shortcutSize : 'regular',
    shortcutDensity: [5, 6, 7].includes(density) ? density : 6,
    iconStyle: ['default', 'clear', 'clear-colored'].includes(source.iconStyle) ? source.iconStyle : 'default',
    contentShift: Number.isFinite(shift) ? Math.round(clamp(shift, -80, 120)) : 0,
    clockFormat: source.clockFormat === '24' ? '24' : '12',
    showSeconds: flag('showSeconds', false),
    timeZone: validTimeZone(source.timeZone),
    clockGlass: flag('clockGlass', false),
    weatherGlass: flag('weatherGlass', true),
    weatherUnit: source.weatherUnit === 'celsius' ? 'celsius' : 'fahrenheit',
    weatherLocation: sanitizeLocation(source.weatherLocation),
    weatherCache: normalizeCache(source.weatherCache),
    shortcuts: normalizeShortcuts(source.shortcuts),
    recentSearches: recent,
    accent,
    contrast: ['light', 'dark'].includes(source.contrast) ? source.contrast : 'auto',
    reducedTransparency: flag('reducedTransparency', false),
  };
}

const HOMEPAGE_KEYS = [
  'showLogo', 'showShortcuts', 'showWeather', 'showClock', 'wallpaper', 'customWallpaper',
  'glass', 'dimming', 'shortcutSize', 'shortcutDensity', 'iconStyle', 'contentShift', 'clockFormat',
  'showSeconds', 'timeZone', 'clockGlass', 'weatherGlass', 'weatherUnit', 'weatherLocation',
  'weatherCache', 'shortcuts', 'recentSearches', 'accent', 'contrast', 'reducedTransparency',
];

function applyHomepagePatch(current, patch) {
  const next = { ...(current || {}) };
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return normalizeHomepage(next);
  for (const key of HOMEPAGE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) next[key] = patch[key];
  }
  return normalizeHomepage(next);
}

function addShortcut(shortcuts, input) {
  const list = normalizeShortcuts(shortcuts);
  if (list.length >= 24) return { shortcuts: list, error: 'You can keep up to 24 shortcuts.' };
  const shortcut = normalizeShortcut({ ...input, id: cleanLine(input?.id, 80) || `s-${Date.now().toString(36)}` });
  if (!shortcut) return { shortcuts: list, error: 'Enter a name and an http or https address.' };
  if (list.some((item) => item.id === shortcut.id)) shortcut.id = `${shortcut.id}-${list.length}`;
  return { shortcuts: [...list, shortcut] };
}

function updateShortcut(shortcuts, input) {
  const list = normalizeShortcuts(shortcuts);
  const shortcut = normalizeShortcut(input);
  if (!shortcut) return { shortcuts: list, error: 'Enter a name and an http or https address.' };
  const index = list.findIndex((item) => item.id === shortcut.id);
  if (index === -1) return { shortcuts: list, error: 'That shortcut is no longer on the page.' };
  const next = list.slice();
  next[index] = shortcut;
  return { shortcuts: next };
}

function removeShortcut(shortcuts, id) {
  const list = normalizeShortcuts(shortcuts);
  return list.filter((item) => item.id !== id);
}

function reorderShortcuts(shortcuts, ids) {
  const list = normalizeShortcuts(shortcuts);
  if (!Array.isArray(ids) || ids.length !== list.length) return list;
  const map = new Map(list.map((item) => [item.id, item]));
  if (new Set(ids).size !== ids.length || ids.some((id) => !map.has(id))) return list;
  return ids.map((id) => map.get(id));
}

function rememberSearch(list, query) {
  const text = cleanLine(query, 120).replace(/\s+/g, ' ');
  const prior = (Array.isArray(list) ? list : []).map((item) => cleanLine(item, 120)).filter(Boolean);
  if (!text) return prior.slice(0, 8);
  return [text, ...prior.filter((item) => item.toLowerCase() !== text.toLowerCase())].slice(0, 8);
}

function matchRecent(list, query) {
  const q = cleanLine(query, 120).toLowerCase();
  return (Array.isArray(list) ? list : [])
    .map((item) => cleanLine(item, 120))
    .filter((item) => item && (!q || item.toLowerCase().includes(q)))
    .slice(0, 5);
}

function toneFor(theme, homepage, wallpaper) {
  if (homepage.contrast === 'light' || homepage.contrast === 'dark') return homepage.contrast;
  if (homepage.wallpaper === 'custom') return 'dark';
  if (!wallpaper || wallpaper.kind === 'none') return theme?.mode === 'light' ? 'light' : 'dark';
  return wallpaper.tone === 'light' ? 'light' : 'dark';
}

function homepageVars(theme, homepage) {
  const page = normalizeHomepage(homepage);
  const wallpaper = page.wallpaper === 'custom' ? { id: 'custom', kind: 'image', tone: 'dark' } : wallpaperById(page.wallpaper);
  const tone = toneFor(theme || { mode: 'dark', colors: {} }, page, wallpaper);
  const light = tone === 'light';
  const accent = page.accent || (theme?.colors?.accent && /^#[0-9a-f]{6}$/i.test(theme.colors.accent) ? theme.colors.accent.toUpperCase() : '#8E8E93');
  const alpha = page.reducedTransparency ? 0.9 : page.glass;
  const glass = light ? `rgba(255,255,255,${clamp(alpha + 0.34, 0.42, 0.94).toFixed(2)})` : `rgba(255,255,255,${alpha.toFixed(2)})`;
  const border = light ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.22)';
  return {
    tone,
    accent,
    vars: {
      '--rt-accent': accent,
      '--rt-glass-bg': glass,
      '--rt-glass-border': border,
      '--rt-text-primary': light ? '#1c1a17' : '#ffffff',
      '--rt-text-secondary': light ? 'rgba(28,26,23,0.66)' : 'rgba(255,255,255,0.72)',
      '--rt-glass-blur': page.reducedTransparency ? '0px' : '22px',
      '--rt-shadow': light ? '0 12px 32px rgba(48,38,28,0.12)' : '0 14px 36px rgba(0,0,0,0.28)',
      '--rt-dim': page.dimming.toFixed(2),
      '--rt-shift': `${page.contentShift}px`,
    },
  };
}

function backgroundDescriptor(homepage) {
  const page = normalizeHomepage(homepage);
  if (page.wallpaper === 'custom') {
    return page.customWallpaper
      ? { type: 'image', src: page.customWallpaper }
      : { type: 'image', src: 'wallpapers/summit.jpg' };
  }
  const wallpaper = wallpaperById(page.wallpaper) || wallpaperById('summit');
  if (wallpaper.kind === 'image') return { type: 'image', src: `wallpapers/${wallpaper.file}` };
  if (wallpaper.kind === 'gradient') return { type: 'gradient', id: wallpaper.id };
  if (wallpaper.kind === 'color') return { type: 'color', id: wallpaper.id };
  return { type: 'none', id: 'none' };
}

function resolveHomepageRoute(pathname) {
  let path = String(pathname || '');
  try { path = decodeURIComponent(path); } catch { return null; }
  if (path.includes('\0') || path.includes('\\') || path.split('/').includes('..')) return null;
  if (PAGE_FILES[path]) return { kind: 'page', file: PAGE_FILES[path] };
  const wallpaper = path.match(/^\/wallpapers\/([a-z0-9-]+)\.(jpg|jpeg|png|webp)$/);
  if (wallpaper) {
    const known = WALLPAPERS.find((item) => item.file && item.id === wallpaper[1] && item.file.endsWith(wallpaper[2] === 'jpeg' ? '.jpg' : `.${wallpaper[2]}`));
    if (!known) return null;
    return { kind: 'wallpaper', file: known.file };
  }
  const user = path.match(/^\/user\/(wallpaper|icon)\/([a-z0-9-]{8,80})\.(png|jpe?g|webp)$/);
  if (!user) return null;
  const ext = user[3] === 'jpeg' ? 'jpg' : user[3];
  return { kind: 'user', bucket: user[1] === 'icon' ? 'icons' : 'wallpapers', file: `${user[2]}.${ext}` };
}

function parseForecast(data, location, unit) {
  const current = data?.current;
  const temperature = Number(current?.temperature_2m);
  const code = Number(current?.weather_code);
  if (!Number.isFinite(temperature) || !Number.isInteger(code) || !weatherLabel(code)) return null;
  const hourlyTimes = Array.isArray(data?.hourly?.time) ? data.hourly.time : [];
  const hourlyTemps = Array.isArray(data?.hourly?.temperature_2m) ? data.hourly.temperature_2m : [];
  const hourlyCodes = Array.isArray(data?.hourly?.weather_code) ? data.hourly.weather_code : [];
  const hourly = [];
  const nowStamp = cleanLine(current.time, 40);
  for (let index = 0; index < hourlyTimes.length && hourly.length < 24; index += 1) {
    if (nowStamp && String(hourlyTimes[index]) < nowStamp) continue;
    const point = normalizePoint({ time: hourlyTimes[index], temperature: hourlyTemps[index], code: hourlyCodes[index] });
    if (point) hourly.push(point);
  }
  const dailyTimes = Array.isArray(data?.daily?.time) ? data.daily.time : [];
  const dailyCodes = Array.isArray(data?.daily?.weather_code) ? data.daily.weather_code : [];
  const highs = Array.isArray(data?.daily?.temperature_2m_max) ? data.daily.temperature_2m_max : [];
  const lows = Array.isArray(data?.daily?.temperature_2m_min) ? data.daily.temperature_2m_min : [];
  const daily = [];
  for (let index = 0; index < dailyTimes.length && daily.length < 5; index += 1) {
    const high = Number(highs[index]);
    const low = Number(lows[index]);
    const dayCode = Number(dailyCodes[index]);
    const time = cleanLine(dailyTimes[index], 40);
    if (!time || !Number.isFinite(high) || !Number.isFinite(low) || !weatherLabel(dayCode)) continue;
    daily.push({ time, high: Math.round(high), low: Math.round(low), code: dayCode });
  }
  const isDay = current.is_day === 0 || current.is_day === false ? false : current.is_day === 1 || current.is_day === true ? true : null;
  return normalizeReport({
    temperature,
    code,
    isDay,
    unit: unit === 'celsius' ? 'celsius' : 'fahrenheit',
    locationName: location?.name || '',
    region: location?.region || '',
    observedAt: current.time,
    hourly,
    daily,
  });
}

function sanitizePlaces(results) {
  const list = Array.isArray(results) ? results : [];
  const places = [];
  for (const item of list) {
    const location = sanitizeLocation({
      name: item?.name,
      region: [item?.admin1, item?.country].filter(Boolean).join(', '),
      latitude: item?.latitude,
      longitude: item?.longitude,
    });
    if (location?.name) places.push(location);
    if (places.length >= 5) break;
  }
  return places;
}

function parseRemoteSuggestions(payload) {
  const source = Array.isArray(payload) && Array.isArray(payload[1])
    ? payload[1]
    : Array.isArray(payload) ? payload : [];
  const items = [];
  for (const item of source) {
    const text = cleanLine(typeof item === 'string' ? item : item?.phrase, 120);
    if (!text || items.some((entry) => entry.toLowerCase() === text.toLowerCase())) continue;
    items.push(text);
    if (items.length >= 6) break;
  }
  return items;
}

function formatClock(date, { hour12 = true, seconds = false, timeZone = '' } = {}) {
  const when = date instanceof Date ? date : new Date(date);
  const zone = validTimeZone(timeZone);
  const timeOptions = { hour: 'numeric', minute: '2-digit', hour12: hour12 !== false };
  const dateOptions = { weekday: 'long', month: 'long', day: 'numeric' };
  if (seconds) timeOptions.second = '2-digit';
  if (zone) {
    timeOptions.timeZone = zone;
    dateOptions.timeZone = zone;
  }
  return {
    time: new Intl.DateTimeFormat('en-US', timeOptions).format(when),
    date: new Intl.DateTimeFormat('en-US', dateOptions).format(when),
  };
}

function monthGrid(year, month) {
  const safeYear = Number(year);
  const safeMonth = Number(month);
  if (!Number.isInteger(safeYear) || !Number.isInteger(safeMonth) || safeMonth < 0 || safeMonth > 11) return null;
  const first = new Date(safeYear, safeMonth, 1);
  const days = new Date(safeYear, safeMonth + 1, 0).getDate();
  return { year: safeYear, month: safeMonth, start: first.getDay(), days };
}

function validEngineTemplate(template) {
  const text = cleanLine(template, 300);
  if (!text || text.split('%s').length !== 2) return '';
  let url;
  try { url = new URL(text.replace('%s', 'query')); } catch { return ''; }
  if (url.protocol !== 'https:' || url.username || url.password) return '';
  return text;
}

function normalizeCustomEngines(input) {
  const list = Array.isArray(input) ? input : [];
  const seen = new Set();
  const engines = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const id = cleanLine(item.id, 80);
    const name = cleanLine(item.name, 40);
    const template = validEngineTemplate(item.template);
    if (!/^custom-[a-z0-9-]{8,80}$/.test(id) || !name || !template || seen.has(id)) continue;
    seen.add(id);
    engines.push({ id, name, template });
    if (engines.length >= 8) break;
  }
  return engines;
}

module.exports = {
  WALLPAPERS,
  DEFAULT_SHORTCUTS,
  wallpaperById,
  normalizeHomepage,
  applyHomepagePatch,
  addShortcut,
  updateShortcut,
  removeShortcut,
  reorderShortcuts,
  rememberSearch,
  matchRecent,
  homepageVars,
  backgroundDescriptor,
  resolveHomepageRoute,
  parseForecast,
  sanitizePlaces,
  sanitizeLocation,
  locationKey,
  readCachedWeather,
  weatherLabel,
  parseRemoteSuggestions,
  formatClock,
  monthGrid,
  normalizeCustomEngines,
  validEngineTemplate,
  webShortcutUrl,
};
