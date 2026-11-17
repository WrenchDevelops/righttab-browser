const fs = require('node:fs');
const path = require('node:path');

function configureSignedMediaTest(app, components, env = process.env) {
  if (env.RIGHTTAB_SIGNED_MEDIA_TEST !== '1') return false;
  if (!app.isPackaged || !components?.whenReady) throw new Error('The signed-media test requires the packaged Castlabs app.');
  if (!env.RIGHTTAB_MEDIA_TEST_PROFILE || !env.RIGHTTAB_MEDIA_REPORT || !env.RIGHTTAB_MEDIA_TEST_NONCE) throw new Error('Use npm run drm:test:disney to prepare an isolated profile.');
  const profile = fs.realpathSync(env.RIGHTTAB_MEDIA_TEST_PROFILE);
  const normal = path.join(app.getPath('appData'), 'RightTab');
  const normalPath = fs.existsSync(normal) ? fs.realpathSync(normal) : normal;
  if (profile === normalPath || profile.startsWith(normalPath + path.sep) || normalPath.startsWith(profile + path.sep)) throw new Error('The test cannot use or contain the normal RightTab profile.');
  const marker = JSON.parse(fs.readFileSync(path.join(profile, '.righttab-signed-media-test.json'), 'utf8'));
  if (marker.format !== 'righttab-signed-media-test' || marker.nonce !== env.RIGHTTAB_MEDIA_TEST_NONCE) throw new Error('The isolated test profile marker is invalid.');
  if (app.isReady()) throw new Error('The test profile must be selected before Electron is ready.');
  app.setPath('userData', profile);
  return true;
}

async function runSignedMediaTest(browser, mediaRuntime) {
  const timer = setTimeout(() => require('electron').app.exit(1), 150000);
  try {
    if (mediaRuntime.provider !== 'castlabs' || mediaRuntime.status !== 'ready') throw new Error('Widevine components must be ready before the signed test.');
    await require('./disney-live-check.cjs').run(browser, mediaRuntime, {
      outputPath: process.env.RIGHTTAB_MEDIA_REPORT,
      signedPackageTest: true,
      captureConfigurations: true,
    });
  } finally { clearTimeout(timer); }
}

module.exports = { configureSignedMediaTest, runSignedMediaTest };
