// Diagnostic only: a new temporary profile and loopback DevTools endpoint per run.
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const electron = require('electron');
const extensionPath = process.argv[2];
if (!extensionPath) {
  console.error('Usage: node scripts/trace-extension-worker.cjs /path/to/unpacked/extension');
  process.exit(2);
}
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'righttab-worker-trace-'));
try {
  const result = spawnSync(electron, [path.join(__dirname, '../electron/trace-extension-worker.cjs'), path.resolve(extensionPath), profile], {
    stdio: 'inherit', timeout: 30000, env: process.env,
  });
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 1;
} finally {
  fs.rmSync(profile, { recursive: true, force: true });
}
