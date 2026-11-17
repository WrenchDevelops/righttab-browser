const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const electron = require('electron');
const extensionPath = process.argv[2];
if (!extensionPath) {
  console.error('Usage: npm run diagnose:extension -- /path/to/unpacked/extension');
  process.exit(2);
}
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'righttab-diagnostic-'));
try {
  const result = spawnSync(electron, [path.join(__dirname, '../electron/diagnose-extension.cjs'), path.resolve(extensionPath), profile], { stdio: 'inherit', timeout: 30000 });
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 1;
} finally {
  fs.rmSync(profile, { recursive: true, force: true });
}
