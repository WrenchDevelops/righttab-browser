const HOMEPAGES = {
  righttab: 'righttab://newtab/',
  chatgpt: 'https://chatgpt.com/',
  google: 'https://www.google.com/',
};

const SEARCH_ENGINES = {
  google: (query) => `https://www.google.com/search?q=${encodeURIComponent(query)}`,
  duckduckgo: (query) => `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
  bing: (query) => `https://www.bing.com/search?q=${encodeURIComponent(query)}`,
  brave: (query) => `https://search.brave.com/search?q=${encodeURIComponent(query)}`,
};

const ENGINE_NAMES = {
  google: 'Google',
  duckduckgo: 'DuckDuckGo',
  bing: 'Bing',
  brave: 'Brave Search',
};

function homepageUrl(startupPage) {
  return HOMEPAGES[startupPage] || HOMEPAGES.righttab;
}

function newTabUrl(settings) {
  const choice = settings?.newTabPage || 'righttab';
  if (choice === 'startup') return homepageUrl(settings?.startupPage);
  return homepageUrl(choice);
}

function isNewTabUrl(value) {
  const text = String(value || '').trim();
  return text === 'righttab://newtab' || text === 'righttab://newtab/';
}

function isRestorableTabUrl(value) {
  return isWebUrl(value) || isNewTabUrl(value);
}

function resolveEngine(engine, customEngines) {
  if (SEARCH_ENGINES[engine]) return { id: engine, name: ENGINE_NAMES[engine], build: SEARCH_ENGINES[engine] };
  const custom = Array.isArray(customEngines) ? customEngines.find((item) => item && item.id === engine && typeof item.template === 'string' && item.template.includes('%s')) : null;
  if (custom) {
    return {
      id: custom.id,
      name: String(custom.name || 'Custom'),
      build: (query) => custom.template.replace('%s', encodeURIComponent(query)),
    };
  }
  return { id: 'google', name: ENGINE_NAMES.google, build: SEARCH_ENGINES.google };
}

function buildSearchUrl(engine, query, customEngines) {
  return resolveEngine(engine, customEngines).build(String(query || '').slice(0, 500));
}

function isWebUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function classifyInput(input, searchEngine = 'google', customEngines) {
  const text = String(input || '').trim();
  if (!text) return { type: 'empty' };

  if (isNewTabUrl(text)) return { type: 'url', url: 'righttab://newtab/' };

  if (/^(javascript|data|file|blob|chrome|chrome-extension|edge|about|view-source|righttab):/i.test(text)) {
    return { type: 'blocked', reason: 'That address cannot be opened from the address bar.' };
  }

  if (/^https?:\/\//i.test(text)) {
    return { type: 'url', url: text.replace(/ /g, '%20') };
  }

  const looksLikeHost = !text.includes(' ') && (
    /^(localhost|\[::1\])(:\d+)?(\/.*)?$/i.test(text) ||
    /^(\d{1,3}\.){3}\d{1,3}(:\d+)?(\/.*)?$/.test(text) ||
    /^[\w.-]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(text)
  );

  if (looksLikeHost) {
    const local = /^(localhost|\[::1\]|(\d{1,3}\.){3}\d{1,3})(:|\/|$)/i.test(text);
    return { type: 'url', url: `${local ? 'http' : 'https'}://${text}` };
  }

  const resolved = resolveEngine(searchEngine, customEngines);
  return { type: 'search', url: resolved.build(text), engine: resolved.id };
}

function originOf(value) {
  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
}

function hostOf(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return '';
  }
}

module.exports = {
  HOMEPAGES,
  SEARCH_ENGINES,
  ENGINE_NAMES,
  homepageUrl,
  newTabUrl,
  isNewTabUrl,
  isRestorableTabUrl,
  isWebUrl,
  classifyInput,
  resolveEngine,
  buildSearchUrl,
  originOf,
  hostOf,
};
