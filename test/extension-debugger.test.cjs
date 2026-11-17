const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createExtensionDebugger } = require('../electron/extension-debugger.cjs');
function fixture() {
  const contents = new EventEmitter();
  contents.url = 'https://example.test/';
  contents.getURL = () => contents.url;
  contents.getTitle = () => 'Test';
  contents.isDestroyed = () => false;
  contents.mainFrame = { framesInSubtree: [{ url: contents.url }] };
  const dbg = contents.debugger = new EventEmitter();
  dbg.attached = false;
  dbg.isAttached = () => dbg.attached;
  dbg.attach = () => { dbg.attached = true; };
  dbg.detach = () => { dbg.attached = false; dbg.emit('detach', {}, 'canceled_by_user'); };
  dbg.sendCommand = async (method) => ({ method });
  const events = [];
  const bridge = createExtensionDebugger({ authenticate: (sender) => sender, getTargets: () => [{ id: 5, contents }], emit: (...args) => events.push(args) });
  return { bridge, contents, events, owner: { id: 'one', permissions: ['debugger'] }, other: { id: 'two', permissions: ['debugger'] } };
}
test('debugger enforces ownership and routes events and commands', async () => {
  const { bridge, contents, events, owner, other } = fixture();
  bridge.attach(owner, { targetId: '5' }, '1.3');
  assert.throws(() => bridge.sendCommand(other, { targetId: '5' }, 'Runtime.enable'), /not attached/);
  assert.throws(() => bridge.attach(owner, { targetId: 'unregistered' }), /registered/);
  assert.throws(() => bridge.sendCommand(owner, { tabId: 5 }, 'Target.attachToTarget'), /not available/);
  assert.deepEqual(await bridge.sendCommand(owner, { tabId: 5 }, 'Runtime.enable'), { method: 'Runtime.enable' });
  contents.debugger.emit('message', {}, 'Runtime.test', { ok: true });
  assert.deepEqual(events[0], ['one', 'onEvent', { targetId: '5' }, 'Runtime.test', { ok: true }]);
  bridge.detach(owner, { tabId: 5 });
  assert.equal(events.length, 1);
  assert.equal(contents.debugger.listenerCount('message'), 0);
});
test('user disconnect, closed tabs, permission and restricted navigation are enforced', () => {
  const { bridge, contents, events, owner } = fixture();
  assert.throws(() => bridge.attach({ id: 'bad', permissions: [] }, { tabId: 5 }), /permission/);
  bridge.attach(owner, { tabId: 5 });
  bridge.disconnectByUser(5);
  assert.deepEqual(events[0], ['one', 'onDetach', { tabId: 5 }, 'canceled_by_user']);
  bridge.attach(owner, { tabId: 5 });
  contents.emit('destroyed');
  assert.equal(events[1][3], 'target_closed');
  contents.debugger.attached = false;
  bridge.attach(owner, { tabId: 5 });
  contents.emit('did-start-navigation', {}, 'file:///secret');
  assert.equal(contents.debugger.isAttached(), false);
  assert.equal(bridge.getTargets(owner).length, 1);
  contents.url = 'file:///secret';
  assert.equal(bridge.getTargets(owner).length, 0);
});

test('subframes are rejected and a newly created frame disconnects', () => {
  const { bridge, contents, owner, events } = fixture();
  contents.mainFrame = { framesInSubtree: [{ url: 'https://example.test/' }, { url: 'chrome://settings/' }] };
  assert.throws(() => bridge.attach(owner, { tabId: 5 }), /Cannot access/);
  contents.mainFrame.framesInSubtree.pop();
  bridge.attach(owner, { tabId: 5 });
  contents.emit('frame-created', {});
  assert.equal(contents.debugger.isAttached(), false);
  assert.equal(events[0][3], 'canceled_by_user');
});

test('extension unload releases ownership and removes debugger listeners', () => {
  const { bridge, contents, events, owner, other } = fixture();
  bridge.attach(owner, { tabId: 5 });
  assert.throws(() => bridge.attach(other, { tabId: 5 }), /already attached/);
  bridge.unload(other.id);
  assert.equal(contents.debugger.isAttached(), true);
  bridge.unload(owner.id);
  assert.equal(contents.debugger.isAttached(), false);
  assert.equal(contents.debugger.listenerCount('message'), 0);
  assert.equal(contents.listenerCount('frame-created'), 0);
  assert.equal(events.length, 0);
});
