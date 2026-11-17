const test = require('node:test');
const assert = require('node:assert/strict');
const { pageContextMenu, searchUrl, suggestedDownloadName } = require('../shared/page-context-menu.cjs');

function labels(items) {
  return items.filter((item) => item.type !== 'separator').map((item) => item.label);
}

function assertSeparators(items) {
  assert.notEqual(items[0]?.type, 'separator');
  assert.notEqual(items[items.length - 1]?.type, 'separator');
  for (let index = 1; index < items.length; index += 1) {
    if (items[index].type === 'separator') assert.notEqual(items[index - 1].type, 'separator');
  }
}

test('right-clicking an image offers open, save, copy, and image search', () => {
  const items = pageContextMenu({
    mediaType: 'image',
    srcURL: 'https://cdn.example/photos/cat.png?size=large',
    suggestedFilename: 'cat.png',
    x: 12,
    y: 40,
  }, { pageUrl: 'https://example.com/gallery' });
  assertSeparators(items);
  assert.deepEqual(labels(items), [
    'Open image in new tab',
    'Save image as…',
    'Copy image',
    'Copy image address',
    'Search image with Google',
    'Inspect',
  ]);
  const save = items.find((item) => item.action === 'save-url');
  assert.equal(save.filename, 'cat.png');
  assert.equal(save.url, 'https://cdn.example/photos/cat.png?size=large');
  const search = items.find((item) => item.label === 'Search image with Google');
  assert.match(search.url, /^https:\/\/lens\.google\.com\/uploadbyurl\?url=/);
  assert.match(search.url, /cat\.png/);
});

test('a linked image includes link and image actions', () => {
  const items = pageContextMenu({
    mediaType: 'image',
    srcURL: 'https://cdn.example/a.jpg',
    linkURL: 'https://example.com/post',
    linkText: 'Read more',
  });
  const names = labels(items);
  assert.ok(names.indexOf('Open link in new tab') < names.indexOf('Open image in new tab'));
  assert.ok(names.includes('Open link to the side'));
  assert.ok(names.includes('Copy link text'));
  assert.ok(names.includes('Copy image'));
  assert.equal(names.at(-1), 'Inspect');
});

test('links can open in a tab, window, private window, or beside the current tab', () => {
  const items = pageContextMenu({ linkURL: 'https://example.com/story' }, { privateWindow: false });
  assert.deepEqual(labels(items), [
    'Open link in new tab',
    'Open link in new window',
    'Open link in private window',
    'Open link to the side',
    'Copy link address',
    'Save link as…',
    'Inspect',
  ]);
  const privateItem = items.find((item) => item.label === 'Open link in private window');
  assert.equal(privateItem.private, true);
  const hidden = pageContextMenu({ linkURL: 'https://example.com/story' }, { privateWindow: true });
  assert.equal(labels(hidden).includes('Open link in private window'), false);
  assert.equal(hidden.find((item) => item.label === 'Open link in new window').private, true);
});

test('mail and phone links open outside the browser', () => {
  const mail = labels(pageContextMenu({ linkURL: 'mailto:ada@example.com' }));
  assert.deepEqual(mail.slice(0, 2), ['Open link', 'Copy link address']);
  assert.equal(mail.includes('Open link in new tab'), false);
});

test('selected text can be copied, searched, or sent to ChatGPT', () => {
  const items = pageContextMenu({
    selectionText: '  how much\nmoney  ',
  }, { searchEngine: 'duckduckgo', platform: 'darwin' });
  assert.deepEqual(labels(items), [
    'Copy',
    'Search DuckDuckGo for "how much money"',
    'Ask ChatGPT about selection',
    'Look Up "how much money"',
    'Inspect',
  ]);
  assert.equal(items.find((item) => item.action === 'search').query, 'how much\nmoney');
  assert.match(searchUrl('bing', 'pasta'), /^https:\/\/www\.bing\.com\/search\?q=pasta/);
  const linux = labels(pageContextMenu({ selectionText: 'pasta' }, { platform: 'linux' }));
  assert.equal(linux.includes('Look Up "pasta"'), false);
});

test('text fields get spelling fixes and editing commands', () => {
  const items = pageContextMenu({
    isEditable: true,
    misspelledWord: 'recieve',
    dictionarySuggestions: ['receive', 'receipt'],
    selectionText: 'recieve',
    editFlags: { canUndo: false, canRedo: false, canCut: true, canCopy: true, canPaste: true, canDelete: true, canSelectAll: true, canEditRichly: true },
  }, { searchEngine: 'google', platform: 'darwin' });
  const names = labels(items);
  assert.deepEqual(names.slice(0, 4), ['receive', 'receipt', 'Add to dictionary', 'Undo']);
  assert.ok(names.includes('Paste and match style'));
  assert.ok(names.includes('Search Google for "recieve"'));
  assert.equal(names.includes('Back'), false);
  assert.equal(items.find((item) => item.label === 'Undo').enabled, false);
  assert.equal(items.find((item) => item.label === 'Cut').enabled, true);
});

test('an empty page offers navigation, save, print, and source', () => {
  const items = pageContextMenu({}, {
    pageUrl: 'https://example.com/article',
    canGoBack: true,
    canGoForward: false,
  });
  assertSeparators(items);
  assert.deepEqual(labels(items), [
    'Back',
    'Forward',
    'Reload',
    'Select all',
    'Save page as…',
    'Print…',
    'View page source',
    'Inspect',
  ]);
  assert.equal(items.find((item) => item.action === 'back').enabled, true);
  assert.equal(items.find((item) => item.action === 'forward').enabled, false);
  assert.equal(items.find((item) => item.action === 'view-source').url, 'view-source:https://example.com/article');
});

test('video controls follow the player state', () => {
  const items = pageContextMenu({
    mediaType: 'video',
    srcURL: 'https://cdn.example/clip.mp4',
    x: 8,
    y: 9,
    mediaFlags: {
      isPaused: true,
      hasAudio: true,
      isMuted: false,
      canLoop: true,
      isLooping: false,
      canToggleControls: true,
      isControlsVisible: true,
      canShowPictureInPicture: true,
      isShowingPictureInPicture: false,
    },
  });
  assert.deepEqual(labels(items), [
    'Play',
    'Mute',
    'Loop',
    'Hide controls',
    'Picture in picture',
    'Open video in new tab',
    'Save video as…',
    'Copy video address',
    'Inspect',
  ]);
  assert.equal(items.find((item) => item.command === 'toggle').x, 8);
});

test('download names prefer the suggested file name', () => {
  assert.equal(suggestedDownloadName('https://cdn.example/a/b/photo.png?x=1', 'holiday.png', 'image'), 'holiday.png');
  assert.equal(suggestedDownloadName('https://cdn.example/files/my%20cat.jpg', '', 'image'), 'my cat.jpg');
  assert.equal(suggestedDownloadName('data:image/png;base64,aaaa', '', 'image'), 'image');
});
