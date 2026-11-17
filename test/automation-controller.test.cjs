const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAutomationController } = require('../electron/automation-controller.cjs');

test('serializes inspections of a tab and cancels a queued task', async () => {
  let release;
  let calls = 0;
  const contents = { isDestroyed: () => false, getURL: () => 'https://example.com/', getTitle: () => 'Example', executeJavaScript: async () => { calls++; await new Promise((resolve) => { release = resolve; }); return { text: 'ok', headings: [] }; } };
  const controller = createAutomationController({ getTab: () => ({ view: { webContents: contents } }) });
  const first = controller.inspect({ taskId: 'one', tabId: 'tab', authorize: true });
  await new Promise(setImmediate);
  const second = controller.inspect({ taskId: 'two', tabId: 'tab', authorize: true });
  assert.equal(controller.cancelTask('two'), true);
  release();
  await first;
  await assert.rejects(second, /cancelled/);
  assert.equal(calls, 1);
});
