// Installs the debugger bridge only into a disposable diagnostic session.
const path = require('path');
const { createExtensionDebugger } = require('./extension-debugger.cjs');
const { createExtensionSenderAuthenticator } = require('./extension-sender.cjs');
const { createDebuggerDispatcher } = require('./extension-debugger-adapter.cjs');
function installDebuggerTrace(session) {
  const authenticate = createExtensionSenderAuthenticator({ session, isEnabled: (id) => !!session.extensions.getExtension(id), isExtensionPage: () => false });
  const bridge = createExtensionDebugger({ authenticate: (principal) => principal, getTargets: () => [], emit: (id, event, ...args) => {
    session.serviceWorkers.startWorkerForScope(`chrome-extension://${id}/`).then((worker) => worker.send('righttab-debugger-trace-event', event, ...args)).catch((error) => console.error('Debugger event delivery failed:', error.message));
  } });
  const dispatch = createDebuggerDispatcher({ authenticate, bridge });
  session.serviceWorkers.on('running-status-changed', ({ runningStatus, versionId }) => {
    if (runningStatus !== 'starting') return;
    const worker = session.serviceWorkers.getWorkerFromVersionID(versionId);
    if (worker && worker.scope.startsWith('chrome-extension://')) worker.ipc.handle('righttab-debugger-trace', dispatch);
  });
  session.extensions.on('extension-unloaded', (_event, extension) => bridge.unload(extension.id));
  session.registerPreloadScript({ type: 'service-worker', filePath: path.join(__dirname, 'debugger-trace-preload.cjs'), includeGlobs: ['chrome-extension://*/*'] });
  return bridge;
}
module.exports = { installDebuggerTrace };
