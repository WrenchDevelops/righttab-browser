const fs = require('fs');
const path = require('path');

function writeJsonAtomic(file, value, { mode } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  const body = typeof value === 'string' ? value : JSON.stringify(value);
  try {
    fs.writeFileSync(tmp, body, mode == null ? undefined : { mode });
    fs.renameSync(tmp, file);
    if (mode != null) {
      try { fs.chmodSync(file, mode); } catch { /* mode already applied on create */ }
    }
    return true;
  } catch (error) {
    try { fs.unlinkSync(tmp); } catch { /* tmp may never have been created */ }
    console.error(`[righttab] failed to write ${file}:`, error && error.message ? error.message : error);
    return false;
  }
}

module.exports = { writeJsonAtomic };
