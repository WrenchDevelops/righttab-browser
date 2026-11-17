const Themes = require('../shared/themes.js');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const {
  app,
  BaseWindow,
  WebContentsView,
  session,
  ipcMain,
  nativeTheme,
  shell,
  dialog,
  clipboard,
  Menu,
  MenuItem,
  safeStorage,
} = require('electron');
const { openStore } = require('./store.cjs');
const { openVault } = require('./vault.cjs');
const { installMenu } = require('./menu.cjs');
const { errorPageUrl, explainLoadError } = require('./error-page.cjs');
const { runChromeImport } = require('./importer.cjs');
const { createExtensionHost } = require('./extensions-host.cjs');
const { createCreatorScout, youtubeContext, platformContext } = require('./creator-scout.cjs');
const { createAutomationController } = require('./automation-controller.cjs');
const { startMediaDiagnostics, protectedMediaAllowed } = require('./media-diagnostics.cjs');
const { creatorScoutCsv } = require('../shared/creator-scout-csv.cjs');
const { homepageUrl, newTabUrl, isNewTabUrl, isRestorableTabUrl, classifyInput, isWebUrl, hostOf, ENGINE_NAMES } = require('../shared/url.cjs');
const Homepage = require('../shared/homepage.cjs');
const { createHomepageService } = require('./homepage.cjs');
const { pageContextMenu, searchUrl } = require('../shared/page-context-menu.cjs');
const { SIDEBAR_COLLAPSED, applySettingsPatch } = require('../shared/settings.cjs');
const {
  emptyBookmarks,
  walk,
  isBookmarked,
  addBookmark,
  removeBookmark,
  updateBookmark,
  findBookmark,
} = require('../shared/bookmarks.cjs');
const { emptyHistory, mergeHistory, searchHistory, suggestHistory } = require('../shared/history.cjs');
const { placeTab, placeInGroup } = require('../shared/tab-order.cjs');
const { startupPlan } = require('../shared/startup.cjs');
const { parseChromePasswordCsv } = require('../shared/csv-passwords.cjs');
const {
  chromeUserDataDir,
  listWindowsProfiles,
  resolveWindowsProfile,
  listProfiles,
  inspectProfile,
  resolveProfileDir,
  toPublicPreview,
  assertOutside,
} = require('../shared/chrome-profile.cjs');

const GROUP_COLORS = ['blue', 'red', 'yellow', 'green', 'purple', 'cyan', 'orange', 'pink'];
const SPACE_COLORS = ['blue', 'purple', 'green', 'orange', 'pink', 'cyan'];
const PROMPTED_PERMISSIONS = new Set([
  'media',
  'geolocation',
  'notifications',
  'display-capture',
  'clipboard-read',
]);

