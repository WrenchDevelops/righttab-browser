const test = require('node:test');
const assert = require('node:assert/strict');
const { initializeMediaRuntime } = require('../electron/media-runtime.cjs');
const { protectedMediaAllowed, originOf, classify } = require('../electron/media-diagnostics.cjs');
const { probeContents } = require('../electron/media-probe.cjs');
const { navigateMediaDocument } = require('../electron/media-navigation.cjs');
const { EventEmitter } = require('node:events');

test('media diagnostics proceed at DOM readiness while subresources are pending, and reject TLS errors', async () => {
  const contents = new EventEmitter();
  contents.loadURL = () => { setImmediate(() => contents.emit('dom-ready')); return new Promise(() => {}); };
  await navigateMediaDocument(contents, 'https://www.disneyplus.com', { timeoutMs: 100 });
  assert.equal(contents.listenerCount('did-fail-load'), 0);
  contents.loadURL = () => { setImmediate(() => contents.emit('did-fail-load', {}, -200, 'certificate error', '', true)); return Promise.reject(new Error('TLS')); };
  await assert.rejects(navigateMediaDocument(contents, 'https://www.disneyplus.com', { timeoutMs: 100 }), /\(-200\)/);
  assert.equal(contents.listenerCount('dom-ready'), 0);
});

test('a suspended diagnostic subframe cannot stall the complete report', async () => {
  const result = await probeContents({ mainFrame: { framesInSubtree: [
    { executeJavaScript: async () => ({ origin: 'https://www.disneyplus.com', media: [] }) },
    { executeJavaScript: () => new Promise(() => {}) },
  ] } }, { timeoutMs: 5 });
  assert.equal(result[0].origin, 'https://www.disneyplus.com');
  assert.equal(result[1].error, 'FrameProbeTimeout');
});

test('protected media respects a saved denial and requires a trustworthy origin', () => {
  assert.equal(protectedMediaAllowed('https://www.disneyplus.com/watch', ''), true);
  assert.equal(protectedMediaAllowed('https://www.disneyplus.com/watch', 'deny'), false);
  assert.equal(protectedMediaAllowed('http://example.com', 'allow'), false);
  for (const url of ['http://127.0.0.1:8080', 'http://localhost', 'http://[::1]']) assert.equal(protectedMediaAllowed(url, ''), true);
  for (const url of ['data:text/html,test', 'file:///tmp/test', 'http://localhost.attacker.com', '', 'invalid']) assert.equal(protectedMediaAllowed(url, ''), false);
});

test('CDM setup handles stock, installed, failed and slow runtimes without blocking the browser', async () => {
  assert.equal((await initializeMediaRuntime()).status, 'unavailable');
  const ready = await initializeMediaRuntime({ whenReady: async () => [], status: () => ({ widevine: { version: '1' } }) });
  assert.equal(ready.status, 'ready');
  assert.equal(ready.components.widevine.version, '1');
  const failure = await initializeMediaRuntime({ whenReady: async () => { throw Object.assign(new Error('secret'), { code: 'OFFLINE' }); } });
  assert.equal(failure.status, 'failed');
  assert.equal(failure.error, 'OFFLINE');
  let complete;
  const pending = await initializeMediaRuntime({ whenReady: () => new Promise((resolve) => { complete = resolve; }), status: () => ({}) }, { timeoutMs: 5 });
  assert.equal(pending.status, 'pending');
  complete();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(pending.status, 'ready');
});

test('diagnostic summaries omit credentials and arbitrary console text', () => {
  assert.equal(originOf('https://user:password@example.com/license/123?token=secret#key'), 'https://example.com');
  assert.equal(originOf('data:text/plain,secret'), 'data:');
  assert.deepEqual(classify('Widevine NotSupportedError token=secret'), ['NotSupportedError', 'widevine']);
});
