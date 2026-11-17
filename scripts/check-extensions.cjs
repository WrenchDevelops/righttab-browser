const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const electron = require('electron');

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'righttab-extensions-'));
let failed = false;
try {
  for (const phase of ['save', 'verify']) {
    const result = spawnSync(electron, [path.join(__dirname, '../electron/extension-check.cjs'), profile, phase], {
      stdio: 'inherit',
      timeout: 120000,
    });
    if (result.status !== 0) {
      failed = true;
      break;
    }
  }
} finally {
  fs.rmSync(profile, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
