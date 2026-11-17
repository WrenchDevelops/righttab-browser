const crypto = require('crypto');

function deriveChromeKey(safeStoragePassword) {
  return crypto.pbkdf2Sync(String(safeStoragePassword), 'saltysalt', 1003, 16, 'sha1');
}

function encryptChromePassword(plaintext, key) {
  const iv = Buffer.alloc(16, ' ');
  const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return Buffer.concat([Buffer.from('v10'), encrypted]);
}

function decryptChromePassword(payload, key) {
  const buffer = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  if (buffer.length < 4) {
    throw new Error('Password data is empty.');
  }
  const prefix = buffer.subarray(0, 3).toString('utf8');
  if (prefix !== 'v10') {
    throw new Error(`Unsupported Chrome password encryption (${prefix}).`);
  }
  const iv = Buffer.alloc(16, ' ');
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
  const plain = Buffer.concat([decipher.update(buffer.subarray(3)), decipher.final()]);
  return plain.toString('utf8');
}

module.exports = { deriveChromeKey, encryptChromePassword, decryptChromePassword };
