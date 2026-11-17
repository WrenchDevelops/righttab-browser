const home = window.righttabHome;
const $ = (id) => document.getElementById(id);
const ZONES = ['', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'Europe/London', 'Europe/Paris', 'Asia/Tokyo', 'Australia/Sydney', 'UTC'];

const state = {
  homepage: null,
  theme: null,
  themes: [],
  engines: [],
  customSearchEngines: [],
  searchEngine: 'google',
  searchSuggestions: true,
  followSystem: false,
  appearanceId: '',
  private: false,
  tone: 'dark',
  vars: {},
  background: { type: 'image', src: 'wallpapers/summit.jpg' },
  wallpapers: [],
  suggestions: [],
  activeSuggestion: -1,
  editing: null,
  iconDraft: '',
};

let clockTimer = 0;
let suggestTimer = 0;
let suggestSeq = 0;
let calendarCursor = new Date();

function asset(src) {
  if (!src || location.protocol === 'righttab:' || src.startsWith('righttab:')) return src;
  if (src.startsWith('wallpapers/')) return `../${src}`;
  return src;
}

function faviconUrl(url) {
  try {
    const host = new URL(url).hostname;
    if (!host) return '';
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
  } catch {
    return '';
  }
}

function previewState() {
  return {
    private: false,
    searchEngine: 'google',
    searchSuggestions: true,
    customSearchEngines: [],
    engines: [
      { id: 'google', name: 'Google' },
      { id: 'bing', name: 'Bing' },
      { id: 'duckduckgo', name: 'DuckDuckGo' },
      { id: 'brave', name: 'Brave Search' },
    ],
    themes: [{ id: 'cloud', name: 'Cloud', mode: 'light' }, { id: 'midnight', name: 'Midnight', mode: 'dark' }],
    appearanceId: 'midnight',
    followSystem: true,
    themeMode: 'dark',
    accent: '#A5D8FF',
    wallpapers: [
      { id: 'summit', name: 'Summit' },
      { id: 'alpine', name: 'Alpine' },
      { id: 'coast', name: 'Poppies' },
      { id: 'dusk', name: 'Dusk' },
      { id: 'dawn', name: 'Dawn' },
      { id: 'ink', name: 'Ink' },
      { id: 'paper', name: 'Paper' },
      { id: 'none', name: 'None' },
    ],
    homepage: {
      showLogo: true,
      showShortcuts: true,
      showWeather: true,
      showClock: true,
      wallpaper: 'summit',
      customWallpaper: '',
      glass: 0.16,
      dimming: 0.22,
      shortcutSize: 'regular',
      shortcutDensity: 6,
      iconStyle: 'default',
      contentShift: 0,
      clockFormat: '12',
      showSeconds: false,
      timeZone: '',
      clockGlass: false,
      weatherGlass: true,
      weatherUnit: 'fahrenheit',
      weatherLocation: null,
      shortcuts: [
        { id: 'youtube', title: 'YouTube', url: 'https://www.youtube.com/', icon: '', openInNewTab: false },
        { id: 'gmail', title: 'Gmail', url: 'https://mail.google.com/', icon: '', openInNewTab: false },
        { id: 'drive', title: 'Google Drive', url: 'https://drive.google.com/', icon: '', openInNewTab: false },
        { id: 'github', title: 'GitHub', url: 'https://github.com/', icon: '', openInNewTab: false },
        { id: 'discord', title: 'Discord', url: 'https://discord.com/', icon: '', openInNewTab: false },
      ],
      recentSearches: [],
      accent: '',
      contrast: 'auto',
      reducedTransparency: false,
    },
    tone: 'dark',
    vars: {},
    background: { type: 'image', src: 'wallpapers/summit.jpg' },
    weather: null,
  };
}

function applyPayload(payload) {
  if (!payload) return;
  Object.assign(state, {
    homepage: payload.homepage,
    themes: payload.themes || [],
    engines: payload.engines || [],
    customSearchEngines: payload.customSearchEngines || [],
    searchEngine: payload.searchEngine || 'google',
    searchSuggestions: payload.searchSuggestions !== false,
    followSystem: !!payload.followSystem,
    appearanceId: payload.appearanceId || '',
    private: !!payload.private,
    tone: payload.tone === 'light' ? 'light' : 'dark',
    vars: payload.vars || {},
    background: payload.background || { type: 'none' },
    wallpapers: payload.wallpapers || state.wallpapers,
    weather: payload.weather || null,
    accent: payload.accent || '#8E8E93',
  });
  applySurface();
  renderShortcuts();
  renderWeather();
  renderClock();
  syncPanel();
}

