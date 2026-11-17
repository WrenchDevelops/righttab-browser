(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RightTabThemes = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const fields = ['toolbar', 'bookmarks', 'sidebar', 'address', 'active', 'accent', 'text', 'icons'];
  const rows = [
    ['cloud', 'Cloud', 'light', '#F8F7FF', '#DCE3F8', '#E7EAF3', '#FFFFFF', '#5261D8', '#343B49'],
    ['midnight', 'Midnight', 'dark', '#172238', '#24344E', '#101C30', '#394F72', '#A5D8FF', '#F0F5FF'],
    ['matcha', 'Matcha', 'light', '#FAF7ED', '#D7E2CD', '#ECEFDF', '#F9FCF3', '#326143', '#293C2D'],
    ['strawberry-milk', 'Strawberry Milk', 'light', '#FFFAF7', '#F4DCE5', '#F5E9EF', '#F6BED1', '#A53562', '#542D40'],
    ['glacier', 'Glacier', 'light', '#F7FCFF', '#D8EBF5', '#E3F0F7', '#FFFFFF', '#08738D', '#263E4B'],
    ['espresso', 'Espresso', 'light', '#F5ECDE', '#D9C4AF', '#E9DCCB', '#FFF8ED', '#8A4D20', '#453126'],
    ['lavender-haze', 'Lavender Haze', 'light', '#F6F0FC', '#DED0EC', '#EBDFF5', '#FCF8FF', '#7543AC', '#443252'],
    ['graphite', 'Graphite', 'dark', '#292B30', '#191B20', '#35383F', '#454A53', '#E0E3EA', '#F3F4F6'],
    ['sunset', 'Sunset', 'light', '#FFF8EE', '#F5D8C7', '#F5E7DC', '#FFEFE5', '#AE493B', '#563C50'],
    ['ocean', 'Ocean', 'dark', '#102E49', '#103C43', '#0B2439', '#225965', '#65E0D3', '#E8F9FB'],
    ['cherry', 'Cherry', 'dark', '#3C1828', '#2B1222', '#4C2134', '#683147', '#FF9CA9', '#FFF4DF'],
    ['retro-computer', 'Retro Computer', 'light', '#EDEAE2', '#D5D0C3', '#F8F5ED', '#FFFCF3', '#A84D12', '#3E3D38'],
  ];
  const presets = rows.map(([id, name, mode, toolbar, sidebar, address, active, accent, text]) => Object.freeze({
    id, name, mode, corners: 'rounded', colors: Object.freeze({ toolbar, bookmarks: toolbar, sidebar, address, active, accent, text, icons: text }),
  }));
  const hex = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
  function validate(value, file = false) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Theme must be an object.');
    const allowed = file ? ['format', 'version', 'theme'] : ['id', 'name', 'mode', 'corners', 'colors'];
    if (Object.keys(value).some(key => !allowed.includes(key))) throw Error('Unknown theme fields. Only theme data is allowed.');
    if (file) {
      if (value.format !== 'righttab-theme' || value.version !== 1) throw Error('Unsupported theme format or version. Expected RightTab theme version 1.');
      return validate(value.theme);
    }
    if (typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 60 || /[\x00-\x1f]/.test(value.name)) throw Error('Use a theme name of 1–60 characters.');
    if (!['light', 'dark'].includes(value.mode)) throw Error('Menu appearance must be light or dark.');
    if (!['rounded', 'square'].includes(value.corners)) throw Error('Invalid button corner style.');
    if (!value.colors || Object.keys(value.colors).length !== fields.length || fields.some(key => !hex(value.colors[key]))) throw Error('Every theme color must be a six-digit hex value, such as #AABBCC.');
    return { name: value.name.trim(), mode: value.mode, corners: value.corners, colors: Object.fromEntries(fields.map(key => [key, value.colors[key].toUpperCase()])) };
  }
  function normalize(input) {
    const source = input && typeof input === 'object' ? input : {};
    const custom = [];
    for (const item of Array.isArray(source.custom) ? source.custom.slice(0, 100) : []) {
      try {
        if (!/^custom-[a-z0-9-]{1,80}$/.test(item.id) || custom.some(t => t.id === item.id || t.name.toLowerCase() === item.name?.toLowerCase()) || presets.some(t => t.name.toLowerCase() === item.name?.toLowerCase())) continue;
        custom.push({ ...validate(item), id: item.id });
      } catch { /* invalid saved theme */ }
    }
    const all = [...presets, ...custom];
    const validId = id => all.some(t => t.id === id);
    return { selected: validId(source.selected) ? source.selected : 'cloud', followSystem: source.followSystem === true,
      light: all.some(t => t.id === source.light && t.mode === 'light') ? source.light : 'cloud',
      dark: all.some(t => t.id === source.dark && t.mode === 'dark') ? source.dark : 'midnight', custom };
  }
  function resolve(settings, dark) {
    const config = normalize(settings.appearance);
    const id = config.followSystem ? (dark ? config.dark : config.light) : config.selected;
    return [...presets, ...config.custom].find(t => t.id === id) || presets[0];
  }
  const rgb = color => color.slice(1).match(/../g).map(x => parseInt(x, 16));
  function mix(a, b, amount) { return '#' + rgb(a).map((v, i) => Math.round(v + (rgb(b)[i] - v) * amount).toString(16).padStart(2, '0')).join(''); }
  function luminance(color) { return rgb(color).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0); }
  function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
  function readable(color, background, ratio = 4.5) {
    if (contrast(color, background) >= ratio) return color;
    const target = contrast('#151515', background) > contrast('#FFFFFF', background) ? '#151515' : '#FFFFFF';
    for (let n = 1; n <= 100; n++) { const candidate = mix(color, target, n / 100); if (contrast(candidate, background) >= ratio) return candidate; }
    return target;
  }
  function issues(theme) {
    const c = theme.colors;
    return ['toolbar', 'bookmarks', 'sidebar', 'address', 'active'].flatMap(key => [
      ...(contrast(c.text, c[key]) < 4.5 ? [`Text on ${key}`] : []),
      ...(contrast(c.icons, c[key]) < 3 ? [`Icons on ${key}`] : []),
    ]);
  }
  function adjust(theme) {
    const copy = JSON.parse(JSON.stringify(theme));
    const c = copy.colors;
    // Preserve chosen surfaces where possible, then adjust only the surfaces that conflict.
    c.text = readable(c.text, c.toolbar);
    c.icons = readable(c.icons, c.toolbar, 3);
    for (const key of ['bookmarks', 'sidebar', 'address', 'active']) {
      const target = luminance(c.text) > .45 ? '#000000' : '#FFFFFF';
      for (let n = 0; n < 100 && (contrast(c.text, c[key]) < 4.5 || contrast(c.icons, c[key]) < 3); n++) c[key] = mix(c[key], target, .08);
    }
    return copy;
  }
  function tokens(theme) {
    const c = theme.colors, dark = theme.mode === 'dark';
    const surface = dark ? mix(c.toolbar, '#FFFFFF', .06) : '#FFFFFF';
    const menuText = readable(c.text, surface);
    const result = { bg: c.toolbar, toolbar: c.toolbar, bookmarks: c.bookmarks, sidebar: c.sidebar, omnibox: c.address, active: c.active,
      text: c.text, icons: c.icons, accent: c.accent, surface, 'surface-2': mix(surface, c.accent, .07),
      muted: readable(mix(c.text, surface, .22), surface), border: mix(surface, menuText, .22),
      hover: mix(c.sidebar, c.text, .09), pressed: mix(c.sidebar, c.text, .17), 'accent-soft': mix(surface, c.accent, .15),
      'on-accent': readable('#FFFFFF', c.accent), 'menu-text': menuText, focus: readable(c.accent, surface, 3),
      danger: dark ? '#FFACA8' : '#B12330', success: dark ? '#A0DFB1' : '#246D3E', warning: dark ? '#FFE19B' : '#7A5300',
      'button-radius': theme.corners === 'square' ? '6px' : '12px', shadow: dark ? '0 8px 28px #00000055' : '0 8px 28px #19213818' };
    for (const key of ['toolbar', 'bookmarks', 'sidebar', 'address', 'active']) {
      result[`${key}-text`] = readable(c.text, c[key]);
      result[`${key}-icons`] = readable(c.icons, c[key], 3);
    }
    return result;
  }
  function apply(element, theme) {
    element.dataset.theme = theme.mode;
    element.dataset.preset = theme.id || 'custom';
    element.style.colorScheme = theme.mode;
    for (const [key, value] of Object.entries(tokens(theme))) element.style.setProperty('--' + key, value);
  }
  return { presets, fields, validate, normalize, resolve, tokens, apply, contrast, issues, adjust };
});
