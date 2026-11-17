// Exercises the visible Home control through the real renderer and IPC bridge.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

const profile = process.argv[2];
if (!profile) throw new Error('Provide a disposable profile path.');
app.setPath('userData', profile);
fs.mkdirSync(profile, { recursive: true });
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ completedSetup: true, importOffered: true }));

app.whenReady().then(async () => {
  const browser = require('./browser.cjs').startBrowser();
  await browser.ready;
  const win = await browser.whenWindow();
  const ui = win.ui.webContents;
  for (const [choice, expected] of [['google', 'https://www.google.com/'], ['chatgpt', 'https://chatgpt.com/']]) {
    browser.updateSettings({ startupPage: choice });
    browser.navigate(win, null, 'https://example.com/');
    await ui.executeJavaScript('document.getElementById("home").click()');
    for (let i = 0; i < 40 && browser.snapshot(win).url !== expected; i++) await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(browser.snapshot(win).url, expected);
  }
  console.log('PASS Home button opens both configured startup destinations');
  app.exit(0);
}).catch((error) => { console.error(error); app.exit(1); });
