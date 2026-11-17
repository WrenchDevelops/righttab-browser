// Loads the real start page and checks the pieces a new tab has to render.
const { app, protocol } = require('electron');
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

const profile = process.argv[2];
if (!profile) throw new Error('Provide a disposable profile path.');
protocol.registerSchemesAsPrivileged([
  { scheme: 'righttab', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);
app.setPath('userData', profile);
fs.mkdirSync(profile, { recursive: true });
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({
  completedSetup: true,
  importOffered: true,
  startupPage: 'righttab',
  newTabPage: 'righttab',
}));

app.whenReady().then(async () => {
  const browser = require('./browser.cjs').startBrowser();
  await browser.ready;
  const win = await browser.whenWindow();
  const contents = browser.activeContents(win);
  for (let i = 0; i < 50 && !contents.getURL().startsWith('righttab://newtab'); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(contents.getURL(), 'righttab://newtab/');
  for (let i = 0; i < 40; i += 1) {
    const count = await contents.executeJavaScript(`document.querySelectorAll('.shortcut:not(.add)').length`);
    if (count === 5) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const probe = await contents.executeJavaScript(`(() => {
    const logo = document.getElementById('logo');
    const search = document.getElementById('search-input');
    const shortcuts = [...document.querySelectorAll('.shortcut:not(.add)')].map((node) => node.title);
    const clock = document.getElementById('clock').innerText;
    const weather = document.getElementById('weather').innerText;
    const searchBox = search.getBoundingClientRect();
    const weatherBox = document.getElementById('weather').getBoundingClientRect();
    const clockBox = document.getElementById('clock').getBoundingClientRect();
    return {
      title: document.title,
      placeholder: search.placeholder,
      logoWidth: Math.round(logo.getBoundingClientRect().width),
      shortcuts,
      clock,
      weather,
      overlap: searchBox.bottom > weatherBox.top || searchBox.bottom > clockBox.top,
      panelClosed: !document.getElementById('panel').classList.contains('open'),
    };
  })()`);
  assert.equal(probe.title, 'New Tab');
  assert.equal(probe.placeholder, 'Search the web or enter a URL...');
  assert.ok(probe.logoWidth >= 72 && probe.logoWidth <= 100, `logo width ${probe.logoWidth}`);
  assert.deepEqual(probe.shortcuts, ['YouTube', 'Gmail', 'Google Drive', 'GitHub', 'Discord']);
  assert.match(probe.clock, /\d/);
  assert.match(probe.weather, /Add a city/);
  assert.equal(probe.weather.includes('72'), false);
  assert.equal(probe.overlap, false);
  assert.equal(probe.panelClosed, true);
  await contents.executeJavaScript(`document.getElementById('customize').click()`);
  assert.equal(await contents.executeJavaScript(`document.getElementById('panel').classList.contains('open')`), true);
  const shot = await contents.capturePage();
  fs.writeFileSync(path.join(profile, 'homepage.png'), shot.toPNG());
  console.log('PASS RightTab start page');
  app.exit(0);
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
