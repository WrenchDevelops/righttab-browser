const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function bookmark(id, title, url) {
  return { id, type: 'url', title, url, addedAt: Date.now() };
}

function folder(id, title) {
  return { id, type: 'folder', title, children: [], addedAt: Date.now() };
}

function runShot(browser) {
  const outDir = path.join(process.cwd(), 'test-results');
  fs.mkdirSync(outDir, { recursive: true });
  return browser.ready.then(() => browser.whenWindow()).then(async (win) => {
    browser.store.setBookmarks({
      bar: [
        bookmark('psu', 'PSU EEC Major', 'https://www.psu.edu/'),
        folder('bank', 'Ephrata National Bank'),
        folder('recipes', 'Recipes'),
        bookmark('verizon', 'Verizon CC', 'https://www.verizon.com/'),
        bookmark('sync', 'Synchrony Account Center', 'https://www.synchrony.com/'),
        bookmark('apps', 'Search Web apps', 'https://www.google.com/search?q=web+apps'),
        bookmark('deal', 'Superstars Deal', 'https://example.com/deal'),
      ],
      other: [],
    }, { immediate: true });
    browser.createTab(win, { url: 'https://www.google.com/', background: true });
    browser.navigate(win, null, 'https://chatgpt.com/');
    win.win.setContentSize(1440, 900);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const [width, height] = win.win.getContentSize();
    const ui = await win.ui.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, 'chrome-ui.png'), ui.toPNG());
    const toolbar = await win.ui.webContents.capturePage({ x: 0, y: 0, width, height: 220 });
    fs.writeFileSync(path.join(outDir, 'chrome-toolbar.png'), toolbar.toPNG());
    const side = await win.ui.webContents.capturePage({
      x: 0,
      y: 0,
      width: Math.min(140, width),
      height: Math.max(200, height - 80),
    });
    fs.writeFileSync(path.join(outDir, 'chrome-sidebar.png'), side.toPNG());
    browser.updateSettings({ sidebarCollapsed: false, sidebarWidth: 248 });
    browser.navigate(win, null, 'https://chatgpt.com/');
    await new Promise((resolve) => setTimeout(resolve, 700));
    const expanded = await win.ui.webContents.capturePage({
      x: 0,
      y: 0,
      width: Math.min(280, width),
      height: Math.max(200, height - 80),
    });
    fs.writeFileSync(path.join(outDir, 'chrome-sidebar-expanded.png'), expanded.toPNG());
    console.log(`shots ${width}x${height} -> ${outDir}`);
    app.exit(0);
  });
}

module.exports = { runShot };
