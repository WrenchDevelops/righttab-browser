const { spawn } = require('node:child_process');
const child = spawn(require('electron'), ['.'], { stdio: 'inherit', env: { ...process.env, RIGHTTAB_AUTOMATION_TEST: '1' } });
child.on('exit', (code) => process.exit(code == null ? 1 : code));
