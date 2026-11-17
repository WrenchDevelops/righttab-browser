const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync, backup } = require('node:sqlite');
const { isWebUrl } = require('./url.cjs');
const { parseSnss } = require('./snss.cjs');
const { importChromeBookmarks, countNodes, emptyBookmarks } = require('./bookmarks.cjs');
const { chromeRowsToHistory } = require('./history.cjs');
const { mapChromePreferences } = require('./preferences.cjs');
const { listChromeExtensions } = require('./extensions.cjs');

const UNSUPPORTED = [
  {
    id: 'cookies',
    title: 'Cookies and signed-in website sessions',
    reason: 'Browser sessions are not imported. Sign in again in RightTab to create a separate session.',
  },
  {
    id: 'sync',
    title: 'Google Sync',
    reason: 'RightTab cannot download bookmarks, passwords, or settings from Google’s sync servers.',
  },
  {
    id: 'payments',
    title: 'Payment methods',
    reason: 'Cards and payment data are not imported.',
  },
  {
    id: 'autofill',
    title: 'Addresses and autofill profiles',
    reason: 'Not imported.',
  },
  {
    id: 'extensions-full',
    title: 'Full Chrome extension support',
    reason: 'Electron 45 can load an unpacked extension folder into a normal window. It cannot install from the Chrome Web Store, and it does not support the full Chrome extension API.',
  },
];

function chromeUserDataDir(home = os.homedir(), platform = process.platform, env = process.env) {
  if (platform === 'win32') return path.join(env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'Google', 'Chrome', 'User Data');
  if (platform === 'linux') return path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'google-chrome');
  return path.join(home, 'Library', 'Application Support', 'Google', 'Chrome');
}

function windowsBrowserRoots(home = os.homedir(), env = process.env) {
  const local = env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  return {
    chrome: path.join(local, 'Google', 'Chrome', 'User Data'),
    edge: path.join(local, 'Microsoft', 'Edge', 'User Data'),
    brave: path.join(local, 'BraveSoftware', 'Brave-Browser', 'User Data'),
  };
}

async function listWindowsProfiles(home = os.homedir(), env = process.env) {
  const labels = { chrome: 'Chrome', edge: 'Edge', brave: 'Brave' };
  const profiles = [];
  for (const [browser, root] of Object.entries(windowsBrowserRoots(home, env))) {
    const listing = await listProfiles(root);
    profiles.push(...listing.profiles.map((profile) => ({ ...profile, id: `${browser}:${profile.id}`, name: `${labels[browser]} · ${profile.name}` })));
  }
  return { installed: profiles.length > 0, profiles, reason: profiles.length ? '' : 'No Chrome, Edge, or Brave profiles were found.' };
}

function resolveWindowsProfile(id, home = os.homedir(), env = process.env) {
  const match = /^(chrome|edge|brave):(Default|Profile \d+)$/.exec(String(id || ''));
  if (!match) throw new Error('Unknown browser profile.');
  return resolveProfileDir(windowsBrowserRoots(home, env)[match[1]], match[2]);
}

function isSafeProfileId(id) {
  return id === 'Default' || /^Profile \d+$/.test(id);
}

function assertOutside(target, protectedDir) {
  if (!protectedDir) return;
  const root = path.resolve(protectedDir);
  const dest = path.resolve(target);
  if (dest === root || dest.startsWith(root + path.sep)) {
    const error = new Error('Refusing to modify the Chrome profile.');
    error.code = 'CHROME_WRITE_BLOCKED';
    throw error;
  }
}

function resolveProfileDir(chromeRoot, profileId) {
  if (!isSafeProfileId(profileId)) throw new Error('Unknown Chrome profile.');
  const root = path.resolve(chromeRoot);
  const dir = path.resolve(root, profileId);
  if (dir === root || !dir.startsWith(root + path.sep)) {
    throw new Error('Profile path escaped the Chrome directory.');
  }
  return dir;
}

function sqliteUri(file) {
  const absolute = path.resolve(file);
  const encoded = absolute.split('/').map((part, index) => (index === 0 ? part : encodeURIComponent(part))).join('/');
  return `file:${encoded}?mode=ro`;
}

