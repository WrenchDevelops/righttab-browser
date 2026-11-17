const { app, session, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { createExtensionSenderAuthenticator } = require('./extension-sender.cjs');
const root = process.argv[2];
app.setPath('userData', root);
app.whenReady().then(async () => {
  const dir = path.join(root, 'extension'); fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'Identity probe', version: '1.0', permissions: ['debugger'], background: { service_worker: 'worker.js' } }));
  fs.writeFileSync(path.join(dir, 'worker.js'), 'console.log("worker started")');
  fs.writeFileSync(path.join(dir, 'panel.html'), '<title>Identity probe</title>');
  const preload = path.join(root, 'preload.cjs');
  fs.writeFileSync(preload, `const {ipcRenderer}=require('electron'); ipcRenderer.invoke('righttab-identity-check').catch(()=>{});`);
  const ses = session.defaultSession;
  ses.registerPreloadScript({ type: 'service-worker', filePath: preload });
  ses.registerPreloadScript({ type: 'frame', filePath: preload });
  let extensionId = '', page;
  const auth = createExtensionSenderAuthenticator({ session: ses, isEnabled: (id) => id === extensionId, isExtensionPage: (wc) => wc === page?.webContents });
  const observations = new Set();
  function inspect(event) {
    const p = auth(event);
    if (p) observations.add(event.type === 'service-worker' ? 'worker' : 'frame');
    return !!p;
  }
  ipcMain.handle('righttab-identity-check', inspect);
  ses.serviceWorkers.on('running-status-changed', ({ runningStatus, versionId }) => {
    if (runningStatus !== 'starting') return;
    const worker = ses.serviceWorkers.getWorkerFromVersionID(versionId);
    if (worker) worker.ipc.handle('righttab-identity-check', inspect);
  });
  // Set the expected ID before its worker starts.
  ses.extensions.on('extension-loaded', (_event, extension) => { extensionId = extension.id; });
  const extension = await ses.extensions.loadExtension(dir);
  extensionId = extension.id;
  page = new BrowserWindow({ show: false, webPreferences: { session: ses, sandbox: true, contextIsolation: true } });
  await page.loadURL(`chrome-extension://${extension.id}/panel.html`);
  for (let i = 0; i < 100 && observations.size < 2; i++) await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual([...observations].sort(), ['frame', 'worker']);
  console.log('PASS: live extension frame and worker sender identity');
  page.destroy(); app.exit(0);
}).catch((error) => { console.error(error); app.exit(1); });
