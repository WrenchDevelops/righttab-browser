const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'righttab-sender-'));
try {
  const result = spawnSync(require('electron'), [path.join(__dirname, '../electron/extension-sender-check.cjs'), dir], { stdio: 'inherit', timeout: 30000 });
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 1;
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
