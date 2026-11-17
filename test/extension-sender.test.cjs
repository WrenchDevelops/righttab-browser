const test = require('node:test');
const assert = require('node:assert/strict');
const { createExtensionSenderAuthenticator } = require('../electron/extension-sender.cjs');
const id = 'a'.repeat(32);
function setup() {
  const ext = { manifest: { permissions: ['debugger'], background: { service_worker: 'background.js' } } };
  const worker = { scope: `chrome-extension://${id}/`, scriptURL: `chrome-extension://${id}/background.js`, versionId: 9, isDestroyed: () => false };
  const session = { extensions: { getExtension: (key) => key === id ? ext : null }, serviceWorkers: { getWorkerFromVersionID: (v) => v === 9 ? worker : null } };
  const frame = { url: `chrome-extension://${id}/panel.html` };
  const contents = { session, mainFrame: frame, getURL: () => frame.url, isDestroyed: () => false };
  const auth = createExtensionSenderAuthenticator({ session, isEnabled: (key) => key === id, isExtensionPage: (wc, key) => wc === contents && key === id });
  return { auth, session, frame, contents, worker };
}
test('authenticates registered worker from trusted scope and version', () => {
  const { auth, session, worker } = setup();
  assert.equal(auth({ type: 'service-worker', session, serviceWorker: worker, versionId: 9 }).id, id);
  assert.equal(auth({ type: 'service-worker', session: {}, serviceWorker: worker, versionId: 9 }), null);
  assert.equal(auth({ type: 'service-worker', session, serviceWorker: { ...worker }, versionId: 9 }), null);
  assert.equal(auth({ type: 'service-worker', session, serviceWorker: worker, versionId: 8 }), null);
  worker.scriptURL = `chrome-extension://${id}/other.js`;
  assert.equal(auth({ type: 'service-worker', session, serviceWorker: worker, versionId: 9 }), null);
});
test('authenticates only registered top-level extension pages', () => {
  const { auth, contents, frame } = setup();
  assert.equal(auth({ sender: contents, senderFrame: frame }).id, id);
  assert.equal(auth({ sender: contents, senderFrame: { url: frame.url } }), null);
  frame.url = 'https://example.com/';
  assert.equal(auth({ sender: contents, senderFrame: frame }), null);
});
