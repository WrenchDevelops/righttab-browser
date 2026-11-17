const path = require('path');
const { createExtensionDebugger } = require('./extension-debugger.cjs');
const { createExtensionSenderAuthenticator } = require('./extension-sender.cjs');
const { createDebuggerDispatcher } = require('./extension-debugger-adapter.cjs');
function installExtensionDebugger({ session, getTargets, changed }) {
  const authenticate = createExtensionSenderAuthenticator({ session, isEnabled: (id) => !!session.extensions.getExtension(id), isExtensionPage: () => false });
  const bridge = createExtensionDebugger({ authenticate: (p) => p, getTargets, changed, emit(id, event, ...args) {
    if (!session.extensions.getExtension(id)) return;
    session.serviceWorkers.startWorkerForScope(`chrome-extension://${id}/`).then((worker) => worker.send('righttab-debugger-event', event, ...args)).catch((error) => console.error('Debugger event delivery failed:', error.message));
  } });
  const dispatch = createDebuggerDispatcher({ authenticate, bridge });
  session.serviceWorkers.on('running-status-changed', ({ runningStatus, versionId }) => {
    if (runningStatus !== 'starting') return;
    const worker = session.serviceWorkers.getWorkerFromVersionID(versionId);
    if (worker?.scope.startsWith('chrome-extension://')) worker.ipc.handle('righttab-debugger', dispatch);
  });
  session.extensions.on('extension-unloaded', (_event, ext) => bridge.unload(ext.id));
  session.registerPreloadScript({ type: 'service-worker', filePath: path.join(__dirname, 'extension-debugger-preload.cjs'), includeGlobs: ['chrome-extension://*/*'] });
  return bridge;
}
module.exports = { installExtensionDebugger };
