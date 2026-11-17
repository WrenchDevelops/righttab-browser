const { app, components } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { probeContents } = require('./media-probe.cjs');
const { initializeMediaRuntime } = require('./media-runtime.cjs');
const { startMediaDiagnostics } = require('./media-diagnostics.cjs');
const assert = require('node:assert/strict');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'righttab-media-'));
app.setName('RightTab Media Test');
app.setPath('userData', profile);
let server;
const deadline = setTimeout(() => { console.error('Media diagnostic deadline exceeded'); app.exit(1); }, 180000);
app.whenReady().then(async () => {
  app.configureHostResolver({ secureDnsMode: 'secure', secureDnsServers: ['https://dns.google/dns-query', 'https://cloudflare-dns.com/dns-query'], enableBuiltInResolver: true });
  const mediaRuntime = await initializeMediaRuntime(components);
  const browser = require('./browser.cjs').startBrowser({ mediaRuntime });
  await browser.ready;
  const win = await browser.whenWindow();
  browser.updateSettings({ completedSetup: true, importOffered: true });
  browser.showPages(win);
  server = http.createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end('<title>RightTab media diagnostics</title><h1>Media capability probe</h1>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const tab = browser.createTab(win, { url: `http://127.0.0.1:${server.address().port}/` });
  const contents = tab.view.webContents;
  await new Promise((resolve) => contents.once('did-finish-load', resolve));
  const report = { date: new Date().toISOString(), versions: process.versions, mediaRuntime,
    profile: 'disposable; no user data imported', normal: await probeContents(contents) };
  browser.showPages(win);
  browser.openSplit(win, { url: contents.getURL() });
  const side = win.tabs.get(win.secondaryTabId).view.webContents;
  if (side.isLoading()) await new Promise((resolve) => side.once('did-finish-load', resolve));
  report.split = await probeContents(side);
  const privateWin = browser.createWindow({ privateMode: true });
  const privateTab = browser.createTab(privateWin, { url: contents.getURL() });
  await new Promise((resolve) => privateTab.view.webContents.once('did-finish-load', resolve));
  report.private = await probeContents(privateTab.view.webContents);
  assert.equal(report.normal[0].codecs.h264.mediaSource, true, 'H.264 MediaSource support');
  assert.equal(report.normal[0].codecs.aac.mediaSource, true, 'AAC MediaSource support');
  assert.equal(report.normal[0].keySystems.find((item) => item.name === 'clearkey-mp4').supported, true);
  assert.deepEqual(report.split[0].keySystems.map((item) => item.supported), report.normal[0].keySystems.map((item) => item.supported), 'Split view must preserve key-system availability');
  report.checks = ['H.264/AAC MediaSource', 'Clear Key media keys', 'normal and split key-system parity', 'private capability probe'];
  const capture = await startMediaDiagnostics(contents, mediaRuntime);
  await contents.executeJavaScript(`console.error('Widevine NotSupportedError secret=do-not-record'); fetch('/missing?token=do-not-record')`);
  report.capture = await capture.finish();
  assert.ok(report.capture.events.some((event) => event.kind === 'console' && event.categories.includes('widevine')));
  assert.ok(!JSON.stringify(report.capture).includes('do-not-record'), 'Reports must not record arbitrary console or request text');
  assert.equal(contents.debugger.isAttached(), false, 'Capture must detach');
  report.checks.push('diagnostic capture and cleanup; console/request privacy');
  console.log('MEDIA_CAPABILITIES', JSON.stringify({ runtime: mediaRuntime, keySystems: report.normal[0].keySystems }));
  if (process.argv.includes('--vmp')) {
    const lab = browser.createTab(win, { url: 'https://castlabs.github.io/wv-vmp-lab/' });
    const wc = lab.view.webContents;
    await wc.loadURL('https://castlabs.github.io/wv-vmp-lab/');
    const capture = await startMediaDiagnostics(wc, mediaRuntime);
    await wc.executeJavaScript(`document.getElementById('loadContentBtn').click()`);
    for (let attempt = 0; attempt < 30; attempt++) {
      if (await wc.executeJavaScript(`document.querySelector('video').readyState >= 2`)) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const playResult = await wc.executeJavaScript(`document.querySelector('video').play().then(() => 'started', e => e.name)`, true);
    await new Promise((resolve) => setTimeout(resolve, 5000));
    report.vmpLab = { playResult, verification: await wc.executeJavaScript(`(document.getElementById('logBox').textContent.match(/PLATFORM_[A-Z_]+/g) || [])`), diagnostics: await capture.finish() };
    browser.closeTab(win, lab.id);
  }
  if (process.argv.includes('--services')) {
    report.services = [];
    for (const [name, url] of [['Disney+', 'https://www.disneyplus.com/'], ['Netflix', 'https://www.netflix.com/'], ['Hulu', 'https://www.hulu.com/'], ['YouTube', 'https://www.youtube.com/'], ['Spotify', 'https://open.spotify.com/']]) {
      const page = browser.createTab(win, { url });
      const wc = page.view.webContents;
      const serviceCapture = await startMediaDiagnostics(wc, mediaRuntime);
      const events = [];
      wc.on('did-fail-load', (_e, code, _description, _url, isMainFrame) => { if (isMainFrame) events.push({ code }); });
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 20000);
        wc.once('did-finish-load', () => { clearTimeout(timer); resolve(); });
      });
      const diagnostics = await serviceCapture.finish();
      report.services.push({ name, events, probe: diagnostics.final, diagnostics, homepageTitle: wc.getTitle(), playback: 'not verified; disposable profile has no authenticated test access' });
      console.log('SERVICE_HOMEPAGE', name, wc.getTitle());
      browser.closeTab(win, page.id);
    }
  }
  const output = path.resolve(process.env.RIGHTTAB_MEDIA_REPORT || path.join(__dirname, '../test-results/media-diagnostics.json'));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ report: output, versions: { electron: process.versions.electron, chrome: process.versions.chrome }, mediaRuntime, normal: report.normal }, null, 2));
  clearTimeout(deadline);
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  browser.store.flush();
  app.exit(0);
}).catch((error) => { console.error(error); app.exit(1); });
app.on('quit', () => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} });
