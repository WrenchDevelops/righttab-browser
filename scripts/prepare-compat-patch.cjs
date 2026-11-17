// Reproducibly derive the experimental adapter from the pinned upstream release.
// Run against a separately installed electron-chrome-extensions@4.10.0 package.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = process.argv[2];
if (!root) throw new Error('Pass the installed electron-chrome-extensions package directory.');
const meta = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
if (meta.version !== '4.10.0') throw new Error('Expected electron-chrome-extensions 4.10.0.');
let main = fs.readFileSync(path.join(root, 'dist/cjs/index.js'), 'utf8');
let preload = fs.readFileSync(path.join(root, 'dist/chrome-extension-api.preload.js'), 'utf8');
for (const [data, expected] of [[main, 'd9065e17c44fcc02453eda134f2b8b235a968edb1317bd7195e10ee4d8d5efca'], [preload, '03a5eecb3532bb6bd494c50d4e0360c3e6ef7895552bec3a8d96b0c986573849']]) {
  if (crypto.createHash('sha256').update(data).digest('hex') !== expected) throw new Error('Upstream package checksum mismatch.');
}
function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw new Error('Upstream code does not match expected pinned patch.');
  return source.replace(before, after);
}
main = replaceOnce(main, 'var d8 = (0, import_debug8.default)("electron-chrome-extensions:router");', `var d8 = (0, import_debug8.default)("electron-chrome-extensions:router");
var { createExtensionSenderAuthenticator } = require('../extension-sender.cjs');
function authenticatedExtensionId(event, claimed) {
  const session = getSessionFromEvent(event);
  const authenticate = createExtensionSenderAuthenticator({
    session,
    isEnabled: (id) => !!session.extensions.getExtension(id),
    isExtensionPage: (contents, id) => contents.mainFrame && contents.mainFrame.url.startsWith('chrome-extension://' + id + '/')
  });
  const principal = authenticate(event);
  if (!principal || principal.id !== claimed) throw new Error('Untrusted extension sender.');
  return principal.id;
}`);
main = replaceOnce(main, 'return observer?.onExtensionMessage(event, extensionId, handlerName, ...args);', 'return observer?.onExtensionMessage(event, authenticatedExtensionId(event, extensionId), handlerName, ...args);');
main = replaceOnce(main, `      const ses = sessionPartition === DEFAULT_SESSION ? getSessionFromEvent(event) : resolvePartition(sessionPartition);
      const observer = this.sessionMap.get(ses);
      return observer?.onExtensionMessage(event, void 0, handlerName, ...args);`, `      throw new Error('Remote extension IPC is unavailable.');`);
main = replaceOnce(main, '    this.onAddListener = (event, extensionId, eventName) => {\n      const observer', '    this.onAddListener = (event, extensionId, eventName) => {\n      try { extensionId = authenticatedExtensionId(event, extensionId); } catch { console.error("Rejected untrusted extension listener."); return; }\n      const observer');
main = replaceOnce(main, '    this.onRemoveListener = (event, extensionId, eventName) => {\n      const observer', '    this.onRemoveListener = (event, extensionId, eventName) => {\n      try { extensionId = authenticatedExtensionId(event, extensionId); } catch { console.error("Rejected untrusted extension listener."); return; }\n      const observer');
main = replaceOnce(main, '    const handler = this.getHandler(handlerName);', `    const allowedOperations = new Set(['windows.get', 'windows.getCurrent', 'windows.getLastFocused', 'windows.getAll', 'windows.create', 'windows.update', 'windows.remove', 'tabs.get', 'tabs.getCurrent', 'tabs.getAllInWindow', 'tabs.query', 'tabs.create', 'tabs.update', 'tabs.remove']);
    if (!allowedOperations.has(handlerName)) throw new Error('Unsupported extension operation: ' + handlerName);
    const allowed = eventSession.extensions.getExtension(extensionId)?.manifest?.permissions || [];
    if (!allowed.includes('tabs')) throw new Error('This experimental windows/tabs adapter requires the tabs permission.');
    const handler = this.getHandler(handlerName);`);
main = replaceOnce(main, '  const principal = authenticate(event);\n  if (!principal || principal.id !== claimed)', `  const principal = authenticate(event);
  if (!principal?.permissions?.includes('tabs')) throw new Error('The tabs permission is required.');
  if (!principal || principal.id !== claimed)`);
main = replaceOnce(main, '    if (!tab) return { id: _TabsAPI.TAB_ID_NONE };\n    return this.getTabDetails(tab);', `    if (!tab) throw new Error('No tab with id: ' + tabId);
    return this.getTabDetails(tab);`);
