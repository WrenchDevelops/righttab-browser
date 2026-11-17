const { spawnSync } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'righttab-debugger-app-'));
try { for (const mode of ['tabId', 'targetId']) { const profile = path.join(dir, mode); fs.mkdirSync(profile); const result = spawnSync(require('electron'), [path.join(__dirname, '../electron/debugger-app-integration-check.cjs'), profile, mode], { stdio: 'inherit', timeout: 45000 }); if (result.error) console.error(result.error.message); if (result.status !== 0) { process.exitCode = result.status ?? 1; break; } } }
finally { fs.rmSync(dir, { recursive: true, force: true }); }
