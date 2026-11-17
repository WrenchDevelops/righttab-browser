const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const T = require('../shared/themes.js');
const { openStore } = require('../electron/store.cjs');
const { applySettingsPatch, normalizeSettings } = require('../shared/settings.cjs');
test('all twelve presets pass text and icon contrast, have distinct active tabs and safe tokens', () => {
  assert.equal(T.presets.length, 12);
  for (const theme of T.presets) {
    assert.deepEqual(T.issues(theme), [], theme.name);
    assert.notEqual(theme.colors.sidebar, theme.colors.active);
    assert.notEqual(T.tokens(theme).hover, theme.colors.active);
    assert.deepEqual(T.validate(theme).colors, theme.colors);
    for (const v of Object.values(T.tokens(theme))) assert.equal(/url\(|javascript:|expression\(/i.test(v), false);
  }
});
test('JSON round trip rejects scripts, CSS, resources, unknown fields and versions', () => {
  const file = { format: 'righttab-theme', version: 1, theme: T.validate(T.presets[0]) };
  assert.deepEqual(T.validate(JSON.parse(JSON.stringify(file)), true), file.theme);
  for (const bad of [{ ...file, version: 2 }, { ...file, css: 'body{}' }, { ...file, theme: { ...file.theme, script: 'alert(1)' } }]) assert.throws(() => T.validate(bad, true));
  for (const value of ['red', '#fff', 'url(https://evil.test)', '#000000; color:red', '<script>']) {
    assert.throws(() => T.validate({ ...file.theme, colors: { ...file.theme.colors, toolbar: value } }));
  }
});
test('low contrast detection and automatic adjustment produce readable colors', () => {
  const theme = JSON.parse(JSON.stringify(T.presets[0]));
  theme.colors.text = '#FFFFFF'; theme.colors.icons = '#FFFFFF'; theme.colors.sidebar = '#000000';
  assert.ok(T.issues(theme).length);
  assert.deepEqual(T.issues(T.adjust(theme)), []);
  const tokens = T.tokens(theme);
  for (const surface of ['toolbar', 'bookmarks', 'sidebar', 'address', 'active']) assert.ok(T.contrast(tokens[surface + '-text'], theme.colors[surface]) >= 4.5);
});
test('system resolution, missing custom fallback and Cloud default', () => {
  assert.equal(T.resolve(normalizeSettings({}), true).id, 'cloud');
  const settings = normalizeSettings({ appearance: { selected: 'matcha', followSystem: true, light: 'sunset', dark: 'cherry' } });
  assert.equal(T.resolve(settings, false).id, 'sunset'); assert.equal(T.resolve(settings, true).id, 'cherry');
  assert.equal(T.normalize({ selected: 'custom-deleted' }).selected, 'cloud');
});
test('store reopening preserves custom themes and all unrelated preferences and sessions', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'righttab-themes-test-'));
  try {
    const store = openStore(dir);
    store.commit({ startupPage: 'google', searchEngine: 'bing', sidebarWidth: 320, restoreSession: true }, { immediate: true });
    store.setSession({ tabs: [{ url: 'https://example.com' }] });
    const theme = { ...T.validate(T.presets[2]), id: 'custom-test', name: 'My Matcha' };
    store.commit(applySettingsPatch(store.settings, { appearance: { selected: theme.id, custom: [theme], light: theme.id, dark: 'ocean', followSystem: false } }), { immediate: true });
    store.flush();
    const reopened = openStore(dir);
    assert.equal(T.resolve(reopened.settings, true).id, theme.id);
    assert.equal(reopened.settings.startupPage, 'google'); assert.equal(reopened.settings.searchEngine, 'bing');
    assert.equal(reopened.settings.sidebarWidth, 320); assert.equal(reopened.settings.restoreSession, true);
    assert.deepEqual(reopened.session, store.session);
    reopened.commit({ appearance: { ...reopened.settings.appearance, custom: [] } }, { immediate: true });
    assert.equal(T.resolve(reopened.settings, false).id, 'cloud');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
