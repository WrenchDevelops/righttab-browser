const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'righttab-debugger-'));
try {
  const result = spawnSync(require('electron'), [path.join(__dirname, '../electron/extension-debugger-check.cjs'), profile], { stdio: 'inherit', timeout: 30000 });
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 1;
} finally { fs.rmSync(profile, { recursive: true, force: true }); }
