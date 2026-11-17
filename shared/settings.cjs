const path = require('path');
const Themes = require('./themes.js');
const { normalizeHomepage, normalizeCustomEngines } = require('./homepage.cjs');
const STARTUP_PAGES = ['righttab', 'chatgpt', 'google'];
const NEW_TAB_PAGES = ['righttab', 'startup', 'chatgpt', 'google'];
const BUILTIN_ENGINES = ['google', 'duckduckgo', 'bing', 'brave'];
const DEFAULT_SETTINGS = {
  startupPage: 'righttab',
  newTabPage: 'righttab',
  searchEngine: 'google',
  customSearchEngines: [],
  searchSuggestions: true,
  homepage: null,
  restoreSession: false,
  theme: 'system',
  appearance: Themes.normalize({}),
  showBookmarkBar: true,
  bookmarkBarMode: 'complex',
  sidebarWidth: 252,
  sidebarCollapsed: false,
  downloadDirectory: null,
  askWhereToSave: false,
  doNotTrack: false,
  httpsOnly: false,
  completedSetup: false,
  importOffered: false,
  zoomByOrigin: {},
  sitePermissions: {},
  installedExtensions: [],
  lastBounds: null,
};

const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 420;
const SIDEBAR_COLLAPSED = 56;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function cleanText(value, max) {
  return typeof value === 'string' ? value.replace(/\0/g, '').slice(0, max) : '';
}

function normalizeInstalledExtension(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const installId = cleanText(item.installId || item.id, 80);
  if (!/^[A-Za-z0-9-]{8,80}$/.test(installId)) return null;
  const extensionPath = cleanText(item.path, 1024);
  if (!path.isAbsolute(extensionPath)) return null;
  const list = (value, limit) => (Array.isArray(value) ? value : [])
    .filter((entry) => typeof entry === 'string')
    .map((entry) => entry.slice(0, 400))
    .slice(0, limit);
  return {
    installId,
    chromiumId: cleanText(item.chromiumId || '', 64),
    name: cleanText(item.name, 200) || 'Extension',
    version: cleanText(item.version, 40),
    path: extensionPath,
    sourcePath: cleanText(item.sourcePath, 1024),
    enabled: item.enabled !== false && !item.error,
    pinned: item.pinned === true,
    source: ['chrome-import', 'builtin'].includes(item.source) ? item.source : 'unpacked',
    builtinId: cleanText(item.builtinId || '', 80),
    loadError: cleanText(item.loadError || item.error, 500),
    loadWarnings: list(item.loadWarnings, 12),
    runtimeErrors: list(item.runtimeErrors, 6),
  };
}

function normalizeInstalledExtensions(source) {
  const raw = Array.isArray(source.installedExtensions)
    ? source.installedExtensions
    : (Array.isArray(source.loadedExtensions) ? source.loadedExtensions : []);
  const seen = new Set();
  const items = [];
  for (const item of raw) {
    const normalized = normalizeInstalledExtension(item);
    if (!normalized || seen.has(normalized.installId)) continue;
    seen.add(normalized.installId);
    items.push(normalized);
    if (items.length >= 40) break;
  }
  return items;
}