function startBrowser({ mediaRuntime = {} } = {}) {
  const store = openStore(app.getPath('userData'));
  const homepageService = createHomepageService(app.getPath('userData'));
  const vault = openVault(path.join(app.getPath('userData'), 'vault.json'), safeStorage);
  const creatorScout = createCreatorScout({ dir: app.getPath('userData'), safeStorage, ...(process.env.RIGHTTAB_SCOUT_TEST === '1' ? { youtubeProvider: null } : {}) });
  const mainSession = session.fromPartition('persist:righttab');
  const windows = new Map();
  let extensionCompat = null;
  let extensionDebugger = null;
  const uiIndex = new Map();
  const floatIndex = new Map();
  const scoutIndex = new Map();
  const assistantIndex = new Map();
  const downloads = [];
  const downloadItems = new Map();
  const forcedSavePaths = [];
  const hardened = new WeakSet();
  let focusedId = null;
  let firstWindow;
  const whenWindow = new Promise((resolve) => { firstWindow = resolve; });
  let announced = false;
  let sessionTimer = null;
  let launchRecovery = '';
  let quitting = false;
  let mediaCapture = null;
  let mediaCaptureStarting = false;

  if (process.env.RIGHTTAB_SMOKE === '1' || process.env.RIGHTTAB_SHOT === '1' || process.env.RIGHTTAB_SCOUT_TEST === '1' || process.env.RIGHTTAB_YOUTUBEJS_TEST === '1' || process.env.RIGHTTAB_CONTACT_LIVE_TEST === '1') {
    store.commit({
      completedSetup: true,
      importOffered: true,
      ...(process.env.RIGHTTAB_SHOT === '1' ? { sidebarCollapsed: true, showBookmarkBar: true } : {}),
    }, { immediate: true });
  }
  nativeTheme.themeSource = 'system';

  function homepage() {
    return homepageUrl(store.settings.startupPage);
  }

  function newTabTarget() {
    return newTabUrl(store.settings);
  }

  function presentedUrl(url) {
    return isNewTabUrl(url) ? '' : url;
  }

  function focused() {
    return windows.get(focusedId) || windows.values().next().value || null;
  }

  function themeColor() {
    return Themes.resolve(store.settings, nativeTheme.shouldUseDarkColors).colors.toolbar;
  }

  function pagePreferences(ses) {
    return {
      session: ses,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      webviewTag: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      safeDialogs: true,
      spellcheck: true,
      preload: path.join(__dirname, 'password-preload.cjs'),
    };
  }

  function safeDownloadDir() {
    const chosen = store.settings.downloadDirectory || app.getPath('downloads');
    try {
      assertOutside(chosen, chromeUserDataDir());
      fs.mkdirSync(chosen, { recursive: true });
      return chosen;
    } catch {
      const fallback = app.getPath('downloads');
      fs.mkdirSync(fallback, { recursive: true });
      return fallback;
    }
  }

  function uniqueSavePath(dir, filename) {
    const parsed = path.parse(path.basename(String(filename || 'download')).replace(/[\\/\0]/g, '') || 'download');
    let candidate = path.join(dir, parsed.base || 'download');
    let index = 1;
    while (fs.existsSync(candidate)) {
      candidate = path.join(dir, `${parsed.name} (${index})${parsed.ext}`);
      index += 1;
    }
    return candidate;
  }

  function takeForcedSave(item) {
    const urls = new Set();
    try {
      for (const entry of item.getURLChain()) urls.add(entry);
    } catch { /* redirect chain is unavailable */ }
    try { urls.add(item.getURL()); } catch { /* item is already gone */ }
    let index = forcedSavePaths.findIndex((entry) => urls.has(entry.url));
    if (index === -1 && forcedSavePaths.length === 1 && Date.now() - forcedSavePaths[0].at < 15000) index = 0;
    if (index === -1) return '';
    return forcedSavePaths.splice(index, 1)[0].savePath;
  }

  function wireSession(ses) {
    homepageService.install(ses);
    ses.setPermissionRequestHandler((wc, permission, callback, details) => {
      if (permission === 'clipboard-sanitized-write' || permission === 'fullscreen') {
        callback(true);
        return;
      }
      const host = hostOf(details.requestingUrl || details.securityOrigin || '');
      const saved = savedSitePermission(host, permission);
      if (permission === 'mediaKeySystem') {
        callback(protectedMediaAllowed(details.requestingUrl || details.securityOrigin || '', saved));
        return;
      }
      if (saved === 'allow') {
        callback(true);
        return;
      }
      if (saved === 'deny' || !PROMPTED_PERMISSIONS.has(permission)) {
        callback(false);
        return;
      }
      const win = windowForContents(wc) || focused();
      if (!win) {
        callback(false);
        return;
      }
      queuePrompt(win, {
        kind: 'permission',
        permission,
        host,
        requestingUrl: details.requestingUrl || '',
        callback,
      });
    });
    ses.webRequest.onBeforeSendHeaders((details, callback) => {
      const headers = details.requestHeaders;
      if (store.settings.doNotTrack) headers.DNT = '1';
      callback({ requestHeaders: headers });
    });
    ses.on('will-download', (_event, item) => {
      const id = crypto.randomUUID();
      const forced = takeForcedSave(item);
      if (forced) item.setSavePath(forced);
      else if (!store.settings.askWhereToSave) {
        item.setSavePath(uniqueSavePath(safeDownloadDir(), item.getFilename()));
      }
      const record = {
        id,
        filename: path.basename(item.getFilename() || 'download'),
        url: item.getURL(),
        received: 0,
        total: item.getTotalBytes(),
        state: 'progressing',
        savePath: item.getSavePath(),
        startedAt: Date.now(),
      };
      downloads.unshift(record);
      if (downloads.length > 100) downloads.pop();
      downloadItems.set(id, item);
      item.on('updated', () => {
        record.received = item.getReceivedBytes();
        record.total = item.getTotalBytes();
        record.savePath = item.getSavePath();
        record.filename = path.basename(record.savePath || record.filename);
        pushAll();
      });
      item.on('done', (_doneEvent, state) => {
        record.state = state;
        record.savePath = item.getSavePath();
        downloadItems.delete(id);
        pushAll();
      });
      pushAll();
    });
  }

  function windowForContents(contents) {
    for (const win of windows.values()) {
      if (win.ui?.webContents === contents) return win;
      for (const tab of win.tabs.values()) {
        if (tab.view.webContents === contents) return win;
      }
    }
    return null;
  }

  function permissionPrompt(prompt) {
    const labels = {
      geolocation: 'your location',
      media: 'your camera and microphone',
      notifications: 'notifications',
      'display-capture': 'your screen',
      'clipboard-read': 'the clipboard',
      midiSysex: 'MIDI devices',
      'idle-detection': 'when you’re idle',
      pointerLock: 'the pointer',
      'persistent-storage': 'extra storage',
      mediaKeySystem: 'protected content',
    };
    const site = prompt.host || 'This site';
    const thing = labels[prompt.permission] || prompt.permission;
    return `${site} wants ${thing}`;
  }

  function permissionKey(host, permission) {
    return `${host}|${permission}`;
  }

  function savedSitePermission(host, permission) {
    if (!host || !permission) return '';
    const value = store.settings.sitePermissions?.[permissionKey(host, permission)];
    return value === 'allow' || value === 'deny' ? value : '';
  }

  function rememberSitePermission(host, permission, allow) {
    if (!host || !permission) return;
    const sitePermissions = { ...(store.settings.sitePermissions || {}) };
    sitePermissions[permissionKey(host, permission)] = allow ? 'allow' : 'deny';
    store.commit({ sitePermissions });
  }

  function queuePrompt(win, prompt) {
    if (win.permission && !win.permission.settled) {
      if (prompt.callback) prompt.callback(false);
      return;
    }
    const id = crypto.randomUUID();
    win.permission = {
      id,
      settled: false,
      ...prompt,
      message: prompt.kind === 'protocol' ? `Open ${prompt.url}?` : permissionPrompt(prompt),
    };
    pushState(win);
    setTimeout(() => replyPermission(win, id, false), 20000);
  }

  function replyPermission(win, id, allow) {
    const pending = win.permission;
    if (!pending || pending.id !== id || pending.settled) return { ok: false };
    pending.settled = true;
    win.permission = null;
    if (pending.kind === 'protocol') {
      if (allow) shell.openExternal(pending.url).catch(() => {});
    } else if (pending.callback) {
      rememberSitePermission(pending.host, pending.permission, allow);
      pending.callback(!!allow);
    }
    pushState(win);
    return { ok: true };
  }

  function promptExternal(win, url) {
    let protocol = '';
    try { protocol = new URL(url).protocol; } catch { return; }
    if (!['mailto:', 'tel:', 'sms:', 'macappstore:', 'itms-apps:'].includes(protocol)) {
      queuePrompt(win, { kind: 'protocol', url, permission: protocol, host: '' });
      return;
    }
    shell.openExternal(url).catch(() => {});
  }

  function handleWillNavigate(event, url, contents, win) {
    const tab = tabForContents(win, contents);
    if (url.startsWith('data:')) {
      if (!tab?.allowData) event.preventDefault();
      if (tab) tab.allowData = false;
      return;
    }
    if (isWebUrl(url) || url === 'about:blank') return;
    event.preventDefault();
    if (url.includes(':')) promptExternal(win, url);
  }

  function handleOpen(details, contents, win) {
    const url = details.url || '';
    if (details.disposition === 'save-to-disk') {
      if (isWebUrl(url)) contents.downloadURL(url);
      return { action: 'deny' };
    }
    if (url && !isWebUrl(url) && url !== 'about:blank') {
      let external = false;
      try { external = !['http:', 'https:', 'about:', 'data:'].includes(new URL(url).protocol); } catch { external = false; }
      if (external) {
        promptExternal(win, url);
        return { action: 'deny' };
      }
      if (!url.startsWith('data:')) return { action: 'deny' };
    }
    const asTab = details.disposition === 'foreground-tab' || details.disposition === 'background-tab';
    if (asTab && isWebUrl(url)) {
      createTab(win, { url, background: details.disposition === 'background-tab' });
      return { action: 'deny' };
    }
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: 520,
        height: 760,
        autoHideMenuBar: true,
        title: 'RightTab',
        webPreferences: pagePreferences(contents.session),
      },
    };
  }

  function harden(contents, win) {
    if (hardened.has(contents)) return;
    hardened.add(contents);
    contents.setWindowOpenHandler((details) => handleOpen(details, contents, win));
    contents.on('will-navigate', (event, url) => handleWillNavigate(event, url, contents, win));
    contents.on('will-attach-webview', (event) => event.preventDefault());
    contents.on('did-create-window', (child) => {
      harden(child.webContents, win);
      child.webContents.on('context-menu', (_event, params) => {
        showPageContextMenu(win, tabForContents(win, child.webContents), child.webContents, params);
      });
    });
  }

  function pageUrlOf(contents) {
    try {
      const current = contents?.getURL?.() || '';
      return isWebUrl(current) ? current : '';
    } catch {
      return '';
    }
  }

  function tabForContents(win, contents) {
    for (const tab of win.tabs.values()) {
      if (tab.view.webContents === contents) return tab;
    }
    return null;
  }

  function activeTab(win) {
    return win?.tabs.get(win.activeTabId) || null;
  }

  function targetTab(win) {
    if (win?.focusedPane === 'secondary' && win.secondaryTabId && win.tabs.has(win.secondaryTabId)) {
      return win.tabs.get(win.secondaryTabId);
    }
    return activeTab(win);
  }

  function activeContents(win) {
    const tab = targetTab(win);
    const contents = tab?.view?.webContents;
    if (!contents || contents.isDestroyed()) return null;
    return contents;
  }

  // Electron's extension adapter has its own active-tab registry. RightTab
  // can display two tabs at once, so the tab with page focus (rather than
  // always the primary sidebar selection) is the only safe active tab to
  // expose to an extension.
  function syncExtensionActiveTab(win) {
    const tab = targetTab(win);
    if (extensionCompat && !win?.private && tab && !tab.view.webContents.isDestroyed()) {
      extensionCompat.selectTab(tab.view.webContents);
    }
  }

  function displayUrl(tab) {
    if (!tab) return '';
    let current = '';
    try { current = tab.view.webContents.getURL(); } catch { current = ''; }
    if (!current || current === 'about:blank' || current.startsWith('data:')) return tab.requestedUrl || '';
    return current;
  }

  function canGoBack(contents) {
    try {
      if (contents.navigationHistory?.canGoBack) return contents.navigationHistory.canGoBack();
      if (typeof contents.canGoBack === 'function') return contents.canGoBack();
    } catch { /* page is closing */ }
    return false;
  }

  function canGoForward(contents) {
    try {
      if (contents.navigationHistory?.canGoForward) return contents.navigationHistory.canGoForward();
      if (typeof contents.canGoForward === 'function') return contents.canGoForward();
    } catch { /* page is closing */ }
    return false;
  }

  function goBack(contents) {
    if (contents.navigationHistory?.goBack) contents.navigationHistory.goBack();
    else contents.goBack();
  }

  function goForward(contents) {
    if (contents.navigationHistory?.goForward) contents.navigationHistory.goForward();
    else contents.goForward();
  }

  function safeFavicon(url, pageUrl) {
    if (!url) return '';
    const value = String(url).trim();
    if (value.startsWith('data:image/')) return value.length > 200000 ? '' : value;
    try {
      const parsed = new URL(value, pageUrl || undefined);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return parsed.href;
    } catch { /* ignore bad favicon */ }
    return '';
  }

  function itemsFrom(win) {
    return win.tabOrder.map((id) => {
      const tab = win.tabs.get(id);
      return { id, pinned: !!tab.pinned, groupId: tab.groupId || null, spaceId: tab.spaceId || win.activeSpaceId };
    });
  }

  function applyItems(win, items) {
    win.tabOrder = items.map((item) => item.id);
    for (const item of items) {
      const tab = win.tabs.get(item.id);
      if (!tab) continue;
      tab.pinned = !!item.pinned;
      tab.groupId = item.groupId || null;
      tab.spaceId = item.spaceId || win.activeSpaceId;
    }
  }

  function sidebarWidth() {
    return store.settings.sidebarCollapsed ? SIDEBAR_COLLAPSED : store.settings.sidebarWidth;
  }

  function extensionPanelWidth(win, contentWidth) {
    if (win.overlayOpen || !win.sidePanelView || win.sidePanelView.webContents.isDestroyed()) return 0;
    if (contentWidth < 520) return Math.max(200, contentWidth - 180);
    return win.sidePanelInstallId === 'creator-scout' ? Math.min(620, Math.max(320, win.creatorScoutWidth || 444)) : 360;
  }

  function placeExtensionViews(win, box) {
    const panel = win.sidePanelView;
    if (panel && !panel.webContents.isDestroyed() && !win.overlayOpen && box.panelWidth > 0) {
      panel.setBounds({ x: box.side + box.pagesWidth, y: box.top, width: box.panelWidth, height: box.contentHeight });
      win.win.contentView.addChildView(panel);
    } else if (panel && !win.win.isDestroyed()) {
      try { win.win.contentView.removeChildView(panel); } catch { /* hidden while a dialog is open */ }
    }
    const popup = win.extensionPopup;
    const anchor = win.extensionPopupAnchor;
    if (popup && anchor && !popup.webContents.isDestroyed() && !win.overlayOpen) {
      const x = Math.max(8, Math.min(anchor.x, Math.max(8, box.width - anchor.width - 8)));
      const y = Math.max(8, Math.min(anchor.y, Math.max(8, box.height - anchor.height - 8)));
      popup.setBounds({ x, y, width: anchor.width, height: anchor.height });
      win.win.contentView.addChildView(popup);
    } else if (popup && !win.win.isDestroyed()) {
      try { win.win.contentView.removeChildView(popup); } catch { /* hidden while a dialog is open */ }
    }
  }

  function openExtensionLink(url) {
    if (!isWebUrl(url)) return;
    const target = [...windows.values()].find((item) => item && !item.private && !item.closed && !item.win.isDestroyed());
    if (!target) return;
    createTab(target, { url });
    try { target.win.show(); target.win.focus(); } catch { /* window is closing */ }
  }

  function layout(win) {
    if (!win || win.closed || win.win.isDestroyed()) return;
    const [width, height] = win.win.getContentSize();
    const fullscreenTab = win.htmlFullscreenTabId && win.tabs.get(win.htmlFullscreenTabId);
    if (fullscreenTab?.attached && !fullscreenTab.view.webContents.isDestroyed()) {
      win.ui.setVisible(false);
      for (const tab of win.tabs.values()) {
        if (!tab.attached) continue;
        tab.view.setBounds({ x: 0, y: 0, width, height });
        if (tab.id !== fullscreenTab.id) tab.view.setVisible(false);
      }
      fullscreenTab.view.setVisible(true);
      try { win.win.contentView.addChildView(fullscreenTab.view); } catch { /* already attached */ }
      return;
    }
    win.ui.setVisible(true);
    for (const tab of win.tabs.values()) if (tab.attached && !tab.view.webContents.isDestroyed()) tab.view.setVisible(true);
    win.ui.setBounds({ x: 0, y: 0, width, height });
    const side = win.measuredSidebar || sidebarWidth();
    const top = win.insets.top;
    const contentWidth = Math.max(0, width - side);
    const contentHeight = Math.max(0, height - top - win.insets.bottom);
    const panelWidth = extensionPanelWidth(win, contentWidth);
    const pagesWidth = Math.max(0, contentWidth - panelWidth);
    const secondary = win.secondaryTabId && win.tabs.get(win.secondaryTabId);
    const ratio = Math.min(0.78, Math.max(0.22, win.splitRatio || 0.5));
    const gap = secondary ? 8 : 0;
    const primaryWidth = secondary ? Math.max(120, Math.min(pagesWidth - gap - 120, Math.round(pagesWidth * ratio) - 4)) : pagesWidth;
    for (const [id, tab] of win.tabs) {
      if (!tab.attached) continue;
      const onRight = secondary && id === win.secondaryTabId;
      tab.view.setBounds(onRight ? {
        x: side + primaryWidth + gap,
        y: top,
        width: Math.max(120, pagesWidth - primaryWidth - gap),
        height: contentHeight,
      } : {
        x: side,
        y: top,
        width: primaryWidth,
        height: contentHeight,
      });
    }
    for (const tab of win.tabs.values()) {
      if (tab.attached && !tab.view.webContents.isDestroyed()) win.win.contentView.addChildView(tab.view);
    }
    placeExtensionViews(win, { pagesWidth, top, panelWidth, contentHeight, width, height, side });
    if (win.float && !win.float.webContents.isDestroyed() && win.float.getVisible()) {
      win.win.contentView.addChildView(win.float);
    }
  }

  function pageAtPoint(win, x, y) {
    let found = null;
    for (const tab of win.tabs.values()) {
      if (!tab.attached || tab.view.webContents.isDestroyed()) continue;
      const bounds = tab.view.getBounds();
      if (x >= bounds.x && y >= bounds.y && x < bounds.x + bounds.width && y < bounds.y + bounds.height) found = tab;
    }
    return found;
  }

  function pointIsOverPage(win, x, y) {
    if (win.overlayOpen) return false;
    const [width, height] = win.win.getContentSize();
    const top = win.insets.top || 0;
    const bottom = win.insets.bottom || 0;
    const side = win.measuredSidebar || sidebarWidth();
    if (y < top || y >= height - bottom || x < side || x >= width) return false;
    if (win.secondaryTabId) {
      const handleX = side + Math.round((width - side) * (win.splitRatio || 0.5));
      if (Math.abs(x - handleX) <= 8) return false;
    }
    return true;
  }

  function setChromeCursor(win, type) {
    const next = type && type !== 'null' ? type : 'default';
    if (win.uiCursor === next || win.ui.webContents.isDestroyed()) return;
    win.uiCursor = next;
    win.ui.webContents.send('ui:cursor', next);
  }

  function forwardMouseToPage(win, mouse) {
    const tab = pageAtPoint(win, mouse.x, mouse.y);
    if (!tab) return;
    const bounds = tab.view.getBounds();
    const contents = tab.view.webContents;
    const input = {
      type: mouse.type,
      x: Math.round(mouse.x - bounds.x),
      y: Math.round(mouse.y - bounds.y),
      button: mouse.button || 'left',
      clickCount: mouse.clickCount || 0,
    };
    if (Number.isFinite(mouse.movementX)) input.movementX = mouse.movementX;
    if (Number.isFinite(mouse.movementY)) input.movementY = mouse.movementY;
    if (mouse.type === 'mouseWheel') {
      input.deltaX = Number(mouse.deltaX) || 0;
      input.deltaY = Number(mouse.deltaY) || 0;
      input.canScroll = true;
      if (Number.isFinite(mouse.wheelTicksX)) input.wheelTicksX = mouse.wheelTicksX;
      if (Number.isFinite(mouse.wheelTicksY)) input.wheelTicksY = mouse.wheelTicksY;
      if (typeof mouse.hasPreciseScrollingDeltas === 'boolean') input.hasPreciseScrollingDeltas = mouse.hasPreciseScrollingDeltas;
      if (Number.isFinite(mouse.accelerationRatioX)) input.accelerationRatioX = mouse.accelerationRatioX;
      if (Number.isFinite(mouse.accelerationRatioY)) input.accelerationRatioY = mouse.accelerationRatioY;
    }
    // The chrome view sits above native page views in some macOS compositor
    // configurations, so pointer input arriving there must be replayed to the
    // page. Do not try to de-duplicate this against page input by timestamp:
    // Chromium reports the injected mouseDown back before the corresponding
    // mouseUp is forwarded, which used to drop mouseUp and leave controls
    // pressed rather than clicked.
    try { contents.sendInputEvent(input); } catch { /* page is closing */ }
    if (mouse.type === 'mouseDown' && !contents.isDestroyed()) contents.focus();
  }

  function schedulePageMouse(win, mouse) {
    const deliver = (input) => forwardMouseToPage(win, input);
    if (mouse.type === 'mouseMove') {
      win.pendingMove = mouse;
      if (win.moveTimer) return;
      win.moveTimer = setImmediate(() => {
        win.moveTimer = null;
        const pending = win.pendingMove;
        win.pendingMove = null;
        if (pending) deliver(pending);
      });
      return;
    }
    setImmediate(() => deliver(mouse));
  }

  function attachActive(win) {
    const activeId = win.activeTabId;
    for (const [id, tab] of win.tabs) {
      const show = tab.spaceId === win.activeSpaceId && (id === activeId || id === win.secondaryTabId) && !win.overlayOpen;
      if (show && !tab.attached) {
        win.win.contentView.addChildView(tab.view);
        tab.attached = true;
      } else if (!show && tab.attached) {
        win.win.contentView.removeChildView(tab.view);
        tab.attached = false;
      }
    }
    layout(win);
  }

  async function captureOverlayPages(win) {
    const visibleIds = [win.activeTabId, win.secondaryTabId].filter(Boolean);
    const pages = [];
    for (const id of visibleIds) {
      const tab = win.tabs.get(id);
      if (!tab || tab.view.webContents.isDestroyed()) continue;
      try {
        const image = await tab.view.webContents.capturePage();
        if (image.isEmpty()) continue;
        const bounds = tab.view.getBounds();
        pages.push({ ...bounds, image: image.toDataURL() });
      } catch { /* a page can disappear while its dialog is opening */ }
    }
    return pages;
  }

  function snapshot(win) {
    const active = targetTab(win);
    const url = displayUrl(active);
    const secondary = win.secondaryTabId && win.tabs.get(win.secondaryTabId);
    const contents = active && !active.view.webContents.isDestroyed() ? active.view.webContents : null;
    return {
      windowId: win.id,
      private: win.private,
      dark: nativeTheme.shouldUseDarkColors,
      resolvedTheme: Themes.resolve(store.settings, nativeTheme.shouldUseDarkColors),
      fullscreen: (() => {
        try { return !win.win.isDestroyed() && !!win.win.isFullScreen(); } catch { return false; }
      })(),
      tabs: itemsFrom(win).map((item) => {
        const tab = win.tabs.get(item.id);
        const tabUrl = displayUrl(tab);
        return {
          id: tab.id,
          url: presentedUrl(tabUrl),
          title: tab.title || 'New Tab',
          favicon: safeFavicon(tab.favicon, tabUrl),
          loading: !!tab.loading,
          pinned: !!tab.pinned,
          groupId: tab.groupId,
          spaceId: tab.spaceId,
          audible: !!tab.audible,
          muted: !!tab.muted,
          error: tab.error?.description || '',
          secure: tabUrl.startsWith('https://'),
        };
      }),
      groups: win.groups.map((group) => ({ ...group })),
      spaces: win.spaces.map((space) => ({ ...space })),
      activeSpaceId: win.activeSpaceId,
      activeTabId: win.activeTabId,
      debuggerAttachments: (extensionDebugger?.list() || []).filter((a) => [...win.tabs.values()].some((t) => !t.view.webContents.isDestroyed() && t.view.webContents.id === a.tabId)).map((a) => ({ ...a, name: mainSession.extensions.getExtension(a.extensionId)?.name || 'Extension' })),
      canGoBack: contents ? canGoBack(contents) : false,
      canGoForward: contents ? canGoForward(contents) : false,
      loading: !!active?.loading,
      url: presentedUrl(url),
      title: active?.title || 'RightTab',
      zoom: contents ? contents.getZoomFactor() : 1,
      bookmarked: !!(url && isBookmarked(store.bookmarks, url)),
      bookmarks: store.bookmarks,
      settings: {
        startupPage: store.settings.startupPage,
        newTabPage: store.settings.newTabPage,
        searchEngine: store.settings.searchEngine,
        customSearchEngines: store.settings.customSearchEngines,
        searchSuggestions: store.settings.searchSuggestions,
        restoreSession: store.settings.restoreSession,
        theme: store.settings.theme,
        appearance: store.settings.appearance,
        showBookmarkBar: store.settings.showBookmarkBar,
        bookmarkBarMode: store.settings.bookmarkBarMode,
        sidebarWidth: store.settings.sidebarWidth,
        sidebarCollapsed: store.settings.sidebarCollapsed,
        downloadDirectory: store.settings.downloadDirectory,
        askWhereToSave: store.settings.askWhereToSave,
        doNotTrack: store.settings.doNotTrack,
        httpsOnly: store.settings.httpsOnly,
        completedSetup: store.settings.completedSetup,
        importOffered: store.settings.importOffered,
      },
      downloads: downloads.slice(0, 30).map((item) => ({
        id: item.id,
        filename: item.filename,
        url: item.url,
        received: item.received,
        total: item.total,
        state: item.state,
        startedAt: item.startedAt || 0,
      })),
      permission: win.permission ? {
        id: win.permission.id,
        kind: win.permission.kind || 'permission',
        permission: win.permission.permission,
        host: win.permission.host,
        message: win.permission.message,
      } : null,
      overlayOpen: win.overlayOpen,
      savedLoginCount: vault.forHost(hostOf(url)).length,
      setupComplete: store.settings.completedSetup,
      split: secondary ? {
        tabId: secondary.id,
        ratio: win.splitRatio || 0.5,
        focused: win.focusedPane === 'secondary' ? 'secondary' : 'primary',
      } : null,
      recovery: win.recovery || '',
      ...extensionHost.publicState(win),
      ...(win.sidePanelInstallId === 'assistant' ? { sidePanel: { installId: 'assistant', name: 'Assistant preview' } }
        : win.sidePanelInstallId === 'creator-scout' ? { sidePanel: { installId: 'creator-scout', name: 'Creator Scout' } }
        : win.sidePanelInstallId === 'chatgpt-direct' ? { sidePanel: { installId: 'chatgpt-direct', name: 'ChatGPT' } } : {}),
    };
  }

  function pushState(win) {
    if (!win || win.closed || win.pushScheduled) return;
    win.pushScheduled = true;
    setImmediate(() => {
      win.pushScheduled = false;
      if (win.closed || !win.ui || win.ui.webContents.isDestroyed()) return;
      win.ui.webContents.send('state:update', snapshot(win));
      if (win.sidePanelInstallId === 'creator-scout' && win.sidePanelView && !win.sidePanelView.webContents.isDestroyed()) {
        win.sidePanelView.webContents.send('creator-scout:theme', Themes.resolve(store.settings, nativeTheme.shouldUseDarkColors));
        const tab = activeTab(win);
        const key = tab ? `${tab.id}:${displayUrl(tab)}` : '';
        if (key !== win.creatorScoutTabKey) {
          win.creatorScoutTabKey = key;
          win.creatorScoutPermission = null;
          win.sidePanelView.webContents.send('creator-scout:context', null);
        }
      }
    });
  }

  function pushAll() {
    for (const win of windows.values()) pushState(win);
  }

  function command(win, name) {
    if (!win || win.ui.webContents.isDestroyed()) return;
    win.ui.webContents.send('ui:command', name);
  }

  function saveSessionNow(options = {}) {
    try {
      const saved = [];
      for (const win of windows.values()) {
        if (win.private || win.closed || win.win.isDestroyed()) continue;
        const secondary = win.tabs.get(win.secondaryTabId);
        saved.push({
          bounds: win.win.getBounds(),
          activeIndex: Math.max(0, win.tabOrder.indexOf(win.activeTabId)),
          groups: win.groups,
          spaces: win.spaces,
          activeSpaceId: win.activeSpaceId,
          splitRatio: win.splitRatio || 0.5,
          secondaryIndex: secondary ? win.tabOrder.indexOf(secondary.id) : -1,
          secondaryUrl: secondary ? displayUrl(secondary) : '',
          closedStack: win.closedStack.slice(0, 25),
          tabs: win.tabOrder.map((id) => {
            const tab = win.tabs.get(id);
            return { url: displayUrl(tab), title: tab.title, pinned: !!tab.pinned, groupId: tab.groupId, spaceId: tab.spaceId };
          }).filter((tab) => isRestorableTabUrl(tab.url)),
        });
      }
      const previous = store.session || {};
      store.setSession({
        version: 1,
        cleanExit: options.clean === true || quitting,
        savedAt: Date.now(),
        windows: saved.length ? saved : (previous.windows || []),
      });
    } catch (error) {
      console.error('[righttab] session save failed:', error && error.message ? error.message : error);
    }
  }

  function persistLogins() {
    mainSession.cookies.flushStore().catch(() => {});
    try { mainSession.flushStorageData(); } catch { /* older session builds */ }
  }

  function saveSessionSoon() {
    clearTimeout(sessionTimer);
    sessionTimer = setTimeout(saveSessionNow, 250);
  }

  function rememberHistory(win, url, title) {
    if (win.private || !isWebUrl(url)) return;
    const existing = store.history.entries.find((entry) => entry.url === url);
    const merged = mergeHistory(store.history, [{
      url,
      title: title || existing?.title || url,
      visitedAt: Date.now(),
      visits: (existing?.visits || 0) + 1,
    }]);
    store.setHistory({ entries: merged.entries });
  }

  function showError(tab, description, url) {
    tab.error = { description, url };
    tab.loading = false;
    tab.allowData = true;
    const dark = nativeTheme.shouldUseDarkColors;
    tab.view.webContents.loadURL(errorPageUrl({ description, url, dark })).catch(() => {});
  }

  function openUrlInWindow(url, privateMode) {
    if (!isWebUrl(url)) return;
    createWindow({ privateMode: !!privateMode, restore: { tabs: [{ url }], activeIndex: 0 } });
  }

  async function saveUrlAs(win, contents, url, filename) {
    if (!win || !contents || contents.isDestroyed() || !isWebUrl(url)) return;
    const result = await dialog.showSaveDialog(win.win, {
      title: 'Save As',
      defaultPath: path.join(safeDownloadDir(), filename || 'download'),
    });
    if (result.canceled || !result.filePath || contents.isDestroyed()) return;
    forcedSavePaths.push({ url, savePath: result.filePath, at: Date.now() });
    contents.downloadURL(url);
  }

  async function savePageAs(win, contents, title) {
    if (!win || !contents || contents.isDestroyed()) return;
    const safe = String(title || 'page').replace(/[\\/\0:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'page';
    const result = await dialog.showSaveDialog(win.win, {
      title: 'Save Page',
      defaultPath: path.join(safeDownloadDir(), `${safe}.html`),
      filters: [{ name: 'Web Page, Complete', extensions: ['html'] }],
    });
    if (result.canceled || !result.filePath || contents.isDestroyed()) return;
    try {
      await contents.savePage(result.filePath, 'HTMLComplete');
    } catch (error) {
      dialog.showErrorBox('Could not save page', error.message || 'The page could not be saved.');
    }
  }

  function mediaAction(contents, x, y, command) {
    if (!contents || contents.isDestroyed()) return;
    if (!['toggle', 'mute', 'loop', 'controls', 'pip'].includes(command)) return;
    const px = Math.round(Number(x) || 0);
    const py = Math.round(Number(y) || 0);
    const script = `(() => {
      const pointX = ${px};
      const pointY = ${py};
      const nodes = document.elementsFromPoint ? document.elementsFromPoint(pointX, pointY) : [document.elementFromPoint(pointX, pointY)];
      let media = null;
      for (const node of nodes) {
        if (!node || !node.closest) continue;
        if (node.tagName === 'VIDEO' || node.tagName === 'AUDIO') { media = node; break; }
        media = node.closest('video,audio');
        if (media) break;
        const root = node.shadowRoot;
        if (root && root.elementFromPoint) {
          const inner = root.elementFromPoint(pointX, pointY);
          if (inner && inner.closest) media = inner.closest('video,audio');
          if (media) break;
        }
      }
      if (!media) {
        const all = document.querySelectorAll('video,audio');
        if (all.length === 1) media = all[0];
      }
      if (!media) return false;
      const action = ${JSON.stringify(command)};
      if (action === 'toggle') {
        if (media.paused) media.play();
        else media.pause();
      } else if (action === 'mute') media.muted = !media.muted;
      else if (action === 'loop') media.loop = !media.loop;
      else if (action === 'controls') media.controls = !media.controls;
      else if (action === 'pip') {
        if (document.pictureInPictureElement) document.exitPictureInPicture();
        else if (media.requestPictureInPicture) media.requestPictureInPicture();
      }
      return true;
    })()`;
    contents.executeJavaScript(script, true).catch(() => {});
  }

  function runPageContextAction(win, tab, contents, entry) {
    if (!contents || contents.isDestroyed()) return undefined;
    switch (entry.action) {
      case 'replace-misspelling':
        contents.replaceMisspelling(entry.word || '');
        return undefined;
      case 'add-dictionary':
        try { contents.session.addWordToSpellCheckerDictionary(entry.word || ''); } catch { /* dictionary unavailable */ }
        return undefined;
      case 'open-tab':
        if (entry.url) createTab(win, { url: entry.url, background: !entry.foreground });
        return undefined;
      case 'open-window':
        openUrlInWindow(entry.url, entry.private);
        return undefined;
      case 'open-split':
        openSplit(win, { url: entry.url });
        return undefined;
      case 'open-external':
        promptExternal(win, entry.url);
        return undefined;
      case 'copy-text':
        clipboard.writeText(String(entry.text || ''));
        return undefined;
      case 'save-url':
        return saveUrlAs(win, contents, entry.url, entry.filename);
      case 'copy-image':
        try { contents.copyImageAt(Number(entry.x) || 0, Number(entry.y) || 0); } catch { /* image was gone */ }
        return undefined;
      case 'media':
        mediaAction(contents, entry.x, entry.y, entry.command);
        return undefined;
      case 'copy':
        contents.copy();
        return undefined;
      case 'search':
        if (entry.query) createTab(win, { url: searchUrl(store.settings.searchEngine, entry.query, store.settings.customSearchEngines), background: !entry.foreground });
        return undefined;
      case 'ask':
        askPreview(win, { text: entry.text, title: tab?.title, url: displayUrl(tab) });
        return undefined;
      case 'lookup':
        try { contents.showDefinitionForSelection(); } catch { /* this platform has no dictionary popup */ }
        return undefined;
      case 'undo': contents.undo(); return undefined;
      case 'redo': contents.redo(); return undefined;
      case 'cut': contents.cut(); return undefined;
      case 'paste': contents.paste(); return undefined;
      case 'paste-match': contents.pasteAndMatchStyle(); return undefined;
      case 'delete': contents.delete(); return undefined;
      case 'select-all': contents.selectAll(); return undefined;
      case 'back': if (canGoBack(contents)) goBack(contents); return undefined;
      case 'forward': if (canGoForward(contents)) goForward(contents); return undefined;
      case 'reload': contents.reload(); return undefined;
      case 'save-page': return savePageAs(win, contents, tab?.title);
      case 'print':
        try { contents.print(); } catch { /* printing is unavailable */ }
        return undefined;
      case 'view-source':
        if (entry.url) createTab(win, { url: entry.url, background: false });
        return undefined;
      case 'inspect':
        try { contents.inspectElement(Math.round(Number(entry.x) || 0), Math.round(Number(entry.y) || 0)); } catch { /* devtools are unavailable */ }
        return undefined;
      default:
        return undefined;
    }
  }

  function showPageContextMenu(win, tab, contents, params) {
    if (!contents || contents.isDestroyed()) return;
    try { contents.focus(); } catch { /* page is closing */ }
    const template = pageContextMenu(params, {
      searchEngine: store.settings.searchEngine,
      customSearchEngines: store.settings.customSearchEngines,
      canGoBack: canGoBack(contents),
      canGoForward: canGoForward(contents),
      pageUrl: displayUrl(tab) || pageUrlOf(contents),
      platform: process.platform,
      privateWindow: !!win.private,
    }).map((entry) => {
      if (entry.type === 'separator') return { type: 'separator' };
      return {
        label: entry.label,
        enabled: entry.enabled !== false,
        click: () => {
          Promise.resolve(runPageContextAction(win, tab, contents, entry)).catch((error) => {
            console.error('[righttab] context menu failed:', error && error.message ? error.message : error);
          });
        },
      };
    });
    const menu = Menu.buildFromTemplate(template);
    if (extensionCompat && !win.private) {
      try {
        const extra = extensionCompat.getContextMenuItems(contents, params) || [];
        if (extra.length) {
          menu.append(new MenuItem({ type: 'separator' }));
          for (const item of extra) menu.append(item);
        }
      } catch { /* extension menus are optional */ }
    }
    menu.popup();
  }

  function wireTab(win, tab) {
    const contents = tab.view.webContents;
    harden(contents, win);
    contents.setMaxListeners(30);
    contents.on('did-start-loading', () => {
      tab.loading = true;
      pushState(win);
    });
    contents.on('did-stop-loading', () => {
      tab.loading = false;
      pushState(win);
    });
    contents.on('enter-html-full-screen', () => {
      if (tab.id !== win.activeTabId || win.secondaryTabId || win.overlayOpen) return;
      win.htmlFullscreenTabId = tab.id;
      try { if (!win.win.isFullScreen()) win.win.setFullScreen(true); } catch { /* platform declined fullscreen */ }
      layout(win); pushState(win);
    });
    contents.on('leave-html-full-screen', () => {
      if (win.htmlFullscreenTabId !== tab.id) return;
      win.htmlFullscreenTabId = null;
      try { if (win.win.isFullScreen()) win.win.setFullScreen(false); } catch { /* window may be closing */ }
      layout(win); pushState(win);
    });
    contents.on('did-navigate', (_event, url) => {
      if (isWebUrl(url)) {
        tab.requestedUrl = url;
        tab.error = null;
        const host = hostOf(url);
        const zoom = store.settings.zoomByOrigin[host];
        if (zoom) contents.setZoomFactor(zoom);
        rememberHistory(win, url, tab.title);
      }
      pushState(win);
      saveSessionSoon();
      maybeOfferSave(win, tab, url);
    });
    contents.on('did-navigate-in-page', (_event, url) => { pushState(win); maybeOfferSave(win, tab, url); });
    contents.on('page-title-updated', (_event, title) => {
      tab.title = title;
      if (tab.id === win.activeTabId && !win.win.isDestroyed()) win.win.setTitle(`${title} — RightTab`);
      if (isWebUrl(displayUrl(tab))) rememberHistory(win, displayUrl(tab), title);
      pushState(win);
    });
    contents.on('page-favicon-updated', (_event, favicons) => {
      const page = displayUrl(tab);
      tab.favicon = (favicons || []).map((item) => safeFavicon(item, page)).find(Boolean) || '';
      const icon = tab.favicon;
      if (icon && isWebUrl(page) && isBookmarked(store.bookmarks, page)) {
        store.setBookmarks(setBookmarkIcon(store.bookmarks, page, icon));
      }
      pushState(win);
    });
    contents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
      if (!isMainFrame || code === -3) return;
      showError(tab, explainLoadError(code, description), url || tab.requestedUrl);
      pushState(win);
    });
    contents.on('render-process-gone', () => {
      showError(tab, 'This page crashed.', tab.requestedUrl);
      pushState(win);
    });
    contents.on('audio-state-changed', (_event, payload) => {
      tab.audible = typeof payload === 'object' ? !!payload.audible : !!payload;
      pushState(win);
    });
    contents.on('focus', () => {
      win.focusedPane = win.secondaryTabId === tab.id ? 'secondary' : 'primary';
      syncExtensionActiveTab(win);
      closeFloat(win);
      extensionHost.closePopup(win);
      pushState(win);
    });
    contents.on('cursor-changed', (_event, type) => {
      if (win.routingPagePointer) setChromeCursor(win, type);
    });
    contents.on('context-menu', (_event, params) => {
      showPageContextMenu(win, tab, contents, params);
    });
    contents.on('found-in-page', (_event, result) => {
      if (!win.ui.webContents.isDestroyed()) {
        win.ui.webContents.send('find:result', {
          active: result.activeMatchOrdinal,
          total: result.matches,
        });
      }
    });
  }

  function destroyTab(tab) {
    if (tab.view && !tab.view.webContents.isDestroyed()) extensionDebugger?.targetClosed(tab.view.webContents.id);
    try {
      if (tab.attached && tab.view) {
        const parent = windows.get(tab.windowId);
        if (parent && !parent.win.isDestroyed()) parent.win.contentView.removeChildView(tab.view);
      }
    } catch { /* view already gone */ }
    tab.attached = false;
    if (tab.view && !tab.view.webContents.isDestroyed()) tab.view.webContents.close();
  }

  function isCredentialOrigin(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' || parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    } catch { return false; }
  }

  async function maybeOfferSave(win, tab, url) {
    const pending = tab.pendingLogin;
    if (!pending || pending.prompted || win.private || !isCredentialOrigin(url)) return;
    if (hostOf(url) !== hostOf(pending.origin) || url === pending.pageUrl) return;
    pending.prompted = true;
    if (vault.isNeverSaved(pending.origin)) return;
    const existing = vault.list().find((entry) => entry.origin === pending.origin && entry.username === pending.username);
    const response = await dialog.showMessageBox(win.win, {
      type: 'question', title: existing ? 'Update password?' : 'Save password?',
      message: existing ? `Update the saved password for ${hostOf(pending.origin)}?` : `Save password for ${hostOf(pending.origin)}?`,
      detail: pending.username ? `Username: ${pending.username}` : 'No username was detected.',
      buttons: existing ? ['Update', 'Not now'] : ['Save', 'Never for this site', 'Not now'],
      defaultId: 0, cancelId: existing ? 1 : 2, noLink: true,
    });
    if (response.response === 0) await vault.add({ ...pending, source: existing ? 'update' : 'righttab' });
    if (!existing && response.response === 1) vault.neverSave(pending.origin);
    pushAll();
  }

  function currentSpace(win) {
    return win.spaces.find((space) => space.id === win.activeSpaceId) || win.spaces[0];
  }

  function ensureActiveSpaceTab(win) {
    const selected = [...win.tabs.values()].find((tab) => tab.spaceId === win.activeSpaceId);
    if (selected) selectTab(win, selected.id);
    else createTab(win, { url: newTabTarget(), spaceId: win.activeSpaceId });
  }

  function selectSpace(win, id) {
    const next = win.spaces.find((space) => space.id === id);
    if (!next || next.id === win.activeSpaceId) return;
    win.activeSpaceId = next.id;
    win.secondaryTabId = null;
    const selected = [...win.tabs.values()].find((tab) => tab.id === next.activeTabId && tab.spaceId === next.id)
      || [...win.tabs.values()].find((tab) => tab.spaceId === next.id);
    if (selected) win.activeTabId = selected.id;
    else createTab(win, { url: newTabTarget(), spaceId: next.id });
    attachActive(win);
    pushState(win);
    saveSessionSoon();
  }

  function createTab(win, { url, title = '', pinned = false, groupId = null, spaceId = null, background = false } = {}) {
    const target = url || newTabTarget();
    const view = new WebContentsView({ webPreferences: pagePreferences(win.session) });
    const tab = {
      id: crypto.randomUUID(),
      windowId: win.id,
      view,
      requestedUrl: target,
      title: title || 'New Tab',
      favicon: '',
      loading: true,
      pinned: !!pinned,
      groupId: groupId || null,
      spaceId: spaceId || win.activeSpaceId,
      audible: false,
      muted: false,
      error: null,
      attached: false,
      allowData: false,
      pendingLogin: null,
    };
    win.tabs.set(tab.id, tab);
    win.tabOrder.push(tab.id);
    if (tab.pinned) tab.groupId = null;
    applyItems(win, [
      ...itemsFrom(win).filter((item) => item.pinned),
      ...itemsFrom(win).filter((item) => !item.pinned),
    ]);
    wireTab(win, tab);
    if (extensionCompat && !win.private) extensionCompat.addTab(view.webContents, win.win);
    view.webContents.loadURL(target).catch(() => {});
    if (!win.activeTabId || (!background && tab.spaceId === win.activeSpaceId)) selectTab(win, tab.id);
    else {
      attachActive(win);
      pushState(win);
    }
    saveSessionSoon();
    return tab;
  }

  function selectTab(win, tabId) {
    if (!win.tabs.has(tabId)) return;
    const requested = win.tabs.get(tabId);
    if (requested.spaceId !== win.activeSpaceId) selectSpace(win, requested.spaceId);
    if (tabId === win.secondaryTabId) {
      win.focusedPane = 'secondary';
      syncExtensionActiveTab(win);
      attachActive(win);
      const side = win.tabs.get(tabId);
      if (!win.overlayOpen && !side.view.webContents.isDestroyed()) side.view.webContents.focus();
      pushState(win);
      return;
    }
    win.focusedPane = 'primary';
    win.activeTabId = tabId;
    const space = currentSpace(win);
    if (space) space.activeTabId = tabId;
    syncExtensionActiveTab(win);
    attachActive(win);
    const tab = win.tabs.get(tabId);
    if (!win.win.isDestroyed()) win.win.setTitle(`${tab.title || 'New Tab'} — RightTab`);
    if (!win.overlayOpen && !tab.view.webContents.isDestroyed()) tab.view.webContents.focus();
    pushState(win);
    saveSessionSoon();
  }

  function closeTab(win, tabId) {
    const tab = win.tabs.get(tabId);
    if (!tab) return;
    const index = win.tabOrder.indexOf(tabId);
    if (extensionCompat && !win.private && extensionCompat.ctx.store.tabs.has(tab.view.webContents)) {
      tab.compatClosing = true;
      extensionCompat.removeTab(tab.view.webContents);
    }
    const url = displayUrl(tab);
    if (!win.private && isWebUrl(url)) {
      win.closedStack.unshift({ url, title: tab.title, groupId: tab.groupId });
      win.closedStack.length = Math.min(win.closedStack.length, 25);
    }
    if (tab.attached) {
      try { win.win.contentView.removeChildView(tab.view); } catch { /* already removed */ }
      tab.attached = false;
    }
    if (!tab.view.webContents.isDestroyed()) {
      extensionDebugger?.targetClosed(tab.view.webContents.id);
      tab.view.webContents.close();
    }
    win.tabs.delete(tabId);
    win.tabOrder = win.tabOrder.filter((id) => id !== tabId);
    if (win.secondaryTabId === tabId) {
      win.secondaryTabId = null;
      win.focusedPane = 'primary';
    }
    if (!win.tabOrder.length) {
      win.win.close();
      return;
    }
    if (win.activeTabId === tabId) {
      const next = win.secondaryTabId || win.tabOrder[Math.min(index, win.tabOrder.length - 1)];
      win.secondaryTabId = null;
      selectTab(win, next);
    } else {
      attachActive(win);
      pushState(win);
    }
    saveSessionSoon();
  }

  function navigate(win, tabId, input) {
    const tab = win.tabs.get(tabId) || targetTab(win);
    if (!tab) return { ok: false, error: 'No tab is open.' };
    const decision = classifyInput(input, store.settings.searchEngine, store.settings.customSearchEngines);
    if (decision.type === 'empty') return { ok: false };
    if (decision.type === 'blocked') return { ok: false, error: decision.reason };
    let url = decision.url;
    if (store.settings.httpsOnly && url.startsWith('http://') && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(url)) {
      url = `https://${url.slice(7)}`;
    }
    tab.requestedUrl = url;
    tab.error = null;
    tab.loading = true;
    pushState(win);
    tab.view.webContents.loadURL(url).catch(() => {});
    return { ok: true, url };
  }

  function reload(win, hard) {
    const tab = targetTab(win);
    if (!tab) return;
    if (tab.error && tab.requestedUrl) {
      navigate(win, tab.id, tab.requestedUrl);
      return;
    }
    if (hard) tab.view.webContents.reloadIgnoringCache();
    else tab.view.webContents.reload();
  }

  function zoom(win, direction) {
    const contents = activeContents(win);
    if (!contents) return;
    const current = contents.getZoomFactor();
    let next = current;
    if (direction === 'in') next = Math.min(3, Math.round((current + 0.1) * 10) / 10);
    if (direction === 'out') next = Math.max(0.3, Math.round((current - 0.1) * 10) / 10);
    if (direction === 'reset') next = 1;
    contents.setZoomFactor(next);
    const host = hostOf(displayUrl(targetTab(win)));
    if (host && !win.private) {
      const zoomByOrigin = { ...store.settings.zoomByOrigin };
      if (next === 1) delete zoomByOrigin[host];
      else zoomByOrigin[host] = next;
      store.commit({ zoomByOrigin });
    }
    pushState(win);
  }

  function setBookmarkIcon(tree, url, favicon) {
    let changed = false;
    const next = structuredClone(tree);
    for (const root of ['bar', 'other']) {
      walk(next[root], (node) => {
        if (node.type === 'url' && node.url === url && node.favicon !== favicon) {
          node.favicon = favicon;
          changed = true;
        }
      });
    }
    return changed ? next : tree;
  }

  function toggleBookmark(win) {
    const url = displayUrl(targetTab(win));
    if (!isWebUrl(url)) return { ok: false };
    if (isBookmarked(store.bookmarks, url)) {
      let tree = store.bookmarks;
      const ids = [];
      for (const root of ['bar', 'other']) {
        walk(tree[root], (node) => { if (node.type === 'url' && node.url === url) ids.push(node.id); });
      }
      for (const id of ids) tree = removeBookmark(tree, id);
      store.setBookmarks(tree);
    } else {
      store.setBookmarks(addBookmark(store.bookmarks, {
        id: crypto.randomUUID(),
        type: 'url',
        title: targetTab(win)?.title || url,
        url,
        favicon: safeFavicon(targetTab(win)?.favicon, url),
        addedAt: Date.now(),
      }));
    }
    pushState(win);
    return { ok: true };
  }

  function insertBookmark(parentId, node) {
    const tree = structuredClone(store.bookmarks);
    if (!parentId) {
      tree.bar.unshift(node);
      store.setBookmarks(tree);
      return;
    }
    const found = findBookmark(tree, parentId);
    if (!found || found.node.type !== 'folder') tree.bar.unshift(node);
    else found.node.children.unshift(node);
    store.setBookmarks(tree);
  }

  function createWindow({ privateMode = false, restore = null } = {}) {
    const id = crypto.randomUUID();
    const savedBounds = restore?.bounds || store.settings.lastBounds || {};
    const options = {
      width: savedBounds.width || 1280,
      height: savedBounds.height || 840,
      minWidth: 760,
      minHeight: 520,
      show: false,
      title: privateMode ? 'RightTab Private' : 'RightTab',
      backgroundColor: themeColor(),
      ...(process.platform === 'darwin' ? {
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 18, y: 16 },
        roundedCorners: true,
        acceptFirstMouse: true,
      } : {}),
    };
    if (Number.isFinite(savedBounds.x) && Number.isFinite(savedBounds.y)) {
      options.x = savedBounds.x;
      options.y = savedBounds.y;
    }
    const win = new BaseWindow(options);
    const ui = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: false,
        webSecurity: true,
      },
    });
    const pageSession = privateMode ? session.fromPartition(`private-${id}`) : mainSession;
    if (privateMode) wireSession(pageSession);
    const controller = {
      id,
      private: privateMode,
      win,
      ui,
      session: pageSession,
      tabs: new Map(),
      tabOrder: [],
      spaces: Array.isArray(restore?.spaces) && restore.spaces.length
        ? restore.spaces.map((space) => ({ id: String(space.id), name: String(space.name || 'Space').slice(0, 40), icon: String(space.icon || '◈').slice(0, 4), color: SPACE_COLORS.includes(space.color) ? space.color : 'blue', activeTabId: space.activeTabId || null }))
        : [{ id: 'default', name: 'Personal', icon: '◈', color: 'blue', activeTabId: null }],
      activeSpaceId: restore?.activeSpaceId || (restore?.spaces?.[0]?.id) || 'default',
      groups: Array.isArray(restore?.groups) ? restore.groups.map((group) => ({ ...group })) : [],
      activeTabId: null,
      closedStack: Array.isArray(restore?.closedStack) ? restore.closedStack.filter((item) => isWebUrl(item.url)).slice(0, 25) : [],
      secondaryTabId: null,
      splitRatio: Number.isFinite(restore?.splitRatio) ? restore.splitRatio : 0.5,
      focusedPane: 'primary',
      recovery: launchRecovery || '',
      insets: { top: 86, bottom: 0 },
      measuredSidebar: 0,
      overlayOpen: !privateMode && !store.settings.completedSetup,
      permission: null,
      shown: false,
      closed: false,
      pushScheduled: false,
    };
    windows.set(id, controller);
    uiIndex.set(ui.webContents.id, controller);
    win.contentView.addChildView(ui);
    const floatView = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: false,
        webSecurity: true,
      },
    });
    floatView.setBackgroundColor('#00000000');
    floatView.setVisible(false);
    controller.float = floatView;
    controller.floatReady = false;
    controller.pendingFloat = null;
    floatIndex.set(floatView.webContents.id, controller);
    floatView.webContents.on('will-navigate', (event) => event.preventDefault());
    floatView.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    floatView.webContents.on('did-finish-load', () => {
      controller.floatReady = true;
      if (controller.pendingFloat) {
        const pending = controller.pendingFloat;
        controller.pendingFloat = null;
        floatView.webContents.send('float:show', pending);
      }
    });
    floatView.webContents.loadFile(path.join(__dirname, '../src/float.html'));
    ui.webContents.on('before-mouse-event', (event, mouse) => {
      if (controller.closed || controller.win.isDestroyed()) return;
      if (!mouse || !pointIsOverPage(controller, mouse.x, mouse.y)) {
        if (controller.routingPagePointer) {
          controller.routingPagePointer = false;
          setChromeCursor(controller, 'default');
        }
        return;
      }
      const routed = new Set(['mouseDown', 'mouseUp', 'mouseMove', 'mouseWheel', 'contextMenu']);
      if (!routed.has(mouse.type)) return;
      event.preventDefault();
      controller.routingPagePointer = true;
      schedulePageMouse(controller, mouse);
    });
    ui.webContents.on('will-navigate', (event) => event.preventDefault());
    ui.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    ui.webContents.on('did-finish-load', () => {
      pushState(controller);
      setTimeout(() => { if (!controller.shown) reveal(controller); }, 1200);
    });
    win.on('focus', () => { focusedId = id; menu.rebuild(); });
    win.on('resize', () => { layout(controller); pushState(controller); });
    win.on('enter-full-screen', () => { layout(controller); pushState(controller); });
    win.on('leave-full-screen', () => {
      if (controller.htmlFullscreenTabId) controller.htmlFullscreenTabId = null;
      layout(controller); pushState(controller);
    });
    win.on('close', () => {
      try { store.commit({ lastBounds: win.getBounds() }, { immediate: true }); } catch { /* window already gone */ }
      saveSessionNow();
      persistLogins();
      if (controller.permission && !controller.permission.settled && controller.permission.callback) {
        controller.permission.settled = true;
        controller.permission.callback(false);
      }
    });
    win.on('closed', () => {
      controller.closed = true;
      extensionHost.disposeWindow(controller);
      for (const tab of controller.tabs.values()) destroyTab(tab);
      if (!ui.webContents.isDestroyed()) ui.webContents.close();
      if (controller.float && !controller.float.webContents.isDestroyed()) controller.float.webContents.close();
      uiIndex.delete(ui.webContents.id);
      if (controller.float) floatIndex.delete(controller.float.webContents.id);
      windows.delete(id);
      if (focusedId === id) focusedId = null;
    });

    const restored = (restore?.tabs || []).filter((tab) => isRestorableTabUrl(tab.url)).slice(0, 50);
    if (restored.length) {
      restored.forEach((tab, index) => {
        createTab(controller, {
          url: tab.url,
          title: tab.title,
          pinned: !!tab.pinned,
          groupId: tab.groupId,
          spaceId: tab.spaceId || controller.activeSpaceId,
          background: index !== (restore.activeIndex || 0),
        });
      });
      const side = Number.isInteger(restore.secondaryIndex)
        ? controller.tabs.get(controller.tabOrder[restore.secondaryIndex])
        : [...controller.tabs.values()].find((tab) => displayUrl(tab) === restore.secondaryUrl && tab.id !== controller.activeTabId);
      if (side && side.id !== controller.activeTabId && side.spaceId === controller.activeSpaceId) controller.secondaryTabId = side.id;
      attachActive(controller);
    } else {
      createTab(controller, { url: homepage() });
    }
    ui.webContents.loadFile(path.join(__dirname, '../src/index.html'));
    focusedId = id;
    return controller;
  }

  function reveal(win) {
    if (win.shown || win.closed) return;
    win.shown = true;
    layout(win);
    win.win.show();
    if (!announced) {
      announced = true;
      firstWindow(win);
    }
    if (win.overlayOpen) win.ui.webContents.focus();
    else activeContents(win)?.focus();
  }

  function openInitial() {
    const plan = startupPlan(store.session, store.settings.restoreSession || process.argv.includes('--restore-session'));
    const previous = store.session || { version: 1, windows: [] };
    store.setSession({ ...previous, cleanExit: false, savedAt: Date.now() });
    launchRecovery = plan.mode === 'crash'
      ? 'Tabs restored after RightTab closed unexpectedly. Closed tabs can be reopened with Shift+Command+T.'
      : '';
    if (plan.mode !== 'home') {
      for (const saved of plan.windows) {
        createWindow({ restore: saved });
        launchRecovery = '';
      }
    }
    launchRecovery = '';
    if (windows.size === 0) createWindow({});
  }

  function openSplit(win, { url, tabId } = {}) {
    if (!win || win.overlayOpen) return;
    extensionHost.closeSidePanel(win);
    let side = tabId ? win.tabs.get(tabId) : null;
    if (tabId && (!side || side.id === win.activeTabId)) return;
    if (!side) {
      side = createTab(win, { url: url || 'https://chatgpt.com/', background: true });
    }
    if (!side || side.id === win.activeTabId) return;
    win.secondaryTabId = side.id;
    win.splitRatio = win.splitRatio || 0.5;
    win.focusedPane = 'secondary';
    syncExtensionActiveTab(win);
    attachActive(win);
    if (!side.view.webContents.isDestroyed()) side.view.webContents.focus();
    pushState(win);
    saveSessionSoon();
  }

  function closeSplit(win) {
    if (!win) return;
    win.secondaryTabId = null;
    win.focusedPane = 'primary';
    syncExtensionActiveTab(win);
    attachActive(win);
    if (!win.overlayOpen) activeContents(win)?.focus();
    pushState(win);
    saveSessionSoon();
  }

  function swapSplit(win) {
    if (!win?.secondaryTabId) return;
    [win.activeTabId, win.secondaryTabId] = [win.secondaryTabId, win.activeTabId];
    win.splitRatio = 1 - win.splitRatio;
    win.focusedPane = win.focusedPane === 'secondary' ? 'primary' : 'secondary';
    syncExtensionActiveTab(win);
    attachActive(win);
    pushState(win);
    saveSessionSoon();
  }

  function askPreview(win, { text, title, url }) {
    const raw = String(text || '').trim();
    if (!raw) return;
    const clipped = raw.slice(0, 6000);
    showFloat(win, {
      kind: 'ask',
      align: 'left',
      x: Math.max(24, Math.round((win.win.getContentSize()[0] - 520) / 2)),
      y: 72,
      width: 520,
      height: 380,
      title: title || 'This page',
      url: url || '',
      text: clipped,
      shortened: raw.length > clipped.length,
    });
  }

  const menuActions = {
    settings: () => store.settings,
    command: (name) => command(focused(), name),
    newTab: () => { const win = focused(); if (win) createTab(win); },
    newWindow: () => createWindow({}),
    newPrivateWindow: () => createWindow({ privateMode: true }),
    closeTab: () => { const win = focused(); if (win?.activeTabId) closeTab(win, targetTab(win)?.id); },
    closeWindow: () => focused()?.win.close(),
    reopenTab: () => {
      const win = focused();
      const closed = win?.closedStack.shift();
      if (closed) createTab(win, closed);
    },
    reload: (hard) => reload(focused(), hard),
    zoom: (direction) => zoom(focused(), direction),
    back: () => { const contents = activeContents(focused()); if (contents && canGoBack(contents)) goBack(contents); },
    forward: () => { const contents = activeContents(focused()); if (contents && canGoForward(contents)) goForward(contents); },
    home: () => { const win = focused(); if (win) navigate(win, null, homepage()); },
    bookmark: () => toggleBookmark(focused()),
    devTools: () => activeContents(focused())?.openDevTools({ mode: 'detach' }),
    startMediaDiagnostics: async () => {
      const win = focused();
      const contents = activeContents(win);
      if (!contents || win?.private) {
        dialog.showErrorBox('Playback diagnostics', 'Open the streaming site in a normal window to capture diagnostics.');
        return;
      }
      if (mediaCapture || mediaCaptureStarting) {
        dialog.showErrorBox('Playback diagnostics', 'Save the current playback report before starting another capture.');
        return;
      }
      mediaCaptureStarting = true;
      try {
        mediaCapture = await startMediaDiagnostics(contents, mediaRuntime);
        await dialog.showMessageBox(win.win, { type: 'info', message: 'Playback diagnostics started', detail: 'Try playing a title in this tab, then choose Help → Save Playback Diagnostics. Capture stops after five minutes. Reports contain capability results and error categories, without license data, request bodies, or credentials.' });
      } catch (error) { dialog.showErrorBox('Playback diagnostics', error.message); }
      finally { mediaCaptureStarting = false; }
    },
    saveMediaDiagnostics: async () => {
      if (!mediaCapture) { dialog.showErrorBox('Playback diagnostics', 'Start playback diagnostics from Help first.'); return; }
      const capture = mediaCapture;
      mediaCapture = null;
      try {
        const report = await capture.finish();
        const result = await dialog.showSaveDialog(focused()?.win, { defaultPath: 'righttab-playback.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
        if (!result.canceled && result.filePath) fs.writeFileSync(result.filePath, JSON.stringify(report, null, 2), { mode: 0o600 });
      } catch (error) { dialog.showErrorBox('Playback diagnostics', error.message); }
    },
    toggleSidebar: () => {
      store.commit({ sidebarCollapsed: !store.settings.sidebarCollapsed });
      pushAll();
      menu.rebuild();
    },
    toggleBookmarkBar: () => {
      const mode = store.settings.bookmarkBarMode === 'hidden' ? 'complex' : 'hidden';
      store.commit({ bookmarkBarMode: mode, showBookmarkBar: mode !== 'hidden' });
      pushAll();
      menu.rebuild();
    },
    findNext: () => command(focused(), 'find-next'),
    findPrevious: () => command(focused(), 'find-previous'),
    selectTabIndex: (index) => {
      const win = focused();
      if (!win) return;
      const id = index >= 8 ? win.tabOrder[win.tabOrder.length - 1] : win.tabOrder[index];
      if (id) selectTab(win, id);
    },
  };
  const menu = installMenu(menuActions);

  function popTabMenu(win, tabId) {
    const tab = win.tabs.get(tabId);
    if (!tab) return;
    const groupItems = win.groups.map((group) => ({
      label: group.name,
      click: () => {
        applyItems(win, placeInGroup(itemsFrom(win), tabId, group.id));
        pushState(win);
        saveSessionSoon();
      },
    }));
    const spaceItems = win.spaces.filter((space) => space.id !== tab.spaceId).map((space) => ({
      label: space.name,
      click: () => {
        tab.spaceId = space.id;
        tab.groupId = null;
        if (tab.id === win.activeTabId) ensureActiveSpaceTab(win);
        pushState(win); saveSessionSoon();
      },
    }));
    Menu.buildFromTemplate([
      { label: 'Open beside current tab', enabled: tabId !== win.activeTabId, click: () => openSplit(win, { tabId }) },
      { label: 'Swap sides', enabled: !!win.secondaryTabId, click: () => swapSplit(win) },
      { label: 'Close split', enabled: win.secondaryTabId === tabId || !!win.secondaryTabId, click: () => closeSplit(win) },
      { label: 'Duplicate', click: () => createTab(win, { url: displayUrl(tab) }) },
      {
        label: tab.pinned ? 'Unpin' : 'Pin',
        click: () => {
          tab.pinned = !tab.pinned;
          if (tab.pinned) tab.groupId = null;
          applyItems(win, [...itemsFrom(win).filter((item) => item.pinned), ...itemsFrom(win).filter((item) => !item.pinned)]);
          pushState(win);
          saveSessionSoon();
        },
      },
      {
        label: tab.muted ? 'Unmute' : 'Mute',
        click: () => {
          tab.muted = !tab.muted;
          tab.view.webContents.setAudioMuted(tab.muted);
          pushState(win);
        },
      },
      { type: 'separator' },
      { label: 'Move to Space', submenu: spaceItems.length ? spaceItems : [{ label: 'No other Spaces', enabled: false }] },
      {
        label: 'Add to new group',
        click: () => {
          const group = { id: crypto.randomUUID(), name: 'Group', color: GROUP_COLORS[win.groups.length % GROUP_COLORS.length], collapsed: false, spaceId: tab.spaceId };
          win.groups.push(group);
          applyItems(win, placeInGroup(itemsFrom(win), tabId, group.id));
          pushState(win);
          saveSessionSoon();
        },
      },
      { label: 'Add to group', submenu: groupItems.length ? groupItems : [{ label: 'No groups yet', enabled: false }] },
      { label: 'Remove from group', enabled: !!tab.groupId, click: () => { tab.groupId = null; pushState(win); saveSessionSoon(); } },
      { type: 'separator' },
      { label: 'Copy link', click: () => clipboard.writeText(displayUrl(tab)) },
      { label: 'Close', click: () => closeTab(win, tabId) },
      {
        label: 'Close other tabs',
        click: () => {
          const ids = win.tabOrder.filter((id) => id !== tabId && !win.tabs.get(id).pinned);
          for (const id of ids) closeTab(win, id);
        },
      },
    ]).popup();
  }

  function popGroupMenu(win, groupId) {
    const group = win.groups.find((item) => item.id === groupId);
    if (!group) return;
    Menu.buildFromTemplate([
      ...GROUP_COLORS.map((color) => ({
        label: color[0].toUpperCase() + color.slice(1),
        type: 'radio',
        checked: group.color === color,
        click: () => { group.color = color; pushState(win); saveSessionSoon(); },
      })),
      { type: 'separator' },
      { label: group.collapsed ? 'Expand group' : 'Collapse group', click: () => { group.collapsed = !group.collapsed; pushState(win); } },
      { label: 'Ungroup', click: () => {
        for (const tab of win.tabs.values()) if (tab.groupId === groupId) tab.groupId = null;
        win.groups = win.groups.filter((item) => item.id !== groupId);
        pushState(win);
        saveSessionSoon();
      } },
      { label: 'Close group', click: () => {
        const ids = win.tabOrder.filter((id) => win.tabs.get(id).groupId === groupId);
        win.groups = win.groups.filter((item) => item.id !== groupId);
        for (const id of ids) closeTab(win, id);
      } },
    ]).popup();
  }

  function popAppMenu(win) {
    Menu.buildFromTemplate([
      { label: 'Settings', click: () => command(win, 'open-settings') },
      { label: 'History', click: () => command(win, 'open-history') },
      { label: 'Bookmarks', click: () => command(win, 'open-bookmarks') },
      { label: 'Passwords', click: () => command(win, 'open-passwords') },
      { label: 'Import from Chrome', click: () => command(win, 'open-import') },
      { type: 'separator' },
      { label: 'Downloads', click: () => command(win, 'toggle-downloads') },
      { label: 'Find', click: () => command(win, 'open-find') },
      { label: 'Keyboard shortcuts', click: () => command(win, 'open-shortcuts') },
      { type: 'separator' },
      { label: 'New window', click: () => createWindow({}) },
      { label: 'New private window', click: () => createWindow({ privateMode: true }) },
    ]).popup();
  }

  function popBookmarkMenu(win, id) {
    const found = findBookmark(store.bookmarks, id);
    if (!found || found.node.type !== 'folder') return;
    const items = (found.node.children || []).map((child) => {
      if (child.type === 'folder') return { label: child.title, click: () => popBookmarkMenu(win, child.id) };
      return {
        label: child.title,
        click: () => navigate(win, null, child.url),
      };
    });
    Menu.buildFromTemplate(items.length ? items : [{ label: 'Empty folder', enabled: false }]).popup();
  }

  async function fillPassword(win, id) {
    const meta = vault.list().find((entry) => entry.id === id);
    const contents = activeContents(win);
    if (!meta || !contents) return { ok: false, reason: 'That login is no longer saved.' };
    const current = displayUrl(targetTab(win));
    if (!isCredentialOrigin(current) || new URL(current).origin !== meta.origin) {
      return { ok: false, reason: 'Passwords only fill on the exact HTTPS origin they were saved for.' };
    }
    let password = '';
    try { password = await vault.reveal(id); } catch (error) { return { ok: false, reason: error.message }; }
    const script = `(() => {
      const username = ${JSON.stringify(meta.username)};
      const password = ${JSON.stringify(password)};
      const visible = (el) => {
        if (!el || el.disabled) return false;
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const pass = [...document.querySelectorAll('input[type="password"]')].find(visible);
      if (!pass) return { ok: false, reason: 'No password field is visible on this page.' };
      const scope = pass.form || document;
      const user = [...scope.querySelectorAll('input[type="email"], input[type="text"], input[autocomplete="username"]')].find(visible);
      const setValue = (el, value) => {
        if (!el) return;
        el.focus();
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };
      setValue(user, username);
      setValue(pass, password);
      return { ok: true };
    })()`;
    try {
      return await contents.executeJavaScript(script, true);
    } catch {
      return { ok: false, reason: 'Could not fill this page.' };
    }
  }

  function siteLabel(url) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, '');
      let path = parsed.pathname || '';
      try { path = decodeURIComponent(path); } catch { /* keep the raw path */ }
      if (!path || path === '/') return host;
      if (path.length > 28) path = `${path.slice(0, 28)}…`;
      return `${host}${path}`;
    } catch {
      return '';
    }
  }

  function readableTitle(title, url) {
    const raw = String(title || '').replace(/\s+/g, ' ').trim();
    const junk = !raw
      || raw.length > 80
      || /^(redirecting|just a moment|loading…?|untitled|new tab)$/i.test(raw)
      || raw.includes('://')
      || raw.includes('%')
      || (raw.includes('=') && raw.length > 48);
    if (!junk) return raw;
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'Saved page'; }
  }

  function suggest(query, options = {}) {
    const text = String(query || '');
    const includeHistory = options.includeHistory !== false;
    const decision = classifyInput(text, store.settings.searchEngine, store.settings.customSearchEngines);
    const items = [];
    const names = { ...ENGINE_NAMES };
    const custom = (store.settings.customSearchEngines || []).find((engine) => engine.id === decision.engine);
    if (custom) names[custom.id] = custom.name;
    const q = text.trim().toLowerCase();
    if (q && includeHistory) {
      // Put remembered destinations first. This makes Enter open a site the
      // user visits often (for example, "scho" → Schoology), instead of
      // defaulting to a web search.
      const history = suggestHistory(store.history.entries, q, 6);
      for (const entry of history) {
        const title = readableTitle(entry.title, entry.url);
        const detail = siteLabel(entry.url);
        items.push({ kind: 'history', title, url: entry.url, detail: detail === title ? 'History' : detail });
      }
    }
    if (decision.type === 'url' && !items.some((item) => item.url === decision.url)) {
      items.push({ kind: 'go', title: siteLabel(decision.url) || decision.url, url: decision.url, detail: 'Open' });
    }
    if (decision.type === 'search') {
      const engine = names[decision.engine] || 'Google';
      items.push({ kind: 'search', title: text.trim(), url: decision.url, detail: `Search ${engine}` });
    }
    if (q) {
      for (const root of ['bar', 'other']) {
        walk(store.bookmarks[root], (node) => {
          if (items.length >= 7 || node.type !== 'url') return;
          if (node.title.toLowerCase().includes(q) || node.url.toLowerCase().includes(q)) {
            items.push({
              kind: 'bookmark',
              title: readableTitle(node.title, node.url),
              url: node.url,
              detail: siteLabel(node.url),
            });
          }
        });
      }
      if (includeHistory) {
        const remainingHistory = searchHistory(store.history.entries, q, 12)
          .filter((entry) => !items.some((item) => item.url === entry.url));
        for (const entry of remainingHistory) {
          if (items.length >= 7) break;
          const title = readableTitle(entry.title, entry.url);
          const detail = siteLabel(entry.url);
          items.push({ kind: 'history', title, url: entry.url, detail: detail === title ? 'History' : detail });
        }
      }
    }
    return items.slice(0, 7);
  }

  function senderWindow(event) {
    const win = uiIndex.get(event.sender.id) || floatIndex.get(event.sender.id);
    if (!win) throw new Error('Unauthorized');
    return win;
  }

  function openAssistant(win) {
    if (!win || win.private || win.overlayOpen || win.secondaryTabId) return { ok: false, error: 'Assistant preview is unavailable in private windows, dialogs, or split view.' };
    if (win.sidePanelInstallId === 'assistant') { extensionHost.closeSidePanel(win); return { ok: true }; }
    extensionHost.closeSidePanel(win);
    const view = new WebContentsView({ webPreferences: { preload: path.join(__dirname, 'assistant-preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, webviewTag: false, webSecurity: true } });
    win.sidePanelView = view;
    win.sidePanelInstallId = 'assistant';
    const id = view.webContents.id;
    assistantIndex.set(id, win);
    view.webContents.once('destroyed', () => assistantIndex.delete(id));
    view.webContents.on('will-navigate', (event) => event.preventDefault());
    view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    view.webContents.loadFile(path.join(__dirname, '../src/assistant.html')).catch(() => extensionHost.closeSidePanel(win));
    layout(win); pushState(win);
    return { ok: true };
  }

  function openCreatorScout(win) {
    if (!win || win.private || win.overlayOpen) return { ok: false, error: 'Creator Scout is unavailable in private windows or while a dialog is open.' };
    if (win.secondaryTabId) return { ok: false, error: 'Close split view before opening Creator Scout.' };
    if (win.sidePanelInstallId === 'creator-scout') { extensionHost.closeSidePanel(win); return { ok: true, closed: true }; }
    extensionHost.closeSidePanel(win);
    const view = new WebContentsView({ webPreferences: { preload: path.join(__dirname, 'creator-scout-preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, webviewTag: false, webSecurity: true } });
    win.sidePanelView = view;
    win.sidePanelInstallId = 'creator-scout';
    win.creatorScoutPermission = null;
    const scoutTasks = new Map();
    win.creatorScoutTasks = scoutTasks;
    view.webContents.once('destroyed', () => { for (const task of scoutTasks.values()) task.abort(); scoutTasks.clear(); });
    // A destroyed WebContentsView no longer guarantees that its `webContents`
    // property is readable. Keep the id while the view is alive so closing the
    // Scout panel cannot turn its cleanup handler into an uncaught exception.
    const scoutContentsId = view.webContents.id;
    scoutIndex.set(scoutContentsId, win);
    view.webContents.once('destroyed', () => scoutIndex.delete(scoutContentsId));
    view.webContents.on('will-navigate', (event) => event.preventDefault());
    view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    view.webContents.loadFile(path.join(__dirname, '../src/creator-scout.html')).catch(() => extensionHost.closeSidePanel(win));
    layout(win); pushState(win);
    return { ok: true };
  }

  function openChatGPTPanel(win) {
    if (!win || win.private || win.overlayOpen) {
      return { ok: false, error: 'ChatGPT is unavailable in private windows or while a dialog is open.' };
    }
    if (win.secondaryTabId) return { ok: false, error: 'Close split view before opening the ChatGPT panel.' };
    if (win.sidePanelInstallId === 'chatgpt-direct' && win.sidePanelView) {
      extensionHost.closeSidePanel(win);
      return { ok: true, closed: true };
    }

    extensionHost.closeSidePanel(win);
    const view = new WebContentsView({ webPreferences: pagePreferences(mainSession) });
    harden(view.webContents, win);
    win.sidePanelView = view;
    win.sidePanelInstallId = 'chatgpt-direct';
    view.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
      if (!isMainFrame || code === -3) return;
      console.warn(`ChatGPT panel failed to load ${url}: ${description} (${code})`);
    });
    view.webContents.loadURL('https://chatgpt.com/').catch((error) => {
      console.warn(`ChatGPT panel could not load: ${error.message}`);
    });
    layout(win);
    pushState(win);
    return { ok: true };
  }

  function selectedScoutTab(win) {
    const tab = activeTab(win);
    if (!tab || tab.view.webContents.isDestroyed()) throw new Error('Select a tab first.');
    return tab;
  }

  function scoutContext(win) {
    const tab = selectedScoutTab(win);
    const url = displayUrl(tab);
    const context = platformContext(url);
    win.creatorScoutTabKey = `${tab.id}:${url}`;
    win.creatorScoutPermission = { tabId: tab.id, url };
    return context ? { ...context, url, title: tab.title || '', tabId: tab.id } : { url, title: tab.title || '', kind: '', platform: '' , tabId: tab.id };
  }

  function approvedScoutTab(win) {
    const tab = selectedScoutTab(win);
    if (win.creatorScoutPermission?.tabId !== tab.id || win.creatorScoutPermission?.url !== displayUrl(tab)) throw new Error('Check the current tab again before inspecting it.');
    return tab;
  }


  function showFloat(win, payload) {
    if (!win.float || win.float.webContents.isDestroyed()) return;
    const width = Math.max(180, Math.round(Number(payload.width) || 280));
    const height = Math.max(44, Math.round(Number(payload.height) || 120));
    const [winW, winH] = win.win.getContentSize();
    let x = Math.round(Number(payload.x) || 8);
    let y = Math.round(Number(payload.y) || 56);
    x = Math.max(8, Math.min(x, Math.max(8, winW - width - 8)));
    y = Math.max(8, Math.min(y, Math.max(8, winH - height - 8)));
    win.floatAnchor = { x, y, width, align: payload.align === 'right' ? 'right' : 'left' };
    win.float.setBounds({ x, y, width, height });
    win.float.setVisible(true);
    win.win.contentView.addChildView(win.float);
    const message = { ...payload, dark: nativeTheme.shouldUseDarkColors, resolvedTheme: Themes.resolve(store.settings, nativeTheme.shouldUseDarkColors) };
    if (win.floatReady) win.float.webContents.send('float:show', message);
    else win.pendingFloat = message;
  }

  function resizeFloat(win, size) {
    if (!win.floatAnchor || !win.float || !win.float.getVisible()) return;
    const width = Math.max(180, Math.round(Number(size.width) || win.floatAnchor.width));
    const height = Math.max(44, Math.round(Number(size.height) || win.floatAnchor.height));
    let x = win.floatAnchor.align === 'right'
      ? win.floatAnchor.x + win.floatAnchor.width - width
      : win.floatAnchor.x;
    const [winW, winH] = win.win.getContentSize();
    x = Math.max(8, Math.min(x, Math.max(8, winW - width - 8)));
    const y = Math.max(8, Math.min(win.floatAnchor.y, Math.max(8, winH - height - 8)));
    const bounds = win.float.getBounds();
    if (Math.abs(bounds.x - x) < 2 && Math.abs(bounds.y - y) < 2 && Math.abs(bounds.width - width) < 2 && Math.abs(bounds.height - height) < 2) return;
    win.float.setBounds({ x, y, width, height });
  }

  function closeFloat(win, notify = true) {
    if (!win?.float || win.float.webContents.isDestroyed() || !win.float.getVisible()) return;
    win.float.setVisible(false);
    try { win.win.contentView.removeChildView(win.float); } catch { /* already removed */ }
    win.pendingFloat = null;
    if (notify && win.ui && !win.ui.webContents.isDestroyed()) win.ui.webContents.send('float:closed');
  }

  function handle(channel, fn) {
    ipcMain.handle(channel, (event, payload) => {
      const win = senderWindow(event);
      return fn(win, payload || {}, event);
    });
  }

  function askMyTextsBinary() {
    const candidates = [
      process.env.ASK_MY_TEXTS_BINARY,
      path.join(os.homedir(), 'Applications/Ask My Texts.app/Contents/MacOS/AskMyTexts'),
      '/Applications/Ask My Texts.app/Contents/MacOS/AskMyTexts',
      path.join(os.homedir(), 'repos/ask-my-texts/.build/release/AskMyTexts'),
      path.join(os.homedir(), 'repos/ask-my-texts/.build/debug/AskMyTexts'),
    ].filter(Boolean);
    return candidates.find((candidate) => {
      try { return fs.statSync(candidate).isFile(); } catch { return false; }
    }) || '';
  }

  function askMyTextsTool(action, payload) {
    if (action === 'status') return { name: 'index_status', arguments: {} };
    if (action === 'recent') return { name: 'recent_messages', arguments: { limit: Math.max(1, Math.min(30, Number(payload.limit) || 15)) } };
    if (action === 'search') {
      const query = String(payload.query || '').trim();
      if (!query) return null;
      return { name: 'search_messages', arguments: { query } };
    }
    return null;
  }

  function callAskMyTexts(action, payload) {
    const tool = askMyTextsTool(action, payload);
    if (!tool) return Promise.resolve({ ok: false, error: 'Enter a question to search your texts.' });
    const binary = askMyTextsBinary();
    if (!binary) return Promise.resolve({ ok: false, error: 'Ask My Texts is not installed. Build or install the Ask My Texts app, then reopen this extension.' });
    const request = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: tool });
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let settled = false;
      const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
      let child;
      try { child = spawn(binary, ['--mcp'], { stdio: ['pipe', 'pipe', 'pipe'] }); } catch (error) { finish({ ok: false, error: error.message }); return; }
      const timer = setTimeout(() => { try { child.kill(); } catch {} finish({ ok: false, error: 'Ask My Texts took too long to respond.' }); }, 10_000);
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('error', (error) => { clearTimeout(timer); finish({ ok: false, error: error.message }); });
      child.on('close', () => {
        clearTimeout(timer);
        const line = stdout.split(/\r?\n/).find(Boolean);
        try {
          const rpc = JSON.parse(line || '{}');
          const result = rpc.result || {};
          const text = result.content?.[0]?.text || rpc.error?.message || 'No result returned.';
          finish({ ok: !result.isError && !rpc.error, text });
        } catch {
          finish({ ok: false, error: stderr.trim() || 'Ask My Texts did not return a valid response.' });
        }
      });
      child.stdin.end(`${request}\n`);
    });
  }

  function homepageState(win) {
    const theme = Themes.resolve(store.settings, nativeTheme.shouldUseDarkColors);
    const homepageSettings = store.settings.homepage;
    const styled = Homepage.homepageVars(theme, homepageSettings);
    const weather = Homepage.readCachedWeather(homepageSettings.weatherCache, homepageSettings.weatherLocation, homepageSettings.weatherUnit, Date.now());
    return {
      private: !!win?.private,
      searchEngine: store.settings.searchEngine,
      searchSuggestions: store.settings.searchSuggestions !== false && !win?.private,
      customSearchEngines: store.settings.customSearchEngines,
      engines: Object.entries(ENGINE_NAMES).map(([id, name]) => ({ id, name })),
      themes: [...Themes.presets, ...(store.settings.appearance.custom || [])].map((item) => ({ id: item.id, name: item.name, mode: item.mode })),
      appearanceId: theme.id,
      followSystem: store.settings.appearance.followSystem === true,
      themeMode: theme.mode,
      accent: theme.colors.accent,
      wallpapers: Homepage.WALLPAPERS.map((item) => ({ id: item.id, name: item.name })),
      homepage: homepageSettings,
      tone: styled.tone,
      vars: styled.vars,
      background: Homepage.backgroundDescriptor(homepageSettings),
      weather,
    };
  }

  function notifyHomepages() {
    for (const win of windows.values()) {
      let payload = null;
      for (const tab of win.tabs.values()) {
        const contents = tab.view?.webContents;
        if (!contents || contents.isDestroyed()) continue;
        let url = '';
        try { url = contents.getURL(); } catch { url = ''; }
        if (!isNewTabUrl(url)) continue;
        payload = payload || homepageState(win);
        try { contents.send('homepage:changed', payload); } catch { /* page is closing */ }
      }
    }
  }

  function applyBrowserSettings(patch) {
    const nextPatch = patch && typeof patch === 'object' ? { ...patch } : {};
    if (nextPatch.appearance && typeof nextPatch.appearance === 'object') {
      nextPatch.appearance = { ...store.settings.appearance, ...nextPatch.appearance };
    }
    store.commit(applySettingsPatch(store.settings, nextPatch), { immediate: true });
    nativeTheme.themeSource = 'system';
    for (const candidate of windows.values()) {
      try { candidate.win.setBackgroundColor(themeColor()); } catch { /* closing */ }
      if (candidate.floatReady) candidate.float.webContents.send('ui:theme', Themes.resolve(store.settings, nativeTheme.shouldUseDarkColors));
      candidate.measuredSidebar = sidebarWidth();
      layout(candidate);
      pushState(candidate);
    }
    menu.rebuild();
    notifyHomepages();
    return store.settings;
  }

  function homepageCaller(event) {
    let url = '';
    try { url = event.senderFrame?.url || event.sender.getURL(); } catch { url = ''; }
    if (!isNewTabUrl(url)) return null;
    for (const win of windows.values()) {
      for (const tab of win.tabs.values()) {
        if (tab.view?.webContents === event.sender) return { win, tab };
      }
    }
    return null;
  }

  async function loadHomepageWeather(win, payload) {
    let location = store.settings.homepage.weatherLocation;
    if (payload.location) {
      location = Homepage.sanitizeLocation(payload.location);
      if (!location) return { error: 'Enter a city to see the weather.', state: homepageState(win) };
      if (!location.name) location = await homepageService.reverse(location);
    }
    if (!location) return { error: 'Add a city to see the weather.', state: homepageState(win) };
    const unit = payload.unit === 'celsius' || payload.unit === 'fahrenheit' ? payload.unit : store.settings.homepage.weatherUnit;
    const cached = Homepage.readCachedWeather(store.settings.homepage.weatherCache, location, unit, Date.now());
    if (cached && !payload.refresh) return { weather: cached, state: homepageState(win) };
    const result = await homepageService.forecast(location, unit);
    if (!result.ok) {
      const stale = Homepage.readCachedWeather(store.settings.homepage.weatherCache, location, unit, Date.now(), { allowStale: true });
      if (stale) return { weather: stale, stale: true, error: result.error, state: homepageState(win) };
      return { error: result.error, state: homepageState(win) };
    }
    store.commit({
      homepage: {
        ...store.settings.homepage,
        weatherLocation: location,
        weatherUnit: unit,
        weatherCache: { fetchedAt: Date.now(), unit, locationKey: Homepage.locationKey(location), report: result.weather },
      },
    }, { immediate: true });
    notifyHomepages();
    return { weather: result.weather, state: homepageState(win) };
  }

  function registerHomepageIpc() {
    const allow = (event) => {
      const found = homepageCaller(event);
      if (!found) throw new Error('Unauthorized');
      return found;
    };
    ipcMain.handle('homepage:state', (event) => homepageState(allow(event).win));
    ipcMain.handle('homepage:update', (event, patch) => {
      const { win } = allow(event);
      store.commit({ homepage: Homepage.applyHomepagePatch(store.settings.homepage, patch) }, { immediate: true });
      notifyHomepages();
      return homepageState(win);
    });
    ipcMain.handle('homepage:browser-setting', (event, patch) => {
      const { win } = allow(event);
      const allowed = {};
      for (const key of ['searchEngine', 'searchSuggestions', 'customSearchEngines', 'appearance', 'theme']) {
        if (patch && Object.prototype.hasOwnProperty.call(patch, key)) allowed[key] = patch[key];
      }
      applyBrowserSettings(allowed);
      return homepageState(win);
    });
    ipcMain.handle('homepage:submit', (event, payload) => {
      const { win, tab } = allow(event);
      const input = String(payload?.input || '');
      const decision = classifyInput(input, store.settings.searchEngine, store.settings.customSearchEngines);
      if (decision.type === 'search' && !win.private) {
        store.commit({ homepage: { ...store.settings.homepage, recentSearches: Homepage.rememberSearch(store.settings.homepage.recentSearches, input) } });
      }
      return navigate(win, tab.id, input);
    });
    ipcMain.handle('homepage:open', (event, payload) => {
      const { win, tab } = allow(event);
      const url = String(payload?.url || '');
      if (!isWebUrl(url)) return { ok: false, error: 'That address cannot be opened.' };
      if (payload?.newTab) {
        createTab(win, { url, background: !!payload.background });
        return { ok: true };
      }
      return navigate(win, tab.id, url);
    });
    ipcMain.handle('homepage:suggest', async (event, payload) => {
      const { win } = allow(event);
      const query = String(payload?.query || '').slice(0, 200);
      const local = suggest(query, { includeHistory: !win.private });
      const recent = win.private ? [] : Homepage.matchRecent(store.settings.homepage.recentSearches, query);
      let remote = [];
      if (!win.private && store.settings.searchSuggestions && query.trim().length >= 2 && ENGINE_NAMES[store.settings.searchEngine]) {
        remote = await homepageService.suggestions(store.settings.searchEngine, query.trim());
      }
      return { local, recent, remote };
    });
    ipcMain.handle('homepage:geocode', async (event, payload) => {
      allow(event);
      return homepageService.geocode(payload?.query);
    });
    ipcMain.handle('homepage:weather', async (event, payload) => loadHomepageWeather(allow(event).win, payload || {}));
    ipcMain.handle('homepage:pick-image', async (event, payload) => {
      const { win } = allow(event);
      const kind = payload?.kind === 'icon' ? 'icon' : 'wallpaper';
      const result = await dialog.showOpenDialog({
        title: kind === 'icon' ? 'Choose shortcut icon' : 'Choose wallpaper',
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      });
      if (result.canceled || !result.filePaths?.[0]) return { cancelled: true, state: homepageState(win) };
      const saved = homepageService.saveUpload(kind, result.filePaths[0]);
      if (!saved.ok) return saved;
      if (kind === 'wallpaper') {
        store.commit({ homepage: { ...store.settings.homepage, wallpaper: 'custom', customWallpaper: saved.url } }, { immediate: true });
        notifyHomepages();
      }
      return { ...saved, state: homepageState(win) };
    });
    ipcMain.handle('homepage:add-engine', (event, payload) => {
      const { win } = allow(event);
      const id = `custom-${crypto.randomUUID()}`;
      const engines = Homepage.normalizeCustomEngines([...(store.settings.customSearchEngines || []), { id, name: payload?.name, template: payload?.template }]);
      if (!engines.some((engine) => engine.id === id)) return { error: 'Use an https address with %s where the query goes.' };
      applyBrowserSettings({ customSearchEngines: engines, searchEngine: id });
      return { state: homepageState(win) };
    });
    ipcMain.handle('homepage:remove-engine', (event, payload) => {
      const { win } = allow(event);
      const id = String(payload?.id || '');
      const engines = (store.settings.customSearchEngines || []).filter((engine) => engine.id !== id);
      const patch = { customSearchEngines: engines };
      if (store.settings.searchEngine === id) patch.searchEngine = 'google';
      applyBrowserSettings(patch);
      return { state: homepageState(win) };
    });
  }

  function registerIpc() {
    ipcMain.on('passwords:captured', (event, payload = {}) => {
      // Only our isolated top-level page preload can send this. Validate the
      // sender belongs to a live tab and that it cannot claim another origin.
      for (const win of windows.values()) {
        const tab = [...win.tabs.values()].find((item) => item.view.webContents === event.sender);
        if (!tab || win.private) continue;
        const pageUrl = event.sender.getURL();
        if (!isCredentialOrigin(pageUrl) || !payload.password || typeof payload.password !== 'string') return;
        let pageOrigin = '';
        let claimedOrigin = '';
        try { pageOrigin = new URL(pageUrl).origin; claimedOrigin = new URL(String(payload.origin || '')).origin; } catch { return; }
        if (pageOrigin !== claimedOrigin) return;
        tab.pendingLogin = {
          origin: pageOrigin,
          username: String(payload.username || '').slice(0, 512),
          password: payload.password,
          pageUrl,
          prompted: false,
          capturedAt: Date.now(),
        };
        return;
      }
    });
    handle('assistant:open', (win) => openAssistant(win));
    ipcMain.handle('assistant:action', async (event, payload = {}) => {
      const win = assistantIndex.get(event.sender.id);
      if (!win || win.private || win.sidePanelInstallId !== 'assistant' || win.sidePanelView?.webContents !== event.sender) throw new Error('Unauthorized assistant panel.');
      const tab = activeTab(win);
      if (!tab || tab.view.webContents.isDestroyed()) throw new Error('Select a tab first.');
      const controller = automationFor(win);
      const taskId = crypto.randomUUID();
      if (payload.action === 'read') {
        const url = tab.view.webContents.getURL();
        const response = await dialog.showMessageBox(win.win, { type: 'question', buttons: ['Cancel', 'Read page'], defaultId: 0, cancelId: 0, title: 'Allow page inspection?', message: 'Read visible text from this tab?', detail: url });
        if (response.response !== 1) throw new Error('Page inspection was not approved.');
        if (win.sidePanelInstallId !== 'assistant' || win.activeTabId !== tab.id || tab.view.webContents.isDestroyed() || tab.view.webContents.getURL() !== url) throw new Error('Tab changed; retry.');
        return controller.inspect({ taskId, tabId: tab.id, authorize: true });
      }
      if (payload.action === 'click') return controller.click({ taskId, tabId: tab.id, label: payload.label });
      throw new Error('Unsupported assistant action.');
    });
    handle('creator-scout:open', (win) => openCreatorScout(win));
    handle('chatgpt:panel', (win) => openChatGPTPanel(win));
    handle('creator-scout:resize', (win, payload) => {
      if (win.sidePanelInstallId !== 'creator-scout') return { ok: false };
      win.creatorScoutWidth = Math.max(320, Math.min(620, Math.round(Number(payload.width) || 420)));
      layout(win); return { ok: true };
    });
    ipcMain.handle('creator-scout:action', async (event, payload = {}) => {
      const win = scoutIndex.get(event.sender.id);
      if (!win || win.private || win.sidePanelView?.webContents !== event.sender) throw new Error('Unauthorized Creator Scout panel.');
      try {
        const action = payload.action;
        if (action === 'state') return { ...creatorScout.state(), theme: Themes.resolve(store.settings, nativeTheme.shouldUseDarkColors) };
        if (action === 'askTexts') return callAskMyTexts(String(payload.kind || ''), payload);
        if (action === 'close') { extensionHost.closeSidePanel(win); return { ok: true }; }
        if (action === 'context') return scoutContext(win);
        if (action === 'setKey') return creatorScout.setKey(payload.key);
        if (action === 'setDeepSeek') return creatorScout.setDeepSeek({ key: payload.key, enabled: payload.enabled === true, clear: payload.clear === true });
        if (action === 'setOpenRouter') return creatorScout.setOpenRouter({ key: payload.key, enabled: payload.enabled === true, clear: payload.clear === true });
        if (action === 'search') return await creatorScout.search(payload.query, payload.limit);
        if (action === 'newConversation') return creatorScout.newConversation();
        if (action === 'conversation') return creatorScout.getConversation(payload.id);
        if (action === 'runConversation') {
          const requestId = String(payload.requestId || '').slice(0, 80);
          if (!requestId || win.creatorScoutTasks.has(requestId)) throw new Error('A unique search request ID is required.');
          const tasks = win.creatorScoutTasks;
          const controller = new AbortController();
          tasks.set(requestId, controller);
          try {
            return await creatorScout.runConversation({ conversationId: payload.conversationId, message: payload.message, context: payload.context, limit: payload.limit, contactMode: payload.contactMode }, (progress) => {
              if (!controller.signal.aborted && !event.sender.isDestroyed() && win.sidePanelView?.webContents === event.sender) event.sender.send('creator-scout:progress', { requestId, ...progress });
            }, controller.signal);
          } finally { tasks.delete(requestId); }
        }
        if (action === 'cancelSearch') {
          const task = win.creatorScoutTasks?.get(String(payload.requestId || ''));
          if (task) task.abort(new Error('Search cancelled.'));
          return { cancelled: !!task };
        }
        if (action === 'searchVideos') return await creatorScout.searchVideos(payload.query, payload.options);
        if (action === 'fetchVideos') return await creatorScout.fetchVideos(payload.ids);
        if (action === 'inspect') return await creatorScout.inspect(payload.id);
        if (action === 'inspectPage') {
          const context = youtubeContext(displayUrl(approvedScoutTab(win)));
          const id = await creatorScout.resolveContext(context);
          if (!id) throw new Error('YouTube did not identify a public channel on this page.');
          return await creatorScout.inspect(id);
        }
        if (action === 'createList') return creatorScout.createList(payload.name);
        if (action === 'deleteList') return creatorScout.deleteList(payload.id);
        if (action === 'save') return creatorScout.save(payload.record, payload.patch);
        if (action === 'outreachDraft') return creatorScout.outreachDraft(payload.id, payload.patch);
        if (action === 'copyDraft') {
          const draft = creatorScout.state().saved[payload.id]?.draft;
          if (!draft) throw new Error('Save a draft first.');
          clipboard.writeText(`To: ${draft.to}\nSubject: ${draft.subject}\n\n${draft.body}`);
          return { ok: true };
        }
        if (action === 'researchContact') {
          const tasks = win.creatorScoutTasks;
          const id = crypto.randomUUID();
          const controller = new AbortController();
          tasks.set(id, controller);
          try { return await creatorScout.researchContact(payload.id, controller.signal, payload.depth); }
          finally { tasks.delete(id); }
        }
        if (action === 'remove') return creatorScout.remove(payload.id);
        if (action === 'clear') return creatorScout.clear();
        if (action === 'createBoard') return creatorScout.createBoard(payload.name);
        if (action === 'saveVideoReference') return creatorScout.saveVideoReference(payload.record, payload.boardId);
        if (action === 'removeVideoReference') return creatorScout.removeVideoReference(payload.id);
        if (action === 'analyticsStatus') return creatorScout.analyticsStatus();
        if (action === 'analyticsQuery') return creatorScout.analyticsQuery(payload.query);
        if (action === 'openUrl') {
          if (!isWebUrl(payload.url)) throw new Error('Only public web links can be opened.');
          createTab(win, { url: payload.url });
          return { ok: true };
        }
        if (action === 'copyLinks') {
          const lines = (Array.isArray(payload.links) ? payload.links : []).slice(0, 50).filter((item) => {
            try { return new URL(item.url).hostname === 'www.youtube.com'; } catch { return false; }
          }).map((item) => `${String(item.name || '').slice(0, 120)} — ${item.url}`);
          clipboard.writeText(lines.join('\n'));
          return { ok: true };
        }
        if (action === 'inspectSite') {
          const tab = selectedScoutTab(win);
          const current = new URL(displayUrl(tab));
          if (current.protocol !== 'https:') throw new Error('Open a public HTTPS creator link before inspecting it.');
          const saved = creatorScout.state().saved[payload.id]?.record;
          const cached = saved || (await creatorScout.inspect(payload.id));
          const allowed = (cached.links || []).some((link) => {
            try { return new URL(link.url).hostname.toLowerCase() === current.hostname.toLowerCase(); } catch { return false; }
          });
          if (!allowed) throw new Error('Open a link from this creator’s API description before inspecting the site.');
          const result = await tab.view.webContents.executeJavaScript(`(() => {
            const visible = (el) => !!(el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
            const text = [...document.querySelectorAll('body *')].filter((el) => visible(el) && el.children.length === 0).map((el) => el.textContent || '').join(' ').slice(0, 100000);
            const emails = [...new Set((text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/gi) || []).slice(0, 20))];
            const contactLinks = [...new Set([...document.querySelectorAll('a[href]')].filter(visible).filter((a) => /contact|business|sponsor|media kit|press/i.test(a.textContent || '')).map((a) => a.href).filter((href) => /^https?:/i.test(href)).slice(0, 20))];
            return { title: document.title.slice(0, 160), url: location.href, emails, contactLinks };
          })()`);
          if (result.url !== displayUrl(tab)) throw new Error('The page changed while it was being inspected.');
          return result;
        }
        if (action === 'previewExport') return creatorScoutCsv(creatorScout.state(), payload.ids, payload.columns);
        if (action === 'export') {
          const csv = creatorScoutCsv(creatorScout.state(), payload.ids, payload.columns);
          const chosen = await dialog.showSaveDialog(win.win, { title: 'Export Creator Scout CSV', defaultPath: 'creator-scout.csv', filters: [{ name: 'CSV', extensions: ['csv'] }] });
          if (chosen.canceled || !chosen.filePath) return { cancelled: true };
          fs.writeFileSync(chosen.filePath, '\uFEFF' + csv, 'utf8');
          return { ok: true };
        }
        throw new Error('Unknown Creator Scout action.');
      } catch (error) { return { error: error.message || 'Creator Scout action failed.' }; }
    });
    ipcMain.handle('ask-my-texts:action', async (event, payload = {}) => {
      if (!extensionHost.isAskMyTextsSender(event.sender)) throw new Error('Unauthorized Ask My Texts extension.');
      return callAskMyTexts(String(payload.action || ''), payload);
    });
    ipcMain.handle('creator-scout:resize-panel', (event, payload = {}) => {
      const win = scoutIndex.get(event.sender.id);
      if (!win || win.sidePanelView?.webContents !== event.sender) throw new Error('Unauthorized Creator Scout panel.');
      win.creatorScoutWidth = Math.max(320, Math.min(620, Math.round(Number(payload.width) || 420)));
      layout(win);
      return { ok: true, width: win.creatorScoutWidth };
    });
    handle('app:bootstrap', (win) => snapshot(win));
    handle('nav:home', (win) => navigate(win, null, homepage()));
    handle('nav:submit', (win, payload) => navigate(win, null, payload.input));
    handle('nav:open', (win, payload) => {
      if (!isWebUrl(payload.url)) return { ok: false };
      if (payload.newTab) createTab(win, { url: payload.url, background: !!payload.background });
      else navigate(win, null, payload.url);
      return { ok: true };
    });
    handle('nav:back', (win) => { const contents = activeContents(win); if (contents && canGoBack(contents)) goBack(contents); });
    handle('nav:forward', (win) => { const contents = activeContents(win); if (contents && canGoForward(contents)) goForward(contents); });
    handle('nav:reload', (win, payload) => reload(win, payload.hard));
    handle('nav:stop', (win) => activeContents(win)?.stop());
    handle('tabs:new', (win, payload) => { createTab(win, { url: payload.url || newTabTarget() }); return { ok: true }; });
    handle('tabs:close', (win, payload) => closeTab(win, payload.id || targetTab(win)?.id));
    handle('tabs:select', (win, payload) => selectTab(win, payload.id));
    handle('tabs:move', (win, payload) => {
      if (!win.tabs.has(payload.id)) return;
      applyItems(win, placeTab(itemsFrom(win), payload.id, payload.beforeId || null));
      pushState(win);
      saveSessionSoon();
    });
    handle('tabs:reopen', (win) => menuActions.reopenTab());
    handle('tabs:menu', (win, payload) => popTabMenu(win, payload.id));
    handle('tabs:duplicate', (win, payload) => {
      const tab = win.tabs.get(payload.id);
      if (tab) createTab(win, { url: displayUrl(tab), spaceId: tab.spaceId });
    });
    handle('spaces:list', (win) => ({ spaces: win.spaces, activeSpaceId: win.activeSpaceId }));
    handle('spaces:create', (win, payload) => {
      const space = { id: crypto.randomUUID(), name: String(payload.name || 'New Space').trim().slice(0, 40) || 'New Space', icon: '◈', color: SPACE_COLORS[win.spaces.length % SPACE_COLORS.length], activeTabId: null };
      win.spaces.push(space);
      selectSpace(win, space.id);
      return space;
    });
    handle('spaces:select', (win, payload) => selectSpace(win, payload.id));
    handle('spaces:rename', (win, payload) => {
      const space = win.spaces.find((item) => item.id === payload.id);
      if (!space) return;
      space.name = String(payload.name || 'Space').trim().slice(0, 40) || 'Space';
      pushState(win); saveSessionSoon();
    });
    handle('spaces:delete', (win, payload) => {
      if (win.spaces.length < 2) throw new Error('Keep at least one Space.');
      const space = win.spaces.find((item) => item.id === payload.id);
      if (!space) return;
      const destination = win.spaces.find((item) => item.id !== space.id);
      for (const tab of win.tabs.values()) if (tab.spaceId === space.id) tab.spaceId = destination.id;
      win.groups = win.groups.filter((group) => group.spaceId !== space.id);
      win.spaces = win.spaces.filter((item) => item.id !== space.id);
      if (win.activeSpaceId === space.id) selectSpace(win, destination.id);
      pushState(win); saveSessionSoon();
    });
    handle('spaces:move-tab', (win, payload) => {
      const tab = win.tabs.get(payload.tabId);
      if (!tab || !win.spaces.some((space) => space.id === payload.spaceId)) return;
      tab.spaceId = payload.spaceId; tab.groupId = null;
      if (tab.id === win.activeTabId) ensureActiveSpaceTab(win);
      pushState(win); saveSessionSoon();
    });
    handle('spaces:search', (win, payload) => {
      const query = String(payload.query || '').trim().toLowerCase();
      return [...win.tabs.values()].filter((tab) => !query || `${tab.title} ${displayUrl(tab)}`.toLowerCase().includes(query)).slice(0, 100).map((tab) => ({ id: tab.id, spaceId: tab.spaceId, title: tab.title, url: displayUrl(tab) }));
    });
    handle('groups:create', (win, payload) => {
      const group = { id: crypto.randomUUID(), name: 'Group', color: GROUP_COLORS[win.groups.length % GROUP_COLORS.length], collapsed: false, spaceId: win.activeSpaceId };
      win.groups.push(group);
      if (payload.tabId) applyItems(win, placeInGroup(itemsFrom(win), payload.tabId, group.id));
      pushState(win);
      saveSessionSoon();
      return group;
    });
    handle('groups:place', (win, payload) => {
      applyItems(win, placeInGroup(itemsFrom(win), payload.tabId, payload.groupId));
      pushState(win);
      saveSessionSoon();
    });
    handle('groups:rename', (win, payload) => {
      const group = win.groups.find((item) => item.id === payload.id);
      if (!group) return;
      group.name = String(payload.name || 'Group').trim().slice(0, 80) || 'Group';
      pushState(win);
      saveSessionSoon();
    });
    handle('groups:color', (win, payload) => {
      const group = win.groups.find((item) => item.id === payload.id);
      if (!group || !GROUP_COLORS.includes(payload.color)) return;
      group.color = payload.color;
      pushState(win);
    });
    handle('groups:toggle', (win, payload) => {
      const group = win.groups.find((item) => item.id === payload.id);
      if (!group) return;
      group.collapsed = !group.collapsed;
      pushState(win);
    });
    handle('groups:ungroup', (win, payload) => {
      const tab = win.tabs.get(payload.tabId);
      if (!tab) return;
      tab.groupId = null;
      pushState(win);
      saveSessionSoon();
    });
    handle('groups:close', (win, payload) => {
      const ids = win.tabOrder.filter((id) => win.tabs.get(id).groupId === payload.id);
      win.groups = win.groups.filter((item) => item.id !== payload.id);
      for (const id of ids) closeTab(win, id);
    });
    handle('groups:menu', (win, payload) => popGroupMenu(win, payload.id));
    handle('groups:root-menu', (win) => {
      const tab = targetTab(win);
      const groups = win.groups.filter((group) => group.spaceId === win.activeSpaceId);
      Menu.buildFromTemplate([
        { label: 'New tab group', enabled: !!tab, click: () => {
          const group = { id: crypto.randomUUID(), name: 'Group', color: GROUP_COLORS[win.groups.length % GROUP_COLORS.length], collapsed: false, spaceId: win.activeSpaceId };
          win.groups.push(group);
          if (tab) applyItems(win, placeInGroup(itemsFrom(win), tab.id, group.id));
          pushState(win); saveSessionSoon();
        } },
        { type: 'separator' },
        ...groups.map((group) => ({ label: group.name, submenu: [
          { label: group.collapsed ? 'Expand group' : 'Collapse group', click: () => { group.collapsed = !group.collapsed; pushState(win); saveSessionSoon(); } },
          { label: 'Manage group', click: () => popGroupMenu(win, group.id) },
        ] })),
        ...(groups.length ? [] : [{ label: 'No tab groups yet', enabled: false }]),
      ]).popup();
    });
    handle('sidebar:set', (win, payload) => {
      const patch = {};
      if (typeof payload.sidebarCollapsed === 'boolean') patch.sidebarCollapsed = payload.sidebarCollapsed;
      if (Number.isFinite(payload.sidebarWidth)) patch.sidebarWidth = payload.sidebarWidth;
      store.commit(patch);
      win.measuredSidebar = store.settings.sidebarCollapsed ? SIDEBAR_COLLAPSED : store.settings.sidebarWidth;
      layout(win);
      pushState(win);
    });
    handle('layout:set', (win, payload) => {
      const top = Number(payload.top);
      const bottom = Number(payload.bottom);
      const sidebar = Number(payload.sidebar);
      if (Number.isFinite(top) && Number.isFinite(bottom)) win.insets = { top: Math.max(0, top), bottom: Math.max(0, bottom) };
      if (Number.isFinite(sidebar) && sidebar > 0) win.measuredSidebar = sidebar;
      layout(win);
      if (!win.shown) reveal(win);
      return { ok: true };
    });
    handle('overlay:set', async (win, payload) => {
      const opening = !!payload.open && !win.overlayOpen;
      const pages = opening ? await captureOverlayPages(win) : [];
      win.overlayOpen = !!payload.open;
      if (win.overlayOpen) extensionHost.closePopup(win);
      attachActive(win);
      pushState(win);
      return { pages };
    });
    handle('page:focus', (win) => activeContents(win)?.focus());
    handle('find:update', (win, payload) => {
      const contents = activeContents(win);
      if (!contents) return;
      if (!payload.text) {
        contents.stopFindInPage('clearSelection');
        return;
      }
      contents.findInPage(String(payload.text), { forward: payload.forward !== false, findNext: !!payload.again });
    });
    handle('zoom:change', (win, payload) => zoom(win, payload.direction));
    handle('omnibox:suggest', (win, payload) => suggest(payload.query));
    handle('bookmarks:toggle', (win) => toggleBookmark(win));
    handle('bookmarks:add', (win, payload) => {
      if (payload.type === 'folder') {
        insertBookmark(payload.parentId, { id: crypto.randomUUID(), type: 'folder', title: String(payload.title || 'Folder').slice(0, 300), children: [], addedAt: Date.now() });
      } else if (isWebUrl(payload.url)) {
        insertBookmark(payload.parentId, { id: crypto.randomUUID(), type: 'url', title: String(payload.title || payload.url).slice(0, 300), url: payload.url, addedAt: Date.now() });
      }
      pushState(win);
    });
    handle('bookmarks:update', (win, payload) => {
      store.setBookmarks(updateBookmark(store.bookmarks, payload.id, payload));
      pushState(win);
    });
    handle('bookmarks:remove', (win, payload) => {
      store.setBookmarks(removeBookmark(store.bookmarks, payload.id));
      pushState(win);
    });
    handle('bookmarks:menu', (win, payload) => popBookmarkMenu(win, payload.id));
    handle('history:search', (_win, payload) => searchHistory(store.history.entries, payload.query, 200));
    handle('history:delete', (win, payload) => {
      store.setHistory({ entries: store.history.entries.filter((entry) => entry.id !== payload.id) });
    });
    handle('history:clear', () => store.setHistory(emptyHistory(), { immediate: true }));
    handle('downloads:action', (_win, payload) => {
      const record = downloads.find((item) => item.id === payload.id);
      const item = downloadItems.get(payload.id);
      if (payload.action === 'cancel' && item) item.cancel();
      if (payload.action === 'pause' && item) item.pause();
      if (payload.action === 'resume' && item?.canResume()) item.resume();
      if (payload.action === 'open' && record?.state === 'completed' && record.savePath) shell.openPath(record.savePath);
      if (payload.action === 'show' && record?.savePath) shell.showItemInFolder(record.savePath);
      if (payload.action === 'clear') {
        for (let index = downloads.length - 1; index >= 0; index -= 1) {
          if (downloads[index].state !== 'progressing') downloads.splice(index, 1);
        }
      }
      pushAll();
    });
    handle('settings:update', (win, payload) => {
      applyBrowserSettings(payload);
      return snapshot(win).settings;
    });
    handle('themes:import', async () => {
      const result = await dialog.showOpenDialog({ title: 'Import RightTab theme', filters: [{ name: 'Theme JSON', extensions: ['json'] }], properties: ['openFile'] });
      if (result.canceled) return { cancelled: true };
      try {
        if (fs.statSync(result.filePaths[0]).size > 32768) throw Error('Theme files must be smaller than 32 KB.');
        return { theme: Themes.validate(JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8')), true) };
      } catch (error) { return { error: error instanceof SyntaxError ? 'This file is not valid JSON.' : error.message }; }
    });
    handle('themes:export', async (_win, payload) => {
      try {
        const theme = store.settings.appearance.custom.find(t => t.id === payload.id);
        if (!theme) throw Error('Only saved custom themes can be exported.');
        const result = await dialog.showSaveDialog({ title: 'Export theme', defaultPath: theme.name.replace(/[^a-z0-9 -]/gi, '_') + '.json', filters: [{ name: 'Theme JSON', extensions: ['json'] }] });
        if (result.canceled) return { cancelled: true };
        fs.writeFileSync(result.filePath, JSON.stringify({ format: 'righttab-theme', version: 1, theme: Themes.validate(theme) }, null, 2));
        return { saved: true };
      } catch (error) { return { error: error.message }; }
    });
    handle('settings:choose-download-dir', async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
        defaultPath: store.settings.downloadDirectory || app.getPath('downloads'),
      });
      if (!result.canceled && result.filePaths[0]) {
        try {
          assertOutside(result.filePaths[0], chromeUserDataDir());
          store.commit({ downloadDirectory: result.filePaths[0] }, { immediate: true });
        } catch {
          throw new Error('Choose a folder outside the Chrome profile.');
        }
      }
      pushAll();
      const current = focused();
      return current ? snapshot(current).settings : null;
    });
    handle('privacy:clear', async (_win, payload) => {
      if (payload.history) store.setHistory(emptyHistory(), { immediate: true });
      if (payload.cache) await mainSession.clearCache();
      if (payload.cookies) await mainSession.clearStorageData();
      pushAll();
      return { ok: true };
    });
    handle('permission:reply', (win, payload) => replyPermission(win, payload.id, payload.allow));
    handle('permissions:reset', () => { store.commit({ sitePermissions: {} }); pushAll(); return { ok: true }; });
    handle('passwords:list', () => vault.list());
    handle('passwords:reveal', async (_win, payload) => ({ password: await vault.reveal(payload.id) }));
    handle('passwords:delete', (_win, payload) => { vault.remove(payload.id); pushAll(); });
    handle('passwords:add', async (_win, payload) => {
      const result = await vault.add(payload);
      pushAll();
      return result;
    });
    handle('passwords:fill', (win, payload) => fillPassword(win, payload.id));
    handle('passwords:menu', (win) => {
      const host = hostOf(displayUrl(targetTab(win)));
      const entries = vault.forHost(host);
      Menu.buildFromTemplate([
        { label: entries.length ? `Saved for ${host}` : 'No saved passwords for this site', enabled: false },
        ...entries.map((entry) => ({ label: entry.username || '(no username)', click: () => fillPassword(win, entry.id) })),
        { type: 'separator' },
        { label: 'Manage passwords', click: () => command(win, 'open-passwords') },
      ]).popup();
    });
    handle('passwords:import-csv', async () => {
      const result = await dialog.showOpenDialog({ filters: [{ name: 'CSV', extensions: ['csv'] }], properties: ['openFile'] });
      if (result.canceled || !result.filePaths[0]) return { cancelled: true, imported: 0, duplicates: 0, failed: 0 };
      const parsed = parseChromePasswordCsv(fs.readFileSync(result.filePaths[0], 'utf8'));
      if (parsed.error) return { imported: 0, duplicates: 0, failed: 0, error: parsed.error };
      let imported = 0;
      let duplicates = 0;
      let failed = 0;
      for (const entry of parsed.entries) {
        try {
          const added = await vault.add({ ...entry, source: 'csv' });
          if (added.duplicate) duplicates += 1;
          else imported += 1;
        } catch { failed += 1; }
      }
      pushAll();
      return { imported, duplicates, failed, error: '' };
    });
    handle('import:list', () => process.platform === 'win32' ? listWindowsProfiles() : listProfiles());
    handle('import:preview', async (_win, payload) => {
      const dir = process.platform === 'win32' ? resolveWindowsProfile(payload.profileId) : resolveProfileDir(chromeUserDataDir(), payload.profileId);
      const inspection = await inspectProfile(dir, {
        homeDir: app.getPath('home'),
        directoryExists: (candidate) => {
          try { return fs.statSync(candidate).isDirectory(); } catch { return false; }
        },
      });
      return toPublicPreview(inspection);
    });
    handle('import:run', async (win, payload, event) => {
      const dir = process.platform === 'win32' ? resolveWindowsProfile(payload.profileId) : resolveProfileDir(chromeUserDataDir(), payload.profileId);
      const result = await runChromeImport({
        profileDir: dir,
        selections: {
          bookmarks: !!payload.bookmarks,
          history: !!payload.history,
          passwords: !!payload.passwords,
          preferences: !!payload.preferences,
          tabs: !!payload.tabs,
          extensions: !!payload.extensions,
          loadExtensions: !!payload.loadExtensions,
        },
        store,
        vault,
        installExtension: (source) => extensionHost.installFromDirectory(source, { sourceKind: 'chrome-import' }),
        send: (progress) => event.sender.send('import:progress', progress),
      });
      for (const url of result.openTabs) createTab(win, { url, background: true });
      if (result.openTabs[0]) {
        const match = [...win.tabs.values()].find((tab) => displayUrl(tab) === result.openTabs[0] || tab.requestedUrl === result.openTabs[0]);
        if (match) selectTab(win, match.id);
      }
      nativeTheme.themeSource = 'system';
      pushAll();
      menu.rebuild();
      return result.summary;
    });
    handle('float:open', (win, payload) => showFloat(win, payload));
    handle('float:close', (win) => closeFloat(win));
    handle('float:resize', (win, payload) => resizeFloat(win, payload));
    handle('float:action', (win, payload) => {
      if (payload.type === 'close') {
        closeFloat(win);
        return;
      }
      if (payload.type === 'extension-open') {
        closeFloat(win);
        return extensionHost.openSurface(win, payload);
      }
      if (payload.type === 'extension-pin') return extensionHost.setPinned(payload.installId, !!payload.pinned);
      if (payload.type === 'extension-close-panel') {
        extensionHost.closeSidePanel(win);
        return { ok: true };
      }
      if (payload.type === 'navigate' && isWebUrl(payload.url)) {
        closeFloat(win);
        navigate(win, null, payload.url);
        return;
      }
      if (payload.type === 'expand') {
        if (win.ui && !win.ui.webContents.isDestroyed()) win.ui.webContents.send('ui:command', 'expand-downloads');
        return;
      }
      if (payload.type === 'download') {
        const record = downloads.find((item) => item.id === payload.id);
        const item = downloadItems.get(payload.id);
        if (payload.action === 'cancel' && item) item.cancel();
        if (payload.action === 'open' && record?.state === 'completed' && record.savePath) shell.openPath(record.savePath);
        if (payload.action === 'show' && record?.savePath) shell.showItemInFolder(record.savePath);
        return;
      }
      if (payload.type === 'ask-send') {
        const page = payload.url ? `From ${payload.title || 'the page'}\n${payload.url}\n\n` : '';
        const prompt = `${page}${String(payload.text || '').slice(0, 6000)}`.trim();
        if (!prompt) return;
        clipboard.writeText(prompt);
        const query = prompt.slice(0, 1800);
        closeFloat(win);
        openSplit(win, { url: `https://chatgpt.com/?q=${encodeURIComponent(query)}` });
        return;
      }
      if (payload.type === 'command' && typeof payload.command === 'string') {
        closeFloat(win);
        command(win, payload.command);
      }
    });
    handle('app:menu', (win) => popAppMenu(win));
    handle('split:open', (win, payload) => openSplit(win, { url: payload.url || 'https://chatgpt.com/', tabId: payload.tabId }));
    handle('split:close', (win) => closeSplit(win));
    handle('split:swap', (win) => swapSplit(win));
    handle('split:ratio', (win, payload) => {
      const ratio = Number(payload.ratio);
      if (!Number.isFinite(ratio)) return;
      win.splitRatio = Math.min(0.78, Math.max(0.22, ratio));
      layout(win);
      pushState(win);
      saveSessionSoon();
    });
    handle('recovery:dismiss', (win) => { win.recovery = ''; pushState(win); });
    handle('window:new', () => createWindow({}));
    handle('window:private', () => createWindow({ privateMode: true }));
    handle('extensions:pick', async () => {
      const result = await dialog.showOpenDialog({
        title: 'Load unpacked extension',
        buttonLabel: 'Review extension',
        properties: ['openDirectory'],
      });
      if (result.canceled || !result.filePaths[0]) return { cancelled: true };
      return extensionHost.stage(result.filePaths[0]);
    });
    handle('extensions:confirm', () => extensionHost.confirmStaged());
    handle('extensions:cancel', () => extensionHost.clearStaged());
    handle('extensions:enabled', (_win, payload) => extensionHost.setEnabled(payload.installId, !!payload.enabled));
    handle('extensions:remove', (_win, payload) => extensionHost.remove(payload.installId));
    handle('extensions:pin', (_win, payload) => extensionHost.setPinned(payload.installId, !!payload.pinned));
    handle('extensions:open', (win, payload) => extensionHost.openSurface(win, payload));
    handle('extensions:close-panel', (win) => { extensionHost.closeSidePanel(win); return { ok: true }; });
    handle('extensions:disconnect-debugger', (win, payload) => {
      if (!win.private && [...win.tabs.values()].some((tab) => !tab.view.webContents.isDestroyed() && tab.view.webContents.id === payload.tabId)) extensionDebugger?.disconnectByUser(payload.tabId);
    });
    registerHomepageIpc();
  }

  const extensionHost = createExtensionHost({
    session: mainSession,
    userData: store.dir,
    store,
    getWindows: () => windows.values(),
    onChanged: () => pushAll(),
    onLayout: (win) => { layout(win); pushState(win); },
    openLink: openExtensionLink,
    chromeRoot: chromeUserDataDir(),
  });

  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event) => event.preventDefault());
    extensionHost.observe(contents);
  });
  app.on('certificate-error', (event, _contents, _url, _error, _certificate, callback) => {
    event.preventDefault();
    callback(false);
  });
  nativeTheme.on('updated', () => {
    for (const win of windows.values()) {
      try { win.win.setBackgroundColor(themeColor()); } catch { /* closing */ }
      pushState(win);
      if (win.floatReady) win.float.webContents.send('ui:theme', Themes.resolve(store.settings, nativeTheme.shouldUseDarkColors));
    }
    notifyHomepages();
  });

  wireSession(mainSession);
  registerIpc();
  // Only the separate opt-in test profile uses the experimental adapter.
  // Register the preload and IPC router before restoring any extension.
  if (process.env.RIGHTTAB_EXTENSION_TEST === '1') {
    const { installExtensionDebugger } = require('./extension-debugger-host.cjs');
    extensionDebugger = installExtensionDebugger({ session: mainSession, changed: () => pushAll(), getTargets: () => [...windows.values()].filter((win) => !win.private && !win.closed).flatMap((win) => [...win.tabs.values()].filter((tab) => !tab.view.webContents.isDestroyed()).map((tab) => ({ id: tab.view.webContents.id, contents: tab.view.webContents, private: false }))) });
    const { ElectronChromeExtensions } = require('./vendor/compat.cjs');
    const locate = (contents) => {
      for (const win of windows.values()) {
        if (win.private || win.closed) continue;
        for (const tab of win.tabs.values()) if (tab.view.webContents === contents) return { win, tab };
      }
      return null;
    };
    extensionCompat = new ElectronChromeExtensions({
      session: mainSession,
      createTab: async (details) => {
        const win = details.windowId ? [...windows.values()].find((item) => !item.private && item.win.id === details.windowId) : focused();
        if (!win || win.private || win.closed) throw new Error('No accessible browser window.');
        const tab = createTab(win, { url: details.url || newTabTarget(), background: details.active === false });
        return [tab.view.webContents, win.win];
      },
      selectTab: (contents) => { const item = locate(contents); if (item && item.win.activeTabId !== item.tab.id) selectTab(item.win, item.tab.id); },
      removeTab: (contents) => { const item = locate(contents); if (item && !item.tab.compatClosing) closeTab(item.win, item.tab.id); },
      assignTabDetails: (details, contents) => {
        const item = locate(contents);
        if (item) { details.index = item.win.tabOrder.indexOf(item.tab.id); details.pinned = item.tab.pinned; }
      },
    });
  }
  const ready = extensionHost.restore()
    .catch((error) => { console.error('Extension restore failed:', error); })
    .then(async () => {
      await extensionHost.removeBuiltin('ask-my-texts');
      openInitial();
      app.on('activate', () => { if (windows.size === 0) createWindow({}); });
      app.on('before-quit', () => {
        mediaCapture?.stop();
        extensionDebugger?.dispose();
        quitting = true;
        try {
          saveSessionNow({ clean: true });
          store.flush();
          persistLogins();
        } catch (error) {
          console.error('[righttab] quit persist failed:', error && error.message ? error.message : error);
        }
      });
      setInterval(() => {
        try {
          saveSessionNow();
          persistLogins();
        } catch (error) {
          console.error('[righttab] periodic persist failed:', error && error.message ? error.message : error);
        }
      }, 20000).unref?.();
      app.on('second-instance', () => {
        const win = focused();
        if (!win || win.win.isDestroyed()) createWindow({});
        else { win.win.show(); win.win.focus(); }
      });
    });

  // Not exposed to renderer or agents until an explicit permission UI exists.
  const automationControllers = new WeakMap();
  const automationFor = (win) => {
    if (!automationControllers.has(win)) automationControllers.set(win, createAutomationController({
      getTab: (id) => win.tabs.get(id),
      approveAction: async ({ tabId, url, label }) => {
        if (win.activeTabId !== tabId) return false;
        const result = await dialog.showMessageBox(win.win, { type: 'warning', buttons: ['Cancel', 'Click button'], defaultId: 0, cancelId: 0, title: 'Approve browser action', message: `Click “${label}”?`, detail: `Page: ${url}\nThis could submit information, change an account, or trigger another action. Only approve if you intend the result.` });
        return result.response === 1 && win.activeTabId === tabId && win.sidePanelInstallId === 'assistant' && !win.closed;
      },
    }));
    return automationControllers.get(win);
  };

  return {
    automationFor,
    openAssistant,
    whenWindow: () => whenWindow,
    ready,
    snapshot,
    createWindow,
    createTab,
    navigate,
    closeTab,
    selectTab,
    openSplit,
    closeSplit,
    swapSplit,
    saveSessionNow,
    zoom,
    toggleBookmark,
    activeContents,
    homepage,
    newTabPageUrl: () => newTabTarget(),
    settings: () => store.settings,
    updateSettings: (patch) => {
      store.commit(applySettingsPatch(store.settings, patch), { immediate: true });
      nativeTheme.themeSource = 'system';
      return store.settings;
    },
    importFixture: (profileDir, passwordKey, selections) => runChromeImport({
      profileDir,
      selections,
      store,
      vault,
      installExtension: (source) => extensionHost.installFromDirectory(source, { sourceKind: 'chrome-import' }),
      passwordKey,
    }),
    vault,
    store,
    mainSession,
    extensions: extensionHost,
    extensionCompat,
    extensionDebugger,
    downloads: () => downloads,
    focused,
    reveal,
    showPages(win) {
      if (!win || win.closed) return;
      win.overlayOpen = false;
      attachActive(win);
    },
  };
}

module.exports = { startBrowser };
