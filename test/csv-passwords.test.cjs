const test = require('node:test');
const assert = require('node:assert/strict');
const { parseChromePasswordCsv } = require('../shared/csv-passwords.cjs');

test('Chrome password CSV rows are parsed, including quoted commas', () => {
  const csv = 'name,url,username,password\n"Example, Inc",https://example.com/login,ada,"p,ass"\n';
  const parsed = parseChromePasswordCsv(csv);
  assert.equal(parsed.error, null);
  assert.deepEqual(parsed.entries, [{ origin: 'https://example.com/login', username: 'ada', password: 'p,ass' }]);
});
