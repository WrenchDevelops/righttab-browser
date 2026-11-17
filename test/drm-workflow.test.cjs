const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { fingerprint, evsEnvironment, disneyOnlySession, testSigned } = require('../scripts/drm-workflow.cjs');
const { configureSignedMediaTest } = require('../electron/signed-media-test.cjs');
const { probeMediaConfigurations } = require('../electron/media-configuration-probe.cjs');
const { comparison, browserProbeSource } = require('../scripts/media-comparison.cjs');

test('unsigned packages cannot read a profile or launch a playback test', async () => {
  let launched = false;
  await assert.rejects(testSigned({ source: '/nonexistent/private/profile', verify: async () => ({ production: false }), launch: async () => { launched = true; } }), /production signature/);
  assert.equal(launched, false);
});

test('signing environment cannot submit a password or weaken verification through inherited EVS options', () => {
  const env = evsEnvironment({ PATH: '/bin', EVS_PASSWD: 'secret', EVS_ANY_SKI: '1', EVS_API_URL: 'https://untrusted.test', EVS_FORCE: '1', EVS_TRACE: '1' });
  assert.deepEqual(env, { PATH: '/bin', EVS_NO_ASK: '1' });
});

test('signing plan detects app changes while allowing only the VMP signature to change', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'righttab-fingerprint-'));
  try {
    const resources = path.join(dir, 'Contents/Frameworks/Electron Framework.framework/Versions/A/Resources');
    fs.mkdirSync(resources, { recursive: true });
    fs.writeFileSync(path.join(resources, 'Electron Framework.sig'), 'development');
    fs.writeFileSync(path.join(dir, 'app.asar'), 'reviewed app');
    const reviewed = await fingerprint(dir, { excludeVmpSignature: true });
    const before = await fingerprint(dir);
    fs.writeFileSync(path.join(resources, 'Electron Framework.sig'), 'production');
    assert.equal(await fingerprint(dir, { excludeVmpSignature: true }), reviewed);
    assert.notEqual(await fingerprint(dir), before);
    fs.writeFileSync(path.join(dir, 'app.asar'), 'different app');
    assert.notEqual(await fingerprint(dir, { excludeVmpSignature: true }), reviewed);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('isolated replay requires a closed source and retains only the Disney title', () => {
  const original = { cleanExit: true, windows: [{ activeSpaceId: 'personal', tabs: [
    { url: 'https://mail.example.test/' },
    { url: 'https://www.disneyplus.com/play/title', spaceId: 'streaming' },
    { url: 'https://attacker.test/play/title' },
  ], activeIndex: 0, secondaryIndex: 2 }] };
  const clone = disneyOnlySession(original);
  assert.equal(original.windows[0].tabs.length, 3);
  assert.deepEqual(clone.windows[0].tabs, [original.windows[0].tabs[1]]);
  assert.equal(clone.windows[0].activeSpaceId, 'streaming');
  assert.equal(clone.windows[0].secondaryIndex, null);
  assert.throws(() => disneyOnlySession({ ...original, cleanExit: false }), /closed profile/);
});

test('packaged replay rejects the normal profile, missing markers, and the stock runtime', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'righttab-profile-guard-'));
  try {
    const normal = path.join(dir, 'RightTab');
    const clone = path.join(dir, 'isolated');
    fs.mkdirSync(normal); fs.mkdirSync(clone);
    let selected;
    const app = { isPackaged: true, isReady: () => false, getPath: () => dir, setPath: (_key, value) => { selected = value; } };
    const env = { RIGHTTAB_SIGNED_MEDIA_TEST: '1', RIGHTTAB_MEDIA_TEST_PROFILE: normal, RIGHTTAB_MEDIA_REPORT: '/tmp/report.json', RIGHTTAB_MEDIA_TEST_NONCE: 'test-nonce' };
    const components = { whenReady() {} };
    assert.throws(() => configureSignedMediaTest(app, components, env), /normal RightTab profile/);
    assert.equal(selected, undefined);
    env.RIGHTTAB_MEDIA_TEST_PROFILE = clone;
    assert.throws(() => configureSignedMediaTest(app, components, env), /ENOENT/);
    fs.writeFileSync(path.join(clone, '.righttab-signed-media-test.json'), JSON.stringify({ format: 'righttab-signed-media-test', nonce: 'test-nonce' }));
    assert.throws(() => configureSignedMediaTest(app, undefined, env), /packaged Castlabs app/);
    assert.equal(configureSignedMediaTest(app, components, env), true);
    assert.equal(selected, fs.realpathSync(clone));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('robustness probe measures CENC/CBCS without license sessions or persistent identifiers', async () => {
  const requests = [];
  const report = await vm.runInNewContext(`(${probeMediaConfigurations.toString()})()`, {
    setTimeout, clearTimeout, location: { origin: 'https://www.disneyplus.com' }, isSecureContext: true,
    navigator: { userAgent: 'Fixture browser',
      requestMediaKeySystemAccess: async (system, configurations) => {
        assert.equal(system, 'com.widevine.alpha');
        const config = configurations[0]; requests.push(config);
        if (config.videoCapabilities[0].robustness.startsWith('HW_')) throw Object.assign(new Error(), { name: 'NotSupportedError' });
        return { getConfiguration: () => config };
      }, mediaCapabilities: { decodingInfo: async () => ({ supported: true, smooth: true, powerEfficient: false, keySystemAccess: {} }) },
    },
  });
  assert.equal(report.matrix.length, 14);
  assert.equal(report.matrix.filter((row) => row.supported).length, 8);
  assert.ok(requests.every((item) => item.distinctiveIdentifier === 'not-allowed' && item.persistentState === 'not-allowed'));
  assert.equal(report.decoding.keySystemAccess, true);
});

test('comparison reports differences without inferring certification or claiming title playback', () => {
  const left = { configurations: { matrix: [{ robustness: 'HW_SECURE_ALL', encryptionScheme: 'cbcs', supported: false }] }, events: [{ kind: 'http-error', category: 'license', status: 400 }] };
  const right = { configurations: { matrix: [{ robustness: 'HW_SECURE_ALL', encryptionScheme: 'cbcs', supported: true }] }, playback: { protectedPlaybackObserved: true } };
  const result = comparison(left, right);
  assert.equal(result.differences.length, 1);
  assert.equal(result.productionSignatureVerified, false);
  assert.equal(result.titlePlaybackVerified, false);
  assert.match(result.conclusion, /cannot be inferred from HTTP 400/);
  new vm.Script(browserProbeSource());
});
