const rt = window.righttab;

const icons = {
  back: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M15 5 8 12l7 7"/></svg>',
  forward: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m9 5 7 7-7 7"/></svg>',
  reload: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v6h-6"/></svg>',
  stop: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 7l10 10M17 7 7 17"/></svg>',
  star: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 16.8 6.6 19.8l1-6.1L3.2 9.4l6.1-.9L12 3Z"/></svg>',
  starFill: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 16.8 6.6 19.8l1-6.1L3.2 9.4l6.1-.9L12 3Z"/></svg>',
  lock: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
  globe: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><path d="M2 12h20M12 4c2.5 2.5 2.5 13 0 16M12 4c-2.5 2.5-2.5 13 0 16"/></svg>',
  download: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 4v10"/><path d="m8 10 4 4 4-4"/><path d="M5 19h14"/></svg>',
  menu: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 5v14M5 12h14"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  collapse: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m10 7 5 5-5 5"/></svg>',
  expand: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m14 7-5 5 5 5"/></svg>',
  key: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="14" r="4"/><path d="M11 14h9l-2 2 2 2"/></svg>',
  hamburger: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 8h14M5 12h14M5 16h14"/></svg>',
  grid: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="6" height="6" rx="1.4"/><rect x="14" y="4" width="6" height="6" rx="1.4"/><rect x="4" y="14" width="6" height="6" rx="1.4"/><rect x="14" y="14" width="6" height="6" rx="1.4"/></svg>',
  searchRail: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg>',
  sparkle: '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="var(--accent)" d="M12 2.2 13.4 8 19 9.4 13.4 10.8 12 16.6 10.6 10.8 5 9.4 10.6 8Z"/><path fill="var(--accent)" d="M18 13.2 18.7 15.6 21 16.3 18.7 17 18 19.4 17.3 17 15 16.3 17.3 15.6Z"/></svg>',
  puzzle: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 4h4a2 2 0 0 1 2 2 2 2 0 1 0 4 0V4h2v6h-2a2 2 0 1 0 0 4h2v6H4v-4a2 2 0 1 0 0-4H4V8h4a2 2 0 1 0 0-4Z"/></svg>',
  folder: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 7.5A2 2 0 0 1 5 5.5h4l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-10Z"/></svg>',
  external: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M14 5h5v5"/><path d="M19 5 10 14"/><path d="M17 13.5V18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4.5"/></svg>',
  file: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M7 3.5h7l5 5V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"/><path d="M14 3.5V9h5"/></svg>',
  search: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg>',
  clock: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><path d="M12 8v5l3 2"/></svg>',
  home: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m3.5 10 8.5-7 8.5 7v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-9Z"/><path d="M9 21v-7h6v7"/></svg>',
};

const SIDEBAR_COLLAPSED_PX = 56;
const $ = (id) => document.getElementById(id);
const engineNames = { google: 'Google', duckduckgo: 'DuckDuckGo', bing: 'Bing', brave: 'Brave Search' };
let state = null;
let screen = '';
let settingsPane = 'startup';
let suggestions = [];
let suggestionIndex = -1;
let findText = '';
let downloadsOpen = false;
let popoverKind = '';
let tabQuery = '';
let draggingResize = false;
let draggingTab = false;
let importProgress = '';
let importResult = null;
let importPreview = null;
let importProfiles = [];
let importProfileId = '';
let importAutoOpened = false;
let extensionReview = null;
let extensionMenuKey = '';
let extensionSnapshot = '';
let importSelections = {
  bookmarks: true,
  history: true,
  passwords: false,
  preferences: true,
  tabs: false,
  loadExtensions: false,
};

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