async function queryJson(dbPath, sql) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const statement = db.prepare(sql);
    statement.setReadBigInts(true);
    return statement.all().map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === 'bigint' ? value.toString() : value])));
  } finally { db.close(); }
}

async function copyFileIfPresent(src, dest) {
  assertOutside(dest, path.dirname(src));
  try {
    await fs.promises.copyFile(src, dest);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function copySqlite(src, dest) {
  assertOutside(dest, path.dirname(src));
  if (!fs.existsSync(src)) return false;
  const db = new DatabaseSync(src, { readOnly: true });
  try { await backup(db, dest); return true; } finally { db.close(); }
}

async function listProfiles(chromeRoot = chromeUserDataDir()) {
  if (!fs.existsSync(chromeRoot)) {
    return {
      installed: false,
      chromeRoot,
      profiles: [],
      reason: 'Google Chrome’s profile folder was not found on this computer.',
    };
  }
  let cache = {};
  try {
    const localState = JSON.parse(await fs.promises.readFile(path.join(chromeRoot, 'Local State'), 'utf8'));
    cache = localState?.profile?.info_cache || {};
  } catch {
    cache = {};
  }
  const profiles = [];
  for (const [id, meta] of Object.entries(cache)) {
    if (!isSafeProfileId(id)) continue;
    const dir = path.join(chromeRoot, id);
    if (!fs.existsSync(dir)) continue;
    profiles.push({
      id,
      name: String(meta?.name || meta?.gaia_name || id),
      email: String(meta?.user_name || ''),
    });
  }
  if (!profiles.length && fs.existsSync(path.join(chromeRoot, 'Default'))) {
    profiles.push({ id: 'Default', name: 'Default', email: '' });
  }
  return {
    installed: true,
    chromeRoot,
    profiles,
    reason: profiles.length ? '' : 'Chrome is installed, but no profiles could be read.',
  };
}

async function newestSessionFile(profileDir) {
  const sessionsDir = path.join(profileDir, 'Sessions');
  const candidates = [];
  if (fs.existsSync(sessionsDir)) {
    const names = await fs.promises.readdir(sessionsDir);
    for (const name of names) {
      if (!name.startsWith('Session_')) continue;
      const full = path.join(sessionsDir, name);
      const stat = await fs.promises.stat(full);
      if (stat.isFile()) candidates.push({ full, mtime: stat.mtimeMs });
    }
  }
  for (const name of ['Current Session', 'Last Session']) {
    const full = path.join(profileDir, name);
    if (fs.existsSync(full)) {
      const stat = await fs.promises.stat(full);
      candidates.push({ full, mtime: stat.mtimeMs });
    }
  }
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0]?.full || '';
}

async function inspectProfile(profileDir, env = {}) {
  const temp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'righttab-import-'));
  const result = {
    profileDir,
    bookmarks: { ok: false, tree: emptyBookmarks(), urlCount: 0, folderCount: 0, addedPreview: 0, error: '' },
    history: { ok: false, entries: [], error: '' },
    passwords: { ok: false, entries: [], error: '' },
    preferences: { ok: false, apply: [], skip: [], error: '' },
    tabs: { ok: false, method: 'none', tabs: [], warnings: [], error: '' },
    extensions: { ok: false, items: [], error: '' },
    unsupported: UNSUPPORTED,
  };
  try {
    await readBookmarks(profileDir, temp, result);
    await readHistory(profileDir, temp, result);
    if (process.platform === 'darwin') await readPasswords(profileDir, temp, result);
    else result.passwords.error = 'Direct Chrome password import is only supported on macOS.';
    await readPreferences(profileDir, result, env);
    await readTabs(profileDir, temp, result);
  } finally {
    await fs.promises.rm(temp, { recursive: true, force: true }).catch(() => {});
  }
  return result;
}