function applySurface() {
  const page = $('page');
  page.dataset.tone = state.tone;
  page.dataset.transparency = state.homepage?.reducedTransparency ? 'reduced' : 'full';
  document.documentElement.style.colorScheme = state.tone;
  for (const [key, value] of Object.entries(state.vars || {})) {
    if (!/^--rt-[a-z0-9-]+$/.test(key)) continue;
    const text = String(value);
    if (text.length > 80 || /url\(|expression|<|>|;/i.test(text)) continue;
    document.documentElement.style.setProperty(key, text);
  }
  const wallpaper = $('wallpaper');
  const background = state.background || {};
  const custom = state.homepage?.customWallpaper || '';
  if (/^righttab:\/\/newtab\/user\/wallpaper\/[a-z0-9-]{8,80}\.(png|jpe?g|webp)$/.test(custom)) {
    wallpaper.style.setProperty('--custom-wallpaper', `url("${custom}")`);
  }
  const id = state.homepage?.wallpaper || 'summit';
  if (wallpaper.dataset.id !== id) {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce) wallpaper.style.opacity = '0.35';
    wallpaper.dataset.id = id;
    if (!reduce) requestAnimationFrame(() => { wallpaper.style.opacity = '1'; });
  }
  if (background.type === 'image' && background.src && background.src.startsWith('righttab:')) {
    wallpaper.style.setProperty('--custom-wallpaper', `url("${background.src}")`);
  }
  $('logo').hidden = !state.homepage.showLogo;
  $('weather').hidden = !state.homepage.showWeather;
  $('clock').hidden = !state.homepage.showClock;
  $('weather').classList.toggle('plain', state.homepage.weatherGlass === false);
  $('weather').classList.toggle('glass', state.homepage.weatherGlass !== false);
  $('clock').classList.toggle('glass', !!state.homepage.clockGlass);
}

function engineGlyph(id) {
  const common = 'viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7"';
  if (id === 'bing') return `<svg ${common}><circle cx="8" cy="12" r="3"/><path d="M11 12h8l-2 4"/></svg>`;
  if (id === 'duckduckgo') return `<svg ${common}><circle cx="12" cy="13" r="5"/><path d="M8 9c1-3 7-3 8 0"/></svg>`;
  if (id === 'brave') return `<svg ${common}><path d="M12 3 6 6v6c0 4 3 6 6 7 3-1 6-3 6-7V6l-6-3Z"/></svg>`;
  if (id && id.startsWith('custom-')) return `<svg ${common}><circle cx="12" cy="12" r="7"/><path d="M12 9v6M9 12h6"/></svg>`;
  return `<svg ${common}><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg>`;
}

function weatherGlyph(icon) {
  const common = 'viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6"';
  if (icon === 'clear') return `<svg ${common}><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>`;
  if (icon === 'clear-night') return `<svg ${common}><path d="M16 3a8 8 0 1 0 5 13 7 7 0 1 1-5-13Z"/></svg>`;
  if (icon === 'partly' || icon === 'partly-night') return `<svg ${common}><circle cx="9" cy="10" r="3"/><path d="M7 16h10a3 3 0 0 0 0-6 5 5 0 0 0-9-1"/></svg>`;
  if (icon === 'rain' || icon === 'thunder') return `<svg ${common}><path d="M7 15h10a3 3 0 0 0 0-6 5 5 0 0 0-9-1"/><path d="M9 18l-1 3M13 18l-1 3M17 18l-1 3"/></svg>`;
  if (icon === 'snow') return `<svg ${common}><path d="M12 3v18M5 7l14 10M19 7 5 17"/></svg>`;
  if (icon === 'fog') return `<svg ${common}><path d="M4 10h16M4 14h16M6 18h12"/></svg>`;
  return `<svg ${common}><path d="M7 16h11a3.5 3.5 0 0 0 0-7 5.5 5.5 0 0 0-10.5-1A3.5 3.5 0 0 0 7 16Z"/></svg>`;
}

