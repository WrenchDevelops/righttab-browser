const fs = require('fs');
const path = require('path');
const { normalizeSettings } = require('../shared/settings.cjs');
const { emptyBookmarks } = require('../shared/bookmarks.cjs');
const { emptyHistory } = require('../shared/history.cjs');
const { writeJsonAtomic } = require('./atomic-json.cjs');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function openStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const files = {
    settings: path.join(dir, 'settings.json'),
    bookmarks: path.join(dir, 'bookmarks.json'),
    history: path.join(dir, 'history.json'),
    session: path.join(dir, 'session.json'),
  };
  const state = {
    settings: normalizeSettings(readJson(files.settings, {})),
    bookmarks: readJson(files.bookmarks, emptyBookmarks()),
    history: readJson(files.history, emptyHistory()),
    session: readJson(files.session, null),
  };
  if (!Array.isArray(state.bookmarks.bar) || !Array.isArray(state.bookmarks.other)) {
    state.bookmarks = emptyBookmarks();
  }
  if (!Array.isArray(state.history.entries)) state.history = emptyHistory();

  const dirty = new Set();
  let writeTimer = null;
  let lastWriteError = null;

  function markDirty(key) {
    dirty.add(key);
  }

  function writeNow() {
    clearTimeout(writeTimer);
    writeTimer = null;
    if (!dirty.size) return true;
    let ok = true;
    for (const key of [...dirty]) {
      if (!writeJsonAtomic(files[key], state[key])) {
        ok = false;
        lastWriteError = `Could not save ${key}.json`;
        continue;
      }
      dirty.delete(key);
    }
    if (ok) lastWriteError = null;
    return ok;
  }

  function writeSoon() {
    clearTimeout(writeTimer);
    writeTimer = setTimeout(() => {
      try { writeNow(); } catch (error) {
        console.error('[righttab] store write failed:', error && error.message ? error.message : error);
      }
    }, 150);
  }

  return {
    dir,
    get settings() { return state.settings; },
    get bookmarks() { return state.bookmarks; },
    get history() { return state.history; },
    get session() { return state.session; },
    get lastWriteError() { return lastWriteError; },
    commit(partial, { immediate = false } = {}) {
      state.settings = normalizeSettings({ ...state.settings, ...partial });
      markDirty('settings');
      if (immediate) writeNow();
      else writeSoon();
      return state.settings;
    },
    setBookmarks(tree, { immediate = false } = {}) {
      state.bookmarks = tree;
      markDirty('bookmarks');
      if (immediate) writeNow();
      else writeSoon();
    },
    setHistory(history, { immediate = false } = {}) {
      state.history = history;
      markDirty('history');
      if (immediate) writeNow();
      else writeSoon();
    },
    setSession(session) {
      state.session = session;
      markDirty('session');
      writeNow();
    },
    flush: writeNow,
  };
}

module.exports = { openStore };
