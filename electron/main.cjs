const { app, components, protocol } = require('electron');
const { initializeMediaRuntime } = require('./media-runtime.cjs');
const fs = require('fs');
const os = require('os');
const path = require('path');

app.setName('RightTab');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'righttab',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
]);

// Persist failures (especially ENOSPC) must not take down the whole browser.
process.on('uncaughtException', (error) => {
  console.error('[righttab] uncaughtException:', error && error.stack ? error.stack : error);
  if (error && (error.code === 'ENOSPC' || error.code === 'EDQUOT')) return;
});
process.on('unhandledRejection', (reason) => {
  console.error('[righttab] unhandledRejection:', reason && reason.stack ? reason.stack : reason);
});

const signedMediaTest = require('./signed-media-test.cjs').configureSignedMediaTest(app, components);

// This opt-in profile is separate from the user's normal RightTab data.
if (process.env.RIGHTTAB_EXTENSION_TEST === '1') {
  app.setPath('userData', path.join(app.getPath('appData'), 'RightTab Extension Test'));
}

if (process.env.RIGHTTAB_SMOKE === '1' || process.env.RIGHTTAB_SHOT === '1' || process.env.RIGHTTAB_SCOUT_TEST === '1' || process.env.RIGHTTAB_AUTOMATION_TEST === '1' || process.env.RIGHTTAB_YOUTUBEJS_TEST === '1' || process.env.RIGHTTAB_CONTACT_LIVE_TEST === '1') {
  const prefix = process.env.RIGHTTAB_CONTACT_LIVE_TEST === '1' ? 'righttab-contact-live-' : process.env.RIGHTTAB_SHOT === '1' ? 'righttab-shot-' : process.env.RIGHTTAB_SCOUT_TEST === '1' ? 'righttab-scout-' : 'righttab-smoke-';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  app.setPath('userData', dir);
  if (process.env.RIGHTTAB_CONTACT_LIVE_TEST === '1') {
    const source = JSON.parse(fs.readFileSync(path.join(os.homedir(), 'Library/Application Support/RightTab/creator-scout.json'), 'utf8'));
    if (!source.key) throw new Error('No encrypted YouTube key in the regular profile.');
    fs.writeFileSync(path.join(dir, 'creator-scout.json'), JSON.stringify({ key: source.key }), { mode: 0o600 });
    if (process.env.RIGHTTAB_OPENROUTER_TEST === '1') {
      fs.copyFileSync(path.join(os.homedir(), 'Library/Application Support/RightTab/openrouter-credentials.json'), path.join(dir, 'openrouter-credentials.json'));
      fs.chmodSync(path.join(dir, 'openrouter-credentials.json'), 0o600);
    }
    process.once('exit', () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });
  }
  process.env.RIGHTTAB_SMOKE_DIR = dir;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.whenReady().then(async () => {
    app.userAgentFallback = String(app.userAgentFallback || '').replace(/\s+RightTab\/[\d.]+/gi, '');
    // Leave DNS resolution to Chromium's defaults and the system/network policy.
    const mediaRuntime = await initializeMediaRuntime(components);
    const { startBrowser } = require('./browser.cjs');
    const browser = startBrowser({ mediaRuntime });
    if (signedMediaTest) {
      require('./signed-media-test.cjs').runSignedMediaTest(browser, mediaRuntime)
        .then(() => {
          browser.store.flush();
          if (process.env.RIGHTTAB_MEDIA_OBSERVE === '1') console.log('SIGNED_IN_TEST ready for title observation');
          else app.exit(0);
        })
        .catch((error) => { console.error('Signed media test failed:', error.message); app.exit(1); });
    }
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') app.quit();
    });
    if (process.env.RIGHTTAB_CONTACT_LIVE_TEST === '1') {
      require('./contact-live-check.cjs').run(browser).catch((error) => { console.error(error.message); app.exit(1); });
    }
    if (process.env.RIGHTTAB_YOUTUBEJS_TEST === '1') {
      require('./youtubejs-app-check.cjs').run(browser).catch((error) => { console.error(error); app.exit(1); });
    }
    if (process.env.RIGHTTAB_AUTOMATION_TEST === '1') {
      require('./automation-app-check.cjs').run(browser).catch((error) => { console.error(error); app.exit(1); });
    }
    if (process.env.RIGHTTAB_SMOKE === '1') {
      require('./smoke.cjs').runSmoke(browser).catch((error) => {
        console.error(error);
        app.exit(1);
      });
    }
    if (process.env.RIGHTTAB_SHOT === '1') {
      require('./shot.cjs').runShot(browser).catch((error) => {
        console.error(error);
        app.exit(1);
      });
    }
    if (process.env.RIGHTTAB_SCOUT_TEST === '1') {
      require('./creator-scout-app-check.cjs').run(browser).catch((error) => {
        console.error(error);
        app.exit(1);
      });
    }
  });
}
