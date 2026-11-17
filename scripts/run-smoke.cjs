const { spawn } = require('child_process');
const electron = require('electron');

const child = spawn(electron, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, RIGHTTAB_SMOKE: '1' },
});

child.on('exit', (code) => process.exit(code == null ? 1 : code));