function shortcutHost(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function brandMark(url) {
  const host = shortcutHost(url);
  const svg = (body) => `<svg class="mark" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
  if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be') {
    return svg('<path fill="#FF0033" fill-rule="evenodd" d="M3.8 7.2A2.7 2.7 0 0 1 6.5 4.5h11A2.7 2.7 0 0 1 20.2 7.2v9.6a2.7 2.7 0 0 1-2.7 2.7h-11a2.7 2.7 0 0 1-2.7-2.7V7.2zm6.1 1.55 5.35 3.25-5.35 3.25V8.75z"/>');
  }
  if (host === 'mail.google.com') {
    return svg('<path fill="#EA4335" d="M1.2 6.1C1.2 4.1 3.4 2.9 5 4.1L12 9.4l7-5.3c1.6-1.2 3.8 0 3.8 2v11.2c0 .9-.7 1.6-1.6 1.6h-3.9V11.2L12 16.1 6.7 11.2v6.7H2.8c-.9 0-1.6-.7-1.6-1.6V6.1z"/>');
  }
  if (host === 'drive.google.com') {
    return `<svg class="mark" viewBox="0 0 87.3 78" aria-hidden="true"><path fill="#0066da" d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L27.5 53H0c0 1.55.4 3.1 1.2 4.5z"/><path fill="#00ac47" d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z"/><path fill="#ea4335" d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 11.5z"/><path fill="#00832d" d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2H34.4c-1.6 0-3.15.45-4.5 1.2z"/><path fill="#2684fc" d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z"/><path fill="#ffba00" d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.8 53h27.45c0-1.55-.4-3.1-1.2-4.5z"/></svg>`;
  }
  if (host === 'github.com' || host.endsWith('.github.com')) {
    return svg('<path fill="#181717" d="M12 .3C5.4.3 0 5.7 0 12.3c0 5.3 3.4 9.8 8.2 11.4.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.5-1.4-1.3-1.8-1.3-1.8-1.1-.8.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6 4.8-1.6 8.2-6.1 8.2-11.4C24 5.7 18.6.3 12 .3z"/>');
  }
  if (host === 'discord.com' || host === 'discord.gg' || host.endsWith('.discord.com')) {
    return svg('<path fill="#5865F2" d="M19.3 5.1A16.2 16.2 0 0 0 15.1 3.8l-.4.7a13.8 13.8 0 0 1 3.5 1.4 14.6 14.6 0 0 0-4.2-1.3 14.8 14.8 0 0 0-6.8 0A13 13 0 0 0 5.8 5.9a14.2 14.2 0 0 1 3.5-1.4l-.4-.7A16.2 16.2 0 0 0 4.7 5.1C2.4 8.5 1.8 11.8 2.1 15.1a15.5 15.5 0 0 0 4.7 2.4l.6-1a10 10 0 0 1-1.5-.7l.3-.3c2.9 1.4 6.2 1.4 9.1 0l.4.3c-.5.3-1 .5-1.5.7l.6 1a15.4 15.4 0 0 0 4.7-2.4c.4-3.8-.5-7.1-2.2-10zm-10.4 8.2c-.9 0-1.6-.8-1.6-1.8s.7-1.8 1.6-1.8 1.7.8 1.6 1.8-.7 1.8-1.6 1.8zm6.3 0c-.9 0-1.6-.8-1.6-1.8s.7-1.8 1.6-1.8 1.7.8 1.6 1.8-.7 1.8-1.6 1.8z"/>');
  }
  return '';
}

function mountShortcutIcon(icon, shortcut) {
  const mark = shortcut.icon ? '' : brandMark(shortcut.url);
  if (mark) {
    icon.insertAdjacentHTML('beforeend', mark);
    return;
  }
  const letter = document.createElement('span');
  letter.className = 'letter';
  letter.textContent = (shortcut.title || '?').slice(0, 1).toUpperCase();
  const source = shortcut.icon || faviconUrl(shortcut.url);
  if (source) {
    const image = document.createElement('img');
    image.alt = '';
    image.referrerPolicy = 'no-referrer';
    image.src = source;
    image.addEventListener('load', () => { if (image.naturalWidth > 0) letter.remove(); });
    image.addEventListener('error', () => image.remove());
    icon.append(image);
  }
  icon.append(letter);
}

function renderShortcuts() {
  const root = $('shortcuts');
  const page = state.homepage;
  if (!page?.showShortcuts) {
    root.hidden = true;
    return;
  }
  root.hidden = false;
  root.dataset.size = page.shortcutSize || 'regular';
  root.dataset.density = String(page.shortcutDensity || 6);
  root.dataset.icons = ['clear', 'clear-colored'].includes(page.iconStyle) ? page.iconStyle : 'default';
  root.replaceChildren();
  for (const shortcut of page.shortcuts || []) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'shortcut';
    button.draggable = true;
    button.dataset.id = shortcut.id;
    button.title = shortcut.title;
    const icon = document.createElement('span');
    icon.className = 'shortcut-icon';
    mountShortcutIcon(icon, shortcut);
    const label = document.createElement('span');
    label.className = 'shortcut-label';
    label.textContent = shortcut.title;
    button.append(icon, label);
    button.addEventListener('click', (event) => openShortcut(shortcut, event.metaKey || event.ctrlKey));
    button.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      openMenu(shortcut, event.clientX, event.clientY);
    });
    button.addEventListener('dragstart', (event) => {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', shortcut.id);
      button.classList.add('dragging');
    });
    button.addEventListener('dragend', () => button.classList.remove('dragging'));
    button.addEventListener('dragover', (event) => {
      event.preventDefault();
      button.classList.add('drop');
    });
    button.addEventListener('dragleave', () => button.classList.remove('drop'));
    button.addEventListener('drop', (event) => {
      event.preventDefault();
      button.classList.remove('drop');
      const id = event.dataTransfer.getData('text/plain');
      reorder(id, shortcut.id);
    });
    root.append(button);
  }
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'shortcut add';
  add.setAttribute('aria-label', 'Add shortcut');
  const plus = document.createElement('span');
  plus.className = 'shortcut-icon';
  plus.innerHTML = '<svg class="plus" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10.75 4.5h2.5v6.25H19.5v2.5h-6.25V19.5h-2.5v-6.25H4.5v-2.5h6.25V4.5z"/></svg>';
  const addLabel = document.createElement('span');
  addLabel.className = 'shortcut-label';
  addLabel.textContent = 'Add';
  add.append(plus, addLabel);
  add.addEventListener('click', () => openShortcutEditor(null));
  root.append(add);
}