main = replaceOnce(main, '    if (!win) return { id: _WindowsAPI.WINDOW_ID_NONE };\n    return this.getWindowDetails(win);', `    if (!win) throw new Error('No window with id: ' + windowId);
    return this.getWindowDetails(win);`);
// A background tab must not become active merely because it was registered.
main = replaceOnce(main, `    this.onCreated(tabId);
    this.onActivated(tabId);
    d4(`, `    this.onCreated(tabId);
    d4(`);
main = replaceOnce(main, 'function resolvePreloadPath(modulePath) {', "function resolvePreloadPath(modulePath) { return import_node_path.default.join(__dirname, 'compat-preload.cjs');\n");
preload = replaceOnce(preload, `        console.warn(\`${'${fnName}'} is not yet implemented.\`);
        if (callback) callback(options.defaultResponse);
        return Promise.resolve(options.defaultResponse);`, `        throw new Error(fnName + ' is not implemented.');`);
preload = replaceOnce(preload, `        console.error(e);
        result = void 0;`, `        throw e;`);
preload = replaceOnce(preload, '  var listenerMap = /* @__PURE__ */ new Map();', `  var listenerMap = /* @__PURE__ */ new Map();
  var listenerWrappers = new WeakMap();`);
preload = replaceOnce(preload, `    import_electron.ipcRenderer.addListener(formatIpcName(name), function(event, ...args) {
      if (true) {
        console.log(name, "(result)", ...args);
      }
      callback(...args);
    });`, `    const wrapper = (_event, ...args) => callback(...args);
    let names = listenerWrappers.get(callback);
    if (!names) { names = new Map(); listenerWrappers.set(callback, names); }
    names.set(name, wrapper);
    import_electron.ipcRenderer.addListener(formatIpcName(name), wrapper);`);
preload = replaceOnce(preload, '    import_electron.ipcRenderer.removeListener(formatIpcName(name), callback);', `    const names = listenerWrappers.get(callback);
    const wrapper = names?.get(name);
    if (wrapper) { import_electron.ipcRenderer.removeListener(formatIpcName(name), wrapper); names.delete(name); }`);
preload = replaceOnce(preload, `        constructor(name) {
          this.name = name;
        }
        addListener(callback) {
          electron.addExtensionListener(extensionId, this.name, callback);
        }
        removeListener(callback) {
          electron.removeExtensionListener(extensionId, this.name, callback);
        }`, `        constructor(name) { this.name = name; this.callbacks = new Set(); }
        addListener(callback) {
          if (typeof callback !== 'function') throw new TypeError('A listener function is required.');
          if (this.callbacks.has(callback)) return;
          this.callbacks.add(callback);
          electron.addExtensionListener(extensionId, this.name, callback);
        }
        removeListener(callback) {
          if (!this.callbacks.delete(callback)) return;
          electron.removeExtensionListener(extensionId, this.name, callback);
        }`);
preload = replaceOnce(preload, `        hasListener(callback) {
          throw new Error("Method not implemented.");
        }`, `        hasListener(callback) { return this.callbacks.has(callback); }`);
preload = replaceOnce(preload, `        hasListeners() {
          throw new Error("Method not implemented.");
        }`, `        hasListeners() { return this.callbacks.size > 0; }`);
preload = replaceOnce(preload, `      if (true) {
        console.log(fnName, args);
      }
`, '');
preload = replaceOnce(preload, `      if (true) {
        console.log(fnName, "(result)", result);
      }
`, '');
preload = replaceOnce(preload, '      const invokeExtension2 = (fnName, opts = {}) => (...args) => electron.invokeExtension(extensionId, fnName, opts, ...args);', `      const invokeExtension2 = (fnName, opts = {}) => (...args) => {
        const callback = typeof args[args.length - 1] === 'function' ? args.pop() : null;
        const promise = electron.invokeExtension(extensionId, fnName, opts, ...args);
        if (!callback) return promise;
        promise.then((result) => callback(result), (error) => {
          const previous = Object.getOwnPropertyDescriptor(chrome.runtime, 'lastError');
          Object.defineProperty(chrome.runtime, 'lastError', { configurable: true, value: { message: String(error?.message || error) } });
          try { callback(); } finally {
            if (previous) Object.defineProperty(chrome.runtime, 'lastError', previous);
            else delete chrome.runtime.lastError;
          }
        });
      };`);
preload = replaceOnce(preload, '        const apiName = key;\n        const baseApi', `        const apiName = key;
        if (apiName !== 'windows' && apiName !== 'tabs') return;
        const baseApi`);
const dest = path.join(__dirname, '../electron/vendor');
fs.mkdirSync(dest, { recursive: true });
fs.writeFileSync(path.join(dest, 'compat.cjs'), main);
fs.writeFileSync(path.join(dest, 'compat-preload.cjs'), preload);
console.log('Prepared experimental compatibility patch.');
