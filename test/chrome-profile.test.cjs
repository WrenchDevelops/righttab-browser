const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createFixtureProfile } = require('./helpers.cjs');
const {
  listProfiles,
  inspectProfile,
  toPublicPreview,
  assertOutside,
  resolveProfileDir,
} = require('../shared/chrome-profile.cjs');
const { deriveChromeKey, decryptChromePassword } = require('../shared/crypto-chrome.cjs');

test('fixture Chrome profile previews bookmarks, history, passwords, tabs, and extensions', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'righttab-fixture-'));
  const fixture = createFixtureProfile(root);
  const listed = await listProfiles(root);
  assert.equal(listed.installed, true);
  assert.equal(listed.profiles[0].email, 'ada@example.com');

  const inspection = await inspectProfile(fixture.profile, {
    homeDir: os.homedir(),
    directoryExists: (dir) => dir === path.join(os.homedir(), 'Downloads'),
  });
  assert.equal(inspection.bookmarks.urlCount, 3);
  assert.equal(inspection.history.entries.length, 1);
  assert.equal(inspection.history.entries[0].url, 'https://example.com/history');
  if (process.platform === 'darwin') assert.equal(inspection.passwords.entries[0].username, 'ada');
  else assert.match(inspection.passwords.error, /only supported on macOS/);
  assert.equal(inspection.tabs.tabs[0].url, 'https://example.com/tab');
  assert.equal(inspection.extensions.items.length, 1);
  assert.equal(inspection.extensions.items[0].name, 'Sample Unpacked');
  assert.equal(inspection.preferences.apply.find((item) => item.key === 'restoreSession').value, true);
  assert.equal(inspection.preferences.apply.find((item) => item.key === 'startupPage'), undefined);

  if (process.platform === 'darwin') {
  const plain = decryptChromePassword(
    Buffer.from(inspection.passwords.entries[0].passwordHex, 'hex'),
    deriveChromeKey(fixture.keyMaterial),
  );
  assert.equal(plain, fixture.password);
  }

  const preview = toPublicPreview(inspection);
  assert.equal(preview.passwords.sample[0]?.passwordHex, undefined);
  assert.equal(JSON.stringify(preview).includes(fixture.password), false);
  assert.ok(preview.unsupported.some((item) => item.id === 'sync'));
  assert.equal(preview.extensions.support, 'list');

  assert.throws(() => assertOutside(path.join(root, 'Default', 'Bookmarks'), root), /Refusing to modify/);
  assert.throws(() => resolveProfileDir(root, '../Default'), /Unknown Chrome profile/);
});

test('Windows Chrome discovery uses LOCALAPPDATA and has a home fallback', () => {
  const { chromeUserDataDir } = require('../shared/chrome-profile.cjs');
  assert.equal(chromeUserDataDir('/home/test', 'win32', { LOCALAPPDATA: '/local' }), path.join('/local', 'Google', 'Chrome', 'User Data'));
  assert.equal(chromeUserDataDir('/home/test', 'win32', {}), path.join('/home/test', 'AppData', 'Local', 'Google', 'Chrome', 'User Data'));
});

test('Windows browser profiles resolve only trusted Chrome, Edge and Brave roots', async () => {
  const { windowsBrowserRoots, listWindowsProfiles, resolveWindowsProfile } = require('../shared/chrome-profile.cjs');
  const local = fs.mkdtempSync(path.join(os.tmpdir(), 'righttab-browsers-'));
  try {
    const env = { LOCALAPPDATA: local };
    const roots = windowsBrowserRoots('/unused', env);
    for (const root of Object.values(roots)) fs.mkdirSync(path.join(root, 'Default'), { recursive: true });
    const listing = await listWindowsProfiles('/unused', env);
    assert.deepEqual(listing.profiles.map((profile) => profile.id), ['chrome:Default', 'edge:Default', 'brave:Default']);
    assert.equal(resolveWindowsProfile('edge:Default', '/unused', env), path.join(roots.edge, 'Default'));
    assert.throws(() => resolveWindowsProfile('edge:../../secret', '/unused', env), /Unknown/);
    assert.throws(() => resolveWindowsProfile('other:Default', '/unused', env), /Unknown/);
  } finally { fs.rmSync(local, { recursive: true, force: true }); }
});
