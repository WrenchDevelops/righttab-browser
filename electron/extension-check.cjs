// Loads a local probe extension and checks the behavior Electron 45 actually provides.
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const profile = process.argv[2];
const phase = process.argv[3];
const pageUrl = 'https://example.com/';
const secretUrl = 'https://example.com/?righttab-private=1';
function trace(line) {
  fs.appendFileSync('/tmp/righttab-ext-log.txt', `${phase} ${line}\n`);
}

function waitFor(fn, timeout, label) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      Promise.resolve().then(fn).then((value) => {
        if (value) {
          clearInterval(timer);
          resolve(value);
        } else if (Date.now() - start > timeout) {
          clearInterval(timer);
          reject(new Error(`timed out waiting for ${label}`));
        }
      }).catch((error) => {
        clearInterval(timer);
        reject(error);
      });
    }, 100);
  });
}

function solidPng(size, r, g, b) {
  const zlib = require('zlib');
  const row = Buffer.alloc(size * 4 + 1);
  for (let x = 0; x < size; x += 1) {
    row[1 + x * 4] = r;
    row[2 + x * 4] = g;
    row[3 + x * 4] = b;
    row[4 + x * 4] = 255;
  }
  const raw = Buffer.concat(Array.from({ length: size }, () => Buffer.from(row)));
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([length, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function writeProbe(root) {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'icon.png'), solidPng(32, 82, 97, 216));
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({
    manifest_version: 3,
    name: 'RightTab Probe',
    version: '1.0.0',
    description: 'Local compatibility probe',
    permissions: ['storage', 'tabs', 'scripting'],
    host_permissions: ['https://example.com/*'],
    action: { default_title: 'Probe', default_popup: 'popup.html', default_icon: { '16': 'icon.png' } },
    background: { service_worker: 'background.js' },
    content_scripts: [{ matches: ['https://example.com/*'], js: ['content.js'], run_at: 'document_start' }],
  }, null, 2));
  fs.writeFileSync(path.join(root, 'background.js'), `
    chrome.storage.local.set({ probe: 'installed' });
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message && message.type === 'ping') {
        chrome.storage.local.get(['probe', 'marker'], (data) => {
          sendResponse({
            from: 'background',
            probe: data.probe || '',
            marker: data.marker || '',
            hasAction: typeof chrome.action,
            hasSidePanel: typeof chrome.sidePanel,
            hasCommands: typeof chrome.commands,
            hasContextMenus: typeof chrome.contextMenus,
            hasIdentity: typeof chrome.identity,
          });
        });
        return true;
      }
      if (message && message.type === 'tabs') {
        try {
          chrome.tabs.query({}, (tabs) => sendResponse({
            error: chrome.runtime.lastError ? chrome.runtime.lastError.message : '',
            urls: (tabs || []).map((tab) => tab.url || ''),
          }));
        } catch (error) {
          sendResponse({ error: error.message, urls: [] });
        }
        return true;
      }
    });
  `);
  fs.writeFileSync(path.join(root, 'content.js'), `
    document.documentElement.dataset.righttabProbe = 'content';
    function ping(tries) {
      chrome.runtime.sendMessage({ type: 'ping' }, (response) => {
        if (chrome.runtime.lastError || !response) {
          if (tries > 0) setTimeout(() => ping(tries - 1), 200);
          else document.documentElement.dataset.righttabBackground = 'failed';
          return;
        }
        document.documentElement.dataset.righttabBackground = response.from || '';
        document.documentElement.dataset.righttabStorage = response.probe || '';
      });
    }
    ping(40);
  `);
  fs.writeFileSync(path.join(root, 'popup.html'), `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:320px;height:180px;font:14px sans-serif}</style><p id="status">loading</p><script src="popup.js"></script>`);
  fs.writeFileSync(path.join(root, 'popup.js'), `
    const status = document.getElementById('status');
    chrome.runtime.sendMessage({ type: 'ping' }, (response) => {
      const error = chrome.runtime.lastError ? chrome.runtime.lastError.message : '';
      status.textContent = JSON.stringify({
        response: response || null,
        error,
        node: typeof require,
        process: typeof process,
        bridge: typeof window.righttab,
        href: location.href,
      });
    });
  `);
}

function writePanel(root) {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({
    manifest_version: 3,
    name: 'Panel Probe',
    version: '1.0.0',
    permissions: ['sidePanel', 'contextMenus', 'identity'],
    action: { default_title: 'Panel' },
    side_panel: { default_path: 'side.html' },
  }));
  fs.writeFileSync(path.join(root, 'side.html'), '<!doctype html><p id="panel">side-panel-page</p><script src="side.js"></script>');
  fs.writeFileSync(path.join(root, 'side.js'), `document.getElementById('panel').dataset.api = [typeof chrome.sidePanel, typeof chrome.contextMenus, typeof chrome.identity].join(' ');`);
}

async function marker(contents) {
  return contents.executeJavaScript(`({
    probe: document.documentElement.dataset.righttabProbe || '',
    background: document.documentElement.dataset.righttabBackground || '',
    storage: document.documentElement.dataset.righttabStorage || '',
  })`);
}

