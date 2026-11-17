const { spawn } = require('node:child_process');
const child = spawn(require('electron'), ['.'], { stdio: 'inherit', env: { ...process.env, RIGHTTAB_YOUTUBEJS_TEST: '1', RIGHTTAB_YOUTUBE_API_KEY: '' } });
child.on('exit', (code) => process.exit(code == null ? 1 : code));
