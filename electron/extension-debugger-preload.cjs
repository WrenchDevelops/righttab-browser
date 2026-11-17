// Loaded only in extension service workers in the isolated test profile.
const { contextBridge, ipcRenderer } = require('electron');
const listeners = { onDetach: new Set(), onEvent: new Set() };
ipcRenderer.on('righttab-debugger-event', (_event, name, ...args) => {
  if (listeners[name]) for (const callback of listeners[name]) callback(...args);
});
contextBridge.exposeInMainWorld('__righttabDebugger', {
  invoke: (method, args) => ipcRenderer.invoke('righttab-debugger', method, args),
  add: (name, callback) => { if (!listeners[name]) throw new Error('Invalid event'); listeners[name].add(callback); },
  remove: (name, callback) => { if (!listeners[name]) throw new Error('Invalid event'); listeners[name].delete(callback); },
});
contextBridge.executeInMainWorld({ func: () => {
  const bridge = globalThis.__righttabDebugger;
  if (!chrome.runtime?.getManifest()?.permissions?.includes('debugger')) return;
  function event(name) {
    const callbacks = new Set();
    return {
      addListener(callback) { if (typeof callback !== 'function') throw new TypeError('Listener must be a function'); if (!callbacks.has(callback)) { callbacks.add(callback); bridge.add(name, callback); } },
      removeListener(callback) { if (callbacks.delete(callback)) bridge.remove(name, callback); },
      hasListener(callback) { return callbacks.has(callback); },
      hasListeners() { return callbacks.size > 0; },
    };
  }
  const call = (method) => (...args) => {
    const callback = typeof args[args.length - 1] === 'function' ? args.pop() : null;
    const promise = bridge.invoke(method, args);
    if (!callback) return promise;
    promise.then((value) => callback(value), (error) => {
      const previous = Object.getOwnPropertyDescriptor(chrome.runtime, 'lastError');
      Object.defineProperty(chrome.runtime, 'lastError', { configurable: true, value: { message: String(error?.message || error) } });
      try { callback(); } finally { if (previous) Object.defineProperty(chrome.runtime, 'lastError', previous); else delete chrome.runtime.lastError; }
    });
  };
  chrome.debugger = { attach: call('attach'), detach: call('detach'), sendCommand: call('sendCommand'), getTargets: call('getTargets'), onEvent: event('onEvent'), onDetach: event('onDetach') };
} });
