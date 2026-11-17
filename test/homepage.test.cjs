const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSettings, applySettingsPatch } = require('../shared/settings.cjs');
const { newTabUrl, homepageUrl } = require('../shared/url.cjs');
const {
  addShortcut,
  updateShortcut,
  removeShortcut,
  reorderShortcuts,
  normalizeHomepage,
  homepageVars,
  parseForecast,
  readCachedWeather,
  formatClock,
  monthGrid,
  resolveHomepageRoute,
  rememberSearch,
} = require('../shared/homepage.cjs');

test('homepage preferences round-trip without losing shortcuts or a saved startup page', () => {
  const first = normalizeSettings({ startupPage: 'chatgpt' });
  assert.equal(first.homepage.shortcuts.length, 5);
  assert.equal(first.homepage.showClock, true);
  const hidden = applySettingsPatch(first, { homepage: { showClock: false, wallpaper: 'alpine' } });
  assert.equal(hidden.startupPage, 'chatgpt');
  assert.equal(hidden.homepage.showClock, false);
  assert.equal(hidden.homepage.wallpaper, 'alpine');
  assert.equal(hidden.homepage.shortcuts[0].title, 'YouTube');
  assert.equal(homepageUrl(hidden.startupPage), 'https://chatgpt.com/');
  assert.equal(newTabUrl(hidden), 'righttab://newtab/');
  const again = normalizeSettings(JSON.parse(JSON.stringify(hidden)));
  assert.equal(again.homepage.showClock, false);
  assert.equal(again.homepage.shortcuts.length, 5);
  assert.equal(again.homepage.iconStyle, 'default');
});

test('shortcut icon style stays on the homepage and rejects unknown values', () => {
  assert.equal(normalizeHomepage({}).iconStyle, 'default');
  assert.equal(normalizeHomepage({ iconStyle: 'nope' }).iconStyle, 'default');
  const clear = applySettingsPatch(normalizeSettings({}), { homepage: { iconStyle: 'clear' } });
  assert.equal(clear.homepage.iconStyle, 'clear');
  const colored = applySettingsPatch(clear, { homepage: { iconStyle: 'clear-colored' } });
  assert.equal(colored.homepage.iconStyle, 'clear-colored');
  assert.equal(colored.homepage.shortcuts.length, 5);
});

test('shortcuts can be added, renamed, reordered, and removed', () => {
  const initial = normalizeHomepage({ shortcuts: [] }).shortcuts;
  assert.deepEqual(initial, []);
  const added = addShortcut([], { id: 'notes', title: 'Notes', url: 'https://example.com/notes' });
  assert.equal(added.shortcuts.length, 1);
  const renamed = updateShortcut(added.shortcuts, { ...added.shortcuts[0], title: 'Field notes' });
  assert.equal(renamed.shortcuts[0].title, 'Field notes');
  const second = addShortcut(renamed.shortcuts, { id: 'maps', title: 'Maps', url: 'https://example.com/maps' });
  const flipped = reorderShortcuts(second.shortcuts, ['maps', 'notes']);
  assert.deepEqual(flipped.map((item) => item.id), ['maps', 'notes']);
  assert.deepEqual(removeShortcut(flipped, 'notes').map((item) => item.id), ['maps']);
  const rejected = addShortcut(flipped, { id: 'bad', title: 'Bad', url: 'javascript:alert(1)' });
  assert.match(rejected.error, /http/);
  assert.equal(rejected.shortcuts.length, 2);
});

test('theme changes recolor the page and leave the logo untinted', () => {
  const dark = homepageVars({ mode: 'dark', colors: { accent: '#A5D8FF' } }, { wallpaper: 'summit' });
  const light = homepageVars({ mode: 'light', colors: { accent: '#5261D8' } }, { wallpaper: 'alpine' });
  const custom = homepageVars({ mode: 'dark', colors: { accent: '#A5D8FF' } }, { wallpaper: 'summit', accent: '#C47A7A' });
  assert.equal(dark.tone, 'dark');
  assert.equal(light.tone, 'light');
  assert.equal(dark.vars['--rt-text-primary'], '#ffffff');
  assert.equal(light.vars['--rt-text-primary'], '#1c1a17');
  assert.equal(dark.vars['--rt-accent'], '#A5D8FF');
  assert.equal(custom.vars['--rt-accent'], '#C47A7A');
  assert.equal(custom.vars['--rt-logo'], undefined);
  const flat = homepageVars({ mode: 'dark', colors: { accent: '#A5D8FF' } }, { reducedTransparency: true });
  assert.equal(flat.vars['--rt-glass-blur'], '0px');
});

test('weather is shown only from a real report and expired cache is not treated as current', () => {
  const report = parseForecast({
    current: { temperature_2m: 72.2, weather_code: 1, is_day: 1, time: '2026-11-17T09:00' },
    hourly: { time: ['2026-11-17T08:00', '2026-11-17T10:00'], temperature_2m: [70, 73], weather_code: [1, 2] },
    daily: { time: ['2026-11-17'], weather_code: [1], temperature_2m_max: [74], temperature_2m_min: [61] },
  }, { name: 'Ephrata', region: 'Pennsylvania, United States' }, 'fahrenheit');
  assert.equal(report.temperature, 72);
  assert.equal(report.label, 'Mostly clear');
  assert.equal(report.hourly.length, 1);
  assert.equal(report.hourly[0].time, '2026-11-17T10:00');
  assert.equal(parseForecast({ current: { weather_code: 1 } }, {}, 'fahrenheit'), null);
  const location = { name: 'Ephrata', region: '', latitude: 40.179, longitude: -76.179 };
  const cache = { fetchedAt: 1_000, unit: 'fahrenheit', locationKey: '40.179,-76.179', report };
  assert.equal(readCachedWeather(cache, location, 'fahrenheit', 1_000 + 31 * 60 * 1000), null);
  assert.equal(readCachedWeather(cache, location, 'fahrenheit', 1_000 + 60 * 1000).temperature, 72);
  assert.equal(readCachedWeather({ ...cache, report: { temperature: 70 } }, location, 'fahrenheit', 2_000), null);
});

test('the clock uses the requested hour cycle and the calendar knows the month', () => {
  const shown = formatClock(new Date('2026-11-17T14:41:05Z'), { hour12: true, seconds: false, timeZone: 'UTC' });
  assert.equal(shown.time, '2:41 PM');
  assert.equal(shown.date, 'Tuesday, November 17');
  const full = formatClock(new Date('2026-11-17T14:41:05Z'), { hour12: false, seconds: true, timeZone: 'UTC' });
  assert.match(full.time, /14:41:05/);
  assert.deepEqual(monthGrid(2026, 10), { year: 2026, month: 10, start: 0, days: 30 });
});

test('the start page only serves its own files', () => {
  assert.equal(resolveHomepageRoute('/logo.png').file, 'logo.png');
  assert.equal(resolveHomepageRoute('/wallpapers/summit.jpg').file, 'summit.jpg');
  assert.equal(resolveHomepageRoute('/wallpapers/secret.jpg'), null);
  assert.equal(resolveHomepageRoute('/user/icon/abcd1234.png').file, 'abcd1234.png');
  assert.equal(resolveHomepageRoute('/user/wallpaper/../settings.json'), null);
  assert.equal(resolveHomepageRoute('/%2e%2e/settings.json'), null);
});

test('recent searches stay short and case-insensitive', () => {
  const once = rememberSearch([], '  Mountain weather ');
  const twice = rememberSearch(once, 'mountain weather');
  assert.deepEqual(twice, ['mountain weather']);
});
