// Isolated capture only: no password-manager API is exposed to page scripts.
const { contextBridge, ipcRenderer } = require('electron');

if (process.isMainFrame) {
  const visible = (el) => {
    if (!el || el.disabled || el.readOnly) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const value = (el) => String(el?.value || '').trim();
  const capture = (form) => {
    const inputs = [...(form?.querySelectorAll?.('input') || document.querySelectorAll('input'))].filter(visible);
    const password = inputs.find((el) => el.type === 'password' && value(el));
    if (!password || password.autocomplete?.startsWith('cc-')) return;
    const username = inputs.find((el) => /^(email|text|tel)$/i.test(el.type) &&
      (el.autocomplete === 'username' || /user|email|login|account/i.test(`${el.name} ${el.id} ${el.placeholder}`))) ||
      inputs.find((el) => /^(email|text)$/i.test(el.type));
    ipcRenderer.send('passwords:captured', { origin: location.origin, username: value(username), password: value(password), pageUrl: location.href });
  };
  document.addEventListener('submit', (event) => capture(event.target), true);
  document.addEventListener('click', (event) => {
    const button = event.target?.closest?.('button, input[type="submit"]');
    if (button) capture(button.form || button.closest('form'));
  }, true);

  // The start page runs in the same tab process as later websites. Expose its
  // bridge only for that origin; the main process checks the sender again.
  try {
    if (location.protocol === 'righttab:' && location.hostname === 'newtab') {
      const subscribe = (callback) => {
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on('homepage:changed', listener);
        return () => ipcRenderer.removeListener('homepage:changed', listener);
      };
      contextBridge.exposeInMainWorld('righttabHome', {
        getState: () => ipcRenderer.invoke('homepage:state'),
        update: (patch) => ipcRenderer.invoke('homepage:update', patch),
        setBrowserSetting: (patch) => ipcRenderer.invoke('homepage:browser-setting', patch),
        submit: (input) => ipcRenderer.invoke('homepage:submit', { input }),
        suggest: (query) => ipcRenderer.invoke('homepage:suggest', { query }),
        open: (payload) => ipcRenderer.invoke('homepage:open', payload),
        geocode: (query) => ipcRenderer.invoke('homepage:geocode', { query }),
        weather: (payload) => ipcRenderer.invoke('homepage:weather', payload || {}),
        pickImage: (kind) => ipcRenderer.invoke('homepage:pick-image', { kind }),
        addEngine: (engine) => ipcRenderer.invoke('homepage:add-engine', engine),
        removeEngine: (id) => ipcRenderer.invoke('homepage:remove-engine', { id }),
        onChange: subscribe,
      });
    }
  } catch { /* this navigation is not the start page */ }
}