async function openShortcut(shortcut, forceNewTab) {
  const newTab = forceNewTab || shortcut.openInNewTab;
  if (!home) return;
  await home.open({ url: shortcut.url, newTab, background: false });
}

function reorder(fromId, beforeId) {
  if (!fromId || fromId === beforeId) return;
  const list = state.homepage.shortcuts.slice();
  const from = list.findIndex((item) => item.id === fromId);
  const before = list.findIndex((item) => item.id === beforeId);
  if (from < 0 || before < 0) return;
  const [item] = list.splice(from, 1);
  list.splice(before, 0, item);
  saveHomepage({ shortcuts: list });
}

function renderWeather() {
  const button = $('weather');
  button.replaceChildren();
  const weather = state.weather;
  const icon = document.createElement('span');
  icon.className = 'weather-icon';
  icon.innerHTML = weatherGlyph(weather?.icon || 'cloud');
  const copy = document.createElement('span');
  copy.className = 'weather-copy';
  const title = document.createElement('strong');
  const detail = document.createElement('span');
  if (!state.homepage.showWeather) return;
  if (!state.homepage.weatherLocation && !weather) {
    title.textContent = 'Weather';
    detail.textContent = 'Add a city';
  } else if (!weather) {
    title.textContent = 'Weather';
    detail.textContent = 'Unavailable';
  } else {
    const unit = weather.unit === 'celsius' ? 'C' : 'F';
    title.textContent = `${weather.temperature}°${unit}`;
    const place = [weather.locationName, weather.region].filter(Boolean).join(', ');
    detail.textContent = place ? `${weather.label} · ${place}` : weather.label;
  }
  copy.append(title, detail);
  button.append(icon, copy);
}

function formatNow() {
  const page = state.homepage;
  const zone = page.timeZone || undefined;
  const timeOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: page.clockFormat !== '24',
    timeZone: zone,
  };
  if (page.showSeconds) timeOptions.second = '2-digit';
  const when = new Date();
  return {
    time: new Intl.DateTimeFormat('en-US', timeOptions).format(when),
    date: new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: zone }).format(when),
  };
}

function renderClock() {
  const button = $('clock');
  if (!state.homepage?.showClock) return;
  const parts = formatNow();
  button.replaceChildren();
  const time = document.createElement('strong');
  time.textContent = parts.time;
  const date = document.createElement('span');
  date.textContent = parts.date;
  button.append(time, date);
}

function tickClock() {
  clearTimeout(clockTimer);
  if (state.homepage) renderClock();
  clockTimer = setTimeout(tickClock, 1000 - (Date.now() % 1000));
}

function paintRange(node) {
  if (!node || node.type !== 'range') return;
  const min = Number(node.min);
  const max = Number(node.max);
  const value = Number(node.value);
  const span = max - min;
  node.style.setProperty('--fill', `${span ? ((value - min) / span) * 100 : 0}%`);
}

function setControl(id, value) {
  const node = $(id);
  if (!node || document.activeElement === node) return;
  if (node.type === 'checkbox') node.checked = !!value;
  else node.value = value == null ? '' : String(value);
  paintRange(node);
}

