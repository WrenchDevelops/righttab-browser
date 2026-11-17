const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const appPath = path.join(root, 'dist-drm/mac-arm64/RightTab.app');
const python = path.join(root, '.venv-evs/bin/python');
const planPath = path.join(root, 'test-results/drm-signing-plan.json');
const receiptPath = path.join(root, 'test-results/drm-production-verification.json');

async function fingerprint(directory, { excludeVmpSignature = false } = {}) {
  const digest = crypto.createHash('sha256');
  async function walk(dir) {
    for (const entry of (await fsp.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(dir, entry.name);
      const relative = path.relative(directory, absolute).split(path.sep).join('/');
      if (excludeVmpSignature && relative.endsWith('/Resources/Electron Framework.sig')) continue;
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isSymbolicLink()) digest.update(JSON.stringify([relative, 'link', await fsp.readlink(absolute)]));
      else if (entry.isFile()) {
        const fileHash = crypto.createHash('sha256');
        for await (const chunk of fs.createReadStream(absolute)) fileHash.update(chunk);
        digest.update(JSON.stringify([relative, fileHash.digest('hex')]));
      } else throw new Error('Unexpected non-file in app bundle.');
    }
  }
  await walk(directory);
  return digest.digest('hex');
}

function evsEnvironment(base = process.env) {
  const env = { ...base };
  // Authenticate with the official local CLI first. This workflow cannot take
  // passwords, switch verification policy, force signatures, or redirect EVS.
  for (const name of Object.keys(env)) if (name.startsWith('EVS_')) delete env[name];
  env.EVS_NO_ASK = '1';
  return env;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env: options.env || process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    const deadline = options.timeoutMs ? setTimeout(() => child.kill('SIGKILL'), options.timeoutMs) : null;
    let output = '';
    const stages = new Set();
    const capture = (chunk) => { output = (output + chunk.toString()).slice(-65536); };
    child.stdout.on('data', (chunk) => {
      capture(chunk);
      if (options.logStages) for (const line of chunk.toString().split('\n')) {
        if (/^SIGNED_IN_TEST (tabs restored|window ready|diagnostics ready|playback page loaded|ready for title observation)$/.test(line) && !stages.has(line)) { stages.add(line); console.log(line); }
      }
    }); child.stderr.on('data', capture);
    child.on('error', (error) => { clearTimeout(deadline); reject(error); });
    child.on('close', (code, signal) => { clearTimeout(deadline); resolve({ code: code ?? 1, signal, output }); });
  });
}

async function evs(command) {
  return run(python, ['-m', 'castlabs_evs.vmp', '--no-ask', command, '--streaming', '--name-hint', 'RightTab', '--min-days', '1', path.dirname(appPath)], { env: evsEnvironment() });
}

async function productionVerification() {
  const result = await evs('verify-pkg');
  if (result.code === 0 && result.output.includes('Signature is valid:')) return { production: true, kind: 'streaming', minimumValidityDays: 1 };
  return { production: false, reason: result.output.includes('development only') ? 'development-certificate' : 'verification-failed', exitCode: result.code };
}

async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, JSON.stringify(value, null, 2), { mode: 0o600 });
}

async function verifyAndRecord() {
  const verification = await productionVerification();
  if (!verification.production) throw new Error(`Production VMP verification failed: ${verification.reason}. No playback test was launched.`);
  const receipt = { format: 'righttab-production-vmp', version: 1, verifiedAt: new Date().toISOString(), app: appPath,
    ...verification, fingerprint: await fingerprint(appPath) };
  try {
    const previous = JSON.parse(await fsp.readFile(receiptPath, 'utf8'));
    if (previous.fingerprint === receipt.fingerprint && previous.source === 'pre-existing public EVS signature cache; restored offline') {
      Object.assign(receipt, { source: previous.source, accountActionTaken: false, newSigningRequest: false, networkRequests: 0 });
    }
  } catch { /* no prior verification receipt */ }
  await writeJson(receiptPath, receipt);
  return receipt;
}

