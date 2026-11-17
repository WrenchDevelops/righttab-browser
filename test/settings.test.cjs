const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSettings, applySettingsPatch } = require('../shared/settings.cjs');

test('defaults open the RightTab page and do not restore the last session', () => {
  const settings = normalizeSettings({});
  assert.equal(settings.startupPage, 'righttab');
  assert.equal(settings.newTabPage, 'righttab');
  assert.equal(settings.searchEngine, 'google');
  assert.equal(settings.restoreSession, false);
  assert.equal(settings.completedSetup, false);
});

test('a settings patch can switch startup to Google without changing search', () => {
  const next = applySettingsPatch(normalizeSettings({}), { startupPage: 'google' });
  assert.equal(next.startupPage, 'google');
  assert.equal(next.searchEngine, 'google');
});

test('unknown startup values fall back to the RightTab page and sidebar width is clamped', () => {
  const settings = normalizeSettings({ startupPage: 'bing', sidebarWidth: 10, searchEngine: 'yahoo' });
  assert.equal(settings.startupPage, 'righttab');
  assert.equal(settings.searchEngine, 'google');
  assert.equal(settings.sidebarWidth, 200);
});

test('a saved ChatGPT startup stays put when new tabs use the RightTab page', () => {
  const settings = normalizeSettings({ startupPage: 'chatgpt' });
  assert.equal(settings.startupPage, 'chatgpt');
  assert.equal(settings.newTabPage, 'righttab');
  const next = applySettingsPatch(settings, { newTabPage: 'google' });
  assert.equal(next.startupPage, 'chatgpt');
  assert.equal(next.newTabPage, 'google');
});

test('bookmark bar supports hidden, simple and complex modes while migrating old settings', () => {
  assert.equal(normalizeSettings({}).bookmarkBarMode, 'complex');
  assert.equal(normalizeSettings({ showBookmarkBar: false }).bookmarkBarMode, 'hidden');
  const simple = applySettingsPatch(normalizeSettings({}), { bookmarkBarMode: 'simple' });
  assert.equal(simple.bookmarkBarMode, 'simple');
  assert.equal(simple.showBookmarkBar, true);
  const hidden = applySettingsPatch(simple, { bookmarkBarMode: 'hidden' });
  assert.equal(hidden.showBookmarkBar, false);
});
