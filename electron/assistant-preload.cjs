const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('assistantPreview', {
  read: () => ipcRenderer.invoke('assistant:action', { action: 'read' }),
  click: (label) => ipcRenderer.invoke('assistant:action', { action: 'click', label }),
});