function syncPanel() {
  const page = state.homepage;
  setControl('follow-system', state.followSystem);
  setControl('show-logo', page.showLogo);
  setControl('show-shortcuts', page.showShortcuts);
  setControl('show-weather', page.showWeather);
  setControl('show-clock', page.showClock);
  setControl('search-suggestions', state.searchSuggestions);
  setControl('clock-format', page.clockFormat);
  setControl('show-seconds', page.showSeconds);
  setControl('clock-glass', page.clockGlass);
  setControl('weather-unit', page.weatherUnit);
  setControl('shortcut-size', page.shortcutSize);
  setControl('shortcut-density', page.shortcutDensity);
  setControl('icon-style', page.iconStyle || 'default');
  setControl('content-shift', page.contentShift);
  setControl('dimming', Math.round(page.dimming * 100));
  setControl('glass', Math.round(page.glass * 100));
  setControl('contrast', page.contrast);
  setControl('reduced-transparency', page.reducedTransparency);
  setControl('accent', page.accent || state.accent || '#8E8E93');
  fillSelect($('theme-preset'), state.themes.map((theme) => [theme.id, theme.name]), state.appearanceId);
  const engines = state.engines.concat((state.customSearchEngines || []).map((engine) => ({ id: engine.id, name: engine.name })));
  fillSelect($('search-engine'), engines.map((engine) => [engine.id, engine.name]), state.searchEngine);
  const zones = ZONES.includes(page.timeZone) ? ZONES : [page.timeZone, ...ZONES];
  fillSelect($('time-zone'), zones.map((zone) => [zone, zone ? zone.replace(/_/g, ' ') : 'System']), page.timeZone);
  $('engine-icon').innerHTML = engineGlyph(state.searchEngine);
  renderWallpaperChoices();
  renderEngineList();
}

function fillSelect(node, pairs, selected) {
  if (!node || document.activeElement === node) return;
  const stamp = `${selected}|${pairs.map((pair) => pair.join(':')).join(',')}`;
  if (node.dataset.stamp === stamp) return;
  node.dataset.stamp = stamp;
  node.replaceChildren();
  for (const [value, label] of pairs) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.selected = value === selected;
    node.append(option);
  }
}

function renderWallpaperChoices() {
  const root = $('wallpaper-choices');
  const choices = (state.wallpapers.length ? state.wallpapers : previewState().wallpapers).slice();
  if (state.homepage.customWallpaper && !choices.some((item) => item.id === 'custom')) {
    choices.push({ id: 'custom', name: 'Yours' });
  }
  const stamp = `${state.homepage.wallpaper}|${state.homepage.customWallpaper}|${choices.map((item) => item.id).join(',')}`;
  if (root.dataset.stamp === stamp) {
    for (const button of root.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.id === state.homepage.wallpaper));
    return;
  }
  root.dataset.stamp = stamp;
  root.replaceChildren();
  for (const item of choices) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'wallpaper-choice';
    button.dataset.id = item.id;
    button.setAttribute('aria-label', item.name);
    button.setAttribute('aria-pressed', String(item.id === state.homepage.wallpaper));
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.textContent = item.name;
    button.append(swatch, label);
    button.addEventListener('click', () => saveHomepage({ wallpaper: item.id }));
    root.append(button);
  }
}

function renderEngineList() {
  const root = $('engine-list');
  root.replaceChildren();
  for (const engine of state.customSearchEngines || []) {
    const item = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = engine.name;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'text-button';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => removeEngine(engine.id));
    item.append(name, remove);
    root.append(item);
  }
}

async function saveHomepage(patch) {
  if (!home) {
    state.homepage = { ...state.homepage, ...patch };
    applySurface();
    renderShortcuts();
    renderWeather();
    renderClock();
    syncPanel();
    return;
  }
  applyPayload(await home.update(patch));
}

async function removeEngine(id) {
  if (!home) return;
  const result = await home.removeEngine(id);
  if (result?.state) applyPayload(result.state);
}

async function saveBrowser(patch) {
  if (!home) return;
  applyPayload(await home.setBrowserSetting(patch));
}

function openPanel(open) {
  $('panel').classList.toggle('open', open);
  $('panel').setAttribute('aria-hidden', open ? 'false' : 'true');
  const button = $('customize');
  button.setAttribute('aria-expanded', open ? 'true' : 'false');
  button.setAttribute('aria-label', open ? 'Close customization' : 'Customize homepage');
}

function closeMenu() {
  $('menu').hidden = true;
  $('menu').replaceChildren();
}

function openMenu(shortcut, x, y) {
  const menu = $('menu');
  menu.replaceChildren();
  const actions = [
    ['Open', () => openShortcut(shortcut, false)],
    ['Open in new tab', () => openShortcut(shortcut, true)],
    ['Edit', () => openShortcutEditor(shortcut)],
    ['Remove', () => saveHomepage({ shortcuts: state.homepage.shortcuts.filter((item) => item.id !== shortcut.id) })],
  ];
  for (const [label, action] of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => { closeMenu(); action(); });
    menu.append(button);
  }
  menu.hidden = false;
  const width = 190;
  menu.style.left = `${Math.max(12, Math.min(x, window.innerWidth - width - 12))}px`;
  menu.style.top = `${Math.max(12, y)}px`;
}

