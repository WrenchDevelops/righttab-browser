// Isolated two-process persistence check. Invoked only by scripts/check-theme-restart.cjs.
const { app } = require('electron');
const assert = require('node:assert/strict');
const T = require('../shared/themes.js');
app.setPath('userData', process.argv[2]);
app.whenReady().then(async () => {
  const browser = require('./browser.cjs').startBrowser();
  await browser.ready;
  const win = await browser.whenWindow();
  const ui = win.ui.webContents;
  const js = text => ui.executeJavaScript(text);
  for (let n = 0; n < 100; n++) {
    if (await js('typeof state !== "undefined" && !!state')) break;
    await new Promise(r => setTimeout(r, 50));
  }
  if (process.argv[3] === 'save') {
    const custom = { ...T.validate(T.presets[2]), id: 'custom-restart', name: 'Restart Check' };
    await js(`rt.setSetting(${JSON.stringify({ completedSetup: true, importOffered: true, startupPage: 'google', appearance: { selected: custom.id, custom: [custom], dark: 'cherry', light: custom.id, followSystem: false } })})`);
    await browser.mainSession.cookies.set({ url: 'https://example.com', name: 'restart-check', value: 'signed-in', expirationDate: Date.now() / 1000 + 86400 });
    await browser.mainSession.cookies.flushStore();
    browser.store.flush();
  } else {
    assert.equal(await js('document.documentElement.dataset.preset'), 'custom-restart');
    assert.equal(browser.store.settings.appearance.custom[0].name, 'Restart Check');
    assert.equal(browser.store.settings.appearance.dark, 'cherry');
    assert.equal(browser.store.settings.appearance.followSystem, false);
    assert.equal(browser.store.settings.startupPage, 'google');
    assert.equal((await browser.mainSession.cookies.get({ name: 'restart-check' }))[0].value, 'signed-in');
    assert.ok(browser.snapshot(win).url.startsWith('https://www.google.com/'));
    console.log('OK actual app restart preserves selected custom theme, system presets, Google startup preference and login cookie');
  }
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