function disneyOnlySession(session) {
  if (session?.cleanExit !== true) throw new Error('Use a backup of a closed profile; the source session is not marked clean.');
  for (const win of session.windows || []) {
    const tab = (win.tabs || []).find((item) => {
      try { const url = new URL(item.url); return url.protocol === 'https:' && url.hostname === 'www.disneyplus.com' && /^\/(play\/|browse\/entity-)/.test(url.pathname); }
      catch { return false; }
    });
    if (tab) return { ...session, windows: [{ ...win, tabs: [tab], activeIndex: 0, secondaryIndex: null, secondaryUrl: null, closedStack: [], activeSpaceId: tab.spaceId || win.activeSpaceId }] };
  }
  throw new Error('The source backup must contain an existing Disney+ title tab.');
}

async function testSigned({ source, observe = false, verify = verifyAndRecord, launch = run } = {}) {
  // Verification precedes all profile access, cloning, or application launches.
  const receipt = await verify();
  if (!receipt.production) throw new Error('A production signature is required.');
  if (!source) throw new Error('Provide --profile-source with a backup of your closed RightTab profile.');
  const canonicalSource = await fsp.realpath(source);
  const session = disneyOnlySession(JSON.parse(await fsp.readFile(path.join(canonicalSource, 'session.json'), 'utf8')));
  // A live source cannot be used even if its session file has a stale clean flag.
  try {
    const lock = await fsp.readlink(path.join(canonicalSource, 'SingletonLock'));
    const pid = Number(lock.split('-').at(-1));
    if (pid > 0) {
      let alive = true;
      try { process.kill(pid, 0); } catch (error) { if (error.code === 'ESRCH') alive = false; }
      if (alive) throw new Error('The source profile is in use; use a closed-profile backup.');
    }
  } catch (error) { if (!['ENOENT', 'EINVAL'].includes(error.code)) throw error; }
  const temp = await fsp.mkdtemp(path.join(os.tmpdir(), 'righttab-signed-disney-'));
  await fsp.chmod(temp, 0o700);
  const profile = path.join(temp, 'profile');
  const reportFile = path.join(root, 'test-results', `disney-signed-${Date.now()}.json`);
  try {
    if (process.platform === 'darwin') {
      const copy = await run('/bin/cp', ['-cR', canonicalSource, profile]);
      if (copy.code !== 0) throw new Error('Could not clone the source profile.');
    } else await fsp.cp(canonicalSource, profile, { recursive: true });
    for (const name of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) await fsp.rm(path.join(profile, name), { force: true });
    const settingsFile = path.join(profile, 'settings.json');
    const settings = JSON.parse(await fsp.readFile(settingsFile, 'utf8'));
    await writeJson(settingsFile, { ...settings, installedExtensions: [], completedSetup: true, importOffered: true });
    await writeJson(path.join(profile, 'session.json'), session);
    const nonce = crypto.randomBytes(24).toString('hex');
    await writeJson(path.join(profile, '.righttab-signed-media-test.json'), { format: 'righttab-signed-media-test', nonce });
    if (await fingerprint(appPath) !== receipt.fingerprint) throw new Error('The app changed after signature verification.');
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    for (const name of Object.keys(env)) if (name.startsWith('RIGHTTAB_')) delete env[name];
    Object.assign(env, { RIGHTTAB_SIGNED_MEDIA_TEST: '1', RIGHTTAB_MEDIA_TEST_PROFILE: profile,
      RIGHTTAB_MEDIA_TEST_NONCE: nonce, RIGHTTAB_MEDIA_REPORT: reportFile });
    if (observe) env.RIGHTTAB_MEDIA_OBSERVE = '1';
    const result = await launch(path.join(appPath, 'Contents/MacOS/RightTab'), ['--restore-session'], { env, timeoutMs: 180000, logStages: true });
    if (result.code !== 0 || !fs.existsSync(reportFile)) {
      const errors = (result.output.match(/(?:Error|TypeError|ReferenceError|Signed media test failed):[^\r\n]{0,240}/g) || [])
        .slice(0, 3).map(line => line.replace(/https?:\/\/[^\s]+/g, '[URL omitted]').replace(/[A-Za-z0-9_+\/=.-]{48,}/g, '[value omitted]'));
      throw new Error(`The packaged playback test failed or produced no report (exit ${result.code}${result.signal ? `, ${result.signal}` : ''}). No success is claimed.${errors.length ? ' ' + errors.join(' | ') : ''}`);
    }
    const report = JSON.parse(await fsp.readFile(reportFile, 'utf8'));
    report.productionVerification = receipt;
    report.testConditions = { profile: 'isolated copy of a closed backup', extensions: 'disabled only in the copy',
      sameAccountAndTitleInSupportedBrowser: 'must be established separately' };
    await writeJson(reportFile, report);
    return { report: reportFile, protectedPlaybackObserved: report.playback?.protectedPlaybackObserved === true,
      titlePlaybackVerified: false, note: 'Actual title and audible playback require observation; an ad or capability query is not a Disney title pass.' };
  } finally { await fsp.rm(temp, { recursive: true, force: true }); }
}

