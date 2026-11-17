const fs = require('fs');
const path = require('path');
const { WebContentsView } = require('electron');
const { assertOutside } = require('../shared/chrome-profile.cjs');
const {
  inspectExtension,
  relativeFile,
  matchesAny,
  actionableExtensionError,
} = require('../shared/extension-manifest.cjs');

const MAX_FILES = 8000;
const MAX_BYTES = 250 * 1024 * 1024;

function createExtensionHost({
  session,
  userData,
  store,
  getWindows,
  onChanged,
  onLayout,
  openLink,
  chromeRoot,
}) {
  const described = new Map();
  const armedContents = new WeakSet();
  const pendingWorkerErrors = new Map();
  const askMyTextsContents = new Set();
  let stagedDir = '';
  let activeWarnings = null;

  process.on('warning', (warning) => {
    const text = `${warning?.name || ''}: ${warning?.message || warning}`;
    if (!/ExtensionLoadWarning|Warnings loading extension|Permission '.+' is unknown/i.test(text)) return;
    if (activeWarnings) activeWarnings.push(text.slice(0, 500));
  });

  function managedRoot() {
    return path.join(userData, 'Extensions');
  }

  function isManaged(target) {
    const root = path.resolve(managedRoot());
    const dest = path.resolve(target);
    return dest === root || dest.startsWith(`${root}${path.sep}`);
  }

  function records() {
    return store.settings.installedExtensions || [];
  }

  function write(next) {
    store.commit({ installedExtensions: next }, { immediate: true });
    onChanged();
  }

  function replaceRecord(record, removeId) {
    const id = record?.installId || removeId;
    const next = records().filter((item) => item.installId !== id);
    if (record) next.push(record);
    next.sort((a, b) => a.name.localeCompare(b.name));
    write(next);
  }

  function detailsFor(record) {
    const manifestPath = path.join(record.path, 'manifest.json');
    let mtime = 0;
    try { mtime = fs.statSync(manifestPath).mtimeMs; } catch { return null; }
    const hit = described.get(record.installId);
    if (hit && hit.mtime === mtime) return hit.value;
    const value = inspectExtension(record.path);
    described.set(record.installId, { mtime, value });
    return value;
  }

  function iconData(record, details) {
    for (const candidate of details?.icons || []) {
      const file = relativeFile(record.path, candidate);
      if (!file) continue;
      try {
        const stat = fs.lstatSync(file);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 512 * 1024) continue;
        const types = {
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.webp': 'image/webp',
          '.svg': 'image/svg+xml',
        };
        const type = types[path.extname(file).toLowerCase()];
        if (!type) continue;
        return `data:${type};base64,${fs.readFileSync(file).toString('base64')}`;
      } catch { /* try the next icon */ }
    }
    return '';
  }

  function cleanWarnings(warnings) {
    const lines = [];
    for (const warning of warnings || []) {
      const text = String(warning).replace(/^Error:\s*/i, '').replace(/^ExtensionLoadWarning:\s*/i, '');
      for (const line of text.split('\n')) {
        const cleaned = line.replace(/^Warning:\s*/i, '').trim();
        if (!cleaned || /^Warnings loading extension at /i.test(cleaned)) continue;
        if (/^Permission '.+' is unknown\.?$/i.test(cleaned)) continue;
        if (!lines.includes(cleaned)) lines.push(cleaned.slice(0, 400));
      }
    }
    return lines.slice(0, 12);
  }

  function loadedExtension(chromiumId) {
    if (!chromiumId || !session.extensions?.getExtension) return null;
    try { return session.extensions.getExtension(chromiumId); } catch { return null; }
  }

  function publicRecord(record) {
    const details = detailsFor(record) || {};
    const experimentalDebugger = process.env.RIGHTTAB_EXTENSION_TEST === '1';
    const debuggerNote = 'Experimental debugger access is limited to registered non-private tabs without subframes; child sessions and Target commands are unavailable.';
    const limitations = [];
    const manifestLimitations = (details.limitations || []).map((item) => experimentalDebugger && item === 'chrome.debugger is not available.' ? debuggerNote : item);
    for (const item of [...(record.runtimeErrors || []), ...(record.loadWarnings || []), ...manifestLimitations]) {
      if (item && !limitations.includes(item)) limitations.push(item);
    }
    return {
      installId: record.installId,
      name: details.name || record.name,
      version: details.version || record.version,
      description: details.description || '',
      enabled: record.enabled !== false,
      pinned: !!record.pinned,
      loaded: !!(record.enabled && loadedExtension(record.chromiumId)),
      icon: iconData(record, details),
      error: record.loadError || '',
      permissions: (details.permissions || []).map((item) => experimentalDebugger && item.id === 'debugger' ? { ...item, support: 'partial', detail: debuggerNote } : item),
      limitations: limitations.slice(0, 12),
      sites: details.sites || [],
      hasPopup: !!details.popup,
      hasSidePanel: !!details.sidePanel,
      hasOptions: !!details.options,
    };
  }

  function publicState(win) {
    const panelRecord = win?.sidePanelInstallId
      ? records().find((item) => item.installId === win.sidePanelInstallId)
      : null;
    return {
      extensions: records().map(publicRecord),
      sidePanel: panelRecord && win.sidePanelView ? { installId: panelRecord.installId, name: panelRecord.name } : null,
    };
  }

  async function loadAt(record) {
    if (!session.extensions?.loadExtension) {
      return { ok: false, error: 'This Electron build cannot load extensions.', warnings: [] };
    }
    const warnings = [];
    activeWarnings = warnings;
    let sawReady = false;
    const onReady = (_event, extension) => {
      if (extension?.path && path.resolve(extension.path) === path.resolve(record.path)) sawReady = true;
    };
    session.extensions?.on('extension-ready', onReady);
    try {
      const loaded = await session.extensions.loadExtension(record.path, { allowFileAccess: false });
      const deadline = Date.now() + 8000;
      while (!sawReady && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return { ok: true, loaded, warnings: [...warnings] };
    } catch (error) {
      const message = error?.message || 'The extension could not be loaded.';
      return { ok: false, error: message, warnings: [...warnings] };
    } finally {
      session.extensions?.removeListener('extension-ready', onReady);
      activeWarnings = null;
    }
  }

  function unload(chromiumId) {
    if (!chromiumId || !session.extensions?.removeExtension) return;
    try { session.extensions.removeExtension(chromiumId); } catch { /* already unloaded */ }
  }

  function reloadMatches(patterns) {
    if (!patterns?.length) return;
    for (const win of getWindows()) {
      if (!win || win.private || win.closed) continue;
      for (const tab of win.tabs.values()) {
        let url = '';
        try { url = tab.view.webContents.getURL(); } catch { url = ''; }
        if (!url || url === 'about:blank') url = tab.requestedUrl || '';
        if (!matchesAny(patterns, url)) continue;
        try { tab.view.webContents.reload(); } catch { /* tab is closing */ }
      }
    }
  }

  function copyTree(source, dest) {
    const rootStat = fs.lstatSync(source);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
      throw new Error('Choose a real folder. Packed .crx files cannot be loaded, and links are not followed.');
    }
    let files = 0;
    let bytes = 0;
    const sourceResolved = path.resolve(source);
    const destResolved = path.resolve(dest);
    if (destResolved === sourceResolved || destResolved.startsWith(`${sourceResolved}${path.sep}`)) {
      throw new Error('Choose the extension folder itself, not a parent of RightTab’s data.');
    }
    const walk = (current, target) => {
      const stat = fs.lstatSync(current);
      const label = path.relative(source, current) || path.basename(current);
      if (stat.isSymbolicLink()) {
        throw new Error(`Remove the symbolic link “${label}” and try again. RightTab does not copy links.`);
      }
      if (stat.isDirectory()) {
        fs.mkdirSync(target, { recursive: true });
        for (const name of fs.readdirSync(current)) walk(path.join(current, name), path.join(target, name));
        return;
      }
      if (!stat.isFile()) throw new Error(`“${label}” is not a regular file, so the extension was not copied.`);
      files += 1;
      bytes += stat.size;
      if (files > MAX_FILES) throw new Error('This folder has more than 8,000 files, so it was not copied.');
      if (bytes > MAX_BYTES) throw new Error('This folder is larger than 250 MB, so it was not copied.');
      fs.copyFileSync(current, target);
    };
    fs.mkdirSync(dest, { recursive: true });
    walk(source, dest);
  }

  function extensionView(record = null) {
    const isAskMyTexts = record?.source === 'builtin' && record?.builtinId === 'ask-my-texts';
    const view = new WebContentsView({
      webPreferences: {
        session,
        ...(isAskMyTexts ? { preload: path.join(__dirname, 'ask-my-texts-extension-preload.cjs') } : {}),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInSubFrames: false,
        webviewTag: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        safeDialogs: true,
      },
    });
    if (isAskMyTexts) {
      const contentsId = view.webContents.id;
      askMyTextsContents.add(contentsId);
      view.webContents.once('destroyed', () => askMyTextsContents.delete(contentsId));
    }
    return view;
  }

  function pageUrl(chromiumId, relative) {
    return `chrome-extension://${chromiumId}/${String(relative || '').replace(/^\/+/, '')}`;
  }

  function destroyView(win, view) {
    if (!view) return;
    try { if (win?.win && !win.win.isDestroyed()) win.win.contentView.removeChildView(view); } catch { /* already detached */ }
    if (!view.webContents.isDestroyed()) view.webContents.close();
  }

  function closePopup(win) {
    if (!win?.extensionPopup) return;
    const view = win.extensionPopup;
    win.extensionPopup = null;
    win.extensionPopupAnchor = null;
    win.extensionPopupInstallId = '';
    destroyView(win, view);
    onLayout(win);
  }

  function closeSidePanel(win) {
    if (!win?.sidePanelView) return;
    const view = win.sidePanelView;
    win.sidePanelView = null;
    win.sidePanelInstallId = '';
    destroyView(win, view);
    onLayout(win);
  }

  function closeSurfacesUsing(installId) {
    for (const win of getWindows()) {
      if (win.extensionPopupInstallId === installId) closePopup(win);
      if (win.sidePanelInstallId === installId) closeSidePanel(win);
    }
  }

  function disposeWindow(win) {
    const views = [win.extensionPopup, win.sidePanelView];
    win.extensionPopup = null;
    win.sidePanelView = null;
    win.extensionPopupAnchor = null;
    win.extensionPopupInstallId = '';
    win.sidePanelInstallId = '';
    for (const view of views) {
      if (view && !view.webContents.isDestroyed()) {
        try { view.webContents.close(); } catch { /* window already closed */ }
      }
    }
  }

  function noteRuntimeError(chromiumId, message) {
    const text = String(message || '').replace(/\s+/g, ' ').trim().slice(0, 400);
    if (!text || !actionableExtensionError(text)) return;
    const record = records().find((item) => item.chromiumId === chromiumId);
    if (!record) {
      const pending = pendingWorkerErrors.get(chromiumId) || [];
      if (!pending.includes(text)) pendingWorkerErrors.set(chromiumId, [...pending, text].slice(-6));
      return;
    }
    if ((record.runtimeErrors || []).includes(text)) return;
    replaceRecord({ ...record, runtimeErrors: [...(record.runtimeErrors || []), text].slice(-6) });
  }

  function fitPopup(win, view) {
    if (win.extensionPopup !== view || view.webContents.isDestroyed() || !win.extensionPopupAnchor) return Promise.resolve();
    return view.webContents.executeJavaScript(`(() => {
      const body = document.body;
      return {
        w: Math.ceil(body ? body.scrollWidth : 0),
        h: Math.ceil(body ? body.scrollHeight : 0),
      };
    })()`).then((size) => {
      if (win.extensionPopup !== view || !win.extensionPopupAnchor) return;
      const anchor = win.extensionPopupAnchor;
      if (size.w && size.w < anchor.width - 12) anchor.width = Math.max(260, size.w);
      else if (size.w > anchor.width + 12) anchor.width = Math.min(780, size.w);
      if (size.h && size.h < anchor.height - 12) anchor.height = Math.max(140, size.h);
      else if (size.h > anchor.height + 12) anchor.height = Math.min(640, size.h);
      onLayout(win);
    }).catch(() => {});
  }

  function openPopupView(win, record, relative, anchor) {
    closePopup(win);
    const view = extensionView(record);
    win.extensionPopup = view;
    win.extensionPopupInstallId = record.installId;
    win.extensionPopupAnchor = {
      x: Number.isFinite(Number(anchor?.x)) ? Math.round(Number(anchor.x)) : 10000,
      y: Number.isFinite(Number(anchor?.y)) ? Math.round(Number(anchor.y)) : 82,
      width: 380,
      height: 520,
      align: anchor?.align === 'right' ? 'right' : 'left',
    };
    view.webContents.on('did-finish-load', () => { fitPopup(win, view); });
    view.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
      if (!isMainFrame || code === -3) return;
      noteRuntimeError(record.chromiumId, `The extension page failed to load (${description || code}).`);
      if (win.extensionPopup === view) closePopup(win);
    });
    view.webContents.loadURL(pageUrl(record.chromiumId, relative)).catch((error) => {
      noteRuntimeError(record.chromiumId, error.message);
      if (win.extensionPopup === view) closePopup(win);
    });
    onLayout(win);
    return { ok: true };
  }

  async function openSurface(win, { installId, kind, anchor } = {}) {
    if (!win || win.closed) return { ok: false, error: 'The window is closed.' };
    if (win.private) {
      return { ok: false, error: 'Extensions stay off in private windows. Content scripts are not injected there.' };
    }
    const record = records().find((item) => item.installId === installId);
    if (!record) return { ok: false, error: 'That extension is not installed.' };
    if (!record.enabled || !loadedExtension(record.chromiumId)) {
      return { ok: false, error: record.loadError || 'Enable the extension before opening it.' };
    }
    const details = detailsFor(record);
    if (!details) return { ok: false, error: 'The extension manifest could not be read.' };
    if (!details.ok) return { ok: false, error: details.error || 'The extension manifest could not be loaded.' };
    if (kind === 'side-panel') {
      if (win.secondaryTabId) return { ok: false, error: 'Close split view before opening an extension side panel.' };
      if (!details.sidePanel) return { ok: false, error: 'This extension does not include a side panel page.' };
      if (win.sidePanelInstallId === installId && win.sidePanelView) {
        closeSidePanel(win);
        return { ok: true, closed: true };
      }
      closeSidePanel(win);
      const view = extensionView(record);
      win.sidePanelView = view;
      win.sidePanelInstallId = installId;
      view.webContents.loadURL(pageUrl(record.chromiumId, details.sidePanel)).catch((error) => {
        noteRuntimeError(record.chromiumId, error.message);
      });
      onLayout(win);
      return { ok: true };
    }
    if (kind === 'options') {
      if (!details.options) return { ok: false, error: 'This extension does not include an options page.' };
      return openPopupView(win, record, details.options, anchor);
    }
    if (!details.popup) {
      return {
        ok: false,
        error: 'This extension has no popup. Electron does not deliver chrome.action.onClicked, so the toolbar button cannot run it.',
      };
    }
    if (win.extensionPopupInstallId === installId) {
      closePopup(win);
      return { ok: true, closed: true };
    }
    return openPopupView(win, record, details.popup, anchor);
  }

  async function installFromDirectory(source, { sourceKind = 'unpacked', builtinId = '', pinned = false } = {}) {
    let resolved;
    try { resolved = path.resolve(source); } catch { return { ok: false, error: 'That folder could not be opened.' }; }
    let sourceStat;
    try { sourceStat = fs.lstatSync(resolved); } catch {
      return { ok: false, error: 'That folder could not be opened.' };
    }
    if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink()) {
      return { ok: false, error: 'Choose the folder that contains manifest.json. A packed .crx file cannot be loaded.' };
    }
    if (isManaged(resolved)) {
      return { ok: false, error: 'Choose the original extension folder. This path is already RightTab’s copy.' };
    }
    const preview = withCrxHint(resolved, inspectExtension(resolved));
    if (!preview.ok) return { ok: false, error: preview.error || 'This folder cannot be loaded.', preview };

    const existing = records().find((item) => item.sourcePath && path.resolve(item.sourcePath) === resolved);
    const installId = existing?.installId || crypto.randomUUID();
    const root = managedRoot();
    fs.mkdirSync(root, { recursive: true });
    const dest = path.join(root, installId);
    const incoming = path.join(root, `${installId}.incoming`);
    const backup = path.join(root, `${installId}.backup`);
    if (!isManaged(dest) || !isManaged(incoming) || !isManaged(backup)) {
      return { ok: false, error: 'The extension copy path is outside RightTab’s folder.' };
    }
    try { assertOutside(dest, chromeRoot); } catch {
      return { ok: false, error: 'RightTab will not write an extension into the Chrome profile.' };
    }
    await fs.promises.rm(incoming, { recursive: true, force: true });
    try {
      copyTree(resolved, incoming);
    } catch (error) {
      await fs.promises.rm(incoming, { recursive: true, force: true });
      return { ok: false, error: error.message, preview };
    }
    const copied = inspectExtension(incoming);
    if (!copied.ok) {
      await fs.promises.rm(incoming, { recursive: true, force: true });
      return { ok: false, error: copied.error || 'The copied extension is not valid.', preview: copied };
    }
    if (existing?.chromiumId) unload(existing.chromiumId);
    closeSurfacesUsing(installId);
    await fs.promises.rm(backup, { recursive: true, force: true });
    if (fs.existsSync(dest)) {
      try { fs.renameSync(dest, backup); } catch (error) {
        await fs.promises.rm(incoming, { recursive: true, force: true });
        return { ok: false, error: `The previous copy could not be moved (${error.message}).`, preview };
      }
    }
    try {
      fs.renameSync(incoming, dest);
    } catch (error) {
      if (fs.existsSync(backup)) fs.renameSync(backup, dest);
      return { ok: false, error: `The extension could not be saved (${error.message}).`, preview };
    }

    const record = {
      installId,
      chromiumId: '',
      name: copied.name,
      version: copied.version,
      path: dest,
      sourcePath: resolved,
      enabled: true,
      pinned: existing?.pinned ?? pinned,
      source: sourceKind === 'chrome-import' ? 'chrome-import' : sourceKind === 'builtin' ? 'builtin' : 'unpacked',
      builtinId,
      loadError: '',
      loadWarnings: [],
      runtimeErrors: existing?.runtimeErrors || [],
    };
    const loaded = await loadAt(record);
    if (!loaded.ok) {
      await fs.promises.rm(dest, { recursive: true, force: true });
      if (fs.existsSync(backup)) {
        fs.renameSync(backup, dest);
        const restored = await loadAt({ ...record, path: dest });
        if (restored.ok) {
          replaceRecord({
            ...record,
            chromiumId: restored.loaded.id,
            loadWarnings: cleanWarnings(restored.warnings),
            loadError: '',
          });
        }
      }
      described.delete(installId);
      return {
        ok: false,
        error: `RightTab could not load this extension: ${loaded.error}`,
        warnings: cleanWarnings(loaded.warnings),
        preview,
      };
    }
    await fs.promises.rm(backup, { recursive: true, force: true });
    record.chromiumId = loaded.loaded.id;
    record.name = loaded.loaded.name || copied.name;
    record.version = loaded.loaded.version || copied.version;
    record.loadWarnings = cleanWarnings(loaded.warnings);
    record.runtimeErrors = pendingWorkerErrors.get(record.chromiumId) || [];
    pendingWorkerErrors.delete(record.chromiumId);
    described.delete(installId);
    replaceRecord(record);
    reloadMatches(copied.sites);
    return { ok: true, name: record.name, id: record.chromiumId, warnings: record.loadWarnings, preview: copied };
  }

  function withCrxHint(dir, preview) {
    if (!preview || preview.ok || !/manifest\.json/.test(preview.error || '')) return preview;
    try {
      if (fs.readdirSync(dir).some((name) => name.toLowerCase().endsWith('.crx'))) {
        return {
          ...preview,
          ok: false,
          error: 'This folder contains a packed .crx file. Electron cannot load .crx packages. Unzip it so manifest.json is in the folder you select, or choose the unpacked version folder from Chrome’s profile.',
        };
      }
    } catch { /* folder could not be listed */ }
    return preview;
  }

  function stage(dir) {
    let resolved;
    try { resolved = path.resolve(dir); } catch { return { ok: false, error: 'That folder could not be opened.' }; }
    const preview = withCrxHint(resolved, inspectExtension(resolved));
    if (!preview.ok) {
      stagedDir = '';
      return { ok: false, error: preview.error || 'This folder cannot be loaded.', preview };
    }
    stagedDir = resolved;
    return { ok: true, preview };
  }

  async function confirmStaged() {
    if (!stagedDir) return { ok: false, error: 'Choose an extension folder first.' };
    const dir = stagedDir;
    stagedDir = '';
    return installFromDirectory(dir, { sourceKind: 'unpacked' });
  }

  async function restore() {
    const kept = [];
    for (const record of records()) {
      if (!isManaged(record.path)) {
        kept.push({
          ...record,
          enabled: false,
          chromiumId: '',
          loadError: 'This extension is outside RightTab’s extension folder. Remove it and load the folder again.',
        });
        continue;
      }
      if (!fs.existsSync(path.join(record.path, 'manifest.json'))) {
        kept.push({
          ...record,
          chromiumId: '',
          loadError: 'The saved extension folder is missing. Remove it and load the original folder again.',
        });
        continue;
      }
      if (!record.enabled) {
        kept.push({ ...record, loadError: '' });
        continue;
      }
      const loaded = await loadAt(record);
      if (!loaded.ok) {
        kept.push({
          ...record,
          chromiumId: '',
          loadError: loaded.error,
          loadWarnings: cleanWarnings(loaded.warnings),
        });
        continue;
      }
      kept.push({
        ...record,
        chromiumId: loaded.loaded.id,
        name: loaded.loaded.name || record.name,
        version: loaded.loaded.version || record.version,
        loadError: '',
        loadWarnings: cleanWarnings(loaded.warnings),
      });
    }
    if (JSON.stringify(kept) !== JSON.stringify(records())) write(kept);
  }

  async function setEnabled(installId, enabled) {
    const record = records().find((item) => item.installId === installId);
    if (!record) return { ok: false, error: 'That extension is not installed.' };
    const details = detailsFor(record);
    if (!enabled) {
      unload(record.chromiumId);
      closeSurfacesUsing(installId);
      replaceRecord({ ...record, enabled: false, loadError: '' });
      reloadMatches(details?.sites || []);
      return { ok: true };
    }
    if (!fs.existsSync(path.join(record.path, 'manifest.json'))) {
      const error = 'The extension folder is missing. Remove it and load the original folder again.';
      replaceRecord({ ...record, enabled: false, loadError: error, chromiumId: '' });
      return { ok: false, error };
    }
    if (!loadedExtension(record.chromiumId)) {
      const loaded = await loadAt(record);
      if (!loaded.ok) {
        replaceRecord({ ...record, enabled: false, loadError: loaded.error, loadWarnings: cleanWarnings(loaded.warnings) });
        return { ok: false, error: loaded.error };
      }
      replaceRecord({
        ...record,
        enabled: true,
        chromiumId: loaded.loaded.id,
        name: loaded.loaded.name || record.name,
        version: loaded.loaded.version || record.version,
        loadError: '',
        loadWarnings: cleanWarnings(loaded.warnings),
      });
    } else {
      replaceRecord({ ...record, enabled: true, loadError: '' });
    }
    reloadMatches(details?.sites || []);
    return { ok: true };
  }

  async function remove(installId) {
    const record = records().find((item) => item.installId === installId);
    if (!record) return { ok: false, error: 'That extension is not installed.' };
    const details = detailsFor(record);
    unload(record.chromiumId);
    closeSurfacesUsing(installId);
    if (isManaged(record.path)) await fs.promises.rm(record.path, { recursive: true, force: true });
    described.delete(installId);
    replaceRecord(null, installId);
    reloadMatches(details?.sites || []);
    return { ok: true };
  }

  function setPinned(installId, pinned) {
    const record = records().find((item) => item.installId === installId);
    if (!record) return { ok: false, error: 'That extension is not installed.' };
    replaceRecord({ ...record, pinned: !!pinned });
    return { ok: true };
  }

  // Extension workers are not WebContents and have their own console event.
  session.serviceWorkers?.on('console-message', (_event, details) => {
    if (details?.level < 2) return;
    const match = /^chrome-extension:\/\/([a-p]{32})(?:\/|$)/.exec(details?.sourceUrl || '');
    if (match) noteRuntimeError(match[1], details.message);
  });

  function observe(contents) {
    const safeUrl = () => {
      try { return contents.getURL() || ''; } catch { return ''; }
    };
    const idFrom = (url) => {
      const match = /^chrome-extension:\/\/([a-p]{32})(?:\/|$)/.exec(String(url || ''));
      return match ? match[1] : '';
    };
    contents.on('console-message', (event) => {
      const text = event?.message || '';
      const severity = event?.level;
      const source = event?.sourceId || '';
      const problem = severity === 'error' || severity === 'warning' || severity >= 2;
      if (!problem) return;
      const id = idFrom(source) || idFrom(safeUrl());
      if (id) noteRuntimeError(id, text);
    });
    const arm = (url) => {
      if (!String(url || '').startsWith('chrome-extension://') || armedContents.has(contents)) return;
      armedContents.add(contents);
      contents.setWindowOpenHandler((details) => {
        if (/^https?:\/\//i.test(details.url || '')) openLink(details.url);
        return { action: 'deny' };
      });
    };
    contents.on('will-navigate', (event, url) => {
      const current = safeUrl();
      const fromExtension = current.startsWith('chrome-extension://');
      const toExtension = String(url || '').startsWith('chrome-extension://');
      if (!fromExtension && !toExtension) return;
      arm(current || url);
      if (fromExtension && toExtension) {
        try {
          if (new URL(current).host === new URL(url).host) return;
        } catch { /* block a malformed extension URL */ }
      }
      if (fromExtension && /^https?:\/\//i.test(url)) {
        event.preventDefault();
        openLink(url);
        return;
      }
      if (fromExtension) event.preventDefault();
    });
    contents.on('did-start-navigation', (_event, url) => arm(url));
  }

  return {
    restore,
    stage,
    confirmStaged,
    clearStaged() { stagedDir = ''; return { ok: true }; },
    installFromDirectory,
    setEnabled,
    remove,
    removeBuiltin: async (builtinId) => {
      const matches = records().filter((record) => record.source === 'builtin' && record.builtinId === builtinId);
      for (const record of matches) await remove(record.installId);
    },
    setPinned,
    openSurface,
    closePopup,
    closeSidePanel,
    disposeWindow,
    observe,
    publicState,
    isAskMyTextsSender: (contents) => !!contents && askMyTextsContents.has(contents.id),
    inspect: inspectExtension,
  };
}

module.exports = { createExtensionHost };
