const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { app } = require('electron');
const { createFixtureProfile } = require('../test/helpers.cjs');

function waitFor(fn, timeout, label) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      Promise.resolve()
        .then(fn)
        .then((value) => {
          if (value) {
            clearInterval(timer);
            resolve(value);
          } else if (Date.now() - start > timeout) {
            clearInterval(timer);
            reject(new Error(`timed out waiting for ${label || 'condition'}`));
          }
        })
        .catch((error) => {
          clearInterval(timer);
          reject(error);
        });
    }, 100);
  });
}

async function runSmoke(browser) {
  const notes = [];
  const ok = (message) => notes.push(`OK ${message}`);
  const fail = (message) => notes.push(`FAIL ${message}`);
  const outDir = path.join(process.cwd(), 'test-results');
  fs.mkdirSync(outDir, { recursive: true });
  let win = null;
  try {
    await browser.ready;
    win = await Promise.race([
      browser.whenWindow(),
      new Promise((_resolve, reject) => setTimeout(() => reject(new Error('window timeout')), 20000)),
    ]);
    await waitFor(() => browser.snapshot(win).tabs.length >= 1, 8000, 'first tab');
    await require('./theme-smoke.cjs').runThemeSmoke(browser, win, outDir, ok);
    const startup = browser.activeContents(win).getURL();
    if (startup.startsWith('righttab://newtab')) ok('startup opens the RightTab page');
    else fail(`startup url ${startup}`);

    browser.createTab(win);
    await waitFor(() => [...win.tabs.values()].length >= 2 && [...win.tabs.values()].every((tab) => tab.view.webContents.getURL().startsWith('righttab://newtab')), 8000, 'new tab navigation');
    const opened = [...win.tabs.values()].map((tab) => {
      try { return tab.view.webContents.getURL(); } catch { return ''; }
    });
    if (opened.length >= 2 && opened.every((url) => url.startsWith('righttab://newtab'))) ok('new tab opens the RightTab page');
    else fail(`new tab urls ${opened.join(' | ')}`);

    browser.navigate(win, null, 'https://example.com/');
    await waitFor(() => {
      const state = browser.snapshot(win);
      return state.url.includes('example.com') && !state.loading;
    }, 20000, 'example.com');
    ok(`loaded ${browser.snapshot(win).title || browser.snapshot(win).url}`);

    browser.navigate(win, null, 'righttab smoke query');
    await waitFor(() => browser.snapshot(win).url.includes('google.com/search'), 20000, 'google search');
    if (decodeURIComponent(browser.snapshot(win).url).includes('righttab smoke query')) ok('address bar searches Google');
    else fail(`search url ${browser.snapshot(win).url}`);

    browser.navigate(win, null, 'example.com/smoke');
    await waitFor(() => browser.snapshot(win).url.startsWith('https://example.com/smoke'), 15000, 'host navigation');
    ok('hostname opens as a URL');

    browser.navigate(win, null, 'https://example.com/');
    await waitFor(() => {
      const state = browser.snapshot(win);
      return state.url.includes('example.com') && !state.url.includes('/smoke') && !state.loading;
    }, 20000, 'return to example');

    browser.toggleBookmark(win);
    if (browser.snapshot(win).bookmarked) ok('bookmark saved');
    else fail('bookmark was not saved');

    if (browser.store.history.entries.some((entry) => entry.url.includes('example.com'))) ok('history recorded');
    else fail('history was not recorded');

    const beforeZoom = browser.activeContents(win).getZoomFactor();
    browser.zoom(win, 'in');
    if (browser.activeContents(win).getZoomFactor() > beforeZoom) ok('zoom in');
    else fail('zoom did not change');

    const found = await new Promise((resolve) => {
      const contents = browser.activeContents(win);
      const timer = setTimeout(() => resolve(null), 5000);
      contents.once('found-in-page', (_event, result) => {
        clearTimeout(timer);
        resolve(result);
      });
      contents.findInPage('Example');
    });
    if (found && found.matches > 0) ok(`find in page matched ${found.matches}`);
    else fail('find in page');

    // The UI view covers the native page views on some macOS compositor paths.
    // Exercise the same forwarded mouseDown/mouseUp sequence a user performs;
    // a missing mouseUp leaves controls pressed and breaks editors such as Docs.
    const clickServer = http.createServer((_request, response) => {
      response.end(`<!doctype html><button id="click">Click</button><input id="field"><script>
        let count = 0;
        document.querySelector('#click').addEventListener('click', () => { count += 1; document.title = 'clicked-' + count; });
      </script>`);
    });
    await new Promise((resolve, reject) => {
      clickServer.once('error', reject);
      clickServer.listen(0, '127.0.0.1', resolve);
    });
    try {
      const port = clickServer.address().port;
      browser.navigate(win, null, `http://127.0.0.1:${port}/`);
      await waitFor(() => browser.snapshot(win).url === `http://127.0.0.1:${port}/` && !browser.snapshot(win).loading, 8000, 'pointer fixture');
      const pointerTab = browser.activeContents(win);
      const bounds = win.tabs.get(win.activeTabId).view.getBounds();
      win.ui.webContents.sendInputEvent({ type: 'mouseDown', x: bounds.x + 25, y: bounds.y + 18, button: 'left', clickCount: 1 });
      win.ui.webContents.sendInputEvent({ type: 'mouseUp', x: bounds.x + 25, y: bounds.y + 18, button: 'left', clickCount: 1 });
      await waitFor(() => pointerTab.executeJavaScript('document.title === "clicked-1"'), 3000, 'forwarded click');
      win.ui.webContents.sendInputEvent({ type: 'mouseDown', x: bounds.x + 100, y: bounds.y + 18, button: 'left', clickCount: 1 });
      win.ui.webContents.sendInputEvent({ type: 'mouseUp', x: bounds.x + 100, y: bounds.y + 18, button: 'left', clickCount: 1 });
      await waitFor(() => pointerTab.executeJavaScript('document.activeElement.id === "field"'), 3000, 'forwarded input focus');
      ok('forwarded pointer input completes clicks and focuses fields');
    } finally {
      await new Promise((resolve) => clickServer.close(resolve));
    }

    // Exercise real native views and the same bridge used by toolbar controls.
    const primaryId = win.activeTabId;
    const side = browser.createTab(win, { url: 'https://example.com/', background: true });
    browser.openSplit(win, { tabId: side.id });
    await waitFor(() => !side.loading, 20000, 'split page');
    if (win.tabs.get(primaryId).attached && side.attached && browser.activeContents(win) === side.view.webContents) ok('split attaches both pages and targets the focused pane');
    else fail('split attachment or focused contents');
    const sideZoom = side.view.webContents.getZoomFactor();
    await win.ui.webContents.executeJavaScript('window.righttab.zoom("in")');
    if (side.view.webContents.getZoomFactor() > sideZoom && browser.snapshot(win).zoom === side.view.webContents.getZoomFactor()) ok('toolbar zoom targets right pane');
    else fail('toolbar zoom targeted the wrong pane');
    await win.ui.webContents.executeJavaScript('window.righttab.setSplitRatio(0.65)');
    const leftBounds = win.tabs.get(primaryId).view.getBounds();
    const rightBounds = side.view.getBounds();
    if (leftBounds.x === win.measuredSidebar && rightBounds.x === leftBounds.x + leftBounds.width + 8 && leftBounds.width > rightBounds.width) ok('split resizes native page bounds');
    else fail('split bounds');
    const originalSize = win.win.getContentSize();
    win.win.setContentSize(760, 600);
    await win.ui.webContents.executeJavaScript('window.righttab.setSidebar({ sidebarWidth: 420 }); window.righttab.setSplitRatio(0.78)');
    await waitFor(() => win.measuredSidebar === 420, 5000, 'wide sidebar');
    const narrowRight = side.view.getBounds();
    if (narrowRight.x + narrowRight.width === win.win.getContentSize()[0]) ok('split stays within a narrow window with a wide sidebar');
    else fail('split overlaps sidebar in a narrow window');
    win.win.setContentSize(...originalSize);
    await win.ui.webContents.executeJavaScript('window.righttab.setSidebar({ sidebarWidth: 252 }); window.righttab.setSplitRatio(0.65)');
    await waitFor(() => win.ui.webContents.executeJavaScript(`!document.getElementById('split-toolbar').hidden && document.getElementById('split-secondary').getAttribute('aria-pressed') === 'true'`), 5000, 'split toolbar');
    fs.writeFileSync(path.join(outDir, 'split-ui.png'), (await win.ui.webContents.capturePage()).toPNG());
    await win.ui.webContents.executeJavaScript(`document.getElementById('split-handle').dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))`);
    await waitFor(() => browser.snapshot(win).split.ratio === 0.5, 5000, 'keyboard split reset');
    ok('split toolbar reflects focus and divider supports keyboard resizing');
    const leftUrl = browser.snapshot(win).tabs.find((tab) => tab.id === primaryId).url;
    await win.ui.webContents.executeJavaScript('window.righttab.submit("https://example.com/split-focus")');
    await waitFor(() => browser.snapshot(win).url.includes('/split-focus'), 15000, 'right pane navigation');
    if (browser.snapshot(win).tabs.find((tab) => tab.id === primaryId).url === leftUrl) ok('address bar navigates only the focused pane');
    else fail('address bar changed the left pane');
    await win.ui.webContents.executeJavaScript('window.righttab.back()');
    await waitFor(() => !browser.snapshot(win).url.includes('/split-focus'), 15000, 'right pane back');
    ok('back navigates the focused pane');
    await win.ui.webContents.executeJavaScript('window.righttab.swapSplit()');
    if (win.activeTabId === side.id && win.secondaryTabId === primaryId && browser.activeContents(win) === side.view.webContents) ok('swap preserves the focused page');
    else fail('split swap');
    browser.saveSessionNow();
    const savedSplit = browser.store.session.windows.find((saved) => saved.tabs.length === win.tabs.size);
    const restoredSplit = browser.createWindow({ restore: savedSplit });
    if (restoredSplit.secondaryTabId && restoredSplit.tabs.get(restoredSplit.secondaryTabId).attached && restoredSplit.tabOrder.indexOf(restoredSplit.secondaryTabId) === savedSplit.secondaryIndex) ok('session restores split with duplicate URLs');
    else fail('split session restoration');
    restoredSplit.win.close();
    browser.closeTab(win, primaryId);
    if (!win.secondaryTabId && side.attached && side.view.getBounds().width > rightBounds.width) ok('closing right pane expands the survivor');
    else fail('closing right pane');
    const replacement = browser.createTab(win, { url: 'https://example.com/', background: true });
    browser.openSplit(win, { tabId: replacement.id });
    browser.closeTab(win, side.id);
    if (win.activeTabId === replacement.id && !win.secondaryTabId && replacement.attached) ok('closing left pane promotes right page');
    else fail('closing left pane');
    browser.openSplit(win, { tabId: replacement.id });
    if (!win.secondaryTabId) ok('opening current tab beside itself is ignored');
    else fail('self split');
    browser.openSplit(win, { url: 'https://example.com/' });
    const keptId = win.secondaryTabId;
    browser.closeSplit(win);
    if (!win.secondaryTabId && win.tabs.has(keptId) && !win.tabs.get(keptId).attached) ok('closing split keeps both tabs');
    else fail('close split discarded a tab');

    const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'righttab-downloads-'));
    browser.store.commit({ downloadDirectory: downloadDir }, { immediate: true });
    const download = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 15000);
      const check = () => {
        const item = browser.downloads().find((entry) => entry.url.includes('example.com') && entry.state !== 'progressing');
        if (item) {
          clearTimeout(timer);
          resolve(item);
        } else setTimeout(check, 200);
      };
      browser.activeContents(win).downloadURL('https://example.com/');
      check();
    });
    if (download?.state === 'completed' && download.savePath && fs.existsSync(download.savePath)) ok(`download saved ${download.filename}`);
    else fail(`download ${download ? download.state : 'did not finish'}`);

    const privateWindow = browser.createWindow({ privateMode: true });
    const privateSession = browser.activeContents(privateWindow)?.session;
    if (privateSession && privateSession !== browser.mainSession) ok('private window uses a separate session');
    else fail('private session was not isolated');
    privateWindow.win.close();

    browser.updateSettings({ startupPage: 'google' });
    if (browser.homepage() === 'https://www.google.com/' && browser.newTabPageUrl() === 'righttab://newtab/') ok('home can switch to Google while new tabs stay on RightTab');
    else fail(`homepage ${browser.homepage()} new tab ${browser.newTabPageUrl()}`);
    browser.updateSettings({ startupPage: 'chatgpt', newTabPage: 'chatgpt', restoreSession: false });
    if (browser.homepage() === 'https://chatgpt.com/' && browser.newTabPageUrl() === 'https://chatgpt.com/') ok('startup and new tabs can both switch to ChatGPT');
    else fail(`homepage ${browser.homepage()} new tab ${browser.newTabPageUrl()}`);

    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'righttab-smoke-chrome-'));
    const fixture = createFixtureProfile(fixtureRoot);
    const imported = await browser.importFixture(fixture.profile, fixture.keyMaterial, {
      bookmarks: true,
      history: true,
      passwords: true,
      preferences: true,
      tabs: true,
      loadExtensions: false,
    });
    if (imported.summary.bookmarks.imported >= 1) ok(`imported ${imported.summary.bookmarks.imported} bookmarks`);
    else fail(`bookmark import ${JSON.stringify(imported.summary.bookmarks)}`);
    if (imported.summary.history.imported >= 1) ok('imported history');
    else fail(`history import ${JSON.stringify(imported.summary.history)}`);
    if (imported.summary.passwords.imported === 1 && !imported.summary.passwords.error) ok('imported a password through the Chrome v10 method');
    else fail(`password import ${JSON.stringify(imported.summary.passwords)}`);
    if (imported.summary.preferences.applied.some((label) => /Restore previous session/.test(label))) ok('mapped a Chrome preference');
    else fail(`preferences ${JSON.stringify(imported.summary.preferences.applied)}`);
    if (browser.homepage() === 'https://chatgpt.com/') ok('import left the ChatGPT startup choice alone');
    else fail('import changed the startup page');
    const listed = browser.vault.list();
    const saved = listed.find((entry) => entry.username === 'ada');
    if (saved && !JSON.stringify(listed).includes(fixture.password)) ok('vault list does not contain the plaintext password');
    else fail('vault list leaked or missed the login');
    if (saved && await browser.vault.reveal(saved.id) === fixture.password) ok('vault decrypts the imported password');
    else fail('vault could not decrypt the imported password');

    win.win.show();
    win.win.focus();
    await new Promise((resolve) => setTimeout(resolve, 700));
    fs.writeFileSync(path.join(outDir, 'ui.png'), (await win.ui.webContents.capturePage()).toPNG());
    const page = browser.activeContents(win);
    if (page) fs.writeFileSync(path.join(outDir, 'page.png'), (await page.capturePage()).toPNG());
    try {
      const { execFile } = require('child_process');
      const mediaId = typeof win.win.getMediaSourceId === 'function' ? win.win.getMediaSourceId() : '';
      const windowId = String(mediaId).split(':')[1];
      if (windowId) {
        await new Promise((resolve) => {
          execFile('/usr/sbin/screencapture', ['-l', windowId, path.join(outDir, 'window.png')], () => resolve());
        });
      }
    } catch { /* full-window capture is optional */ }
    ok('screenshots written');
  } catch (error) {
    fail(error && error.stack ? error.stack : String(error));
  }
  const failed = notes.some((line) => line.startsWith('FAIL'));
  fs.writeFileSync(path.join(outDir, 'smoke.txt'), notes.join('\n'));
  console.log(notes.join('\n'));
  app.exit(failed ? 1 : 0);
}

module.exports = { runSmoke };
