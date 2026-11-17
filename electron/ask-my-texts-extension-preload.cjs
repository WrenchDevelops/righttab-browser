const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('askMyTexts', {
  request: (payload) => ipcRenderer.invoke('ask-my-texts:action', payload),
});
