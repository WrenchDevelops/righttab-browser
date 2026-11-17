const { spawn } = require('node:child_process');
const path = require('node:path');
const child = spawn(require('electron'), [path.join(__dirname, '../electron/media-check.cjs'), ...process.argv.slice(2)], {
  stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '' },
});
child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code) => process.exit(code == null ? 1 : code));
