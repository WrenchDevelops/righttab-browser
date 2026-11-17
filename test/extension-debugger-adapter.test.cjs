const test = require('node:test');
const assert = require('node:assert/strict');
const { createDebuggerDispatcher } = require('../electron/extension-debugger-adapter.cjs');
test('dispatcher rejects spoofed identity and forwards genuine errors', async () => {
  const trustedEvent = {};
  const principal = { id: 'trusted', permissions: ['debugger'] };
  const dispatch = createDebuggerDispatcher({
    authenticate: (event) => event === trustedEvent ? principal : null,
    bridge: { attach: (caller) => { assert.equal(caller, principal); throw new Error('actual error'); } },
  });
  await assert.rejects(dispatch({ extensionId: 'trusted' }, 'attach', []), /permission/);
  await assert.rejects(dispatch(trustedEvent, 'attach', []), /actual error/);
  await assert.rejects(dispatch(trustedEvent, 'constructor', []), /Unknown/);
  await assert.rejects(dispatch(trustedEvent, 'attach', {}), /array/);
});
