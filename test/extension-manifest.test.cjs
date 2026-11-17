const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { inspectExtension, matchPattern } = require('../shared/extension-manifest.cjs');
const { normalizeSettings, applySettingsPatch } = require('../shared/settings.cjs');

function writeExtension(root, manifest, files = {}) {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest));
  for (const [name, contents] of Object.entries(files)) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  }
}

test('a manifest v3 extension reports partial tabs support and unavailable Chrome-only APIs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'righttab-ext-'));
  writeExtension(root, {
    manifest_version: 3,
    name: '__MSG_name__',
    version: '1.2.3',
    default_locale: 'en',
    description: 'Probe',
    permissions: ['storage', 'tabs', 'contextMenus', 'sidePanel', 'identity'],
    host_permissions: ['https://chatgpt.com/*'],
    action: { default_popup: 'popup.html', default_title: 'Probe' },
    background: { service_worker: 'background.js' },
    content_scripts: [{ matches: ['https://chatgpt.com/*'], js: ['content.js'] }],
    side_panel: { default_path: 'side.html' },
    commands: { open: { suggested_key: { default: 'Ctrl+Shift+Y' } } },
  }, {
    'popup.html': '<p>popup</p>',
    'background.js': '',
    'content.js': '',
    'side.html': '<p>side</p>',
    '_locales/en/messages.json': JSON.stringify({ name: { message: 'Localized Probe' } }),
  });
  const info = inspectExtension(root);
  assert.equal(info.ok, true);
  assert.equal(info.name, 'Localized Probe');
  assert.equal(info.permissions.find((item) => item.id === 'storage').support, 'partial');
  assert.equal(info.permissions.find((item) => item.id === 'tabs').support, 'partial');
  assert.equal(info.permissions.find((item) => item.id === 'contextMenus').support, 'no');
  assert.equal(info.permissions.find((item) => item.id === 'https://chatgpt.com/*').support, 'yes');
  assert.equal(info.popup, 'popup.html');
  assert.equal(info.sidePanel, 'side.html');
  assert.ok(info.limitations.some((item) => item.includes('contextMenus') || item.includes('right-click')));
  assert.ok(info.limitations.some((item) => item.includes('chrome.action')));
  assert.ok(info.limitations.some((item) => item.includes('chrome.commands')));
});

test('folders without a usable manifest are refused with a specific error', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'righttab-ext-bad-'));
  assert.match(inspectExtension(root).error, /manifest\.json/);
  fs.writeFileSync(path.join(root, 'manifest.json'), '{');
  assert.match(inspectExtension(root).error, /not valid JSON/);
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ manifest_version: 1, name: 'Old', version: '1' }));
  assert.match(inspectExtension(root).error, /manifest version 2 or 3/);
});

test('match patterns cover declared sites and ignore other origins', () => {
  assert.equal(matchPattern('https://chatgpt.com/*', 'https://chatgpt.com/c/1'), true);
  assert.equal(matchPattern('https://chatgpt.com/*', 'https://example.com/'), false);
  assert.equal(matchPattern('http://127.0.0.1/*', 'http://127.0.0.1:4312/secret'), true);
  assert.equal(matchPattern('*://*.example.com/*', 'https://example.com/a'), true);
  assert.equal(matchPattern('*://*.example.com/*', 'https://evil.com/'), false);
  assert.equal(matchPattern('<all_urls>', 'https://example.com/'), true);
  assert.equal(matchPattern('<all_urls>', 'file:///tmp/a'), false);
});

test('installed extensions survive a settings patch and old loads migrate once', () => {
  const migrated = normalizeSettings({
    loadedExtensions: [{ name: 'Old', id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', path: '/tmp/old-extension' }],
  });
  assert.equal(migrated.installedExtensions.length, 1);
  assert.equal(migrated.installedExtensions[0].name, 'Old');
  assert.equal(migrated.installedExtensions[0].enabled, true);
  assert.equal(migrated.loadedExtensions, undefined);
  const patched = applySettingsPatch(migrated, { startupPage: 'google' });
  assert.equal(patched.startupPage, 'google');
  assert.equal(patched.installedExtensions[0].installId, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
  const rejected = normalizeSettings({ installedExtensions: [{ installId: '../escape', path: '/tmp/x', name: 'Bad' }] });
  assert.equal(rejected.installedExtensions.length, 0);
});

test('worker startup failure is actionable in extension diagnostics', () => {
  const { actionableExtensionError } = require('../shared/extension-manifest.cjs');
  assert.equal(actionableExtensionError('Chrome extension background startup failed.'), true);
});