async function readBookmarks(profileDir, temp, result) {
  const src = path.join(profileDir, 'Bookmarks');
  if (!fs.existsSync(src)) {
    result.bookmarks.error = 'This profile has no Bookmarks file.';
    return;
  }
  const dest = path.join(temp, 'Bookmarks');
  await copyFileIfPresent(src, dest);
  try {
    const json = JSON.parse(await fs.promises.readFile(dest, 'utf8'));
    const imported = importChromeBookmarks(emptyBookmarks(), json);
    const counts = countNodes(imported.tree.bar.concat ? imported.tree.bar : []);
    const barCounts = countNodes(imported.tree.bar);
    const otherCounts = countNodes(imported.tree.other);
    result.bookmarks = {
      ok: true,
      tree: imported.tree,
      urlCount: barCounts.urls + otherCounts.urls,
      folderCount: barCounts.folders + otherCounts.folders,
      addedPreview: imported.added,
      error: '',
    };
  } catch (error) {
    result.bookmarks.error = `Bookmarks could not be read (${error.message}).`;
  }
}

async function readHistory(profileDir, temp, result) {
  const src = path.join(profileDir, 'History');
  if (!fs.existsSync(src)) {
    result.history.error = 'This profile has no History database.';
    return;
  }
  const dest = path.join(temp, 'History');
  try {
    await copySqlite(src, dest);
    const rows = await queryJson(dest, `
      SELECT url, title, visit_count, last_visit_time
      FROM urls
      WHERE hidden = 0
        AND url NOT LIKE 'chrome://%'
        AND url NOT LIKE 'chrome-extension://%'
        AND url NOT LIKE 'devtools://%'
      ORDER BY last_visit_time DESC
      LIMIT 5000
    `);
    result.history = { ok: true, entries: chromeRowsToHistory(rows), error: '' };
  } catch (error) {
    result.history.error = `History could not be read (${cleanSqliteError(error)}).`;
  }
}

async function readPasswords(profileDir, temp, result) {
  const src = path.join(profileDir, 'Login Data');
  if (!fs.existsSync(src)) {
    result.passwords.error = 'This profile has no saved-password database.';
    return;
  }
  const dest = path.join(temp, 'Login Data');
  try {
    await copySqlite(src, dest);
    const rows = await queryJson(dest, `
      SELECT origin_url, username_value, hex(password_value) AS password_hex,
             date_created, blacklisted_by_user
      FROM logins
    `);
    const entries = [];
    for (const row of rows) {
      if (Number(row.blacklisted_by_user) === 1) continue;
      const hex = String(row.password_hex || '');
      if (!hex || !isWebUrl(row.origin_url)) continue;
      entries.push({
        origin: row.origin_url,
        username: String(row.username_value || ''),
        passwordHex: hex,
        createdAt: Number(row.date_created) || 0,
      });
    }
    result.passwords = { ok: true, entries, error: '' };
  } catch (error) {
    result.passwords.error = `Saved passwords could not be read (${cleanSqliteError(error)}).`;
  }
}

async function readPreferences(profileDir, result, env) {
  const src = path.join(profileDir, 'Preferences');
  if (!fs.existsSync(src)) {
    result.preferences.error = 'This profile has no Preferences file.';
    result.preferences.skip = mapChromePreferences({}, env).skip;
    return;
  }
  try {
    const prefs = JSON.parse(await fs.promises.readFile(src, 'utf8'));
    const mapped = mapChromePreferences(prefs, env);
    result.preferences = { ok: true, apply: mapped.apply, skip: mapped.skip, raw: prefs, error: '' };
    result.extensions = { ok: true, items: listChromeExtensions(prefs), error: '' };
  } catch (error) {
    result.preferences.error = `Preferences could not be read (${error.message}).`;
    result.extensions.error = 'Extensions could not be listed because Preferences could not be read.';
  }
}

