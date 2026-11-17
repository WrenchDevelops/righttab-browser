const test = require('node:test');
const assert = require('node:assert/strict');
const { importChromeBookmarks, emptyBookmarks, isBookmarked } = require('../shared/bookmarks.cjs');

test('Chrome bookmark folders are imported and script URLs are dropped', () => {
  let n = 0;
  const imported = importChromeBookmarks(emptyBookmarks(), {
    roots: {
      bookmark_bar: {
        children: [
          { type: 'url', name: 'Example', url: 'https://example.com/' },
          {
            type: 'folder',
            name: 'Recipes',
            children: [
              { type: 'url', name: 'Soup', url: 'https://example.com/soup' },
              { type: 'url', name: 'Bad', url: 'javascript:alert(1)' },
            ],
          },
        ],
      },
      other: { children: [] },
      synced: { children: [{ type: 'url', name: 'Phone', url: 'https://example.com/phone' }] },
    },
  }, () => `id-${n++}`);

  assert.equal(imported.added, 3);
  assert.equal(isBookmarked(imported.tree, 'https://example.com/soup'), true);
  assert.equal(isBookmarked(imported.tree, 'javascript:alert(1)'), false);
  const again = importChromeBookmarks(imported.tree, {
    roots: { bookmark_bar: { children: [{ type: 'url', name: 'Example', url: 'https://example.com/' }] } },
  }, () => 'dup');
  assert.equal(again.duplicates, 1);
  assert.equal(again.added, 0);
});
