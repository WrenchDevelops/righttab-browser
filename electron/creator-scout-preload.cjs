const { contextBridge, ipcRenderer } = require('electron');
const invoke = (action, payload = {}) => ipcRenderer.invoke('creator-scout:action', { action, ...payload });
contextBridge.exposeInMainWorld('scout', {
  invoke,
  resize: (width) => ipcRenderer.invoke('creator-scout:resize-panel', { width }),
  onProgress(callback) {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('creator-scout:progress', listener);
    return () => ipcRenderer.removeListener('creator-scout:progress', listener);
  },
  onContext(callback) {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('creator-scout:context', listener);
    return () => ipcRenderer.removeListener('creator-scout:context', listener);
  },
  onTheme(callback) {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('creator-scout:theme', listener);
    return () => ipcRenderer.removeListener('creator-scout:theme', listener);
  },
});