function openShortcutEditor(shortcut) {
  state.editing = shortcut;
  state.iconDraft = shortcut?.icon || '';
  $('shortcut-heading').textContent = shortcut ? 'Edit shortcut' : 'Add shortcut';
  $('shortcut-title').value = shortcut?.title || '';
  $('shortcut-url').value = shortcut?.url || '';
  $('shortcut-newtab').checked = !!shortcut?.openInNewTab;
  $('shortcut-remove').hidden = !shortcut;
  $('shortcut-error').hidden = true;
  $('shortcut-dialog').showModal();
  $('shortcut-title').focus();
}

function showSuggestions(items) {
  const list = $('suggestions');
  const input = $('search-input');
  state.suggestions = items;
  state.activeSuggestion = -1;
  list.replaceChildren();
  if (!items.length) {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    return;
  }
  items.forEach((item, index) => {
    const row = document.createElement('li');
    row.setAttribute('role', 'presentation');
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'option');
    button.id = `suggestion-${index}`;
    const title = document.createElement('span');
    title.textContent = item.title;
    const detail = document.createElement('small');
    detail.textContent = item.detail || '';
    button.append(title, detail);
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => chooseSuggestion(item));
    row.append(button);
    list.append(row);
  });
  list.hidden = false;
  input.setAttribute('aria-expanded', 'true');
}

function moveSuggestion(delta) {
  if (!state.suggestions.length) return;
  state.activeSuggestion = (state.activeSuggestion + delta + state.suggestions.length) % state.suggestions.length;
  [...$('suggestions').querySelectorAll('button')].forEach((button, index) => {
    button.setAttribute('aria-selected', String(index === state.activeSuggestion));
  });
  $('search-input').setAttribute('aria-activedescendant', `suggestion-${state.activeSuggestion}`);
}

async function refreshSuggestions() {
  const query = $('search-input').value;
  const seq = ++suggestSeq;
  if (!home) {
    const recent = (state.homepage.recentSearches || []).filter((item) => !query || item.toLowerCase().includes(query.toLowerCase()));
    if (seq !== suggestSeq) return;
    showSuggestions(recent.map((item) => ({ title: item, detail: 'Recent', kind: 'recent', query: item })));
    return;
  }
  const result = await home.suggest(query);
  if (seq !== suggestSeq) return;
  const items = [];
  for (const recent of result.recent || []) items.push({ title: recent, detail: 'Recent', kind: 'recent', query: recent });
  for (const local of result.local || []) items.push({ title: local.title, detail: local.detail, kind: local.kind, url: local.url, query: local.title });
  for (const remote of result.remote || []) {
    if (items.some((item) => item.title.toLowerCase() === remote.toLowerCase())) continue;
    items.push({ title: remote, detail: 'Suggestion', kind: 'remote', query: remote });
  }
  showSuggestions(items.slice(0, 8));
}

async function chooseSuggestion(item) {
  $('suggestions').hidden = true;
  if (item.url && (item.kind === 'history' || item.kind === 'bookmark' || item.kind === 'go')) {
    if (home) await home.open({ url: item.url, newTab: false });
    return;
  }
  $('search-input').value = item.query || item.title;
  submitSearch(item.query || item.title);
}

async function submitSearch(input) {
  const text = String(input || '').trim();
  $('search-note').hidden = true;
  if (!text) return;
  if (!home) {
    $('search-note').hidden = false;
    $('search-note').textContent = 'Search runs inside RightTab.';
    return;
  }
  const result = await home.submit(text);
  if (result && result.ok === false && result.error) {
    $('search-note').hidden = false;
    $('search-note').textContent = result.error;
  }
}

