function isInsideHome(candidate, homeDir) {
  if (!candidate || !homeDir) return false;
  const path = require('path');
  const home = path.resolve(homeDir);
  const target = path.resolve(candidate);
  return target === home || target.startsWith(home + path.sep);
}

function mapChromePreferences(prefs, env = {}) {
  const apply = [];
  const skip = [];
  const source = prefs && typeof prefs === 'object' ? prefs : {};

  const showBar = source.bookmark_bar?.show_on_all_tabs;
  if (typeof showBar === 'boolean') {
    apply.push({ key: 'showBookmarkBar', value: showBar, label: showBar ? 'Show the bookmark bar' : 'Hide the bookmark bar' });
  }

  const scheme = source.browser?.theme?.color_scheme;
  if (scheme === 0 || scheme === 1 || scheme === 2) {
    const theme = scheme === 1 ? 'light' : scheme === 2 ? 'dark' : 'system';
    apply.push({ key: 'theme', value: theme, label: `Appearance: ${theme}` });
  }

  const startup = source.session?.restore_on_startup;
  const startupUrls = Array.isArray(source.session?.startup_urls) ? source.session.startup_urls.filter((url) => typeof url === 'string') : [];
  if (startup === 1 || startup === 5) {
    apply.push({
      key: 'restoreSession',
      value: true,
      label: 'Restore previous session on startup',
    });
  } else if (startup === 0) {
    apply.push({
      key: 'restoreSession',
      value: false,
      label: 'Open the startup page instead of restoring tabs',
    });
  } else if (startup === 4) {
    skip.push({
      label: 'Chrome startup pages',
      reason: startupUrls.length
        ? `RightTab keeps your ChatGPT or Google choice. These Chrome startup pages were not applied: ${startupUrls.slice(0, 3).join(', ')}`
        : 'Chrome was set to open specific pages. RightTab keeps your ChatGPT or Google choice.',
    });
  }

  if (typeof source.enable_do_not_track === 'boolean') {
    apply.push({
      key: 'doNotTrack',
      value: source.enable_do_not_track,
      label: source.enable_do_not_track ? 'Send a Do Not Track header' : 'Do not send Do Not Track',
    });
  }

  if (typeof source.https_only_mode_enabled === 'boolean') {
    apply.push({
      key: 'httpsOnly',
      value: source.https_only_mode_enabled,
      label: source.https_only_mode_enabled ? 'Upgrade plain HTTP addresses to HTTPS' : 'Allow HTTP addresses you type',
    });
  }

  const provider = source.default_search_provider_data?.template_url_data || {};
  const providerName = String(provider.short_name || provider.keyword || '').trim();
  const providerUrl = String(provider.url || '').toLowerCase();
  let engine = null;
  if (providerUrl.includes('google.com/search') || providerName.toLowerCase() === 'google') engine = 'google';
  else if (providerUrl.includes('duckduckgo.com') || providerName.toLowerCase().includes('duckduckgo')) engine = 'duckduckgo';
  else if (providerUrl.includes('bing.com/search') || providerName.toLowerCase() === 'bing') engine = 'bing';
  if (engine) {
    apply.push({ key: 'searchEngine', value: engine, label: `Address-bar search: ${engine}` });
  } else if (providerName) {
    skip.push({
      label: `Search engine “${providerName}”`,
      reason: 'Only Google, DuckDuckGo, and Bing can replace address-bar search. An unknown provider was left unchanged.',
    });
  }

  const downloadDir = source.download?.default_directory;
  if (typeof downloadDir === 'string' && downloadDir.trim()) {
    const allowed = isInsideHome(downloadDir, env.homeDir) && (!env.directoryExists || env.directoryExists(downloadDir));
    if (allowed) {
      apply.push({ key: 'downloadDirectory', value: downloadDir, label: `Save downloads to ${downloadDir}` });
    } else {
      skip.push({
        label: 'Chrome download folder',
        reason: 'The folder is missing or sits outside your home directory, so it was not applied.',
      });
    }
  }

  skip.push({
    label: 'Startup and new-tab site',
    reason: 'Import never changes your startup or new-tab page. Set that in RightTab.',
  });
  skip.push({
    label: 'Most Chrome settings',
    reason: 'Sync, site permissions, content settings, themes, and flags stay in Chrome.',
  });

  return { apply, skip };
}

module.exports = { mapChromePreferences, isInsideHome };
