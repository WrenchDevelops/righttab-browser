function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  const source = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ',') {
      row.push(cell);
      cell = '';
      continue;
    }
    if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    if (char !== '\r') cell += char;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((item) => item.some((value) => value.trim() !== ''));
}

function parseChromePasswordCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { entries: [], error: 'The CSV file is empty.' };
  const header = rows[0].map((value) => value.trim().toLowerCase());
  const urlIndex = header.indexOf('url');
  const usernameIndex = header.indexOf('username');
  const passwordIndex = header.indexOf('password');
  if (urlIndex < 0 || usernameIndex < 0 || passwordIndex < 0) {
    return { entries: [], error: 'The CSV needs url, username, and password columns. Export it from Chrome’s password manager.' };
  }
  const entries = [];
  for (const row of rows.slice(1)) {
    const url = (row[urlIndex] || '').trim();
    const username = (row[usernameIndex] || '').trim();
    const password = row[passwordIndex] || '';
    if (!url || !password) continue;
    entries.push({ origin: url, username, password });
  }
  return { entries, error: null };
}

module.exports = { parseCsv, parseChromePasswordCsv };
