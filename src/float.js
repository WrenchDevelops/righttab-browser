const rt = window.righttab;
const card = document.getElementById('card');

const icons = {
  search: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg>',
  globe: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><path d="M2 12h20"/></svg>',
  star: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 16.8 6.6 19.8l1-6.1L3.2 9.4l6.1-.9L12 3Z"/></svg>',
  clock: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><path d="M12 8v5l3 2"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  folder: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 7.5A2 2 0 0 1 5 5.5h4l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-10Z"/></svg>',
  external: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M14 5h5v5"/><path d="M19 5 10 14"/><path d="M17 13.5V18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4.5"/></svg>',
  file: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M7 3.5h7l5 5V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"/><path d="M14 3.5V9h5"/></svg>',
};

function icon(name) {
  const span = document.createElement('span');
  span.className = 'suggestion-icon';
  span.innerHTML = icons[name] || icons.globe;
  return span;
}

function plain(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text || '';
  return node;
}

function renderSuggestions(payload) {
  const wrap = document.createElement('div');
  wrap.className = 'pad';
  const glyphs = { search: 'search', go: 'globe', bookmark: 'star', history: 'clock' };
  payload.items.forEach((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `suggestion${index === payload.selected ? ' selected' : ''}`;
    const title = plain('strong', '', item.title);
    const detail = plain('em', '', item.detail || '');
    button.append(icon(glyphs[item.kind] || 'globe'), title, detail);
    button.onclick = () => rt.floatAction({ type: 'navigate', url: item.url });
    wrap.append(button);
  });
  card.append(wrap);
}

function formatBytes(value) {
  if (!value) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unit = 0;
  while (size > 1024 && unit < units.length - 1) { size /= 1024; unit += 1; }
  return `${size.toFixed(size > 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function timeAgo(stamp) {
  if (!stamp) return '';
  const minutes = Math.max(0, Date.now() - stamp) / 60000;
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${Math.round(minutes)} min ago`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)} hours ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function renderDownloads(payload) {
  const head = document.createElement('div');
  head.className = 'popover-head';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'icon-button';
  close.innerHTML = icons.close;
  close.onclick = () => rt.floatAction({ type: 'close' });
  head.append(plain('strong', '', 'Recent downloads'), close);
  card.append(head);
  if (!payload.items.length) card.append(plain('p', 'empty', 'No downloads yet.'));
  for (const item of payload.items) {
    const row = document.createElement('div');
    row.className = 'download-row';
    const mark = document.createElement('span');
    mark.innerHTML = icons.file;
    const copy = document.createElement('div');
    copy.className = 'download-copy';
    const size = item.total > 0 ? formatBytes(item.total) : formatBytes(item.received);
    const when = item.state === 'progressing' ? 'Downloading' : timeAgo(item.startedAt);
    copy.append(plain('strong', '', item.filename || 'Download'), plain('small', '', [size, when || item.state].filter(Boolean).join(' · ')));
    if (item.state === 'progressing' && item.total > 0) {
      const bar = document.createElement('i');
      bar.className = 'download-progress';
      bar.style.width = `${Math.min(100, Math.round((item.received / item.total) * 100))}%`;
      copy.append(bar);
    }
    row.append(mark, copy);
    if (item.state === 'completed') {
      row.append(actionButton('Show in folder', icons.folder, () => rt.floatAction({ type: 'download', id: item.id, action: 'show' })));
      row.append(actionButton('Open', icons.external, () => rt.floatAction({ type: 'download', id: item.id, action: 'open' })));
    } else if (item.state === 'progressing') {
      row.append(actionButton('Cancel', icons.close, () => rt.floatAction({ type: 'download', id: item.id, action: 'cancel' })));
    }
    card.append(row);
  }
  const foot = document.createElement('button');
  foot.type = 'button';
  foot.className = 'popover-foot';
  foot.append(plain('span', '', payload.expanded ? 'Show fewer' : 'Full download history'));
  const arrow = document.createElement('span');
  arrow.innerHTML = icons.external;
  foot.append(arrow);
  foot.onclick = () => rt.floatAction({ type: 'expand' });
  card.append(foot);
}

function actionButton(label, glyph, action) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'icon-button';
  button.title = label;
  button.setAttribute('aria-label', label);
  button.innerHTML = glyph;
  button.onclick = action;
  return button;
}

function renderMenu(payload) {
  for (const item of payload.items || []) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'menu-row';
    button.textContent = item.label;
    button.onclick = () => rt.floatAction({ type: 'command', command: item.command });
    card.append(button);
  }
}