function renderWeatherDialog() {
  const body = $('weather-body');
  body.replaceChildren();
  const weather = state.weather;
  const wrap = document.createElement('div');
  wrap.className = 'forecast';
  if (weather) {
    const current = document.createElement('p');
    const unit = weather.unit === 'celsius' ? 'C' : 'F';
    current.textContent = `${weather.temperature}°${unit} · ${weather.label}`;
    wrap.append(current);
    if (weather.hourly?.length) {
      const hourly = document.createElement('div');
      hourly.className = 'hourly';
      for (const point of weather.hourly.slice(0, 8)) {
        const cell = document.createElement('div');
        cell.className = 'hour';
        const hour = point.time.slice(11, 16) || point.time;
        cell.textContent = `${hour}\n${point.temperature}°`;
        hourly.append(cell);
      }
      wrap.append(hourly);
    }
    if (weather.daily?.length) {
      const daily = document.createElement('div');
      daily.className = 'daily';
      for (const day of weather.daily) {
        const cell = document.createElement('div');
        cell.className = 'day';
        cell.textContent = `${day.time.slice(5)}\n${day.high}° / ${day.low}°`;
        daily.append(cell);
      }
      wrap.append(daily);
    }
  } else {
    const empty = document.createElement('p');
    empty.textContent = state.homepage.weatherLocation ? 'Weather is unavailable right now.' : 'Add a city to see the weather. RightTab will not guess.';
    wrap.append(empty);
  }
  const row = document.createElement('div');
  row.className = 'city-row';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'City name';
  input.setAttribute('aria-label', 'City name');
  input.value = state.homepage.weatherLocation?.name || '';
  const search = document.createElement('button');
  search.type = 'button';
  search.className = 'primary';
  search.textContent = 'Find';
  const locate = document.createElement('button');
  locate.type = 'button';
  locate.className = 'text-button';
  locate.textContent = 'Use this Mac’s location';
  const places = document.createElement('ul');
  places.className = 'places';
  search.addEventListener('click', async () => {
    places.replaceChildren();
    if (!home) return;
    const found = await home.geocode(input.value);
    for (const place of found.places || []) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = [place.name, place.region].filter(Boolean).join(', ');
      button.addEventListener('click', () => selectPlace(place));
      item.append(button);
      places.append(item);
    }
    if (!(found.places || []).length) {
      const item = document.createElement('li');
      item.textContent = found.error || 'No matching city.';
      places.append(item);
    }
  });
  locate.addEventListener('click', () => requestDeviceLocation());
  row.append(input, search);
  wrap.append(row, locate, places);
  body.append(wrap);
}

async function selectPlace(place) {
  if (!home) return;
  const result = await home.weather({ location: place, unit: $('weather-unit').value, refresh: true });
  if (result?.weather) state.weather = result.weather;
  if (result?.state) applyPayload(result.state);
  else renderWeather();
  renderWeatherDialog();
}

function requestDeviceLocation() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(async (position) => {
    await selectPlace({
      name: '',
      region: '',
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    });
  }, () => {
    const note = document.createElement('p');
    note.className = 'hint';
    note.textContent = 'Location permission was denied. Enter a city instead.';
    $('weather-body').append(note);
  }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
}

function renderCalendar() {
  const cursor = calendarCursor;
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  $('calendar-title').textContent = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: state.homepage.timeZone || undefined }).format(first);
  const grid = $('calendar-grid');
  grid.replaceChildren();
  for (const label of ['S', 'M', 'T', 'W', 'T', 'F', 'S']) {
    const cell = document.createElement('b');
    cell.textContent = label;
    grid.append(cell);
  }
  for (let index = 0; index < first.getDay(); index += 1) grid.append(document.createElement('span'));
  const today = new Date();
  for (let day = 1; day <= days; day += 1) {
    const cell = document.createElement('span');
    cell.textContent = String(day);
    if (day === today.getDate() && month === today.getMonth() && year === today.getFullYear()) cell.className = 'today';
    grid.append(cell);
  }
}

