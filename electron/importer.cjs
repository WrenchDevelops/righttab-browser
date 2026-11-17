const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { inspectProfile } = require('../shared/chrome-profile.cjs');
const { mergeBookmarkTrees } = require('../shared/bookmarks.cjs');
const { mergeHistory } = require('../shared/history.cjs');
const { deriveChromeKey, decryptChromePassword } = require('../shared/crypto-chrome.cjs');

const execFileAsync = promisify(execFile);

async function readChromeSafeStorageKey() {
  if (process.platform !== 'darwin') throw new Error('Direct Chrome password import is only supported on macOS.');
  if (process.env.RIGHTTAB_SMOKE === '1') {
    throw new Error('The smoke test does not read the macOS keychain.');
  }
  const { stdout } = await execFileAsync('/usr/bin/security', [
    'find-generic-password',
    '-w',
    '-s',
    'Chrome Safe Storage',
    '-a',
    'Chrome',
  ], { timeout: 120000 });
  const key = stdout.trim();
  if (!key) throw new Error('macOS did not return the Chrome Safe Storage key.');
  return key;
}

function directoryExists(candidate) {
  try {
    return fs.statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

function extensionSource(profileDir, item) {
  if (item.path && fs.existsSync(path.join(item.path, 'manifest.json'))) return item.path;
  const root = path.join(profileDir, 'Extensions', item.id);
  if (!fs.existsSync(root)) return '';
  const versions = fs.readdirSync(root)
    .filter((name) => fs.existsSync(path.join(root, name, 'manifest.json')))
    .sort();
  return versions.length ? path.join(root, versions[versions.length - 1]) : '';
}

async function loadCopiedExtension(profileDir, item, installExtension) {
  const source = extensionSource(profileDir, item);
  if (!source) {
    return {
      ok: false,
      name: item.name,
      error: 'The extension folder was not found. In Chrome, open chrome://extensions, copy the extension ID, and load that version folder from Settings → Extensions.',
    };
  }
  if (typeof installExtension !== 'function') {
    return { ok: false, name: item.name, error: 'Extension loading is not available.' };
  }
  const loaded = await installExtension(source);
  if (!loaded?.ok) return { ok: false, name: item.name, error: loaded?.error || 'The extension could not be loaded.', warnings: loaded?.warnings || [] };
  return { ok: true, name: loaded.name || item.name, id: loaded.id || item.id, warnings: loaded.warnings || [] };
}

async function runChromeImport({
  profileDir,
  selections,
  store,
  vault,
  installExtension,
  passwordKey,
  send = () => {},
}) {
  const selected = {
    bookmarks: !!selections?.bookmarks,
    history: !!selections?.history,
    passwords: !!selections?.passwords,
    preferences: !!selections?.preferences,
    tabs: !!selections?.tabs,
    extensions: !!selections?.extensions,
    loadExtensions: !!selections?.loadExtensions,
  };
  send({ message: 'Reading a copy of the Chrome profile…' });
  const inspection = await inspectProfile(profileDir, { homeDir: os.homedir(), directoryExists });
  const summary = {
    bookmarks: { imported: 0, duplicates: 0, error: '' },
    history: { imported: 0, updated: 0, error: '' },
    passwords: { imported: 0, duplicates: 0, failed: 0, error: '' },
    preferences: { applied: [], skipped: inspection.preferences.skip || [] },
    tabs: { opened: 0, skipped: 0, urls: [] },
    extensions: { listed: (inspection.extensions.items || []).length, loaded: [], failed: [] },
    notes: [
      'Chrome’s original profile was not modified.',
      'Cookies, website logins, and Google Sync were not imported.',
    ],
  };

  if (selected.bookmarks) {
    if (!inspection.bookmarks.ok) summary.bookmarks.error = inspection.bookmarks.error || 'Bookmarks were unavailable.';
    else {
      const merged = mergeBookmarkTrees(store.bookmarks, inspection.bookmarks.tree);
      store.setBookmarks(merged.tree, { immediate: true });
      if (merged.added > 0) store.commit({ showBookmarkBar: true }, { immediate: true });
      summary.bookmarks.imported = merged.added;
      summary.bookmarks.duplicates = merged.duplicates;
    }
  }

  if (selected.history) {
    if (!inspection.history.ok) summary.history.error = inspection.history.error || 'History was unavailable.';
    else {
      const merged = mergeHistory(store.history, inspection.history.entries);
      store.setHistory({ entries: merged.entries }, { immediate: true });
      summary.history.imported = merged.added;
      summary.history.updated = merged.updated;
    }
  }

  if (selected.passwords) {
    if (!inspection.passwords.ok) summary.passwords.error = inspection.passwords.error || 'Saved passwords were unavailable.';
    else {
      try {
        send({ message: 'Waiting for macOS Keychain, if it asks…' });
        const keyMaterial = passwordKey || await readChromeSafeStorageKey();
        const key = deriveChromeKey(keyMaterial);
        for (const entry of inspection.passwords.entries) {
          try {
            const password = decryptChromePassword(Buffer.from(entry.passwordHex, 'hex'), key);
            const result = await vault.add({
              origin: entry.origin,
              username: entry.username,
              password,
              source: 'chrome',
            });
            if (result.duplicate) summary.passwords.duplicates += 1;
            else summary.passwords.imported += 1;
          } catch {
            summary.passwords.failed += 1;
          }
        }
        if (!summary.passwords.imported && summary.passwords.failed) {
          summary.passwords.error = 'None of the saved passwords could be decrypted. Export a CSV from Chrome’s password manager and import that instead.';
        }
      } catch (error) {
        summary.passwords.error = `Passwords were not imported (${error.message}). You can export a CSV from Chrome and import it from Passwords.`;
      }
    }
  }

  if (selected.preferences) {
    if (!inspection.preferences.ok) {
      summary.preferences.skipped = [{ label: 'Preferences', reason: inspection.preferences.error || 'Preferences were unavailable.' }];
    } else {
      const patch = {};
      for (const item of inspection.preferences.apply) {
        if (item.key === 'startupPage') continue;
        patch[item.key] = item.value;
        summary.preferences.applied.push(item.label);
      }
      if (Object.keys(patch).length) store.commit(patch, { immediate: true });
      summary.notes.push('Your ChatGPT or Google startup choice was not changed.');
    }
  }

  if (selected.tabs) {
    if (!inspection.tabs.ok) summary.tabs.skipped = 0;
    const urls = [];
    for (const tab of inspection.tabs.tabs || []) urls.push(tab.url);
    summary.tabs.urls = urls.slice(0, 50);
    summary.tabs.skipped = Math.max(0, (inspection.tabs.tabs || []).length - summary.tabs.urls.length);
    if (inspection.tabs.error) summary.tabs.error = inspection.tabs.error;
    if (inspection.tabs.warnings?.length) summary.notes.push(inspection.tabs.warnings[0]);
  }

  if (selected.loadExtensions) {
    summary.notes.push('Copied extension folders were loaded with Electron’s unpacked loader. Chrome Web Store installation is not available, and APIs Electron does not support will fail.');
    const items = (inspection.extensions.items || []).slice(0, 20);
    for (const item of items) {
      try {
        send({ message: `Loading ${item.name}…` });
        const loaded = await loadCopiedExtension(profileDir, item, installExtension);
        if (loaded.ok) summary.extensions.loaded.push(loaded.name);
        else summary.extensions.failed.push({ name: item.name, error: loaded.error });
        if (loaded.warnings?.length) summary.notes.push(`${item.name}: ${loaded.warnings[0]}`);
      } catch (error) {
        summary.extensions.failed.push({ name: item.name, error: error.message });
      }
    }
  } else if (selected.extensions) {
    summary.notes.push(`${summary.extensions.listed} extensions were listed and not installed. Load an unpacked folder from Settings → Extensions.`);
  }

  return { summary, openTabs: selected.tabs ? summary.tabs.urls : [] };
}

module.exports = { runChromeImport, readChromeSafeStorageKey };
