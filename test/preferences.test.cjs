const test = require('node:test');
const assert = require('node:assert/strict');
const { mapChromePreferences } = require('../shared/preferences.cjs');

test('only compatible Chrome preferences are mapped and startup site is never changed', () => {
  const mapped = mapChromePreferences({
    bookmark_bar: { show_on_all_tabs: false },
    browser: { theme: { color_scheme: 2 } },
    session: { restore_on_startup: 4, startup_urls: ['https://example.com/start'] },
    enable_do_not_track: true,
    download: { default_directory: '/Users/test/Downloads' },
    default_search_provider_data: {
      template_url_data: { short_name: 'Evil Search', url: 'https://evil.example/search?q={searchTerms}' },
    },
  }, {
    homeDir: '/Users/test',
    directoryExists: (dir) => dir === '/Users/test/Downloads',
  });

  assert.equal(mapped.apply.find((item) => item.key === 'startupPage'), undefined);
  assert.equal(mapped.apply.find((item) => item.key === 'theme').value, 'dark');
  assert.equal(mapped.apply.find((item) => item.key === 'showBookmarkBar').value, false);
  assert.equal(mapped.apply.find((item) => item.key === 'doNotTrack').value, true);
  assert.equal(mapped.apply.find((item) => item.key === 'downloadDirectory').value, '/Users/test/Downloads');
  assert.equal(mapped.apply.find((item) => item.key === 'searchEngine'), undefined);
  assert.ok(mapped.skip.some((item) => /Evil Search/.test(item.label)));
  assert.ok(mapped.skip.some((item) => item.label === 'Startup and new-tab site'));
});