async function readTabs(profileDir, temp, result) {
  const sessionFile = await newestSessionFile(profileDir);
  if (!sessionFile) {
    result.tabs.error = 'Chrome has no session file in this profile. Open tabs were not available.';
    return;
  }
  const dest = path.join(temp, 'Session.bin');
  await copyFileIfPresent(sessionFile, dest);
  try {
    const buffer = await fs.promises.readFile(dest);
    const parsed = parseSnss(buffer);
    const tabs = [];
    for (const window of parsed.windows || []) {
      for (const tab of window.tabs || []) {
        if (isWebUrl(tab.url)) tabs.push(tab);
      }
    }
    result.tabs = {
      ok: parsed.ok && tabs.length > 0,
      method: parsed.method,
      tabs: tabs.slice(0, 50),
      truncated: tabs.length > 50,
      warnings: parsed.warnings || [],
      error: tabs.length ? '' : (parsed.error || 'No web pages were found in the session file.'),
    };
  } catch (error) {
    result.tabs.error = `Open tabs could not be read (${error.message}).`;
  }
}

function cleanSqliteError(error) {
  return String(error.stderr || error.message || 'unknown error')
    .replace(/file:[^\s]+/g, 'database')
    .split('\n')[0]
    .slice(0, 240);
}

function toPublicPreview(inspection) {
  return {
    bookmarks: {
      id: 'bookmarks',
      title: 'Bookmarks and folders',
      support: inspection.bookmarks.ok ? 'supported' : 'unavailable',
      urlCount: inspection.bookmarks.urlCount,
      folderCount: inspection.bookmarks.folderCount,
      error: inspection.bookmarks.error,
      detail: inspection.bookmarks.ok
        ? 'Read from a copy of the Bookmarks file. The source profile is not modified.'
        : inspection.bookmarks.error,
    },
    history: {
      id: 'history',
      title: 'Browsing history',
      support: inspection.history.ok ? 'supported' : 'unavailable',
      count: inspection.history.entries.length,
      sample: inspection.history.entries.slice(0, 5).map((entry) => ({ title: entry.title, url: entry.url })),
      error: inspection.history.error,
      detail: 'Up to 5,000 sites, read from a copy of the History database.',
    },
    passwords: {
      id: 'passwords',
      title: 'Saved passwords',
      support: inspection.passwords.ok ? 'supported' : 'unavailable',
      count: inspection.passwords.entries.length,
      sample: inspection.passwords.entries.slice(0, 12).map((entry) => ({
        origin: entry.origin,
        username: entry.username,
      })),
      error: inspection.passwords.error,
      detail: inspection.passwords.ok ? 'Requires a macOS Keychain prompt for Chrome Safe Storage. Passwords are re-encrypted for RightTab.' : inspection.passwords.error,
    },
    preferences: {
      id: 'preferences',
      title: 'Compatible preferences',
      support: inspection.preferences.ok ? 'partial' : 'unavailable',
      apply: inspection.preferences.apply,
      skip: inspection.preferences.skip,
      error: inspection.preferences.error,
      detail: 'Only a small, checked set of Chrome preferences can be applied.',
    },
    tabs: {
      id: 'tabs',
      title: 'Open tabs',
      support: inspection.tabs.ok ? 'best-effort' : 'unavailable',
      method: inspection.tabs.method,
      count: inspection.tabs.tabs.length,
      sample: inspection.tabs.tabs.slice(0, 30),
      truncated: !!inspection.tabs.truncated,
      warnings: inspection.tabs.warnings || [],
      error: inspection.tabs.error,
      detail: inspection.tabs.method === 'url-scan'
        ? 'The session file could not be parsed fully. These URLs were recovered by a best-effort scan and may be out of order.'
        : 'Read from the browser’s session file. Private windows are not included. Pinning and exact order can be imperfect.',
    },
    extensions: {
      id: 'extensions',
      title: 'Extensions',
      support: 'list',
      items: inspection.extensions.items || [],
      error: inspection.extensions.error || '',
      detail: 'Listed only until you opt in. A copied folder loads with Electron’s limits. The Chrome Web Store cannot be installed from here.',
    },
    unsupported: inspection.unsupported,
  };
}

module.exports = {
  UNSUPPORTED,
  chromeUserDataDir,
  windowsBrowserRoots,
  listWindowsProfiles,
  resolveWindowsProfile,
  isSafeProfileId,
  assertOutside,
  resolveProfileDir,
  listProfiles,
  inspectProfile,
  toPublicPreview,
  sqliteUri,
};