async function main(args = process.argv.slice(2)) {
  const [action, ...rest] = args;
  if (!['prepare', 'verify', 'sign', 'restore-cache', 'test'].includes(action)) throw new Error('Use prepare, verify, sign, restore-cache, or test. Signup and credentials are never accepted by this script.');
  if (action !== 'test' && rest.length) throw new Error('No credentials or extra signing arguments are accepted.');
  if (action === 'test' && (!([2, 3].includes(rest.length)) || rest[0] !== '--profile-source' || (rest.length === 3 && rest[2] !== '--observe'))) throw new Error('Use test --profile-source /path/to/closed-profile-backup [--observe].');
  if (!fs.existsSync(python) || !fs.existsSync(appPath)) throw new Error('The EVS environment and packaged DRM app must exist first.');
  if (action === 'prepare') {
    const plan = { format: 'righttab-drm-signing-plan', version: 1, preparedAt: new Date().toISOString(), app: appPath,
      payloadFingerprint: await fingerprint(appPath, { excludeVmpSignature: true }), verification: await productionVerification(),
      signup: '.venv-evs/bin/python -m castlabs_evs.account signup',
      accountActionTaken: false, signingActionTaken: false, defaultRuntime: 'unchanged stock Electron',
      next: ['Authenticate locally with the official EVS CLI', 'npm run drm:sign', 'npm run drm:verify', 'npm run drm:test:disney -- --profile-source /path/to/closed-profile-backup'] };
    await writeJson(planPath, plan);
    return { plan: planPath, verification: plan.verification, accountActionTaken: false, signingActionTaken: false };
  }
  if (action === 'sign' || action === 'restore-cache') {
    const plan = JSON.parse(await fsp.readFile(planPath, 'utf8'));
    if (plan.app !== appPath || plan.payloadFingerprint !== await fingerprint(appPath, { excludeVmpSignature: true })) throw new Error('The packaged app changed. Review and run drm:prepare again before signing.');
    const result = action === 'sign' ? await evs('sign-pkg') : await run(python,
      [path.join(__dirname, 'restore-vmp-cache.py'), appPath, path.join(root, 'test-results/vmp-signature-before-cache-restore.sig')], { env: evsEnvironment() });
    if (result.code !== 0) throw new Error('EVS signing failed. Authenticate locally with the official CLI; no credential prompt or signup is performed by this workflow.');
    const receipt = await verifyAndRecord();
    if (action === 'restore-cache') {
      receipt.source = 'pre-existing public EVS signature cache; restored offline';
      receipt.accountActionTaken = false;
      receipt.newSigningRequest = false;
      receipt.networkRequests = 0;
      await writeJson(receiptPath, receipt);
    }
    return receipt;
  }
  if (action === 'verify') return verifyAndRecord();
  return testSigned({ source: rest[1], observe: rest.includes('--observe') });
}

if (require.main === module) main().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { fingerprint, evsEnvironment, disneyOnlySession, testSigned, main };
