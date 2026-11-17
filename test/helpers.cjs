const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

function createDatabase(file, sql) {
  const db = new DatabaseSync(file);
  try { db.exec(sql); } finally { db.close(); }
}
const { msToChromeTime } = require('../shared/chrome-time.cjs');
const { deriveChromeKey, encryptChromePassword } = require('../shared/crypto-chrome.cjs');
const { buildSampleSession } = require('../shared/snss.cjs');

function createFixtureProfile(root, { password = 's3cret-horse', keyMaterial = 'test-key' } = {}) {
  const profile = path.join(root, 'Default');
  fs.mkdirSync(path.join(profile, 'Sessions'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Local State'), JSON.stringify({
    profile: {
      info_cache: {
        Default: { name: 'Personal', user_name: 'ada@example.com' },
        'Profile 1': { name: 'Work', user_name: 'work@example.com' },
      },
    },
  }));
  fs.writeFileSync(path.join(profile, 'Bookmarks'), JSON.stringify({
    roots: {
      bookmark_bar: {
        children: [
          { type: 'url', name: 'Example', url: 'https://example.com/', date_added: String(msToChromeTime(Date.UTC(2024, 0, 2))) },
          {
            type: 'folder',
            name: 'Recipes',
            children: [
              { type: 'url', name: 'Soup', url: 'https://example.com/soup', date_added: '1' },
              { type: 'url', name: 'Bad', url: 'javascript:alert(1)' },
            ],
          },
        ],
      },
      other: { children: [] },
      synced: { children: [{ type: 'url', name: 'Phone', url: 'https://example.com/phone' }] },
    },
  }));

  const history = path.join(profile, 'History');
  const visited = msToChromeTime(Date.UTC(2024, 5, 1));
  createDatabase(history, `
    CREATE TABLE urls (
      id INTEGER PRIMARY KEY,
      url TEXT,
      title TEXT,
      visit_count INTEGER,
      last_visit_time INTEGER,
      hidden INTEGER DEFAULT 0
    );
    INSERT INTO urls (url, title, visit_count, last_visit_time, hidden)
    VALUES ('https://example.com/history', 'History Example', 4, ${visited}, 0);
    INSERT INTO urls (url, title, visit_count, last_visit_time, hidden)
    VALUES ('chrome://settings', 'Settings', 1, ${visited}, 0);
  `);

  const key = deriveChromeKey(keyMaterial);
  const encrypted = encryptChromePassword(password, key);
  const login = path.join(profile, 'Login Data');
  createDatabase(login, `
    CREATE TABLE logins (
      origin_url VARCHAR NOT NULL,
      username_value VARCHAR,
      password_value BLOB,
      date_created INTEGER NOT NULL,
      blacklisted_by_user INTEGER NOT NULL,
      signon_realm VARCHAR NOT NULL
    );
    INSERT INTO logins (origin_url, username_value, password_value, date_created, blacklisted_by_user, signon_realm)
    VALUES ('https://example.com/login', 'ada', X'${encrypted.toString('hex')}', 1, 0, 'https://example.com');
  `);

  fs.writeFileSync(path.join(profile, 'Preferences'), JSON.stringify({
    bookmark_bar: { show_on_all_tabs: true },
    browser: { theme: { color_scheme: 2 } },
    session: { restore_on_startup: 1 },
    enable_do_not_track: true,
    https_only_mode_enabled: false,
    download: { default_directory: path.join(os.homedir(), 'Downloads') },
    default_search_provider_data: {
      template_url_data: { short_name: 'Google', url: 'https://www.google.com/search?q={searchTerms}' },
    },
    extensions: {
      settings: {
        aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: {
          location: 1,
          state: 1,
          manifest: { name: 'Component Extension', version: '1' },
        },
        bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: {
          location: 4,
          state: 1,
          path: '/tmp/unpacked-ext',
          manifest: { name: 'Sample Unpacked', version: '2.0' },
        },
      },
    },
  }));

  fs.writeFileSync(
    path.join(profile, 'Sessions', 'Session_100'),
    buildSampleSession({ url: 'https://example.com/tab', title: 'Open tab' }),
  );
  return { profile, password, keyMaterial };
}

module.exports = { createFixtureProfile };