async function openReadyPopup(browser, win, installId) {
  const opened = await browser.extensions.openSurface(win, { installId, kind: 'popup', anchor: { x: 420, y: 88 } });
  if (!opened.ok) throw new Error(opened.error || 'popup did not open');
  const popup = win.extensionPopup.webContents;
  await waitFor(async () => {
    const text = await popup.executeJavaScript(`document.getElementById('status').textContent`);
    return text && text !== 'loading' ? text : '';
  }, 8000, 'popup status');
  return JSON.parse(await popup.executeJavaScript(`document.getElementById('status').textContent`));
}

process.on('warning', (warning) => {
  if (String(warning.name || warning).includes('MaxListeners')) {
    console.error(warning.stack || warning.message);
  }
});
app.setName('RightTab');
app.setPath('userData', profile);
fs.mkdirSync(profile, { recursive: true });
const settingsFile = path.join(profile, 'settings.json');
if (!fs.existsSync(settingsFile)) {
  fs.writeFileSync(settingsFile, JSON.stringify({ completedSetup: true, importOffered: true, startupPage: 'chatgpt' }));
}
console.error(`BOOT phase=${phase} fast=${process.env.RIGHTTAB_EXT_FAST || ''} userData=${profile}`);
app.whenReady().then(async () => {
  const notes = [];
  const browser = require('./browser.cjs').startBrowser();
  await browser.ready;
  const win = await browser.whenWindow();
  browser.updateSettings({ completedSetup: true, importOffered: true, startupPage: 'google' });
  browser.showPages(win);
  const ui = win.ui.webContents;
  await waitFor(() => ui.executeJavaScript('typeof state !== "undefined" && !!state'), 8000, 'ui state');
  await ui.executeJavaScript(`document.querySelector('[data-action="start"]')?.click()`);
  notes.push(`versions chromium=${process.versions.chrome} electron=${process.versions.electron}`);
  trace(`ready names=${browser.store.settings.installedExtensions.map((item) => item.name).join(',')}`);

  if (phase === 'save') {
    const probeDir = path.join(profile, 'probe-source');
    const panelDir = path.join(profile, 'panel-source');
    writeProbe(probeDir);
    writePanel(panelDir);
    const staged = browser.extensions.stage(probeDir);
    if (!staged.ok) throw new Error(staged.error);
    if (!staged.preview.permissions.some((item) => item.id === 'storage')) throw new Error('review omitted storage');
    const installed = await browser.extensions.confirmStaged();
    if (!installed.ok) throw new Error(installed.error);
    const probe = browser.extensions.publicState(win).extensions.find((item) => item.name === 'RightTab Probe');
    if (!probe?.loaded) throw new Error('probe did not load');
    browser.extensions.setPinned(probe.installId, true);

    browser.navigate(win, null, pageUrl);
    let lastPage = '';
    try {
      await waitFor(async () => {
        const contents = browser.activeContents(win);
        if (!contents || !contents.isDestroyed || contents.isDestroyed()) return false;
        const mark = await marker(contents);
        lastPage = `${contents.getURL()} ${JSON.stringify(mark)}`;
        return mark.background === 'background';
      }, 20000, 'content script');
    } catch (error) {
      throw new Error(`${error.message}: ${lastPage}`);
    }
    const first = await marker(browser.activeContents(win));
    if (first.probe !== 'content' || first.storage !== 'installed') throw new Error(`content script ${JSON.stringify(first)}`);
    notes.push('content script ran and reached the service worker');

    const popup = await openReadyPopup(browser, win, probe.installId);
    if (popup.bridge !== 'undefined' || popup.node !== 'undefined') throw new Error(`popup was not isolated ${JSON.stringify(popup)}`);
    if (!String(popup.href).startsWith('chrome-extension://')) throw new Error(`popup url ${popup.href}`);
    if (popup.response?.from !== 'background' || popup.response?.probe !== 'installed') throw new Error(`popup messaging ${JSON.stringify(popup)}`);
    notes.push(`popup isolated; action=${popup.response.hasAction} sidePanel=${popup.response.hasSidePanel} commands=${popup.response.hasCommands} contextMenus=${popup.response.hasContextMenus} identity=${popup.response.hasIdentity}`);
    await win.extensionPopup.webContents.executeJavaScript(`new Promise((resolve) => chrome.storage.local.set({ marker: 'kept' }, () => resolve(true)))`);
    browser.extensions.closePopup(win);

    browser.createTab(win, { url: pageUrl });
    await waitFor(async () => (await marker(browser.activeContents(win))).probe === 'content', 8000, 'new tab content script');
    notes.push('content script ran in a newly opened tab');

    const privateWindow = browser.createWindow({ privateMode: true });
    browser.navigate(privateWindow, null, secretUrl);
    await waitFor(() => {
      const contents = browser.activeContents(privateWindow);
      if (!contents || contents.isDestroyed()) return false;
      const loading = typeof contents.isLoading === 'function' ? contents.isLoading() : false;
      return !loading && contents.getURL().includes('righttab-private');
    }, 8000, 'private page');
    await new Promise((resolve) => setTimeout(resolve, 600));
    const privateMarker = await marker(browser.activeContents(privateWindow));
    if (privateMarker.probe) throw new Error('content script ran in a private window');
    const queried = await openReadyPopup(browser, win, probe.installId);
    void queried;
    const tabQuery = JSON.parse(await win.extensionPopup.webContents.executeJavaScript(`new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'tabs' }, (response) => {
        resolve(JSON.stringify(response || { error: chrome.runtime.lastError && chrome.runtime.lastError.message, urls: [] }));
      });
    })`));
    if ((tabQuery.urls || []).some((url) => String(url).includes('righttab-private'))) {
      throw new Error(`chrome.tabs.query exposed a private tab: ${JSON.stringify(tabQuery)}`);
    }
    notes.push(`private window stayed isolated; tabs query error=${tabQuery.error || 'none'} count=${(tabQuery.urls || []).length}`);
    privateWindow.win.close();
    browser.extensions.closePopup(win);

    await browser.extensions.setEnabled(probe.installId, false);
    browser.navigate(win, null, pageUrl);
    await waitFor(() => {
      const contents = browser.activeContents(win);
      if (!contents || contents.isDestroyed()) return false;
      const loading = typeof contents.isLoading === 'function' ? contents.isLoading() : false;
      return !loading && contents.getURL().startsWith(pageUrl);
    }, 8000, 'reload after disable');
    const disabledStarted = Date.now();
    while (Date.now() - disabledStarted < 1500) {
      const disabled = await marker(browser.activeContents(win));
      if (disabled.probe) throw new Error('content script still ran while the extension was disabled');
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    notes.push('disabling the extension stopped its content script');
    await browser.extensions.setEnabled(probe.installId, true);

    trace('before panel install');
    const panel = await browser.extensions.installFromDirectory(panelDir);
    if (!panel.ok) throw new Error(panel.error);
    const panelRecord = browser.extensions.publicState(win).extensions.find((item) => item.name === 'Panel Probe');
    const joined = (panelRecord.limitations || []).join(' ');
    if (!/side panel|sidePanel|context menu|right-click|chrome.identity/i.test(joined)) {
      throw new Error(`missing limitation text: ${joined}`);
    }
    const openedPanel = await browser.extensions.openSurface(win, { installId: panelRecord.installId, kind: 'side-panel' });
    if (!openedPanel.ok) throw new Error(openedPanel.error || 'side panel did not open');
    await waitFor(async () => {
      const text = await win.sidePanelView.webContents.executeJavaScript(`document.getElementById('panel').textContent`);
      return text === 'side-panel-page' ? text : '';
    }, 8000, 'side panel page');
    const api = await win.sidePanelView.webContents.executeJavaScript(`document.getElementById('panel').dataset.api || ''`);
    notes.push(`side panel page opened; chrome.sidePanel/contextMenus/identity types=${api}`);
    trace(`after panel names=${browser.store.settings.installedExtensions.map((item) => item.name).join(',')}`);

    const chromeUi = await ui.executeJavaScript(`({
      button: !!document.getElementById('extensions-button'),
      pins: document.querySelectorAll('#extension-pins .extension-pin').length,
    })`);
    if (!chromeUi.button || chromeUi.pins < 1) throw new Error(`toolbar chrome ${JSON.stringify(chromeUi)}`);
    await ui.executeJavaScript(`document.getElementById('profile-button').click(); document.querySelector('[data-pane="extensions"]').click();`);
    await waitFor(() => ui.executeJavaScript(`document.body.innerText.includes('RightTab Probe') && document.body.innerText.includes('Chrome Web Store')`), 4000, 'extensions settings');
    const outDir = path.join(__dirname, '../test-results');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'extensions-ui.png'), (await ui.capturePage()).toPNG());
    notes.push('settings lists the probe and explains that the Chrome Web Store cannot be installed');
    await browser.mainSession.flushStorageData();
    browser.store.flush();
    console.error(`END SAVE ${browser.store.settings.installedExtensions.map((item) => item.name).join(' | ')}`);
  } else {
    const probe = browser.extensions.publicState(win).extensions.find((item) => item.name === 'RightTab Probe');
    const panel = browser.extensions.publicState(win).extensions.find((item) => item.name === 'Panel Probe');
    if (!probe?.loaded || !panel?.loaded) {
      const saved = browser.store.settings.installedExtensions.map((item) => ({
        name: item.name,
        enabled: item.enabled,
        error: item.loadError,
        path: item.path,
      }));
      throw new Error(`extensions were not restored ${JSON.stringify(saved)}`);
    }
    browser.navigate(win, null, pageUrl);
    await waitFor(async () => (await marker(browser.activeContents(win))).storage === 'installed', 8000, 'restored content script');
    const popup = await openReadyPopup(browser, win, probe.installId);
    if (popup.response?.marker !== 'kept') throw new Error(`storage did not survive restart ${JSON.stringify(popup)}`);
    notes.push('restart restored both extensions, the content script, and chrome.storage.local');
  }

  console.log(notes.map((line) => `OK ${line}`).join('\n'));
  app.exit(0);
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
