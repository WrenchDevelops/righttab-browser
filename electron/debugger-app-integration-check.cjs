const { app, session } = require('electron');
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert/strict');
const profile = process.argv[2];
const targetMode = process.argv[3] === 'targetId';
if (!profile) throw new Error('Disposable profile required.');
process.env.RIGHTTAB_EXTENSION_TEST = '1';
app.setPath('userData', profile);
app.whenReady().then(async () => {
  const ext = path.join(profile, 'probe'); fs.mkdirSync(ext);
  fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'Debugger probe', version: '1.0', permissions: ['tabs', 'debugger'], host_permissions: ['<all_urls>'], background: { service_worker: 'worker.js' } }));
  fs.writeFileSync(path.join(ext, 'worker.js'), `
    chrome.debugger.onEvent.addListener((source, method) => { if (method === 'Runtime.executionContextCreated') console.log('PROBE_EVENT', typeof source.tabId === 'number' || typeof source.targetId === 'string'); });
    chrome.debugger.onDetach.addListener(async (source, reason) => {
      console.log('PROBE_DETACH', reason, typeof source.tabId === 'number' || typeof source.targetId === 'string');
      if (reason === 'canceled_by_user') { try { await chrome.debugger.attach(source, '1.3'); console.log('PROBE_REATTACHED'); } catch (e) { console.log('PROBE_FAIL', e.message); } }
    });
    let started = false;
    const timer = setInterval(async () => {
      if (started) return;
      try {
        const tabs = await chrome.tabs.query({});
        const tab = tabs.find(t => (t.url || '').startsWith('http://127.0.0.1:'));
        if (!tab) return;
        started = true; clearInterval(timer);
        const target = ${targetMode ? "{targetId:(await chrome.debugger.getTargets()).find(t => t.tabId === tab.id).id}" : "{tabId:tab.id}"};
        await chrome.debugger.attach(target, '1.3');
        await chrome.debugger.sendCommand(target, 'Runtime.enable');
        const result = await chrome.debugger.sendCommand(target, 'Runtime.evaluate', {expression:'document.title',returnByValue:true});
        console.log('PROBE_TITLE', result.result.value);
      } catch (e) { console.log('PROBE_FAIL', e.message); }
    }, 100);
  `);
  const seen = [];
  session.fromPartition('persist:righttab').serviceWorkers.on('console-message', (_e, d) => { if (d.message.startsWith('PROBE_')) seen.push(d.message); });
  const browser = require('./browser.cjs').startBrowser();
  await browser.ready;
  const win = await browser.whenWindow();
  browser.updateSettings({ completedSetup: true, importOffered: true }); browser.showPages(win);
  const server = http.createServer((_req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<title>Local probe</title>'); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const tab = browser.createTab(win, { url: `http://127.0.0.1:${server.address().port}/` });
  const result = await browser.extensions.installFromDirectory(ext); assert.ok(result.ok, result.error);
  for (let i = 0; i < 200 && !seen.includes('PROBE_TITLE Local probe'); i++) await new Promise(r => setTimeout(r, 50));
  assert.ok(seen.includes('PROBE_TITLE Local probe'), JSON.stringify(seen));
  assert.ok(seen.includes('PROBE_EVENT true'), JSON.stringify(seen));
  const attached = browser.snapshot(win).debuggerAttachments;
  assert.equal(attached[0]?.name, 'Debugger probe');
  for (let i = 0; i < 100; i++) { if ((await win.ui.webContents.executeJavaScript(`document.getElementById('extension-control')?.innerText || ''`)).includes('Debugger probe')) break; await new Promise(r => setTimeout(r, 50)); }
  const indicator = await win.ui.webContents.executeJavaScript(`document.getElementById('extension-control')?.innerText || ''`);
  assert.match(indicator, /Debugger probe.*Disconnect/s);
  await win.ui.webContents.executeJavaScript(`document.querySelector('#extension-control button').click()`);
  for (let i = 0; i < 100 && !seen.includes('PROBE_DETACH canceled_by_user true'); i++) await new Promise(r => setTimeout(r, 50));
  assert.ok(seen.includes('PROBE_DETACH canceled_by_user true'), JSON.stringify(seen));
  for (let i = 0; i < 100 && !seen.includes('PROBE_REATTACHED'); i++) await new Promise(r => setTimeout(r, 50));
  assert.ok(seen.includes('PROBE_REATTACHED'), JSON.stringify(seen));
  browser.closeTab(win, tab.id);
  for (let i = 0; i < 100 && !seen.includes('PROBE_DETACH target_closed true'); i++) await new Promise(r => setTimeout(r, 50));
  assert.ok(seen.includes('PROBE_DETACH target_closed true'), JSON.stringify(seen));
  assert.equal(browser.snapshot(win).debuggerAttachments.length, 0);
  console.log('PASS worker debugger', targetMode ? 'targetId' : 'tabId', 'attach, command, event, indicator and disconnect');
  server.close(); app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