function bind() {
  $('customize').addEventListener('click', () => openPanel(!$('panel').classList.contains('open')));
  $('search-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const chosen = state.suggestions[state.activeSuggestion];
    if (chosen) chooseSuggestion(chosen);
    else submitSearch($('search-input').value);
  });
  $('search-input').addEventListener('focus', () => refreshSuggestions());
  $('search-input').addEventListener('input', () => {
    clearTimeout(suggestTimer);
    suggestTimer = setTimeout(refreshSuggestions, 140);
  });
  $('search-input').addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); moveSuggestion(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); moveSuggestion(-1); }
    else if (event.key === 'Escape') {
      $('suggestions').hidden = true;
      $('search-input').setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('#search-form')) $('suggestions').hidden = true;
    if (!event.target.closest('#menu')) closeMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (!$('menu').hidden) closeMenu();
      else if ($('panel').classList.contains('open')) openPanel(false);
    }
  });

  const pageToggle = (id, key) => $(id).addEventListener('change', () => saveHomepage({ [key]: $(id).checked }));
  pageToggle('show-logo', 'showLogo');
  pageToggle('show-shortcuts', 'showShortcuts');
  pageToggle('show-weather', 'showWeather');
  pageToggle('show-clock', 'showClock');
  pageToggle('show-seconds', 'showSeconds');
  pageToggle('clock-glass', 'clockGlass');
  pageToggle('reduced-transparency', 'reducedTransparency');
  $('clock-format').addEventListener('change', () => saveHomepage({ clockFormat: $('clock-format').value }));
  $('time-zone').addEventListener('change', () => saveHomepage({ timeZone: $('time-zone').value }));
  $('weather-unit').addEventListener('change', async () => {
    const unit = $('weather-unit').value;
    await saveHomepage({ weatherUnit: unit });
    if (home && state.homepage.weatherLocation) {
      const result = await home.weather({ unit, refresh: true });
      if (result?.state) applyPayload(result.state);
      else if (result?.weather) { state.weather = result.weather; renderWeather(); }
    }
  });
  $('shortcut-size').addEventListener('change', () => saveHomepage({ shortcutSize: $('shortcut-size').value }));
  $('shortcut-density').addEventListener('change', () => saveHomepage({ shortcutDensity: Number($('shortcut-density').value) }));
  $('icon-style').addEventListener('change', () => saveHomepage({ iconStyle: $('icon-style').value }));
  $('contrast').addEventListener('change', () => saveHomepage({ contrast: $('contrast').value }));
  const slider = (id, key, scale) => {
    let timer = 0;
    $(id).addEventListener('input', () => {
      paintRange($(id));
      clearTimeout(timer);
      timer = setTimeout(() => saveHomepage({ [key]: Number($(id).value) / scale }), 80);
    });
  };
  slider('glass', 'glass', 100);
  slider('dimming', 'dimming', 100);
  slider('content-shift', 'contentShift', 1);
  $('theme-preset').addEventListener('change', () => saveBrowser({ appearance: { selected: $('theme-preset').value, followSystem: false } }));
  $('follow-system').addEventListener('change', () => saveBrowser({ appearance: { followSystem: $('follow-system').checked } }));
  $('accent').addEventListener('input', () => saveHomepage({ accent: $('accent').value }));
  $('accent-reset').addEventListener('click', () => saveHomepage({ accent: '' }));
  $('search-engine').addEventListener('change', () => saveBrowser({ searchEngine: $('search-engine').value }));
  $('search-suggestions').addEventListener('change', () => saveBrowser({ searchSuggestions: $('search-suggestions').checked }));
  $('add-engine').addEventListener('click', async () => {
    if (!home) return;
    const result = await home.addEngine({ name: $('custom-engine-name').value, template: $('custom-engine-template').value });
    if (result?.error) {
      $('custom-engine-template').setCustomValidity(result.error);
      $('custom-engine-template').reportValidity();
      return;
    }
    $('custom-engine-name').value = '';
    $('custom-engine-template').value = '';
    if (result?.state) applyPayload(result.state);
  });
  $('upload-wallpaper').addEventListener('click', async () => {
    if (!home) return;
    const result = await home.pickImage('wallpaper');
    if (result?.state) applyPayload(result.state);
  });
  $('weather').addEventListener('click', () => {
    renderWeatherDialog();
    $('weather-dialog').showModal();
    if (home && state.homepage.weatherLocation) {
      home.weather({}).then((result) => {
        if (result?.weather) state.weather = result.weather;
        if (result?.state) applyPayload(result.state);
        if ($('weather-dialog').open) renderWeatherDialog();
        renderWeather();
      });
    }
  });
  $('weather-close').addEventListener('click', () => $('weather-dialog').close());
  $('clock').addEventListener('click', () => {
    calendarCursor = new Date();
    renderCalendar();
    $('calendar-dialog').showModal();
  });
  $('calendar-prev').addEventListener('click', () => { calendarCursor.setMonth(calendarCursor.getMonth() - 1); renderCalendar(); });
  $('calendar-next').addEventListener('click', () => { calendarCursor.setMonth(calendarCursor.getMonth() + 1); renderCalendar(); });
  $('calendar-close').addEventListener('click', () => $('calendar-dialog').close());
  $('shortcut-cancel').addEventListener('click', () => $('shortcut-dialog').close());
  $('shortcut-remove').addEventListener('click', () => {
    if (!state.editing) return;
    const id = state.editing.id;
    $('shortcut-dialog').close();
    saveHomepage({ shortcuts: state.homepage.shortcuts.filter((item) => item.id !== id) });
  });
  $('shortcut-icon').addEventListener('click', async () => {
    if (!home) return;
    const result = await home.pickImage('icon');
    if (result?.url) state.iconDraft = result.url;
  });
  $('shortcut-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const draft = {
      id: state.editing?.id || `s-${Date.now().toString(36)}`,
      title: $('shortcut-title').value,
      url: $('shortcut-url').value,
      icon: state.iconDraft,
      openInNewTab: $('shortcut-newtab').checked,
    };
    const list = state.homepage.shortcuts.slice();
    const index = list.findIndex((item) => item.id === draft.id);
    if (index >= 0) list[index] = { ...list[index], ...draft };
    else list.push(draft);
    $('shortcut-dialog').close();
    saveHomepage({ shortcuts: list });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(clockTimer);
    else tickClock();
  });
}

bind();
applyPayload(previewState());
tickClock();
if (home) {
  home.getState().then((payload) => {
    applyPayload(payload);
    $('search-input').focus();
  }).catch(() => {});
  home.onChange((payload) => applyPayload(payload));
} else {
  $('search-input').focus();
}