function normalizeSettings(input) {
  const source = input && typeof input === 'object' ? input : {};
  const settings = { ...DEFAULT_SETTINGS };

  settings.startupPage = STARTUP_PAGES.includes(source.startupPage) ? source.startupPage : 'righttab';
  settings.newTabPage = NEW_TAB_PAGES.includes(source.newTabPage) ? source.newTabPage : 'righttab';
  settings.customSearchEngines = normalizeCustomEngines(source.customSearchEngines);
  const customIds = new Set(settings.customSearchEngines.map((engine) => engine.id));
  settings.searchEngine = BUILTIN_ENGINES.includes(source.searchEngine) || customIds.has(source.searchEngine)
    ? source.searchEngine
    : 'google';
  settings.searchSuggestions = source.searchSuggestions !== false;
  settings.homepage = normalizeHomepage(source.homepage);
  settings.restoreSession = source.restoreSession === true;
  settings.theme = ['system', 'light', 'dark'].includes(source.theme) ? source.theme : 'system';
  settings.appearance = Themes.normalize(source.appearance || (source.theme === 'dark' ? { selected: 'midnight' } : {}));
  // Preserve the old boolean preference while offering a less crowded bar.
  // A stored mode wins unless an old profile explicitly hid the bar.
  settings.bookmarkBarMode = ['hidden', 'simple', 'complex'].includes(source.bookmarkBarMode)
    ? source.bookmarkBarMode
    : (source.showBookmarkBar === false ? 'hidden' : 'complex');
  if (source.showBookmarkBar === false) settings.bookmarkBarMode = 'hidden';
  settings.showBookmarkBar = settings.bookmarkBarMode !== 'hidden';
  settings.sidebarCollapsed = source.sidebarCollapsed === true;
  settings.sidebarWidth = Number.isFinite(source.sidebarWidth)
    ? clamp(Math.round(source.sidebarWidth), SIDEBAR_MIN, SIDEBAR_MAX)
    : DEFAULT_SETTINGS.sidebarWidth;
  settings.downloadDirectory = typeof source.downloadDirectory === 'string' && source.downloadDirectory.trim()
    ? source.downloadDirectory
    : null;
  settings.askWhereToSave = source.askWhereToSave === true;
  settings.doNotTrack = source.doNotTrack === true;
  settings.httpsOnly = source.httpsOnly === true;
  settings.completedSetup = source.completedSetup === true;
  settings.importOffered = source.importOffered === true;
  settings.sitePermissions = source.sitePermissions && typeof source.sitePermissions === 'object' && !Array.isArray(source.sitePermissions)
    ? Object.fromEntries(
      Object.entries(source.sitePermissions)
        .filter(([key, value]) => typeof key === 'string' && key.length < 300 && (value === 'allow' || value === 'deny'))
        .slice(0, 500),
    )
    : {};
  settings.zoomByOrigin = source.zoomByOrigin && typeof source.zoomByOrigin === 'object' && !Array.isArray(source.zoomByOrigin)
    ? Object.fromEntries(
      Object.entries(source.zoomByOrigin)
        .filter(([host, zoom]) => typeof host === 'string' && host.length < 200 && Number.isFinite(zoom))
        .slice(0, 300)
        .map(([host, zoom]) => [host, clamp(zoom, 0.3, 3)]),
    )
    : {};
  settings.installedExtensions = normalizeInstalledExtensions(source);
  if (source.lastBounds && Number.isFinite(source.lastBounds.width) && Number.isFinite(source.lastBounds.height)) {
    settings.lastBounds = {
      x: Number.isFinite(source.lastBounds.x) ? source.lastBounds.x : undefined,
      y: Number.isFinite(source.lastBounds.y) ? source.lastBounds.y : undefined,
      width: clamp(source.lastBounds.width, 760, 4000),
      height: clamp(source.lastBounds.height, 520, 3000),
    };
  }
  return settings;
}

function applySettingsPatch(current, patch) {
  const next = { ...current };
  if (!patch || typeof patch !== 'object') return normalizeSettings(next);
  if (Object.prototype.hasOwnProperty.call(patch, 'homepage')) {
    next.homepage = { ...(current.homepage || {}), ...patch.homepage };
  }
  const allowed = [
    'startupPage',
    'newTabPage',
    'searchEngine',
    'customSearchEngines',
    'searchSuggestions',
    'restoreSession',
    'theme',
    'appearance',
    'showBookmarkBar',
    'bookmarkBarMode',
    'sidebarWidth',
    'sidebarCollapsed',
    'askWhereToSave',
    'doNotTrack',
    'httpsOnly',
    'completedSetup',
    'importOffered',
  ];
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) next[key] = patch[key];
  }
  return normalizeSettings(next);
}

module.exports = {
  DEFAULT_SETTINGS,
  SIDEBAR_MIN,
  SIDEBAR_MAX,
  SIDEBAR_COLLAPSED,
  normalizeSettings,
  applySettingsPatch,
};