function host(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function svgButton(id, icon) {
  $(id).innerHTML = icon;
}

function bind() {
  svgButton('back', icons.back);
  svgButton('forward', icons.forward);
  svgButton('reload', icons.reload);
  svgButton('home', icons.home);
  svgButton('star', icons.star);
  svgButton('passwords', icons.key);
  svgButton('collapse', icons.hamburger);
  svgButton('workspaces', icons.grid);
  svgButton('tab-search', icons.searchRail);
  $('find-prev').innerHTML = icons.back;
  $('find-next').innerHTML = icons.forward;
  $('find-close').innerHTML = icons.close;
  $('new-tab').innerHTML = icons.plus;
  $('all-bookmarks').insertAdjacentHTML('afterbegin', icons.folder);

  $('back').onclick = () => rt.back();
  $('forward').onclick = () => rt.forward();
  $('reload').onclick = () => (state?.loading ? rt.stop() : rt.reload(false));
  $('home').onclick = () => rt.home();
  $('star').onclick = () => rt.toggleBookmark();
  $('passwords').onclick = () => rt.showPasswordMenu();
  $('downloads-button').onclick = () => togglePopover('downloads');
  $('menu-button').onclick = () => togglePopover('menu');
  document.addEventListener('mousedown', (event) => {
    if (!popoverKind) return;
    if (event.target.closest('#popover') || event.target.closest('#downloads-button') || event.target.closest('#menu-button') || event.target.closest('#extensions-button')) return;
    closePopover();
  });
  $('collapse').onclick = () => rt.setSidebar({ sidebarCollapsed: !state.settings.sidebarCollapsed });
  $('new-tab').onclick = (event) => rt.newTab(event.metaKey || event.ctrlKey ? '' : '');
  $('extensions-button').onclick = () => togglePopover('extensions');
  $('assistant-button').onclick = () => rt.openAssistant();
  $('creator-scout-button').onclick = () => rt.toggleCreatorScout();
  $('side-panel-close').onclick = () => rt.closeSidePanel();
  $('profile-button').onclick = () => { settingsPane = 'startup'; openOverlay('settings'); };
  $('workspaces').onclick = () => {
    if (state?.settings.sidebarCollapsed) rt.setSidebar({ sidebarCollapsed: false });
    rt.showGroupsMenu();
  };
  $('tab-search').onclick = () => {
    if (state?.settings.sidebarCollapsed) rt.setSidebar({ sidebarCollapsed: false });
    $('tab-filter').hidden = false;
    $('tab-filter').focus();
  };
  $('tab-filter').addEventListener('input', () => { tabQuery = $('tab-filter').value; renderTabs(); });
  $('all-bookmarks').onclick = () => openOverlay('bookmarks');
  $('zoom-reset').onclick = () => rt.zoom('reset');
  $('omnibox').onsubmit = (event) => {
    event.preventDefault();
    const value = $('address').value;
    hideSuggestions();
    rt.submit(value).then(() => rt.focusPage());
  };
  $('address').addEventListener('focus', () => $('address').select());
  $('address').addEventListener('input', onAddressInput);
  $('address').addEventListener('keydown', onAddressKey);
  $('address').addEventListener('blur', () => setTimeout(hideSuggestions, 150));
  $('findbar').onsubmit = (event) => { event.preventDefault(); runFind(true); };
  $('find-input').addEventListener('input', () => runFind(false));
  $('find-next').onclick = () => runFind(true);
  $('find-prev').onclick = () => runFind(true, false);
  $('find-close').onclick = closeFind;
  $('overlay').addEventListener('click', (event) => {
    if (event.target === $('overlay') && state?.setupComplete) closeOverlay();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Tab' && !$('overlay').hidden) {
      const nodes = [...$('overlay').querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]')].filter(n => n.getClientRects().length);
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && (document.activeElement === first || !$('overlay').contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !$('overlay').contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    }
    if (event.key === 'Escape') {
      if (themeDraft) { themeDraft = null; renderOverlay(); $('create-theme')?.focus(); return; }
      if (popoverKind) closePopover();
      else if (!$('suggestions').hidden) hideSuggestions();
      else if (!$('findbar').hidden) closeFind();
      else if (!$('overlay').hidden && state?.setupComplete) closeOverlay();
      else if (state?.sidePanel) rt.closeSidePanel();
    }
  });
  rt.onCursor((type) => {
    document.documentElement.style.cursor = !type || type === 'default' || type === 'null' ? '' : type;
  });
  $('resize').addEventListener('mousedown', startResize);
  $('split-swap').onclick = () => rt.swapSplit();
  $('split-close').onclick = () => rt.closeSplit();
  $('split-primary').onclick = () => rt.selectTab(state.activeTabId);
  $('split-secondary').onclick = () => rt.selectTab(state.split.tabId);
  $('split-handle').addEventListener('pointerdown', startSplitResize);
  $('split-handle').addEventListener('dblclick', () => rt.setSplitRatio(0.5));
  $('split-handle').addEventListener('keydown', (event) => {
    if (!state?.split || !['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return;
    event.preventDefault();
    rt.setSplitRatio(event.key === 'Home' ? 0.5 : state.split.ratio + (event.key === 'ArrowLeft' ? -0.02 : 0.02));
  });
  new ResizeObserver(reportLayout).observe($('chrome-top'));
  new ResizeObserver(reportLayout).observe($('chrome-bottom'));
  new ResizeObserver(reportLayout).observe($('sidebar'));
}

function startSplitResize(event) {
  if (!state?.split || event.button !== 0) return;
  event.preventDefault();
  const handle = $('split-handle');
  handle.setPointerCapture(event.pointerId);
  const move = (ev) => {
    const sidebar = $('sidebar').offsetWidth;
    const width = window.innerWidth - sidebar;
    const ratio = Math.min(0.78, Math.max(0.22, (ev.clientX - sidebar + 4) / width));
    rt.setSplitRatio(ratio);
  };
  const up = () => {
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('lostpointercapture', up);
    handle.removeEventListener('pointerup', finish);
    handle.removeEventListener('pointercancel', finish);
  };
  const finish = () => {
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    up();
  };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('lostpointercapture', up);
  handle.addEventListener('pointerup', finish);
  handle.addEventListener('pointercancel', finish);
}

function openShortcut(url, event) {
  if (event.metaKey || event.ctrlKey) rt.openUrl(url, { newTab: true });
  else rt.openUrl(url, { newTab: false });
}

function reportLayout() {
  const top = $('chrome-top').offsetHeight;
  document.documentElement.style.setProperty('--chrome-h', `${top}px`);
  rt.setLayout({
    top,
    bottom: $('chrome-bottom').offsetHeight,
    sidebar: $('sidebar').offsetWidth,
  });
}

function startResize(event) {
  draggingResize = true;
  $('sidebar').classList.add('resizing');
  const move = (ev) => {
    const width = Math.round(ev.clientX);
    if (width < 140) {
      document.body.classList.add('collapsed');
      document.documentElement.style.setProperty('--sidebar-w', `${SIDEBAR_COLLAPSED_PX}px`);
      rt.setSidebar({ sidebarCollapsed: true });
    } else {
      const clamped = Math.max(200, Math.min(420, width));
      document.body.classList.remove('collapsed');
      document.documentElement.style.setProperty('--sidebar-w', `${clamped}px`);
      rt.setSidebar({ sidebarCollapsed: false, sidebarWidth: clamped });
    }
  };
  const up = () => {
    draggingResize = false;
    $('sidebar').classList.remove('resizing');
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
  };
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
}

function apply() {
  if (!state) return;
  Themes.apply(document.documentElement, state.resolvedTheme || currentTheme());
  document.documentElement.dataset.private = state.private ? 'true' : 'false';
  document.body.dataset.fullscreen = state.fullscreen ? 'true' : 'false';
  document.body.classList.toggle('collapsed', !!state.settings.sidebarCollapsed);
  if (!draggingResize) {
    const width = state.settings.sidebarCollapsed ? SIDEBAR_COLLAPSED_PX : state.settings.sidebarWidth;
    document.documentElement.style.setProperty('--sidebar-w', `${width}px`);
  }
  $('back').disabled = !state.canGoBack;
  $('forward').disabled = !state.canGoForward;
  $('reload').innerHTML = state.loading ? icons.stop : icons.reload;
  $('reload').title = state.loading ? 'Stop' : 'Reload';
  $('loading-bar').hidden = !state.loading;
  // The address bar is the source of truth for the active tab. In particular,
  // navigation can complete while the field still has focus (for example after
  // pressing Enter on a remembered-link suggestion), so do not leave the old
  // typed prefix visible.
  $('address').value = state.url || '';
  const customEngine = (state.settings.customSearchEngines || []).find((item) => item.id === state.settings.searchEngine);
  const engine = engineNames[state.settings.searchEngine] || customEngine?.name || 'Google';
  $('address').placeholder = `Search ${engine} or enter address`;
  if (!state.url) {
    $('security').innerHTML = '<img class="home-mark" src="newtab/logo.png" alt="">';
    $('security').classList.remove('secure');
  } else {
    $('security').innerHTML = state.url.startsWith('https://') ? icons.lock : icons.globe;
    $('security').classList.toggle('secure', state.url.startsWith('https://'));
  }
  $('star').innerHTML = state.bookmarked ? icons.starFill : icons.star;
  $('star').style.color = state.bookmarked ? 'var(--accent)' : '';
  const zoom = Math.round((state.zoom || 1) * 100);
  $('zoom-reset').hidden = zoom === 100;
  $('zoom-reset').textContent = `${zoom}%`;
  $('passwords').hidden = !state.savedLoginCount;
  $('private-pill').hidden = !state.private;
  $('collapse').innerHTML = icons.hamburger;
  $('collapse').title = state.settings.sidebarCollapsed ? 'Expand tabs' : 'Collapse tabs';
  $('collapse').dataset.label = state.settings.sidebarCollapsed ? 'Expand' : 'Collapse';
  renderBookmarks();
  if (!draggingTab) renderTabs();
  const recovery = $('recovery');
  if (state.recovery) {
    recovery.hidden = false;
    recovery.replaceChildren();
    const text = document.createElement('span');
    text.textContent = state.recovery;
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.textContent = 'Dismiss';
    dismiss.onclick = () => rt.dismissRecovery();
    recovery.append(text, dismiss);
  } else recovery.hidden = true;
  $('split-toolbar').hidden = !state.split;
  const splitHandle = $('split-handle');
  if (state.split) {
    for (const [id, tabId, pane] of [['split-primary', state.activeTabId, 'primary'], ['split-secondary', state.split.tabId, 'secondary']]) {
      const button = $(id);
      const tab = state.tabs.find((item) => item.id === tabId);
      button.textContent = `${pane === 'primary' ? 'Left' : 'Right'}: ${tab?.title || 'New Tab'}`;
      button.setAttribute('aria-pressed', String(state.split.focused === pane));
    }
    splitHandle.setAttribute('aria-valuenow', String(Math.round(state.split.ratio * 100)));
    const sidebar = $('sidebar').offsetWidth;
    const top = $('chrome-top').offsetHeight;
    const content = window.innerWidth - sidebar;
    splitHandle.hidden = false;
    splitHandle.style.top = `${top}px`;
    splitHandle.style.bottom = `${$('chrome-bottom').offsetHeight}px`;
    splitHandle.style.left = `${sidebar + Math.round(content * state.split.ratio - 4)}px`;
  } else splitHandle.hidden = true;
  renderPermission();
  const controls = $('extension-control');
  controls.replaceChildren();
  for (const attachment of state.debuggerAttachments || []) {
    const row = document.createElement('div');
    const label = document.createElement('span');
    label.textContent = `${attachment.name} is controlling a tab`;
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = 'Disconnect';
    button.onclick = () => rt.disconnectDebugger(attachment.tabId);
    row.append(label, button); controls.append(row);
  }
  controls.hidden = !controls.childElementCount;
  $('downloads-button').classList.toggle('busy', state.downloads.some((item) => item.state === 'progressing'));
  $('downloads-button').classList.toggle('open', popoverKind === 'downloads');
  $('menu-button').classList.toggle('open', popoverKind === 'menu');
  $('extensions-button').classList.toggle('open', popoverKind === 'extensions');
  renderExtensionChrome();
  if (popoverKind === 'downloads') renderDownloadsPopover();
  if (popoverKind === 'extensions') {
    const key = `${state.private}:${state.sidePanel?.installId || ''}:${(state.extensions || []).map((ext) => `${ext.installId}:${ext.enabled}:${ext.pinned}:${ext.loaded}:${ext.error}`).join('|')}`;
    if (key !== extensionMenuKey) {
      extensionMenuKey = key;
      renderExtensionsPopover();
    }
  }
  renderShelf();
  reportLayout();
  if (!state.setupComplete && !screen) openOverlay('welcome');
  else if (!state.private && !state.settings.importOffered && !screen && !importAutoOpened) {
    importAutoOpened = true;
    showImport();
  }
}

function renderBookmarks() {
  const bar = $('bookmarks');
  const list = $('bookmark-items');
  const mode = state.settings.bookmarkBarMode || (state.settings.showBookmarkBar === false ? 'hidden' : 'complex');
  const items = state.bookmarks?.bar || [];
  bar.hidden = mode === 'hidden';
  bar.dataset.mode = mode;
  list.replaceChildren();
  if (bar.hidden) return;
  // Simple mode is intentionally predictable: the first six bar entries are
  // the user's existing favourites, rendered without the dense separators.
  for (const item of (mode === 'simple' ? items.slice(0, 6) : items)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'bookmark';
    button.title = item.type === 'url' ? item.url : item.title;
    const icon = document.createElement('img');
    icon.className = 'bookmark-icon';
    icon.alt = '';
    icon.referrerPolicy = 'no-referrer';
    const primaryIcon = bookmarkLogo(item);
    const backupIcon = item.type === 'url' ? siteIcon(item.url, 32) : '';
    icon.src = primaryIcon;
    let triedBackup = !primaryIcon || primaryIcon === backupIcon;
    icon.onerror = () => {
      if (!triedBackup && backupIcon) {
        triedBackup = true;
        icon.src = backupIcon;
        return;
      }
      icon.remove();
    };
    const label = document.createElement('span');
    label.textContent = item.title;
    button.append(icon, label);
    button.onclick = (event) => {
      if (item.type === 'folder') rt.openBookmarkMenu(item.id);
      else if (event.metaKey || event.ctrlKey) rt.openUrl(item.url, { newTab: true });
      else rt.openUrl(item.url);
    };
    list.append(button);
  }
}

function siteIcon(url, size = 64) {
  try {
    const name = new URL(url).hostname;
    if (!name) return '';
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(name)}&sz=${size}`;
  } catch {
    return '';
  }
}

function bookmarkLogo(item) {
  if (item.type === 'folder') {
    return 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="%235f6368" d="M2 3.5A1.5 1.5 0 0 1 3.5 2h3l1.2 1.5H12.5A1.5 1.5 0 0 1 14 5v7.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-9Z"/></svg>');
  }
  if (item.favicon && /^(https?:|data:image\/)/.test(item.favicon)) return item.favicon;
  return siteIcon(item.url, 32);
}

function renderTabs() {
  const root = $('tabs');
  const scroll = root.scrollTop;
  root.replaceChildren();
  const query = tabQuery.trim().toLowerCase();
  const inSpace = state.tabs.filter((tab) => tab.spaceId === state.activeSpaceId);
  const visibleTabs = query
    ? inSpace.filter((tab) => `${tab.title} ${tab.url}`.toLowerCase().includes(query))
    : inSpace;
  let previousGroup = null;
  for (const tab of visibleTabs) {
    if (tab.pinned) {
      root.append(tabRow(tab));
      previousGroup = null;
      continue;
    }
    if (tab.groupId && tab.groupId !== previousGroup) {
      const group = state.groups.find((item) => item.id === tab.groupId && item.spaceId === state.activeSpaceId);
      if (group) root.append(groupHeader(group));
    }
    previousGroup = tab.groupId;
    const group = state.groups.find((item) => item.id === tab.groupId && item.spaceId === state.activeSpaceId);
    if (group?.collapsed) continue;
    const row = tabRow(tab);
    if (group) row.classList.add('in-group');
    root.append(row);
  }
  root.scrollTop = scroll;
  const active = root.querySelector('.tab.active');
  if (active) active.scrollIntoView({ block: 'nearest' });
}


function groupHeader(group) {
  const header = document.createElement('div');
  header.className = `group-header group ${group.color || 'blue'}`;
  const dot = document.createElement('i');
  dot.className = 'group-dot';
  const name = document.createElement('span');
  name.className = 'group-name';
  name.textContent = group.name || 'Group';
  name.ondblclick = () => renameGroup(header, group, name);
  const toggle = document.createElement('button');
  toggle.className = 'group-toggle';
  toggle.innerHTML = group.collapsed ? icons.forward : icons.back;
  toggle.onclick = (event) => { event.stopPropagation(); rt.toggleGroup(group.id); };
  header.append(dot, name, toggle);
  header.onclick = () => rt.toggleGroup(group.id);
  header.oncontextmenu = (event) => { event.preventDefault(); rt.showGroupMenu(group.id); };
  header.addEventListener('dragover', (event) => event.preventDefault());
  header.addEventListener('drop', (event) => {
    event.preventDefault();
    const id = event.dataTransfer.getData('text/plain');
    if (id) rt.placeInGroup(id, group.id);
  });
  return header;
}

function renameGroup(header, group, name) {
  const input = document.createElement('input');
  input.className = 'group-name-input';
  input.value = group.name;
  name.replaceWith(input);
  input.focus();
  input.select();
  const finish = (save) => {
    if (save) rt.renameGroup(group.id, input.value);
    else renderTabs();
  };
  input.onkeydown = (event) => {
    if (event.key === 'Enter') finish(true);
    if (event.key === 'Escape') finish(false);
  };
  input.onblur = () => finish(true);
}

function startPageMark() {
  const icon = document.createElement('img');
  icon.className = 'favicon home-mark';
  icon.alt = '';
  icon.draggable = false;
  icon.src = 'newtab/logo.png';
  return icon;
}

function tabIcon(tab) {
  const directIcon = tab.favicon && /^(https?:|data:image\/)/.test(tab.favicon) ? tab.favicon : '';
  const backupIcon = siteIcon(tab.url);
  const icon = document.createElement(directIcon || backupIcon ? 'img' : 'span');
  icon.className = directIcon || backupIcon ? 'favicon' : 'favicon-fallback';
  if (directIcon || backupIcon) {
    icon.alt = '';
    icon.referrerPolicy = 'no-referrer';
    icon.src = directIcon || backupIcon;
    let triedBackup = !directIcon;
    icon.onerror = () => {
      if (!triedBackup && backupIcon) {
        triedBackup = true;
        icon.src = backupIcon;
        return;
      }
      const fallback = document.createElement('span');
      fallback.className = 'favicon-fallback';
      fallback.innerHTML = icons.globe;
      icon.replaceWith(fallback);
    };
  } else icon.innerHTML = icons.globe;
  return icon;
}

function tabRow(tab) {
  const row = document.createElement('button');
  row.type = 'button';
  const focusedId = state.split?.focused === 'secondary' ? state.split.tabId : state.activeTabId;
  row.className = `tab${tab.id === focusedId ? ' active' : ''}`;
  if (state.split && [state.activeTabId, state.split.tabId].includes(tab.id)) row.title = `${tab.title} — ${tab.id === state.activeTabId ? 'Left' : 'Right'} pane`;
  row.draggable = true;
  const icon = tab.url ? tabIcon(tab) : startPageMark();
  const title = document.createElement('span');
  title.className = 'tab-title';
  title.textContent = tab.title || tab.url || 'New Tab';
  row.append(icon, title);
  if (tab.audible || tab.muted) {
    const speaker = document.createElement('i');
    speaker.className = 'speaker';
    speaker.textContent = tab.muted ? '🔇' : '🔊';
    row.append(speaker);
  }
  const close = document.createElement('span');
  close.className = 'tab-close';
  close.innerHTML = icons.close;
  close.onclick = (event) => { event.stopPropagation(); rt.closeTab(tab.id); };
  row.append(close);
  row.onclick = () => rt.selectTab(tab.id);
  row.onauxclick = (event) => { if (event.button === 1) rt.closeTab(tab.id); };
  row.oncontextmenu = (event) => { event.preventDefault(); rt.showTabMenu(tab.id); };
  row.ondragstart = (event) => {
    draggingTab = true;
    event.dataTransfer.setData('text/plain', tab.id);
    event.dataTransfer.effectAllowed = 'move';
  };
  row.ondragend = () => { draggingTab = false; renderTabs(); };
  row.ondragover = (event) => {
    event.preventDefault();
    const after = event.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2;
    row.classList.toggle('drop-after', after);
    row.classList.toggle('drop-before', !after);
  };
  row.ondragleave = () => row.classList.remove('drop-after', 'drop-before');
  row.ondrop = (event) => {
    event.preventDefault();
    const from = event.dataTransfer.getData('text/plain');
    const after = event.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2;
    const visible = [...state.tabs].filter((item) => {
      if (item.pinned || !item.groupId) return true;
      const group = state.groups.find((candidate) => candidate.id === item.groupId);
      return !group?.collapsed;
    });
    const index = visible.findIndex((item) => item.id === tab.id);
    const beforeId = after ? visible[index + 1]?.id || null : tab.id;
    if (from) rt.moveTab(from, beforeId);
  };
  return row;
}

function renderPermission() {
  const bar = $('permission');
  if (!state.permission) { bar.hidden = true; return; }
  bar.hidden = false;
  bar.replaceChildren();
  const text = document.createElement('span');
  text.textContent = state.permission.message;
  const actions = document.createElement('div');
  actions.className = 'prompt-actions';
  const allow = document.createElement('button');
  allow.type = 'button';
  allow.className = 'prompt-allow';
  allow.textContent = state.permission.kind === 'protocol' ? 'Open' : 'Allow';
  allow.onclick = () => rt.replyPermission(state.permission.id, true);
  const block = document.createElement('button');
  block.type = 'button';
  block.className = 'prompt-block';
  block.textContent = state.permission.kind === 'protocol' ? 'Cancel' : 'Block';
  block.onclick = () => rt.replyPermission(state.permission.id, false);
  actions.append(allow, block);
  bar.append(text, actions);
}

function togglePopover(kind) {
  if (popoverKind === kind) closePopover();
  else openPopover(kind);
}

function anchorBelow(el, width, align) {
  const rect = el.getBoundingClientRect();
  const x = align === 'right' ? rect.right - width : rect.left;
  return { x: Math.round(x), y: Math.round(rect.bottom + 6), width: Math.round(width), align };
}

function openPopover(kind) {
  popoverKind = kind;
  $('suggestions').hidden = true;
  $('popover-slot').hidden = true;
  if (kind === 'downloads') renderDownloadsPopover();
  if (kind === 'menu') renderMenuPopover();
  if (kind === 'extensions') renderExtensionsPopover();
  $('downloads-button').classList.toggle('open', kind === 'downloads');
  $('menu-button').classList.toggle('open', kind === 'menu');
  $('extensions-button').classList.toggle('open', kind === 'extensions');
}

function closePopover() {
  const was = popoverKind;
  popoverKind = '';
  extensionMenuKey = '';
  $('downloads-button').classList.remove('open');
  $('menu-button').classList.remove('open');
  $('extensions-button').classList.remove('open');
  if (was) rt.closeFloat();
}

function renderDownloadsPopover() {
  const items = state.downloads.slice(0, downloadsOpen ? 20 : 4);
  const button = $('downloads-button');
  const width = 380;
  const height = 108 + Math.max(items.length, 1) * 68;
  rt.openFloat({
    kind: 'downloads',
    ...anchorBelow(button, width, 'right'),
    height,
    expanded: downloadsOpen,
    items,
  });
}

function renderExtensionsPopover() {
  const button = $('extensions-button');
  const count = state.private ? 1 : Math.max((state.extensions || []).length, 1);
  rt.openFloat({
    kind: 'extensions',
    ...anchorBelow(button, 360, 'right'),
    height: 132 + count * 58,
    private: !!state.private,
    extensions: state.private ? [] : (state.extensions || []),
    sidePanelId: state.sidePanel?.installId || '',
  });
}

function renderExtensionChrome() {
  const pins = $('extension-pins');
  const chatgpt = state.private ? null : (state.extensions || []).find((ext) => ext.enabled && ext.loaded && ext.hasSidePanel && /^chatgpt$/i.test(ext.name.trim()));
  const chatButton = $('chatgpt-panel');
  // The Chrome extension's iframe panel is not compatible with Electron, so
  // ChatGPT uses a native RightTab panel backed by the same signed-in session.
  const chatOpen = state.sidePanel?.installId === 'chatgpt-direct';
  chatButton.hidden = !chatgpt;
  chatButton.classList.toggle('active', chatOpen);
  chatButton.setAttribute('aria-pressed', String(chatOpen));
  chatButton.title = chatOpen ? 'Close ChatGPT side panel' : 'Open ChatGPT side panel';
  chatButton.setAttribute('aria-label', chatButton.title);
  chatButton.innerHTML = chatgpt ? extensionIconHtml(chatgpt) : '';
  chatButton.onclick = chatgpt ? () => rt.openChatGPTPanel() : null;
  const list = state.private ? [] : (state.extensions || []).filter((ext) => ext.enabled && ext.pinned && ext.installId !== chatgpt?.installId);
  pins.replaceChildren();
  pins.hidden = !list.length;
  for (const ext of list) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tray-item extension-pin';
    button.title = ext.name;
    button.setAttribute('aria-label', ext.name);
    button.innerHTML = extensionIconHtml(ext);
    button.onclick = () => {
      const rect = button.getBoundingClientRect();
      rt.openExtension({ installId: ext.installId, kind: 'popup', x: Math.round(rect.left), y: Math.round(rect.bottom + 6) });
    };
    pins.append(button);
  }
  const close = $('side-panel-close');
  const panel = !state.private && state.sidePanel ? state.sidePanel : null;
  const scoutOpen = panel?.installId === 'creator-scout';
  const scoutButton = $('creator-scout-button');
  scoutButton.hidden = !!state.private;
  scoutButton.classList.toggle('active', scoutOpen);
  scoutButton.setAttribute('aria-pressed', String(scoutOpen));
  close.hidden = !panel || chatOpen || scoutOpen;
  const closeLabel = panel ? `Close ${panel.name}` : 'Close panel';
  close.title = closeLabel;
  close.setAttribute('aria-label', closeLabel);
}

function extensionIconHtml(ext) {
  if (ext?.icon && String(ext.icon).startsWith('data:image/')) return `<img alt="" src="${esc(ext.icon)}">`;
  const letter = esc(String(ext?.name || 'Extension').trim().charAt(0).toUpperCase() || 'E');
  return `<span class="ext-letter">${letter}</span>`;
}

function supportLabel(support) {
  if (support === 'yes') return 'Supported';
  if (support === 'partial') return 'Partial';
  return 'Not available';
}

function renderMenuPopover() {
  const button = $('menu-button');
  const width = 240;
  rt.openFloat({
    kind: 'menu',
    ...anchorBelow(button, width, 'right'),
    height: 12 + 12 * 36,
    items: [
      { command: 'open-settings', label: 'Settings' },
      { command: 'open-appearance', label: 'Appearance' },
      { command: 'open-history', label: 'History' },
      { command: 'open-bookmarks', label: 'Bookmarks' },
      { command: 'open-passwords', label: 'Passwords' },
      { command: 'open-google', label: 'Open Google' },
      { command: 'open-import', label: 'Import from Chrome' },
      { command: 'split-chatgpt', label: 'Split ChatGPT to the side' },
      { command: 'reopen-tab', label: 'Reopen closed tab' },
      { command: 'swap-split', label: 'Swap split sides' },
      { command: 'close-split', label: 'Close split view' },
      { command: 'new-window', label: 'New window' },
      { command: 'new-private-window', label: 'New private window' },
    ],
  });
}

function timeAgo(stamp) {
  if (!stamp) return '';
  const minutes = Math.max(0, Date.now() - stamp) / 60000;
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${Math.round(minutes)} min ago`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)} hours ago`;
  const days = hours / 24;
  return `${Math.round(days)} days ago`;
}

function renderShelf() {
  $('shelf').hidden = true;
}

function addMini(row, label, action) {
  const button = document.createElement('button');
  button.className = 'text-button';
  button.textContent = label;
  button.onclick = action;
  row.append(button);
}

function formatBytes(value) {
  if (!value) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unit = 0;
  while (size > 1024 && unit < units.length - 1) { size /= 1024; unit += 1; }
  return `${size.toFixed(size > 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

async function onAddressInput() {
  const query = $('address').value;
  if (!query.trim()) {
    hideSuggestions();
    return;
  }
  const results = await rt.suggest(query);
  // Suggestions are asynchronous; do not let an earlier keystroke replace
  // the matches for the text that is currently in the address bar.
  if ($('address').value !== query) return;
  suggestions = results;
  suggestionIndex = suggestions.length ? 0 : -1;
  renderSuggestions();
}

function renderSuggestions() {
  $('suggestions').hidden = true;
  if (!suggestions.length || document.activeElement !== $('address')) {
    if (popoverKind === 'suggestions') closePopover();
    return;
  }
  popoverKind = 'suggestions';
  $('downloads-button').classList.remove('open');
  $('menu-button').classList.remove('open');
  const omnibox = $('omnibox');
  const width = omnibox.getBoundingClientRect().width;
  rt.openFloat({
    kind: 'suggestions',
    ...anchorBelow(omnibox, width, 'left'),
    height: 8 + suggestions.length * 36,
    selected: suggestionIndex,
    items: suggestions.map((item) => ({
      kind: item.kind,
      title: item.title,
      detail: item.detail || '',
      url: item.url,
    })),
  });
}

function onAddressKey(event) {
  if (event.isComposing) return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    if (!suggestions.length) return;
    event.preventDefault();
    suggestionIndex = (suggestionIndex + (event.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length;
    renderSuggestions();
  } else if (event.key === 'Enter' && suggestionIndex >= 0 && suggestions[suggestionIndex]) {
    event.preventDefault();
    acceptSuggestion(suggestions[suggestionIndex]);
  } else if (event.key === 'Escape') {
    hideSuggestions();
    $('address').value = state.url || '';
    $('address').blur();
  }
}

function acceptSuggestion(item) {
  hideSuggestions();
  rt.openUrl(item.url);
  rt.focusPage();
}

function hideSuggestions() {
  suggestions = [];
  suggestionIndex = -1;
  $('suggestions').hidden = true;
}

function openFind() {
  $('findbar').hidden = false;
  $('find-input').focus();
  $('find-input').select();
  reportLayout();
}

function closeFind() {
  $('findbar').hidden = true;
  findText = '';
  rt.find({ text: '' });
  reportLayout();
}

function runFind(again, forward = true) {
  findText = $('find-input').value;
  rt.find({ text: findText, again, forward });
}

function showImport() {
  importAutoOpened = true;
  openOverlay('import');
  loadProfiles();
}

function rememberImportSeen() {
  if (!state?.settings?.importOffered) rt.setSetting({ importOffered: true });
  if (state?.settings) state.settings.importOffered = true;
}

function openOverlay(next) {
  screen = next;
  $('overlay').hidden = false;
  renderOverlay();
  $('overlay').setAttribute('role', 'dialog');
  $('overlay').setAttribute('aria-modal', 'true');
  $('overlay').setAttribute('aria-label', next === 'settings' ? 'Settings' : next);
  $('overlay').querySelector('button, input, select')?.focus();
  rt.setOverlay(true).then((snapshot) => {
    if (!$('overlay').hidden && screen === next) showPageSnapshot(snapshot?.pages || []);
  }).catch(() => { /* the dialog still works if a page cannot be captured */ });
}

function closeOverlay() {
  if (screen === 'import') rememberImportSeen();
  themeDraft = null;
  screen = '';
  $('overlay').hidden = true;
  clearPageSnapshot();
  rt.setOverlay(false);
  $('profile-button').focus();
}

function showPageSnapshot(pages) {
  const layer = $('page-snapshot');
  layer.replaceChildren();
  for (const page of pages) {
    if (!page?.image || !Number.isFinite(page.width) || !Number.isFinite(page.height)) continue;
    const image = document.createElement('img');
    image.src = page.image;
    image.style.left = `${page.x}px`;
    image.style.top = `${page.y}px`;
    image.style.width = `${page.width}px`;
    image.style.height = `${page.height}px`;
    layer.append(image);
  }
  layer.hidden = !layer.childElementCount;
}

function clearPageSnapshot() {
  const layer = $('page-snapshot');
  layer.hidden = true;
  layer.replaceChildren();
}

function renderOverlay() {
  const overlay = $('overlay');
  if (screen === 'welcome') overlay.innerHTML = welcomeHtml();
  else if (screen === 'settings') overlay.innerHTML = settingsHtml();
  else if (screen === 'history') { overlay.innerHTML = sheet('History', '<div id="history-list" class="list"></div>'); loadHistory(''); }
  else if (screen === 'bookmarks') overlay.innerHTML = bookmarksHtml();
  else if (screen === 'passwords') { overlay.innerHTML = passwordsHtml(); loadPasswords(); }
  else if (screen === 'import') overlay.innerHTML = importHtml();
  else if (screen === 'shortcuts') overlay.innerHTML = shortcutsHtml();
  else overlay.innerHTML = '';
  overlay.querySelectorAll('[data-action]').forEach((node) => {
    node.addEventListener('click', () => overlayAction(node.dataset.action, node.dataset.arg || '', node));
  });
  overlay.querySelectorAll('[data-pane]').forEach((node) => {
    node.addEventListener('click', () => { settingsPane = node.dataset.pane; renderOverlay(); });
  });
  overlay.querySelectorAll('input[name="startup"]').forEach((node) => {
    node.addEventListener('change', () => rt.setSetting({ startupPage: node.value }));
  });
  const search = overlay.querySelector('#search-engine');
  if (search) search.onchange = () => rt.setSetting({ searchEngine: search.value });
  const newTabPage = overlay.querySelector('#new-tab-page');
  if (newTabPage) newTabPage.onchange = () => rt.setSetting({ newTabPage: newTabPage.value });
  const restore = overlay.querySelector('#restore-session');
  if (restore) restore.onchange = () => rt.setSetting({ restoreSession: restore.checked });
  bindThemes();
  const bookmarks = overlay.querySelector('#show-bookmarks');
  if (bookmarks) bookmarks.onchange = () => rt.setSetting({ showBookmarkBar: bookmarks.checked });
  const bookmarkMode = overlay.querySelector('#bookmark-bar-mode');
  if (bookmarkMode) bookmarkMode.onchange = () => rt.setSetting({ bookmarkBarMode: bookmarkMode.value, showBookmarkBar: bookmarkMode.value !== 'hidden' });
  const ask = overlay.querySelector('#ask-download');
  if (ask) ask.onchange = () => rt.setSetting({ askWhereToSave: ask.checked });
  const dnt = overlay.querySelector('#dnt');
  if (dnt) dnt.onchange = () => rt.setSetting({ doNotTrack: dnt.checked });
  const https = overlay.querySelector('#https-only');
  if (https) https.onchange = () => rt.setSetting({ httpsOnly: https.checked });
  const historyQuery = overlay.querySelector('#history-query');
  if (historyQuery) historyQuery.oninput = () => loadHistory(historyQuery.value);
  const profile = overlay.querySelector('#chrome-profile');
  if (profile) profile.onchange = () => { importProfileId = profile.value; loadPreview(); };
  overlay.querySelectorAll('[data-import]').forEach((node) => {
    node.addEventListener('change', () => { importSelections[node.dataset.import] = node.checked; });
  });
  overlay.querySelectorAll('[data-extension-toggle]').forEach((node) => {
    node.addEventListener('change', () => rt.setExtensionEnabled({ installId: node.dataset.extensionToggle, enabled: node.checked }));
  });
  if (screen === 'settings' && settingsPane === 'passwords') loadPasswords();
}

function overlayAction(action, arg, node) {
  if (action === 'close') closeOverlay();
  if (action === 'start') {
    rt.setSetting({ completedSetup: true });
    state.setupComplete = true;
    closeOverlay();
  }
  if (action === 'open-import') showImport();
  if (action === 'open-settings') { screen = 'settings'; renderOverlay(); }
  if (action === 'choose-download') rt.chooseDownloadDir();
  if (action === 'clear-history') rt.clearHistory().then(() => loadHistory(''));
  if (action === 'clear-cache') rt.clearData({ cache: true });
  if (action === 'reset-permissions') rt.resetPermissions();
  if (action === 'clear-cookies') {
    if (confirm('This signs you out of sites in RightTab. Chrome is not affected.')) rt.clearData({ cookies: true });
  }
  if (action === 'add-bookmark') {
    const url = prompt('Bookmark address');
    if (url) rt.addBookmark({ title: prompt('Name', url) || url, url });
  }
  if (action === 'add-folder') {
    const title = prompt('Folder name', 'Folder');
    if (title) rt.addBookmark({ type: 'folder', title });
  }
  if (action === 'remove-bookmark') rt.removeBookmark(arg);
  if (action === 'delete-history') rt.deleteHistory(arg).then(() => loadHistory($('history-query')?.value || ''));
  if (action === 'open-history') { rt.openUrl(arg); closeOverlay(); }
  if (action === 'add-password') addPassword();
  if (action === 'delete-password') rt.deletePassword(arg).then(loadPasswords);
  if (action === 'reveal-password') revealPassword(arg);
  if (action === 'import-csv') rt.importPasswordCsv().then((result) => { alert(passwordCsvMessage(result)); loadPasswords(); });
  if (action === 'run-import') runImport();
  if (action === 'pane') { settingsPane = arg; renderOverlay(); }
  if (action === 'pick-extension') pickExtension();
  if (action === 'confirm-extension') confirmExtension();
  if (action === 'cancel-extension') { extensionReview = null; rt.cancelExtension(); renderOverlay(); }
  if (action === 'pin-extension') rt.pinExtension(arg, node?.dataset.pinned === '1');
  if (action === 'remove-extension' && confirm('Remove this extension from RightTab? Data it stored in this browser is deleted with it.')) rt.removeExtension(arg);
  if (action === 'open-extension') {
    const rect = node.getBoundingClientRect();
    rt.openExtension({
      installId: arg,
      kind: node?.dataset.kind || 'popup',
      x: Math.round(rect.left),
      y: Math.round(rect.bottom + 6),
    }).then((result) => {
      if (result?.ok) closeOverlay();
      else if (result?.error) {
        extensionReview = { ok: false, error: result.error, preview: null };
        renderOverlay();
      }
    });
  }
}

function welcomeHtml() {
  return `<div class="sheet narrow"><div class="sheet-body">
    <h2>Welcome to RightTab</h2>
    <p class="lede">Tabs stay on the right. New tabs open the RightTab start page. You can launch with that page, ChatGPT, or Google.</p>
    ${startupChoices()}
    <p class="note">The address bar is separate. A web address opens that site. Other text searches Google unless you change the search engine in Settings.</p>
    <div class="actions-row">
      <button class="primary" data-action="start">Start browsing</button>
      <button class="secondary" data-action="open-import">Import from Chrome</button>
    </div>
  </div></div>`;
}

const destinationMarks = {
  righttab: '<span class="choice-logo righttab-logo"><img src="newtab/logo.png" alt=""></span>',
  chatgpt: '<span class="choice-logo chatgpt-logo" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.142-.081 4.778-2.758a.795.795 0 0 0 .393-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.495 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.677l5.814 3.354-2.02 1.169a.076.076 0 0 1-.071 0l-4.83-2.787A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855-5.833-3.387 2.015-1.165a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.666zm2.01-3.023-.142-.085-4.773-2.782a.776.776 0 0 0-.785 0L9.41 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zM8.307 12.863l-2.02-1.164a.08.08 0 0 1-.038-.057V6.074a4.5 4.5 0 0 1 7.376-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365 2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg></span>',
  google: '<span class="choice-logo google-logo" aria-hidden="true"><svg viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg></span>',
};

function settingsGlyph(inner, filled = false) {
  const fill = filled ? '' : ' fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';
  return `<svg viewBox="0 0 24 24" width="18" height="18"${fill} aria-hidden="true">${inner}</svg>`;
}

const settingsIcons = {
  startup: settingsGlyph('<path d="M4.5 11 12 4.5 19.5 11"/><path d="M7 10.2V19h10v-8.8"/>'),
  appearance: settingsGlyph('<circle cx="12" cy="12" r="7.25" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 4.75a7.25 7.25 0 0 0 0 14.5z" fill="currentColor"/>', true),
  extensions: settingsGlyph('<path d="M8 4h4a2 2 0 0 1 2 2 2 2 0 1 0 4 0V4h2v6h-2a2 2 0 1 0 0 4h2v6H4v-4a2 2 0 1 0 0-4H4V8h4a2 2 0 1 0 0-4Z"/>'),
  privacy: settingsGlyph('<path d="M12 3.5 5.5 6v5.2c0 4.2 2.7 6.5 6.5 8.3 3.8-1.8 6.5-4.1 6.5-8.3V6L12 3.5z"/>'),
  passwords: settingsGlyph('<circle cx="8" cy="14" r="3.2"/><path d="M11 14h9l-1.6 1.8 1.6 1.8"/>'),
  import: settingsGlyph('<path d="M12 4v9"/><path d="m8 10 4 4 4-4"/><path d="M5 19h14"/>'),
  shortcuts: settingsGlyph('<path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/>'),
  close: settingsGlyph('<path d="M7 7l10 10M17 7 7 17"/>'),
};

function settingsHead(title, lede) {
  return `<header class="settings-head"><h2>${esc(title)}</h2><p class="lede">${esc(lede)}</p></header>`;
}

function settingsBlock(title, detail, body) {
  return `<section class="settings-block"><div class="settings-block-label"><h3>${esc(title)}</h3>${detail ? `<p>${esc(detail)}</p>` : ''}</div>${body}</section>`;
}

function startupChoices() {
  const current = state.settings.startupPage;
  const options = [
    ['righttab', 'RightTab', 'Start page'],
    ['chatgpt', 'ChatGPT', 'chatgpt.com'],
    ['google', 'Google', 'google.com'],
  ];
  return `<div class="choice-grid">${options.map(([value, name, detail]) => `<label class="choice ${current === value ? 'selected' : ''}"><input type="radio" name="startup" value="${value}" ${current === value ? 'checked' : ''}>${destinationMarks[value]}<span class="choice-copy"><strong>${name}</strong><span>${detail}</span></span></label>`).join('')}</div>`;
}

function settingsNavButton(id, label) {
  const selected = settingsPane === id;
  return `<button type="button" data-pane="${id}" class="${selected ? 'selected' : ''}" ${selected ? 'aria-current="page"' : ''}><span class="settings-nav-icon">${settingsIcons[id]}</span>${label}</button>`;
}

function settingsHtml() {
  return `<div class="sheet settings-sheet"><nav class="nav-col" aria-label="Settings sections">
      <div class="settings-brand"><span class="settings-brand-mark"><img src="newtab/logo.png" alt=""></span><span><strong>RightTab</strong><small>Settings</small></span></div>
      <div class="settings-nav-group"><p class="settings-nav-label">Browse</p><div class="settings-nav-items">${settingsNavButton('startup', 'Startup')}${settingsNavButton('appearance', 'Appearance')}${settingsNavButton('extensions', 'Extensions')}</div></div>
      <div class="settings-nav-group"><p class="settings-nav-label">Privacy</p><div class="settings-nav-items">${settingsNavButton('privacy', 'Search and privacy')}${settingsNavButton('passwords', 'Passwords')}</div></div>
      <div class="settings-nav-group"><p class="settings-nav-label">Library</p><div class="settings-nav-items">${settingsNavButton('import', 'Import')}${settingsNavButton('shortcuts', 'Shortcuts')}</div></div>
    </nav><div class="settings-main"><button type="button" class="settings-close" data-action="close" aria-label="Close settings">${settingsIcons.close}</button><div class="sheet-body settings-body">${settingsPaneHtml()}</div></div></div>`;
}

function settingsPaneHtml() {
  const settings = state.settings;
  if (settingsPane === 'startup') {
    const newTabPage = settings.newTabPage || 'righttab';
    return `${settingsHead('Startup and new tabs', 'A new window and a new tab can open different pages. Change either one whenever you want.')}
      ${settingsBlock('When RightTab opens', 'The first page of a new window.', startupChoices())}
      ${settingsBlock('New tabs', 'Command-T. This can stay on the start page when launch opens another site.', `<div class="settings-group"><label class="row" for="new-tab-page"><div><strong>New tab page</strong><p>RightTab, the launch page, ChatGPT, or Google.</p></div><select id="new-tab-page">
        <option value="righttab" ${newTabPage === 'righttab' ? 'selected' : ''}>RightTab start page</option>
        <option value="startup" ${newTabPage === 'startup' ? 'selected' : ''}>Same as startup</option>
        <option value="chatgpt" ${newTabPage === 'chatgpt' ? 'selected' : ''}>ChatGPT</option>
        <option value="google" ${newTabPage === 'google' ? 'selected' : ''}>Google</option>
      </select></label></div>`)}
      ${settingsBlock('Session', 'Private windows are never saved.', `<div class="settings-group"><label class="row settings-toggle-row" for="restore-session"><div><strong>Restore previous session</strong><p>Reopen your tabs when you launch RightTab.</p></div><input id="restore-session" type="checkbox" ${settings.restoreSession ? 'checked' : ''}></label></div><p class="settings-footnote">After an unexpected quit, RightTab restores your tabs either way. Reopen a closed tab with Shift–Command–T.</p>`)}`;
  }
  if (settingsPane === 'appearance') return appearanceHtml();
  if (settingsPane === 'extensions') return extensionsHtml();
  if (settingsPane === 'privacy') {
    const engines = [...Object.entries(engineNames), ...(settings.customSearchEngines || []).map((engine) => [engine.id, engine.name])];
    return `${settingsHead('Search and privacy', 'Search runs only when the address bar is not a web address. It does not change the page RightTab opens.')}
      ${settingsBlock('Address bar', 'A web address opens that site. Everything else is a search.', `<div class="settings-group"><label class="row" for="search-engine"><div><strong>Search engine</strong><p>Used from the address bar.</p></div><select id="search-engine">${engines.map(([id, label]) => `<option value="${esc(id)}" ${settings.searchEngine === id ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></label></div>`)}
      ${settingsBlock('Connection', 'These apply to pages you open in RightTab.', `<div class="settings-group"><label class="row" for="https-only"><div><strong>HTTPS only</strong><p>Addresses you type that start with http are upgraded, except localhost.</p></div><input id="https-only" type="checkbox" ${settings.httpsOnly ? 'checked' : ''}></label><label class="row" for="dnt"><div><strong>Do Not Track</strong><p>Adds a DNT header. Sites do not have to honor it.</p></div><input id="dnt" type="checkbox" ${settings.doNotTrack ? 'checked' : ''}></label></div>`)}
      ${settingsBlock('Downloads', '', `<div class="settings-group"><label class="row" for="ask-download"><div><strong>Ask where to save</strong><p>Otherwise files save to ${esc(settings.downloadDirectory || 'your Downloads folder')}.</p></div><input id="ask-download" type="checkbox" ${settings.askWhereToSave ? 'checked' : ''}></label><div class="row"><div><strong>Download folder</strong><p>${esc(settings.downloadDirectory || 'Your Downloads folder')}</p></div><button class="secondary" type="button" data-action="choose-download">Choose</button></div></div>`)}
      ${settingsBlock('On this computer', 'Chrome is not affected.', `<div class="settings-group"><div class="row"><div><strong>Browsing history</strong><p>Pages RightTab remembers.</p></div><button class="secondary" type="button" data-action="clear-history">Clear</button></div><div class="row"><div><strong>Cached files</strong><p>Stored page data, not your tabs.</p></div><button class="secondary" type="button" data-action="clear-cache">Clear</button></div><div class="row"><div><strong>Site sign-in</strong><p>Removes cookies in RightTab and signs you out of sites here.</p></div><button class="secondary quiet-danger" type="button" data-action="clear-cookies">Sign out</button></div><div class="row"><div><strong>Permission choices</strong><p>Camera, microphone, location, and the other prompts.</p></div><button class="secondary" type="button" data-action="reset-permissions">Reset</button></div></div>`)}`;
  }
  if (settingsPane === 'passwords') {
    return `${settingsHead('Passwords', 'Saved logins use your operating system’s secure storage. RightTab does not write them into your other browser, and a revealed password is shown only in this window.')}
      <div class="actions-row settings-actions"><button class="secondary" type="button" data-action="add-password">Add password</button><button class="secondary" type="button" data-action="import-csv">Import Chrome CSV</button></div>
      <p class="settings-footnote">You can import a password CSV exported from Chrome Password Manager.</p>
      <div id="password-list" class="list"></div>`;
  }
  if (settingsPane === 'import') {
    return `${settingsHead('Import browser data', 'Your source profile is only read. Nothing in it is changed, deleted, or uploaded.')}
      <div class="settings-callout"><div><strong>Bring a copy into RightTab</strong><p>Bookmarks, history, and some settings can be imported where supported. Signed-in website sessions stay in the original browser.</p></div><button class="primary" type="button" data-action="open-import">Open import</button></div>
      ${settingsBlock('Stays behind', '', unsupportedHtml())}`;
  }
  return `${settingsHead('Shortcuts', 'The same keys work in every window. Private windows included.')}${shortcutTable()}`;
}

function extensionsHtml() {
  const list = state.extensions || [];
  const review = extensionReview || null;
  return `${settingsHead('Extensions', 'RightTab can load an unpacked extension folder in a normal window. A Chrome Web Store link cannot be installed, and a packed .crx file cannot be loaded. Extensions stay off in private windows.')}
    <div class="note-card"><strong>Use an extension from Chrome</strong><p>Open chrome://extensions in Google Chrome and turn on Developer mode. Note the extension ID. Locate the extension’s files in your Chrome profile. Choose the version folder that contains manifest.json. Quit Chrome first, or copy the folder somewhere else, so Chrome is not using those files while RightTab copies them.</p></div>
    ${review ? extensionReviewHtml(review) : ''}
    <div class="actions-row settings-actions"><button class="primary" type="button" data-action="pick-extension">Load unpacked folder</button></div>
    ${list.length ? `<div class="extension-list">${list.map(extensionCard).join('')}</div>` : '<p class="settings-empty">No extensions are loaded.</p>'}
    <p class="settings-footnote">Documented Electron extension APIs are runtime messaging, local storage, scripting, part of tabs, webRequest, management, and devtools. RightTab draws pinned icons and opens popup, options, and side-panel pages itself because chrome.action and chrome.sidePanel do not control this toolbar. Context menus, chrome.commands, chrome.identity, and native messaging are not available.</p>`;
}

function extensionReviewHtml(result) {
  const preview = result.preview || {};
  const rows = (preview.permissions || []).map((item) => `<li><strong>${esc(supportLabel(item.support))}</strong> ${esc(item.title)} — ${esc(item.detail)}</li>`).join('');
  const limits = (preview.limitations || []).map((item) => `<li>${esc(item)}</li>`).join('');
  const sites = (preview.sites || []).map((item) => esc(item)).join(', ');
  return `<article class="extension-review">
    <h3>${esc(preview.name || 'Extension')} ${esc(preview.version || '')}</h3>
    ${preview.description ? `<p>${esc(preview.description)}</p>` : ''}
    ${sites ? `<p class="muted">Content scripts run on ${sites}.</p>` : ''}
    ${rows ? `<ul class="permission-list">${rows}</ul>` : '<p>This extension does not request API permissions.</p>'}
    ${limits ? `<ul class="permission-list">${limits}</ul>` : ''}
    ${result.error ? `<p class="extension-error">${esc(result.error)}</p>` : '<p>Loading copies the folder into RightTab and reloads matching open pages.</p>'}
    <div class="actions-row">
      ${result.ok === false ? '' : '<button class="primary" data-action="confirm-extension">Load extension</button>'}
      <button class="secondary" data-action="cancel-extension">Cancel</button>
    </div>
  </article>`;
}

function extensionCard(ext) {
  const permissions = (ext.permissions || []).map((item) => `<li><strong>${esc(supportLabel(item.support))}</strong> ${esc(item.title)} — ${esc(item.detail)}</li>`).join('');
  const limits = (ext.limitations || []).filter((item) => !(ext.permissions || []).some((permission) => permission.detail === item)).map((item) => `<li>${esc(item)}</li>`).join('');
  return `<article class="extension-card">
    <div class="extension-icon">${extensionIconHtml(ext)}</div>
    <div>
      <strong>${esc(ext.name)}</strong>
      <p class="extension-meta">Version ${esc(ext.version || 'unknown')} · ${ext.enabled ? (ext.loaded ? 'Enabled' : 'Enabled, not running') : 'Disabled'}${ext.pinned ? ' · Pinned' : ''}</p>
      ${ext.description ? `<p class="muted">${esc(ext.description)}</p>` : ''}
      ${ext.error ? `<p class="extension-error">${esc(ext.error)}</p>` : ''}
      ${ext.sites?.length ? `<p class="muted">Content scripts: ${esc(ext.sites.join(', '))}</p>` : ''}
      ${permissions ? `<ul class="permission-list">${permissions}</ul>` : ''}
      ${limits ? `<ul class="permission-list">${limits}</ul>` : ''}
      <div class="actions-row">
        ${ext.hasPopup ? `<button class="secondary" data-action="open-extension" data-kind="popup" data-arg="${esc(ext.installId)}">Open popup</button>` : ''}
        ${ext.hasSidePanel ? `<button class="secondary" data-action="open-extension" data-kind="side-panel" data-arg="${esc(ext.installId)}">Open side panel page</button>` : ''}
        ${ext.hasOptions ? `<button class="secondary" data-action="open-extension" data-kind="options" data-arg="${esc(ext.installId)}">Options</button>` : ''}
        <button class="secondary" data-action="pin-extension" data-arg="${esc(ext.installId)}" data-pinned="${ext.pinned ? '0' : '1'}">${ext.pinned ? 'Unpin' : 'Pin'}</button>
        <button class="secondary" data-action="remove-extension" data-arg="${esc(ext.installId)}">Remove</button>
      </div>
    </div>
    <label class="extension-toggle"><span>Enabled</span><input type="checkbox" aria-label="Enabled" data-extension-toggle="${esc(ext.installId)}" ${ext.enabled ? 'checked' : ''}></label>
  </article>`;
}

async function pickExtension() {
  const result = await rt.pickExtension();
  if (!result || result.cancelled) return;
  extensionReview = result;
  settingsPane = 'extensions';
  if (screen !== 'settings') openOverlay('settings');
  else renderOverlay();
}

async function confirmExtension() {
  const result = await rt.confirmExtension();
  if (!result || result.cancelled) return;
  if (!result.ok) {
    extensionReview = { ok: false, error: result.error || 'The extension could not be loaded.', preview: result.preview || extensionReview?.preview };
    renderOverlay();
    return;
  }
  extensionReview = null;
  if (screen === 'settings') renderOverlay();
}

function sheet(title, body) {
  return `<div class="sheet narrow"><div class="sheet-body"><h2>${esc(title)}</h2>${body}<div class="actions-row"><button class="secondary" data-action="close">Close</button></div></div></div>`;
}

async function loadHistory(query) {
  const list = $('history-list') || document.getElementById('history-list');
  if (!list) return;
  const entries = await rt.searchHistory(query);
  list.replaceChildren();
  const search = document.getElementById('history-query');
  if (!search) {
    const input = document.createElement('input');
    input.id = 'history-query';
    input.placeholder = 'Search history';
    input.value = query;
    input.oninput = () => loadHistory(input.value);
    list.before(input);
  }
  if (!entries.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No history yet.';
    list.append(empty);
    return;
  }
  for (const entry of entries) {
    const row = document.createElement('div');
    row.className = 'history-item';
    const open = document.createElement('button');
    open.className = 'text-button';
    open.textContent = entry.title || entry.url;
    open.title = entry.url;
    open.onclick = () => { rt.openUrl(entry.url); closeOverlay(); };
    const remove = document.createElement('button');
    remove.className = 'text-button';
    remove.textContent = 'Delete';
    remove.onclick = () => rt.deleteHistory(entry.id).then(() => loadHistory(query));
    row.append(open, remove);
    list.append(row);
  }
}

function bookmarksHtml() {
  const items = [];
  const walk = (nodes) => {
    for (const node of nodes || []) {
      items.push(node);
      if (node.type === 'folder') walk(node.children);
    }
  };
  walk(state.bookmarks.bar);
  walk(state.bookmarks.other);
  const rows = items.map((node) => `<div class="list-card"><strong>${esc(node.title)}</strong><div class="muted">${esc(node.type === 'url' ? node.url : 'Folder')}</div><button class="text-button" data-action="remove-bookmark" data-arg="${esc(node.id)}">Delete</button></div>`).join('');
  const mode = state.settings.bookmarkBarMode || (state.settings.showBookmarkBar === false ? 'hidden' : 'complex');
  return `<div class="sheet narrow"><div class="sheet-body"><h2>Bookmarks</h2><div class="row"><div><strong>Bookmark bar</strong><p>Hide it, keep a clean set of your first six bookmarks, or show every bookmark as before.</p></div><select id="bookmark-bar-mode" aria-label="Bookmark bar display"><option value="hidden" ${mode === 'hidden' ? 'selected' : ''}>Hidden</option><option value="simple" ${mode === 'simple' ? 'selected' : ''}>Simple</option><option value="complex" ${mode === 'complex' ? 'selected' : ''}>Complex</option></select></div><div class="actions-row"><button class="secondary" data-action="add-bookmark">Add bookmark</button><button class="secondary" data-action="add-folder">Add folder</button></div><div class="list">${rows || '<p class="muted">No bookmarks yet.</p>'}</div><div class="actions-row"><button class="secondary" data-action="close">Close</button></div></div></div>`;
}

function passwordsHtml() {
  return `<div class="sheet narrow"><div class="sheet-body"><h2>Passwords</h2>
    <p class="lede">Passwords are protected by your operating system’s secure storage. RightTab never writes plaintext passwords to its settings or vault file; revealing one shows it only in this window.</p>
    <div class="actions-row"><button class="secondary" data-action="add-password">Add password</button><button class="secondary" data-action="import-csv">Import Chrome CSV</button></div>
    <p class="note">To import a CSV, export passwords from Chrome Password Manager and select the file here.</p>
    <div id="password-list" class="list"></div>
    <div class="actions-row"><button class="secondary" data-action="close">Close</button></div></div></div>`;
}

async function loadPasswords() {
  const list = document.getElementById('password-list');
  if (!list) return;
  const entries = await rt.listPasswords();
  list.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement('p');
    empty.className = 'settings-empty';
    empty.textContent = 'No saved passwords.';
    list.append(empty);
    return;
  }
  for (const entry of entries) {
    const card = document.createElement('article');
    card.className = 'list-card password-card';
    const main = document.createElement('div');
    main.className = 'password-main';
    const title = document.createElement('strong');
    title.textContent = `${host(entry.origin) || entry.origin} · ${entry.username || '(no username)'}`;
    const secret = document.createElement('div');
    secret.className = 'muted';
    secret.textContent = 'Hidden';
    const reveal = document.createElement('button');
    reveal.className = 'text-button';
    reveal.textContent = 'Reveal';
    reveal.onclick = async () => {
      const result = await rt.revealPassword(entry.id);
      secret.textContent = result.password || '';
      setTimeout(() => { secret.textContent = 'Hidden'; }, 20000);
    };
    const remove = document.createElement('button');
    remove.className = 'text-button';
    remove.textContent = 'Delete';
    remove.onclick = () => rt.deletePassword(entry.id).then(loadPasswords);
    const actions = document.createElement('div');
    actions.className = 'password-actions';
    actions.append(reveal, remove);
    main.append(title, secret);
    card.append(main, actions);
    list.append(card);
  }
}

async function addPassword() {
  const origin = prompt('Website, such as https://example.com');
  if (!origin) return;
  const username = prompt('Username', '') ?? '';
  const password = prompt('Password');
  if (!password) return;
  const result = await rt.addPassword({ origin, username, password });
  if (result?.duplicate) alert('That login is already saved.');
  loadPasswords();
}

function passwordCsvMessage(result) {
  if (!result || result.cancelled) return 'Import cancelled.';
  if (result.error) return result.error;
  return `Imported ${result.imported}. Duplicates skipped: ${result.duplicates}. Failed: ${result.failed}.`;
}

function importHtml() {
  const profiles = importProfiles.map((profile) => `<option value="${esc(profile.id)}" ${profile.id === importProfileId ? 'selected' : ''}>${esc(profile.name)}${profile.email ? ` · ${esc(profile.email)}` : ''}</option>`).join('');
  return `<div class="sheet"><div class="sheet-body">
    <h2>Import browser data</h2>
    <p class="lede">RightTab copies what you select into its own profile. Your source profile is not modified. Google Sync, cookies, and signed-in website sessions do not transfer.</p>
    ${profiles ? `<label>Browser profile <select id="chrome-profile">${profiles}</select></label>` : '<p class="muted">Looking for browser profiles…</p>'}
    <div id="import-preview">${importPreview ? previewHtml(importPreview) : '<p class="muted">Choose a profile to preview what can move.</p>'}</div>
    <p class="muted" id="import-progress">${esc(importProgress)}</p>
    ${importResult ? resultHtml(importResult) : ''}
    <div class="actions-row">
      <button class="primary" data-action="run-import">Import selected</button>
      <button class="secondary" data-action="${state.setupComplete ? 'close' : 'start'}">${state.setupComplete ? 'Close' : 'Start browsing'}</button>
    </div>
  </div></div>`;
}

function previewHtml(preview) {
  const blocks = ['bookmarks', 'history', 'passwords', 'preferences', 'tabs', 'extensions'];
  const choices = {
    bookmarks: preview.bookmarks.support === 'supported',
    history: preview.history.support === 'supported',
    passwords: preview.passwords.support === 'supported' && preview.passwords.count > 0,
    preferences: preview.preferences.support === 'partial',
    tabs: preview.tabs.support === 'best-effort',
    loadExtensions: false,
  };
  return `<div class="matrix">${blocks.map((key) => {
    const item = preview[key];
    const checked = importSelections[key] && choices[key] ? 'checked' : '';
    const disabled = choices[key] || key === 'extensions' ? '' : 'disabled';
    const box = key === 'extensions'
      ? ''
      : `<label class="check"><input type="checkbox" data-import="${key}" ${checked} ${disabled}> Import</label>`;
    return `<article><span class="badge ${esc(item.support)}">${esc(item.support)}</span><strong>${esc(item.title)}</strong><p>${esc(item.detail || '')}</p><p>${esc(countLine(key, item))}</p>${item.error ? `<p>${esc(item.error)}</p>` : ''}${box}</article>`;
  }).join('')}</div>
  <label class="check"><input type="checkbox" data-import="loadExtensions" ${importSelections.loadExtensions ? 'checked' : ''}> Load copied extension folders into RightTab. Review the permissions above first. Unsupported Chrome APIs will still fail, and private windows do not get extensions.</label>
  ${unsupportedHtml()}`;
}

function countLine(key, item) {
  if (key === 'bookmarks') return `${item.urlCount || 0} bookmarks in ${item.folderCount || 0} folders`;
  if (key === 'history') return `${item.count || 0} sites`;
  if (key === 'passwords') return `${item.count || 0} saved passwords. The password itself is not shown. A macOS Keychain prompt is required for direct password import.`;
  if (key === 'preferences') return `${(item.apply || []).length} settings can be applied. ${(item.skip || []).length} items stay behind.`;
  if (key === 'tabs') return `${item.count || 0} pages${item.method === 'url-scan' ? ' recovered by a best-effort scan' : ''}`;
  if (key === 'extensions') {
    const names = (item.items || []).slice(0, 6).map((ext) => {
      const permissions = (ext.permissions || []).slice(0, 6).join(', ');
      return `${ext.name}${permissions ? ` (${permissions})` : ''}`;
    });
    return names.length
      ? `${(item.items || []).length} listed. ${names.join('; ')}`
      : `${(item.items || []).length} listed. None are installed unless you opt in below.`;
  }
  return '';
}

function unsupportedHtml() {
  return `<div class="matrix"><article><span class="badge unsupported">Not imported</span><strong>Cookies, website logins, and Google Sync</strong><p>Sign in again here. RightTab then keeps its own session. Payment methods, addresses, and the rest of Chrome’s settings also stay in Chrome.</p></article></div>`;
}

function resultHtml(summary) {
  const lines = [
    ['Bookmarks', `${summary.bookmarks.imported} added, ${summary.bookmarks.duplicates} already saved${summary.bookmarks.error ? `. ${summary.bookmarks.error}` : ''}`],
    ['History', `${summary.history.imported} added, ${summary.history.updated} updated${summary.history.error ? `. ${summary.history.error}` : ''}`],
    ['Passwords', `${summary.passwords.imported} added, ${summary.passwords.duplicates} duplicates, ${summary.passwords.failed} failed${summary.passwords.error ? `. ${summary.passwords.error}` : ''}`],
    ['Preferences', (summary.preferences.applied || []).join(', ') || 'None applied'],
    ['Tabs', `${(summary.tabs.urls || []).length} opened${summary.tabs.error ? `. ${summary.tabs.error}` : ''}`],
    ['Extensions', `${summary.extensions.listed} listed, ${summary.extensions.loaded.length} loaded, ${summary.extensions.failed.length} failed`],
  ];
  return `<h3>Import results</h3><div class="matrix">${lines.map(([name, value]) => `<article><strong>${esc(name)}</strong><p>${esc(value)}</p></article>`).join('')}</div><p class="note">${esc((summary.notes || []).join(' '))}</p>`;
}

async function loadProfiles() {
  const listed = await rt.listChromeProfiles();
  importProfiles = listed.profiles || [];
  if (!importProfileId && importProfiles[0]) importProfileId = importProfiles[0].id;
  renderOverlay();
  if (importProfileId) loadPreview();
  else {
    const slot = document.getElementById('import-preview');
    if (slot) slot.innerHTML = `<p>${esc(listed.reason || 'Google Chrome was not found.')}</p>${unsupportedHtml()}`;
  }
}

async function loadPreview() {
  importPreview = await rt.previewChromeProfile(importProfileId);
  if (importPreview.bookmarks.support === 'supported') importSelections.bookmarks = true;
  importSelections.history = importPreview.history.support === 'supported';
  importSelections.passwords = importPreview.passwords.count > 0;
  importSelections.preferences = importPreview.preferences.support === 'partial';
  importSelections.tabs = importPreview.tabs.support === 'best-effort' && importPreview.tabs.count > 0 && importPreview.tabs.count <= 15;
  renderOverlay();
}

async function runImport() {
  importProgress = 'Importing…';
  renderOverlay();
  try {
    importResult = await rt.importChrome({ profileId: importProfileId, ...importSelections, extensions: true });
    importProgress = 'Import finished.';
  } catch (error) {
    importProgress = error.message || 'Import failed.';
  }
  renderOverlay();
}

function shortcutsHtml() {
  return `<div class="sheet narrow"><div class="sheet-body"><h2>Keyboard shortcuts</h2>${shortcutTable()}<div class="actions-row"><button class="secondary" data-action="close">Close</button></div></div></div>`;
}

function shortcutTable() {
  const rows = [
    ['New tab', '⌘T'], ['Close tab', '⌘W'], ['Reopen closed tab', '⇧⌘T'], ['Address bar', '⌘L'],
    ['Reload', '⌘R'], ['Hard reload', '⇧⌘R'], ['Back / forward', '⌘[ / ⌘]'], ['Find', '⌘F'],
    ['Bookmark', '⌘D'], ['Zoom', '⌘+ / ⌘- / ⌘0'], ['History', '⌘Y'], ['Downloads', '⇧⌘J'],
    ['Settings', '⌘,'], ['Passwords', '⇧⌘P'], ['Password suggestions', '⇧⌘L'], ['New window', '⌘N'], ['Private window', '⇧⌘N'], ['Tab sidebar', '⌥⌘S'],
    ['Select tab', '⌘1–8, ⌘9 last'],
  ];
  return `<div class="shortcut-list">${rows.map(([name, keys]) => `<div class="shortcut-row"><span>${esc(name)}</span><kbd>${esc(keys)}</kbd></div>`).join('')}</div>`;
}

function handleCommand(command) {
  if (command === 'focus-omnibox') { $('address').focus(); $('address').select(); }
  if (command === 'open-find') openFind();
  if (command === 'find-next') { if ($('findbar').hidden) openFind(); runFind(true, true); }
  if (command === 'find-previous') { if ($('findbar').hidden) openFind(); runFind(true, false); }
  if (command === 'open-settings') { settingsPane = 'startup'; openOverlay('settings'); }
  if (command === 'open-extensions') { settingsPane = 'extensions'; openOverlay('settings'); }
  if (command === 'open-appearance') { settingsPane = 'appearance'; openOverlay('settings'); }
  if (command === 'open-history') openOverlay('history');
  if (command === 'open-bookmarks') openOverlay('bookmarks');
  if (command === 'open-passwords') openOverlay('passwords');
  if (command === 'password-suggestions') rt.showPasswordMenu();
  if (command === 'open-google') rt.openUrl('https://www.google.com/');
  if (command === 'open-import') showImport();
  if (command === 'open-shortcuts') openOverlay('shortcuts');
  if (command === 'toggle-downloads') togglePopover('downloads');
  if (command === 'expand-downloads') {
    downloadsOpen = !downloadsOpen;
    if (popoverKind === 'downloads') renderDownloadsPopover();
  }
  if (command === 'split-chatgpt') rt.openSplit({ url: 'https://chatgpt.com/' });
  if (command === 'swap-split') rt.swapSplit();
  if (command === 'close-split') rt.closeSplit();
  if (command === 'reopen-tab') rt.reopenClosed();
  if (command === 'new-window') rt.newWindow();
  if (command === 'new-private-window') rt.newPrivateWindow();
}

rt.onFind((result) => {
  $('find-count').textContent = result.total ? `${result.active} / ${result.total}` : '0 / 0';
});
rt.onImportProgress((progress) => {
  importProgress = progress.message || '';
  const slot = document.getElementById('import-progress');
  if (slot) slot.textContent = importProgress;
});
rt.onCommand(handleCommand);
rt.onFloatClosed(() => {
  popoverKind = '';
  suggestions = [];
  suggestionIndex = -1;
  $('suggestions').hidden = true;
  $('popover-slot').hidden = true;
  $('downloads-button').classList.remove('open');
  $('menu-button').classList.remove('open');
  $('extensions-button').classList.remove('open');
  extensionMenuKey = '';
});
rt.onState((next) => {
  const wasSetup = state?.setupComplete;
  const previousTheme = state ? Themes.resolve(state.settings, state.dark).id : '';
  const previousAppearance = JSON.stringify(state?.settings.appearance);
  const nextExtensions = JSON.stringify(next.extensions || []);
  const extensionsChanged = extensionSnapshot !== nextExtensions;
  extensionSnapshot = nextExtensions;
  state = next;
  if (wasSetup === false && next.setupComplete) state.setupComplete = true;
  apply();
  if (extensionsChanged && screen === 'settings' && settingsPane === 'extensions') {
    const scroll = document.querySelector('.sheet-body')?.scrollTop || 0;
    renderOverlay();
    const body = document.querySelector('.sheet-body');
    if (body) body.scrollTop = scroll;
  }
  if (screen === 'settings' && settingsPane === 'appearance' && !themeDraft &&
      (previousTheme !== currentTheme().id || previousAppearance !== JSON.stringify(state.settings.appearance))) {
    const focused = document.activeElement;
    const id = focused?.id;
    const themeId = focused?.dataset.themeId;
    const scroll = document.querySelector('.sheet-body')?.scrollTop || 0;
    renderOverlay();
    if (id) document.getElementById(id)?.focus();
    else if (themeId) document.querySelector(`[data-theme-id="${themeId}"]`)?.focus();
    document.querySelector('.sheet-body').scrollTop = scroll;
  }
  if (screen === 'settings' || screen === 'welcome') {
    document.querySelectorAll('.choice').forEach((card) => {
      const input = card.querySelector('input');
      card.classList.toggle('selected', input?.value === state.settings.startupPage);
      if (input) input.checked = input.value === state.settings.startupPage;
    });
  }
});

bind();
rt.getBootstrap().then((initial) => {
  state = initial;
  apply();
  reportLayout();
});
