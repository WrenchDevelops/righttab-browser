const path = require('path');
const { ENGINE_NAMES, buildSearchUrl, isWebUrl } = require('./url.cjs');

function shorten(text, max = 40) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

function pushSection(items, section) {
  const usable = section.filter(Boolean);
  if (!usable.length) return;
  if (items.length && items[items.length - 1].type !== 'separator') items.push({ type: 'separator' });
  items.push(...usable);
}

function searchUrl(engine, query, customEngines) {
  return buildSearchUrl(engine, query, customEngines);
}

function suggestedDownloadName(url, suggestedFilename, fallback = 'download') {
  const named = String(suggestedFilename || '').replace(/[\\/\0:*?"<>|]/g, '').trim();
  if (named) return named.slice(0, 180);
  if (!isWebUrl(url)) return fallback;
  try {
    const base = path.basename(new URL(url).pathname);
    let decoded = base;
    try { decoded = decodeURIComponent(base); } catch { /* keep the raw name */ }
    const clean = decoded.replace(/[\\/\0:*?"<>|]/g, '').trim();
    if (clean && clean !== '.') return clean.slice(0, 180);
  } catch { /* data and blob urls have no file name */ }
  return fallback;
}

function specialLink(url) {
  try {
    const protocol = new URL(url).protocol;
    if (protocol === 'mailto:' || protocol === 'tel:' || protocol === 'sms:') return url;
  } catch { /* not a url */ }
  return '';
}

function pageContextMenu(params = {}, options = {}) {
  const rawSelection = String(params.selectionText || '').trim();
  const selection = rawSelection.replace(/\s+/g, ' ').trim();
  const linkURL = String(params.linkURL || '');
  const webLink = isWebUrl(linkURL) ? linkURL : '';
  const externalLink = webLink ? '' : specialLink(linkURL);
  const srcURL = String(params.srcURL || '');
  const httpSrc = isWebUrl(srcURL) ? srcURL : '';
  const mediaType = params.mediaType || 'none';
  const media = mediaType === 'audio' || mediaType === 'video';
  const image = mediaType === 'image' || (!!params.hasImageContents && !media);
  const flags = params.editFlags || {};
  const mediaFlags = params.mediaFlags || {};
  const editable = !!params.isEditable;
  const customEngines = Array.isArray(options.customSearchEngines) ? options.customSearchEngines : [];
  const customEngine = customEngines.find((item) => item.id === options.searchEngine);
  const engineName = ENGINE_NAMES[options.searchEngine] || customEngine?.name || 'Google';
  const items = [];
  const x = Number(params.x) || 0;
  const y = Number(params.y) || 0;

  if (editable && params.misspelledWord) {
    const suggestions = (Array.isArray(params.dictionarySuggestions) ? params.dictionarySuggestions : [])
      .map((word) => String(word || '').trim())
      .filter(Boolean)
      .slice(0, 5);
    if (suggestions.length) {
      for (const word of suggestions) items.push({ action: 'replace-misspelling', label: word, word });
    } else {
      items.push({ label: 'No spelling suggestions', enabled: false });
    }
    items.push({ action: 'add-dictionary', label: 'Add to dictionary', word: String(params.misspelledWord) });
  }

  if (webLink) {
    const linkText = String(params.linkText || '').replace(/\s+/g, ' ').trim();
    pushSection(items, [
      { action: 'open-tab', label: 'Open link in new tab', url: webLink },
      { action: 'open-window', label: 'Open link in new window', url: webLink, private: !!options.privateWindow },
      options.privateWindow ? null : { action: 'open-window', label: 'Open link in private window', url: webLink, private: true },
      { action: 'open-split', label: 'Open link to the side', url: webLink },
      { action: 'copy-text', label: 'Copy link address', text: webLink },
      linkText && linkText !== webLink ? { action: 'copy-text', label: 'Copy link text', text: linkText } : null,
      { action: 'save-url', label: 'Save link as…', url: webLink, filename: suggestedDownloadName(webLink, '', 'download') },
    ]);
  } else if (externalLink) {
    pushSection(items, [
      { action: 'open-external', label: 'Open link', url: externalLink },
      { action: 'copy-text', label: 'Copy link address', text: externalLink },
    ]);
  }

  if (image) {
    pushSection(items, [
      httpSrc ? { action: 'open-tab', label: 'Open image in new tab', url: httpSrc } : null,
      httpSrc ? { action: 'save-url', label: 'Save image as…', url: httpSrc, filename: suggestedDownloadName(httpSrc, params.suggestedFilename, 'image') } : null,
      { action: 'copy-image', label: 'Copy image', x, y },
      httpSrc ? { action: 'copy-text', label: 'Copy image address', text: httpSrc } : null,
      httpSrc ? { action: 'open-tab', label: 'Search image with Google', url: `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(httpSrc)}`, foreground: true } : null,
    ]);
  }

  if (media) {
    const kind = mediaType === 'audio' ? 'audio' : 'video';
    pushSection(items, [
      { action: 'media', label: mediaFlags.isPaused ? 'Play' : 'Pause', command: 'toggle', x, y },
      mediaFlags.hasAudio === false ? null : { action: 'media', label: mediaFlags.isMuted ? 'Unmute' : 'Mute', command: 'mute', x, y },
      mediaFlags.canLoop === false ? null : { action: 'media', label: mediaFlags.isLooping ? 'Unloop' : 'Loop', command: 'loop', x, y },
      mediaFlags.canToggleControls === false ? null : { action: 'media', label: mediaFlags.isControlsVisible ? 'Hide controls' : 'Show controls', command: 'controls', x, y },
      mediaFlags.canShowPictureInPicture ? { action: 'media', label: mediaFlags.isShowingPictureInPicture ? 'Exit picture in picture' : 'Picture in picture', command: 'pip', x, y } : null,
      httpSrc ? { action: 'open-tab', label: `Open ${kind} in new tab`, url: httpSrc } : null,
      httpSrc ? { action: 'save-url', label: `Save ${kind} as…`, url: httpSrc, filename: suggestedDownloadName(httpSrc, params.suggestedFilename, kind) } : null,
      httpSrc ? { action: 'copy-text', label: `Copy ${kind} address`, text: httpSrc } : null,
    ]);
  }

  if (selection && !editable) {
    pushSection(items, [
      flags.canCopy === false ? null : { action: 'copy', label: 'Copy' },
      { action: 'search', label: `Search ${engineName} for "${shorten(selection)}"`, query: rawSelection.slice(0, 500), foreground: true },
      { action: 'ask', label: 'Ask ChatGPT about selection', text: rawSelection },
      options.platform === 'darwin' ? { action: 'lookup', label: `Look Up "${shorten(selection, 24)}"` } : null,
    ]);
  }

  if (editable) {
    const edit = [
      { action: 'undo', label: 'Undo', enabled: !!flags.canUndo },
      { action: 'redo', label: 'Redo', enabled: !!flags.canRedo },
      { type: 'separator' },
      { action: 'cut', label: 'Cut', enabled: !!flags.canCut },
      { action: 'copy', label: 'Copy', enabled: flags.canCopy !== false },
      { action: 'paste', label: 'Paste', enabled: flags.canPaste !== false },
      flags.canEditRichly ? { action: 'paste-match', label: 'Paste and match style', enabled: !!flags.canPaste } : null,
      { action: 'delete', label: 'Delete', enabled: !!flags.canDelete },
      { type: 'separator' },
      { action: 'select-all', label: 'Select all', enabled: flags.canSelectAll !== false },
    ];
    if (selection) {
      edit.push(
        { type: 'separator' },
        { action: 'search', label: `Search ${engineName} for "${shorten(selection)}"`, query: rawSelection.slice(0, 500), foreground: true },
        { action: 'ask', label: 'Ask ChatGPT about selection', text: rawSelection },
      );
    }
    pushSection(items, edit);
  }

  const specific = !!(webLink || externalLink || image || media || selection || editable);
  if (!specific) {
    const page = isWebUrl(options.pageUrl) ? options.pageUrl : '';
    pushSection(items, [
      { action: 'back', label: 'Back', enabled: !!options.canGoBack },
      { action: 'forward', label: 'Forward', enabled: !!options.canGoForward },
      { action: 'reload', label: 'Reload' },
      { action: 'select-all', label: 'Select all' },
      { type: 'separator' },
      { action: 'save-page', label: 'Save page as…', enabled: !!page },
      { action: 'print', label: 'Print…' },
      { type: 'separator' },
      page ? { action: 'view-source', label: 'View page source', url: `view-source:${page}` } : { label: 'View page source', enabled: false },
    ]);
  }

  pushSection(items, [
    { action: 'inspect', label: 'Inspect', x, y },
  ]);

  return items;
}

module.exports = {
  pageContextMenu,
  searchUrl,
  suggestedDownloadName,
};
