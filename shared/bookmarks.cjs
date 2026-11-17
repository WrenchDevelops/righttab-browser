const { isWebUrl } = require('./url.cjs');
const { chromeTimeToMs } = require('./chrome-time.cjs');

function emptyBookmarks() {
  return { bar: [], other: [] };
}

function walk(nodes, visit, parent = null) {
  for (const node of nodes || []) {
    visit(node, parent);
    if (node.type === 'folder') walk(node.children, visit, node);
  }
}

function collectUrls(tree) {
  const urls = new Set();
  for (const key of ['bar', 'other']) {
    walk(tree[key], (node) => {
      if (node.type === 'url') urls.add(node.url);
    });
  }
  return urls;
}

function findBookmark(tree, id) {
  let found = null;
  for (const key of ['bar', 'other']) {
    walk(tree[key], (node, parent) => {
      if (node.id === id) found = { node, parent, root: key };
    });
  }
  return found;
}

function removeBookmark(tree, id) {
  const next = structuredClone(tree);
  for (const key of ['bar', 'other']) {
    next[key] = removeFromList(next[key], id);
  }
  return next;
}

function removeFromList(nodes, id) {
  const kept = [];
  for (const node of nodes || []) {
    if (node.id === id) continue;
    if (node.type === 'folder') {
      kept.push({ ...node, children: removeFromList(node.children, id) });
    } else {
      kept.push(node);
    }
  }
  return kept;
}

function addBookmark(tree, bookmark, location = 'bar') {
  const next = structuredClone(tree);
  const list = location === 'other' ? next.other : next.bar;
  list.unshift(bookmark);
  return next;
}

function isBookmarked(tree, url) {
  return collectUrls(tree).has(url);
}

function convertChromeNode(node, idFactory) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'url') {
    if (!isWebUrl(node.url)) return null;
    return {
      id: idFactory(),
      type: 'url',
      title: String(node.name || node.url).slice(0, 300),
      url: node.url,
      addedAt: chromeTimeToMs(node.date_added) || Date.now(),
    };
  }
  if (node.type === 'folder') {
    const children = [];
    for (const child of node.children || []) {
      const converted = convertChromeNode(child, idFactory);
      if (converted) children.push(converted);
    }
    return {
      id: idFactory(),
      type: 'folder',
      title: String(node.name || 'Folder').slice(0, 300),
      children,
      addedAt: chromeTimeToMs(node.date_added) || Date.now(),
    };
  }
  return null;
}

function countNodes(nodes) {
  let urls = 0;
  let folders = 0;
  walk(nodes, (node) => {
    if (node.type === 'url') urls += 1;
    if (node.type === 'folder') folders += 1;
  });
  return { urls, folders };
}

function importChromeBookmarks(current, chromeJson, idFactory = () => globalThis.crypto.randomUUID()) {
  const tree = current ? structuredClone(current) : emptyBookmarks();
  const existing = collectUrls(tree);
  const roots = chromeJson?.roots || {};
  const incomingBar = [];
  const incomingOther = [];

  for (const child of roots.bookmark_bar?.children || []) {
    const node = convertChromeNode(child, idFactory);
    if (node) incomingBar.push(node);
  }
  for (const child of roots.other?.children || []) {
    const node = convertChromeNode(child, idFactory);
    if (node) incomingOther.push(node);
  }
  if ((roots.synced?.children || []).length) {
    const mobile = convertChromeNode({ ...roots.synced, type: 'folder', name: roots.synced.name || 'Mobile bookmarks' }, idFactory);
    if (mobile) incomingOther.push(mobile);
  }

  const stats = { added: 0, duplicates: 0, skipped: 0 };

  function absorb(list, target) {
    for (const node of list) {
      const cleaned = dropDuplicateUrls(node, existing, stats);
      if (cleaned) target.push(cleaned);
    }
  }

  absorb(incomingBar, tree.bar);
  absorb(incomingOther, tree.other);

  return {
    tree,
    added: stats.added,
    duplicates: stats.duplicates,
    skipped: stats.skipped,
    folderCount: countNodes(tree.bar).folders + countNodes(tree.other).folders,
  };
}

function dropDuplicateUrls(node, existing, stats) {
  if (node.type === 'url') {
    if (existing.has(node.url)) {
      stats.duplicates += 1;
      return null;
    }
    existing.add(node.url);
    stats.added += 1;
    return node;
  }
  const children = [];
  for (const child of node.children || []) {
    const kept = dropDuplicateUrls(child, existing, stats);
    if (kept) children.push(kept);
  }
  if (!children.length) return null;
  return { ...node, children };
}

function mergeBookmarkTrees(current, incoming) {
  const tree = current ? structuredClone(current) : emptyBookmarks();
  const existing = collectUrls(tree);
  const stats = { added: 0, duplicates: 0, skipped: 0 };
  function absorb(list, target) {
    for (const node of list || []) {
      const cleaned = dropDuplicateUrls(structuredClone(node), existing, stats);
      if (cleaned) target.push(cleaned);
    }
  }
  absorb(incoming?.bar, tree.bar);
  absorb(incoming?.other, tree.other);
  return { tree, added: stats.added, duplicates: stats.duplicates, skipped: stats.skipped };
}

function updateBookmark(tree, id, patch) {
  const next = structuredClone(tree);
  const found = findBookmark(next, id);
  if (!found) return next;
  if (typeof patch.title === 'string' && patch.title.trim()) {
    found.node.title = patch.title.trim().slice(0, 300);
  }
  if (found.node.type === 'url' && typeof patch.url === 'string' && isWebUrl(patch.url)) {
    found.node.url = patch.url;
  }
  return next;
}

module.exports = {
  emptyBookmarks,
  walk,
  collectUrls,
  findBookmark,
  removeBookmark,
  addBookmark,
  isBookmarked,
  importChromeBookmarks,
  updateBookmark,
  mergeBookmarkTrees,
  countNodes,
};
