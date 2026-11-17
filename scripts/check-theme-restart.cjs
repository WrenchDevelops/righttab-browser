const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const electron = require('electron');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'righttab-theme-restart-'));
try {
  for (const phase of ['save', 'verify']) {
    const result = spawnSync(electron, [path.join(__dirname, '../electron/theme-restart.cjs'), profile, phase], { stdio: 'inherit', timeout: 30000 });
    if (result.status !== 0) process.exitCode = 1;
    if (result.status !== 0) break;
  }
} finally { fs.rmSync(profile, { recursive: true, force: true }); }
