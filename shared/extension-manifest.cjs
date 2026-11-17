const fs = require('fs');
const path = require('path');

const DOCUMENTED_PARTIAL = {
  storage: 'chrome.storage.local is supported. chrome.storage.sync is stored on this Mac only and is not synced to other devices. chrome.storage.managed is not available.',
  tabs: 'Only part of chrome.tabs works: sendMessage, reload, executeScript, and limited query and update. Creating tabs, tab events, and the special tab id -1 are not available.',
  webRequest: 'chrome.webRequest can be overridden by RightTab’s own request handler, which sets Do Not Track when that setting is on.',
  management: 'Only some chrome.management methods are available.',
};

const DOCUMENTED_YES = {
  scripting: 'The extension can insert scripts on sites it is allowed to access.',
};

const UNSUPPORTED_PERMISSIONS = {
  sidePanel: 'chrome.sidePanel is not an Electron API. If the manifest names a side panel page, RightTab can open that page from the extension menu. The extension cannot open or resize it itself.',
  contextMenus: 'chrome.contextMenus is not available. Menu items from this extension will not appear in the page menu.',
  commands: 'chrome.commands is not available. Shortcuts declared by this extension will not run.',
  identity: 'chrome.identity is not available. Sign-in that uses it will not work, and RightTab does not give the extension a desktop login API.',
  nativeMessaging: 'Native messaging is not available. This extension cannot start or talk to other programs on this Mac.',
  debugger: 'chrome.debugger is not available.',
  downloads: 'chrome.downloads is not available. Downloads stay on RightTab’s own downloads button.',
  cookies: 'chrome.cookies is not available to extensions.',
  notifications: 'chrome.notifications is not available.',
  alarms: 'chrome.alarms is not a documented Electron extension API. Scheduled alarms may not run.',
  webNavigation: 'chrome.webNavigation is not a documented Electron extension API.',
  tabGroups: 'chrome.tabGroups is not available.',
  offscreen: 'chrome.offscreen is not available.',
  declarativeNetRequest: 'chrome.declarativeNetRequest is not a documented Electron extension API. Request rules from this extension may not run.',
  privacy: 'chrome.privacy is not available.',
  proxy: 'chrome.proxy is not available.',
  bookmarks: 'chrome.bookmarks is not available to extensions.',
  history: 'chrome.history is not available to extensions.',
  topSites: 'chrome.topSites is not available.',
  sessions: 'chrome.sessions is not available.',
  pageCapture: 'chrome.pageCapture is not available.',
  tts: 'chrome.tts is not available.',
  desktopCapture: 'chrome.desktopCapture is not available.',
  activeTab: 'activeTab is not a documented Electron permission. Access to the current tab may not be granted.',
  geolocation: 'The geolocation extension permission is not available.',
  clipboardRead: 'clipboardRead is not available to extensions.',
  clipboardWrite: 'clipboardWrite is not available to extensions.',
  tabCapture: 'chrome.tabCapture is not available.',
  system: 'chrome.system is not available.',
  power: 'chrome.power is not available.',
  idle: 'chrome.idle is not available.',
  browsingData: 'chrome.browsingData is not available to extensions.',
  fontSettings: 'chrome.fontSettings is not available.',
  gcm: 'chrome.gcm is not available.',
  instanceID: 'chrome.instanceID is not available.',
  loginState: 'chrome.loginState is not available.',
  platformKeys: 'chrome.platformKeys is not available.',
  certificateProvider: 'chrome.certificateProvider is not available.',
  enterprise: 'Enterprise extension APIs are not available.',
  'processes': 'chrome.processes is not available.',
  'search': 'chrome.search is not available.',
};

