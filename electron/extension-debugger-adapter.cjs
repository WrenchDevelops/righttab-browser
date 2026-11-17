// Request dispatcher for a future restricted extension-only preload channel.
// It derives the principal from Electron's event; payloads cannot supply one.
function createDebuggerDispatcher({ authenticate, bridge }) {
  return async function dispatch(event, method, args) {
    const principal = authenticate(event);
    if (!principal || !principal.permissions.includes('debugger')) throw new Error('Debugger permission is required.');
    if (!Array.isArray(args)) throw new TypeError('Arguments must be an array.');
    switch (method) {
      case 'attach': return bridge.attach(principal, ...args);
      case 'detach': return bridge.detach(principal, ...args);
      case 'sendCommand': return bridge.sendCommand(principal, ...args);
      case 'getTargets': return bridge.getTargets(principal, ...args);
      default: throw new Error('Unknown debugger method.');
    }
  };
}
module.exports = { createDebuggerDispatcher };
