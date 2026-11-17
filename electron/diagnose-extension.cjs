// Runs only in a disposable profile. Never point userData at an existing profile.
const { app, session } = require('electron');
const extensionPath = process.argv[2];
const profile = process.argv[3];
if (!extensionPath || !profile) throw new Error('Expected extension path and temporary profile');
app.setPath('userData', profile);
app.whenReady().then(async () => {
  const workers = session.defaultSession.serviceWorkers;
  console.log(`Electron ${process.versions.electron}; Chromium ${process.versions.chrome}`);
  workers.on('console-message', (_event, details) => {
    if (details.level >= 2 && details.sourceUrl.startsWith('chrome-extension://')) {
      console.log(`Worker ${details.level === 3 ? 'error' : 'warning'}: ${details.message} (${details.sourceUrl}:${details.lineNumber})`);
    }
  });
  workers.on('registration-completed', (_event, details) => console.log(`Registered: ${details.scope}`));
  const extension = await session.defaultSession.extensions.loadExtension(extensionPath, { allowFileAccess: false });
  console.log(`Loaded: ${extension.id}`);
  await new Promise((resolve) => setTimeout(resolve, 8000));
  console.log(`Running workers: ${Object.keys(workers.getAllRunning()).length}`);
  app.exit(0);
}).catch((error) => { console.error(error.message); app.exit(1); });
