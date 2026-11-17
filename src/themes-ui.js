const Themes = RightTabThemes;
let themeFilter = 'all';
let themeDraft = null;
let themeOriginal = null;
let themeMessage = '';
const colorLabels = { toolbar: 'Toolbar background', bookmarks: 'Bookmarks bar background', sidebar: 'Sidebar background', address: 'Address bar background', active: 'Active tab background', accent: 'Accent color', text: 'Primary text', icons: 'Icon color' };
const themeConfig = () => Themes.normalize(state.settings.appearance);
const allThemes = () => [...Themes.presets, ...themeConfig().custom];
const currentTheme = () => Themes.resolve(state.settings, state.dark);
function miniTheme(theme) {
  const vars = Object.entries(Themes.tokens(theme)).map(([k, v]) => `--${k}:${v}`).join(';');
  return `<div class="theme-mini" style="${vars}" aria-hidden="true"><div class="mini-toolbar"><span>•••</span><div class="mini-address">Search or enter address</div><span>☰</span></div><div class="mini-bookmarks">☆ Bookmarks</div><div class="mini-content"><div class="mini-sidebar"><div class="mini-tab chosen">◉ New tab</div><div class="mini-tab">○ Another tab</div><span>＋</span></div><div class="mini-page"><div></div><div></div></div></div></div>`;
}
function uniqueThemeName(name) {
  const names = allThemes().map(t => t.name.toLowerCase());
  if (!names.includes(name.toLowerCase())) return name;
  let n = 2;
  while (names.includes(`${name.slice(0, 54)} ${n}`.toLowerCase())) n++;
  return `${name.slice(0, 54)} ${n}`;
}
function beginTheme(theme, editing = false) {
  themeDraft = JSON.parse(JSON.stringify(theme));
  if (!editing || !theme.id?.startsWith('custom-')) {
    delete themeDraft.id;
    themeDraft.name = uniqueThemeName(`${theme.name.slice(0, 52)} copy`);
  }
  themeOriginal = JSON.parse(JSON.stringify(themeDraft));
  themeMessage = '';
  renderOverlay();
  $('theme-name')?.focus();
}
async function persistAppearance(patch) {
  const appearance = Themes.normalize({ ...themeConfig(), ...patch });
  const settings = await rt.setSetting({ appearance });
  state.settings = settings;
  state.resolvedTheme = Themes.resolve(state.settings, state.dark);
  apply();
}
function appearanceHtml() {
  if (themeDraft) return themeEditorHtml();
  const config = themeConfig(), selected = currentTheme();
  const visible = allThemes().filter(t => themeFilter === 'all' || (themeFilter === 'custom' ? t.id.startsWith('custom-') : t.mode === themeFilter));
  const options = mode => allThemes().filter(t => t.mode === mode).map(t => `<option value="${esc(t.id)}" ${config[mode] === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
  return `${settingsHead('Appearance', 'Themes change RightTab’s chrome. Pages you visit keep their own colors.')}
    <div class="theme-heading"><div class="theme-filters" role="group" aria-label="Filter themes">${['all', 'light', 'dark', 'custom'].map(f => `<button class="secondary" type="button" data-theme-filter="${f}" aria-pressed="${themeFilter === f}">${f[0].toUpperCase() + f.slice(1)}</button>`).join('')}</div><button class="primary" type="button" id="create-theme">Create theme</button></div>
    <p id="theme-message" role="status">${esc(themeMessage)}</p>
    <div class="theme-grid">${visible.map(t => `<button class="theme-card" type="button" data-theme-id="${esc(t.id)}" aria-pressed="${t.id === selected.id}">${miniTheme(t)}<span>${esc(t.name)}<b>${t.id === selected.id ? 'Selected' : t.mode === 'dark' ? 'Dark' : 'Light'}</b></span></button>`).join('') || '<p class="settings-empty">No custom themes yet. Create one from any preset.</p>'}</div>
    <section class="settings-block"><div class="settings-block-label"><h3>This theme</h3><p>${esc(selected.name)} is the chrome you see now.</p></div>
      <div class="settings-group"><div class="row"><div><strong>${esc(selected.name)}</strong><p>${selected.id.startsWith('custom-') ? 'Custom theme' : 'Built-in theme'}</p></div><div class="actions-row"><button class="secondary" type="button" id="edit-theme">${selected.id.startsWith('custom-') ? 'Edit' : 'Edit a copy'}</button><button class="secondary" type="button" id="duplicate-theme">Duplicate</button>${selected.id.startsWith('custom-') ? '<button class="secondary" type="button" id="export-theme">Export</button><button class="secondary quiet-danger" type="button" id="delete-theme">Delete</button>' : ''}</div></div></div>
      <div class="actions-row settings-actions"><button class="secondary" type="button" id="import-theme">Import JSON…</button><button class="secondary" type="button" id="reset-cloud">Reset to Cloud</button></div>
    </section>
    <section class="settings-block"><div class="settings-block-label"><h3>System</h3><p>Use one preset in daylight and another at night.</p></div>
      <div class="settings-group">
        <label class="row" for="follow-system"><div><strong>Follow system appearance</strong><p>Switch presets when the Mac changes between light and dark.</p></div><input id="follow-system" type="checkbox" ${config.followSystem ? 'checked' : ''}></label>
        <div class="system-themes"><label>Light preset<select id="system-light">${options('light')}</select></label><label>Dark preset<select id="system-dark">${options('dark')}</select></label></div>
        <label class="row" for="show-bookmarks"><div><strong>Bookmark bar</strong><p>Shown under the address bar.</p></div><input id="show-bookmarks" type="checkbox" ${state.settings.showBookmarkBar ? 'checked' : ''}></label>
      </div>
      <p class="settings-footnote">Drag the sidebar edge to resize it, or collapse it to favicons.</p>
    </section>`;
}
function themeEditorHtml() {
  return `${settingsHead(themeDraft.id ? 'Edit theme' : 'Create theme', 'Preview changes here, then save to apply them.')}<label class="theme-name">Theme name<input id="theme-name" maxlength="60" value="${esc(themeDraft.name)}"></label>
    <div id="draft-preview">${miniTheme(themeDraft)}</div><div class="color-grid">${Themes.fields.map(key => `<label class="color-field">${colorLabels[key]}<span><input type="color" data-color="${key}" value="${themeDraft.colors[key]}" aria-label="${colorLabels[key]} picker"><input data-hex="${key}" value="${themeDraft.colors[key]}" maxlength="7" pattern="#[0-9a-fA-F]{6}" aria-label="${colorLabels[key]} hex"></span></label>`).join('')}</div>
    <div class="system-themes"><label>Menus and dialogs<select id="draft-mode"><option value="light" ${themeDraft.mode === 'light' ? 'selected' : ''}>Light defaults</option><option value="dark" ${themeDraft.mode === 'dark' ? 'selected' : ''}>Dark defaults</option></select></label><label>Button corners<select id="draft-corners"><option value="rounded" ${themeDraft.corners === 'rounded' ? 'selected' : ''}>Rounded</option><option value="square" ${themeDraft.corners === 'square' ? 'selected' : ''}>Slightly squared</option></select></label></div>
    <p id="contrast-warning" role="status"></p><p class="note">The browser also adjusts foreground colors per surface to keep text readable.</p><p id="theme-message" role="alert">${esc(themeMessage)}</p>
    <div class="actions-row"><button class="primary" id="save-theme">Save and apply</button><button class="secondary" id="cancel-theme">Cancel</button><button class="secondary" id="reset-draft">Reset</button><button class="secondary" id="adjust-theme">Auto adjust contrast</button></div>`;
}
function updateDraftPreview() {
  $('draft-preview').innerHTML = miniTheme(themeDraft);
  const issues = Themes.issues(themeDraft);
  $('contrast-warning').textContent = issues.length ? `Low contrast: ${issues.join(', ')}. Auto adjust before saving, or choose different colors.` : 'Contrast looks good across browser surfaces.';
  $('save-theme').disabled = issues.length > 0 || !!document.querySelector('[data-hex]:invalid');
}
function bindThemes() {
  if (screen !== 'settings' || settingsPane !== 'appearance') return;
  const on = (id, fn) => { if ($(id)) $(id).onclick = fn; };
  if (themeDraft) {
    $('theme-name').oninput = e => { themeDraft.name = e.target.value; };
    document.querySelectorAll('[data-color], [data-hex]').forEach(input => { input.oninput = () => {
      const key = input.dataset.color || input.dataset.hex;
      if (/^#[0-9a-f]{6}$/i.test(input.value)) {
        themeDraft.colors[key] = input.value.toUpperCase();
        document.querySelector(`[data-color="${key}"]`).value = input.value;
        document.querySelector(`[data-hex="${key}"]`).value = themeDraft.colors[key];
      }
      updateDraftPreview();
    }; });
    $('draft-mode').onchange = e => { themeDraft.mode = e.target.value; updateDraftPreview(); };
    $('draft-corners').onchange = e => { themeDraft.corners = e.target.value; updateDraftPreview(); };
    on('cancel-theme', () => { themeDraft = null; themeMessage = ''; renderOverlay(); $('create-theme')?.focus(); });
    on('reset-draft', () => { themeDraft = JSON.parse(JSON.stringify(themeOriginal)); renderOverlay(); });
    on('adjust-theme', () => { themeDraft = Themes.adjust(themeDraft); renderOverlay(); });
    on('save-theme', async () => {
      try {
        const clean = Themes.validate(themeDraft);
        if (allThemes().some(t => t.id !== themeDraft.id && t.name.toLowerCase() === clean.name.toLowerCase())) throw Error('That name is already used. Choose a different theme name.');
        if (Themes.issues(clean).length) throw Error('Please adjust the low-contrast colors before saving.');
        const id = themeDraft.id || `custom-${crypto.randomUUID()}`;
        const custom = [...themeConfig().custom.filter(t => t.id !== id), { ...clean, id }];
        if (custom.length > 100) throw Error('You can save up to 100 custom themes. Delete one before adding another.');
        await persistAppearance({ custom, selected: id, followSystem: false });
        themeDraft = null; themeMessage = 'Theme saved.'; renderOverlay();
        document.querySelector(`[data-theme-id="${id}"]`)?.focus();
      } catch (error) { $('theme-message').textContent = error.message; }
    });
    updateDraftPreview(); return;
  }
  document.querySelectorAll('[data-theme-filter]').forEach(b => b.onclick = () => { themeFilter = b.dataset.themeFilter; renderOverlay(); document.querySelector(`[data-theme-filter="${themeFilter}"]`).focus(); });
  document.querySelectorAll('[data-theme-id]').forEach(b => b.onclick = async () => { await persistAppearance({ selected: b.dataset.themeId, followSystem: false }); renderOverlay(); document.querySelector(`[data-theme-id="${b.dataset.themeId}"]`)?.focus(); });
  on('create-theme', () => beginTheme(currentTheme()));
  on('edit-theme', () => beginTheme(currentTheme(), true));
  on('duplicate-theme', () => beginTheme(currentTheme()));
  on('reset-cloud', async () => { await persistAppearance({ selected: 'cloud', followSystem: false }); themeMessage = 'Reset to Cloud.'; renderOverlay(); });
  on('delete-theme', async () => {
    const theme = currentTheme();
    if (!confirm(`Delete “${theme.name}”?`)) return;
    const config = themeConfig();
    await persistAppearance({ custom: config.custom.filter(t => t.id !== theme.id), selected: 'cloud', followSystem: false,
      light: config.light === theme.id ? 'cloud' : config.light, dark: config.dark === theme.id ? 'midnight' : config.dark });
    themeMessage = 'Theme deleted. Switched to Cloud.'; renderOverlay();
  });
  on('export-theme', async () => { const result = await rt.exportTheme(currentTheme().id); $('theme-message').textContent = result.error || (result.saved ? 'Theme exported.' : 'Export cancelled.'); });
  on('import-theme', async () => {
    const result = await rt.importTheme();
    if (result.theme) {
      const name = uniqueThemeName(result.theme.name);
      beginTheme({ ...result.theme, name }, true);
      themeDraft.name = name;
      themeOriginal = JSON.parse(JSON.stringify(themeDraft));
      // Imported themes are drafts, never replace an existing theme.
      themeMessage = name !== result.theme.name ? 'That name already exists. A unique name has been suggested; review the preview before saving.' : 'Imported preview. Review and save to apply.';
      renderOverlay();
    } else $('theme-message').textContent = result.error || 'Import cancelled.';
  });
  $('follow-system').onchange = async e => { await persistAppearance({ followSystem: e.target.checked }); renderOverlay(); };
  for (const mode of ['light', 'dark']) $('system-' + mode).onchange = async e => { await persistAppearance({ [mode]: e.target.value }); renderOverlay(); };
}
