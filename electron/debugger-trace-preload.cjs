// Isolated diagnostic preload. This is not registered by the shipping app.
const { contextBridge, ipcRenderer } = require('electron');
const listeners = { onDetach: new Set(), onEvent: new Set() };
ipcRenderer.on('righttab-debugger-trace-event', (_event, name, ...args) => {
  if (listeners[name]) for (const callback of listeners[name]) callback(...args);
});
contextBridge.exposeInMainWorld('__righttabDebuggerTrace', {
  invoke: (method, args) => ipcRenderer.invoke('righttab-debugger-trace', method, args),
  add: (name, callback) => { if (!listeners[name]) throw new Error('Invalid event'); listeners[name].add(callback); },
  remove: (name, callback) => { if (!listeners[name]) throw new Error('Invalid event'); listeners[name].delete(callback); },
});
contextBridge.executeInMainWorld({ func: () => {
  const bridge = globalThis.__righttabDebuggerTrace;
  const event = (name) => ({ addListener: (callback) => bridge.add(name, callback), removeListener: (callback) => bridge.remove(name, callback) });
  const call = (name) => (...args) => {
    if (typeof args[args.length - 1] === 'function') throw new Error('Callback mode is not implemented in this diagnostic.');
    return bridge.invoke(name, args);
  };
  globalThis.chrome.debugger = { attach: call('attach'), detach: call('detach'), sendCommand: call('sendCommand'), getTargets: call('getTargets'), onEvent: event('onEvent'), onDetach: event('onDetach') };
} });
