const test = require('node:test');
const assert = require('node:assert/strict');
const { placeTab, placeInGroup, displayItems } = require('../shared/tab-order.cjs');

test('dragging into the pinned prefix pins a tab and clears its group', () => {
  const items = [
    { id: 'p', pinned: true, groupId: null },
    { id: 'a', pinned: false, groupId: 'g1' },
    { id: 'b', pinned: false, groupId: null },
  ];
  const next = placeTab(items, 'b', 'p');
  assert.equal(next[0].id, 'b');
  assert.equal(next[0].pinned, true);
  assert.equal(next[0].groupId, null);
});

test('dragging onto a grouped tab joins that group', () => {
  const items = [
    { id: 'a', pinned: false, groupId: 'g1' },
    { id: 'b', pinned: false, groupId: null },
  ];
  const next = placeTab(items, 'b', 'a');
  assert.equal(next[0].id, 'b');
  assert.equal(next[0].groupId, 'g1');
  const display = displayItems(next);
  assert.equal(display.body[0].type, 'group');
  assert.deepEqual(display.body[0].tabs.map((tab) => tab.id), ['b', 'a']);
});

test('placing a tab in a group unpins it', () => {
  const items = [
    { id: 'p', pinned: true, groupId: null },
    { id: 'a', pinned: false, groupId: 'g1' },
  ];
  const next = placeInGroup(items, 'p', 'g1');
  assert.equal(next.find((item) => item.id === 'p').pinned, false);
  assert.equal(next.find((item) => item.id === 'p').groupId, 'g1');
});