function renderAsk(payload) {
  const head = document.createElement('div');
  head.className = 'popover-head';
  head.append(plain('strong', '', 'Send this to ChatGPT?'));
  card.append(head);
  card.append(plain('p', 'empty', 'Nothing is sent until you choose Send. The full text is also copied so you can paste it if ChatGPT does not fill the box.'));
  if (payload.title || payload.url) card.append(plain('p', 'empty', [payload.title, payload.url].filter(Boolean).join(' · ')));
  const preview = document.createElement('pre');
  preview.className = 'ask-preview';
  preview.textContent = payload.text || '';
  card.append(preview);
  if (payload.shortened) card.append(plain('p', 'empty', 'The selection was shortened to 6,000 characters.'));
  const actions = document.createElement('div');
  actions.className = 'ask-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'menu-row';
  cancel.textContent = 'Cancel';
  cancel.onclick = () => rt.floatAction({ type: 'close' });
  const send = document.createElement('button');
  send.type = 'button';
  send.className = 'ask-send';
  send.textContent = 'Send';
  send.onclick = () => rt.floatAction({
    type: 'ask-send',
    text: payload.text,
    title: payload.title,
    url: payload.url,
  });
  actions.append(cancel, send);
  card.append(actions);
}

function renderExtensions(payload) {
  const head = document.createElement('div');
  head.className = 'popover-head';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'icon-button';
  close.innerHTML = icons.close;
  close.onclick = () => rt.floatAction({ type: 'close' });
  head.append(plain('strong', '', 'Extensions'), close);
  card.append(head);
  if (payload.private) {
    card.append(plain('p', 'empty', 'Extensions stay off in private windows. Content scripts are not injected, and pinned buttons are hidden.'));
  } else if (!(payload.extensions || []).length) {
    card.append(plain('p', 'empty', 'No extensions yet. Load an unpacked folder from Settings. A Chrome Web Store link cannot be installed.'));
  } else {
    for (const ext of payload.extensions) {
      const row = document.createElement('div');
      row.className = 'ext-row';
      const main = document.createElement('button');
      main.type = 'button';
      main.className = 'ext-main';
      if (ext.icon && String(ext.icon).startsWith('data:image/')) {
        const img = document.createElement('img');
        img.className = 'ext-icon';
        img.alt = '';
        img.src = ext.icon;
        main.append(img);
      }
      const copy = document.createElement('span');
      copy.className = 'ext-copy';
      const status = !ext.enabled
        ? 'Disabled'
        : ext.hasPopup
          ? (ext.version ? `Version ${ext.version}` : 'Enabled')
          : 'No popup. chrome.action.onClicked is not available.';
      copy.append(plain('strong', '', ext.name), plain('small', '', status));
      main.append(copy);
      main.onclick = () => {
        const kind = ext.hasPopup ? 'popup' : (ext.hasSidePanel ? 'side-panel' : '');
        if (kind) rt.floatAction({ type: 'extension-open', installId: ext.installId, kind });
      };
      const pin = document.createElement('button');
      pin.type = 'button';
      pin.className = 'ext-pin';
      pin.textContent = ext.pinned ? 'Unpin' : 'Pin';
      pin.onclick = () => rt.floatAction({ type: 'extension-pin', installId: ext.installId, pinned: !ext.pinned });
      row.append(main, pin);
      card.append(row);
    }
  }
  if (payload.sidePanelId) {
    const closePanel = document.createElement('button');
    closePanel.type = 'button';
    closePanel.className = 'popover-foot';
    closePanel.textContent = 'Close side panel';
    closePanel.onclick = () => rt.floatAction({ type: 'extension-close-panel' });
    card.append(closePanel);
  }
  const manage = document.createElement('button');
  manage.type = 'button';
  manage.className = 'popover-foot';
  manage.textContent = 'Manage extensions';
  manage.onclick = () => rt.floatAction({ type: 'command', command: 'open-extensions' });
  card.append(manage);
}

function render(payload) {
  if (payload.resolvedTheme) RightTabThemes.apply(document.documentElement, payload.resolvedTheme);
  card.replaceChildren();
  if (payload.kind === 'suggestions') renderSuggestions(payload);
  if (payload.kind === 'downloads') renderDownloads(payload);
  if (payload.kind === 'menu') renderMenu(payload);
  if (payload.kind === 'ask') renderAsk(payload);
  if (payload.kind === 'extensions') renderExtensions(payload);
  requestAnimationFrame(() => {
    rt.resizeFloat({ width: card.offsetWidth, height: card.offsetHeight });
  });
}

rt.onFloatShow(render);

rt.onTheme(theme => RightTabThemes.apply(document.documentElement, theme));

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { event.preventDefault(); rt.floatAction({ type: 'close' }); }
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    const buttons = [...card.querySelectorAll('button')];
    if (!buttons.length) return;
    event.preventDefault();
    const index = buttons.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus();
  }
});