function readJson(file, maxBytes) {
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch (error) {
    return { ok: false, error: error && error.code === 'ENOENT' ? 'missing' : 'unreadable' };
  }
  if (stat.isSymbolicLink() || !stat.isFile()) return { ok: false, error: 'not-file' };
  if (stat.size > maxBytes) return { ok: false, error: 'too-large' };
  try {
    return { ok: true, value: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {
    return { ok: false, error: 'invalid-json' };
  }
}

function readManifest(root) {
  const parsed = readJson(path.join(root, 'manifest.json'), 1024 * 1024);
  if (!parsed.ok && parsed.error === 'missing') {
    return { ok: false, error: 'This folder has no manifest.json. Choose the extension folder itself. A packed .crx file cannot be loaded.' };
  }
  if (!parsed.ok && parsed.error === 'not-file') {
    return { ok: false, error: 'manifest.json must be a regular file. RightTab will not follow a link.' };
  }
  if (!parsed.ok && parsed.error === 'too-large') return { ok: false, error: 'manifest.json is larger than 1 MB.' };
  if (!parsed.ok && parsed.error === 'invalid-json') return { ok: false, error: 'manifest.json is not valid JSON.' };
  if (!parsed.ok) return { ok: false, error: 'manifest.json could not be read.' };
  if (!parsed.value || typeof parsed.value !== 'object' || Array.isArray(parsed.value)) {
    return { ok: false, error: 'manifest.json must contain an object.' };
  }
  return { ok: true, manifest: parsed.value };
}

function messageValue(root, locales, key) {
  for (const locale of locales) {
    if (!locale || !/^[A-Za-z0-9_-]{2,20}$/.test(locale)) continue;
    const file = path.join(root, '_locales', locale, 'messages.json');
    try {
      const parsed = readJson(file, 1024 * 1024);
      if (!parsed.ok) continue;
      const entry = parsed.value?.[key];
      if (typeof entry?.message === 'string' && entry.message.trim()) return entry.message.trim();
    } catch { /* missing locale */ }
  }
  return '';
}

function localize(root, manifest, value) {
  const text = typeof value === 'string' ? value : '';
  const match = /^__MSG_([A-Za-z0-9_@]+)__$/.exec(text);
  if (!match) return text;
  const locales = [manifest.default_locale, 'en', 'en_US'];
  return messageValue(root, locales, match[1]) || text;
}

function stringList(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string' && item.length < 300).slice(0, 40);
}

function hostPermission(permission) {
  return permission === '<all_urls>' || permission.includes('://') || permission.startsWith('*');
}

function hostDetail(permission) {
  if (permission === '<all_urls>' || permission === '*://*/*') return 'Read and change pages on every website you open.';
  const host = permission.replace(/^\*:\/\/|^\w+:\/\//, '').replace(/\/.*$/, '').replace(/^\*\./, '');
  if (!host || host === '*') return 'Read and change pages on every website you open.';
  return `Read and change pages on ${host}.`;
}

function classifyPermission(permission) {
  if (hostPermission(permission)) {
    return { id: permission, title: permission, detail: hostDetail(permission), support: 'yes' };
  }
  if (DOCUMENTED_YES[permission]) {
    return { id: permission, title: permission, detail: DOCUMENTED_YES[permission], support: 'yes' };
  }
  if (DOCUMENTED_PARTIAL[permission]) {
    return { id: permission, title: permission, detail: DOCUMENTED_PARTIAL[permission], support: 'partial' };
  }
  const known = UNSUPPORTED_PERMISSIONS[permission];
  if (known) return { id: permission, title: permission, detail: known, support: 'no' };
  return {
    id: permission,
    title: permission,
    detail: `Electron 45 does not document “${permission}”. If this extension calls it, that part will fail.`,
    support: 'no',
  };
}

function relativeFile(root, value) {
  if (typeof value !== 'string' || !value || value.includes('\0') || value.length > 300) return '';
  const normalized = path.posix.normalize(value.replace(/\\/g, '/')).replace(/^\.\//, '');
  if (!normalized || normalized.startsWith('../') || normalized === '..' || path.posix.isAbsolute(normalized)) return '';
  const full = path.resolve(root, normalized);
  const base = path.resolve(root);
  if (full !== base && !full.startsWith(base + path.sep)) return '';
  return full;
}

function fileExists(file) {
  if (!file) return false;
  try {
    const stat = fs.lstatSync(file);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function iconCandidates(manifest) {
  const action = manifest.action || manifest.browser_action || manifest.page_action || {};
  const values = [];
  const push = (value) => {
    if (!value) return;
    if (typeof value === 'string') values.push(value);
    else if (typeof value === 'object') {
      for (const size of ['32', '48', '24', '19', '16', '38', '128', '64', '96']) {
        if (typeof value[size] === 'string') values.push(value[size]);
      }
    }
  };
  push(action.default_icon);
  push(manifest.icons);
  return values;
}

function popupPath(manifest) {
  const action = manifest.action || manifest.browser_action || manifest.page_action || {};
  return typeof action.default_popup === 'string' ? action.default_popup : '';
}

function sidePanelPath(manifest) {
  const panel = manifest.side_panel;
  return panel && typeof panel.default_path === 'string' ? panel.default_path : '';
}

function optionsPath(manifest) {
  if (typeof manifest.options_page === 'string') return manifest.options_page;
  if (manifest.options_ui && typeof manifest.options_ui.page === 'string') return manifest.options_ui.page;
  return '';
}

function contentMatches(manifest) {
  const scripts = Array.isArray(manifest.content_scripts) ? manifest.content_scripts : [];
  const matches = [];
  for (const script of scripts) matches.push(...stringList(script?.matches));
  return [...new Set(matches)].slice(0, 40);
}

function inspectExtension(root) {
  const manifestResult = readManifest(root);
  if (!manifestResult.ok) return { ok: false, error: manifestResult.error };
  const manifest = manifestResult.manifest;
  const version = Number(manifest.manifest_version);
  const blocking = [];
  if (version !== 2 && version !== 3) {
    blocking.push(`Only manifest version 2 or 3 can be loaded. This file says “${manifest.manifest_version}”.`);
  }
  const name = localize(root, manifest, manifest.name).slice(0, 200);
  if (!name) blocking.push('The manifest needs a name.');
  const extensionVersion = String(manifest.version || '').slice(0, 40);
  if (!extensionVersion) blocking.push('The manifest needs a version.');

  const background = manifest.background && typeof manifest.background === 'object' ? manifest.background : null;
  if (version === 3 && background?.scripts) {
    blocking.push('Manifest version 3 must use background.service_worker. background.scripts is a version 2 field.');
  }
  if (version === 3 && background && !background.service_worker) {
    blocking.push('This version 3 extension is missing background.service_worker.');
  }
  if (version === 2 && background?.service_worker) {
    blocking.push('Manifest version 2 cannot use a service worker. Use background.scripts or background.page.');
  }
  const backgroundFile = version === 3
    ? background?.service_worker
    : (Array.isArray(background?.scripts) ? background.scripts[0] : background?.page);
  if (background && typeof backgroundFile === 'string' && !fileExists(relativeFile(root, backgroundFile))) {
    blocking.push(`The background file “${backgroundFile}” is not in this folder.`);
  }

  const permissions = [...stringList(manifest.permissions), ...stringList(manifest.host_permissions)];
  const optional = stringList(manifest.optional_permissions);
  const classified = permissions.map(classifyPermission);
  const limitations = classified.filter((item) => item.support !== 'yes').map((item) => item.detail);
  const popup = popupPath(manifest);
  const side = sidePanelPath(manifest);
  const options = optionsPath(manifest);
  if (popup && !fileExists(relativeFile(root, popup))) {
    blocking.push(`The popup file “${popup}” is not in this folder.`);
  }
  if (side && !fileExists(relativeFile(root, side))) {
    limitations.push(`The side panel file “${side}” is missing, so RightTab cannot open it.`);
  }
  if ((manifest.action || manifest.browser_action || manifest.page_action) && !popup) {
    limitations.push('This toolbar button has no popup. Electron does not deliver chrome.action.onClicked, so clicking the icon cannot run the extension.');
  } else if (popup) {
    limitations.push('Electron’s chrome.action API does not control the toolbar. RightTab shows the manifest icon and opens the popup. Badges, dynamic icons, and chrome.action.onClicked do not work.');
  }
  if (side) limitations.push(UNSUPPORTED_PERMISSIONS.sidePanel);
  if (manifest.commands) limitations.push(UNSUPPORTED_PERMISSIONS.commands);
  if (manifest.oauth2) limitations.push(UNSUPPORTED_PERMISSIONS.identity);
  if (manifest.chrome_url_overrides) {
    limitations.push('This extension wants to replace a Chrome page such as the new tab page. RightTab keeps its own new tab page.');
  }
  if (options) {
    limitations.push('chrome.runtime.openOptionsPage is not available. RightTab can still open the options page from the extension’s menu.');
  }
  const scripts = Array.isArray(manifest.content_scripts) ? manifest.content_scripts : [];
  for (const script of scripts) {
    for (const file of stringList(script?.js)) {
      if (!fileExists(relativeFile(root, file))) blocking.push(`The content script “${file}” is not in this folder.`);
    }
  }

  const uniqueLimits = [];
  for (const item of limitations) {
    if (item && !uniqueLimits.includes(item)) uniqueLimits.push(item);
  }

  return {
    ok: blocking.length === 0,
    error: blocking[0] || '',
    blocking,
    name: name || 'Extension',
    version: extensionVersion,
    description: localize(root, manifest, manifest.description).slice(0, 400),
    manifestVersion: version,
    permissions: classified,
    optional: optional.map(classifyPermission),
    limitations: uniqueLimits.slice(0, 12),
    sites: contentMatches(manifest),
    popup: popup && fileExists(relativeFile(root, popup)) ? popup : '',
    sidePanel: side && fileExists(relativeFile(root, side)) ? side : '',
    options: options && fileExists(relativeFile(root, options)) ? options : '',
    icons: iconCandidates(manifest),
    hasBackground: !!background,
    backgroundKind: version === 3 && background?.service_worker ? 'service-worker' : (background ? 'page' : ''),
  };
}

function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function matchPattern(pattern, url) {
  let parsed;
  try { parsed = new URL(url); } catch { return false; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return false;
  if (pattern === '<all_urls>') return true;
  if (typeof pattern !== 'string') return false;
  const match = /^(https?|\*):\/\/(\*|(\*\.)?[^/*]+)(\/.*)$/.exec(pattern);
  if (!match) return false;
  if (match[1] !== '*' && `${match[1]}:` !== parsed.protocol) return false;
  const host = match[2];
  if (host !== '*') {
    if (host.startsWith('*.')) {
      const base = host.slice(2).toLowerCase();
      const name = parsed.hostname.toLowerCase();
      if (name !== base && !name.endsWith(`.${base}`)) return false;
    } else if (parsed.hostname.toLowerCase() !== host.toLowerCase()) return false;
  }
  const pathPattern = match[4].split('*').map(escapeRegex).join('.*');
  return new RegExp(`^${pathPattern}$`).test(parsed.pathname);
}

function matchesAny(patterns, url) {
  return (patterns || []).some((pattern) => matchPattern(pattern, url));
}

function actionableExtensionError(message) {
  return /background startup failed|unsupported|is not a function|is not defined|Cannot read properties of undefined|No matching signature|Permission '.+' is unknown|service worker registration failed|Unchecked runtime\.lastError/i.test(String(message || ''));
}

module.exports = {
  readManifest,
  inspectExtension,
  matchPattern,
  matchesAny,
  relativeFile,
  classifyPermission,
  actionableExtensionError,
  iconCandidates,
};
