const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const runtime = path.join(__dirname, '../runtimes/castlabs/node_modules/electron');
if (!fs.existsSync(path.join(runtime, 'path.txt'))) {
  console.error('Install the optional runtime first with npm run setup:drm. See docs/streaming.md for signing and security limitations.');
  process.exit(1);
}
console.warn('Using opt-in Castlabs 45.2.1 development runtime. Production DRM services may require EVS signing; this build is behind stock Electron security updates.');
const args = process.argv.slice(2);
const executable = args[0] === '--npm' ? (process.platform === 'win32' ? 'npm.cmd' : 'npm') : require(runtime);
const child = spawn(executable, args[0] === '--npm' ? args.slice(1) : (args.length && !args[0].startsWith('--') ? args : ['.', ...args]), {
  stdio: 'inherit', cwd: path.join(__dirname, '..'),
  env: { ...process.env, ELECTRON_OVERRIDE_DIST_PATH: path.join(runtime, 'dist') },
});
child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code) => process.exit(code == null ? 1 : code));
