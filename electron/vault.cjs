const fs = require('fs');
const { hostOf, isWebUrl } = require('../shared/url.cjs');
const { writeJsonAtomic } = require('./atomic-json.cjs');

function openVault(file, safeStorage) {
  let entries = [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Array.isArray(parsed.entries)) entries = parsed.entries;
  } catch {
    entries = [];
  }

  function persist() {
    if (!writeJsonAtomic(file, { entries })) {
      throw new Error('Could not save the password vault. Free some disk space and try again.');
    }
  }

  function publicEntry(entry) {
    return {
      id: entry.id,
      origin: entry.origin,
      username: entry.username,
      createdAt: entry.createdAt,
      source: entry.source || 'righttab',
      updatedAt: entry.updatedAt || entry.createdAt,
    };
  }

  async function encrypt(password) {
    // On macOS Electron safeStorage is backed by the user's login Keychain.
    // This metadata file only contains Keychain-protected ciphertext.
    if (!(await safeStorage.isAsyncEncryptionAvailable())) {
      throw new Error('Secure password storage is unavailable on this computer.');
    }
    const encrypted = await safeStorage.encryptStringAsync(String(password));
    return Buffer.from(encrypted).toString('base64');
  }

  return {
    list() {
      return entries.filter((entry) => !entry.never).map(publicEntry);
    },
    forHost(host) {
      if (!host) return [];
      return entries.filter((entry) => !entry.never && hostOf(entry.origin) === host).map(publicEntry);
    },
    isNeverSaved(origin) {
      const normalized = normalizeOrigin(origin);
      return !!normalized && entries.some((entry) => entry.never && entry.origin === normalized);
    },
    neverSave(origin) {
      const normalized = normalizeOrigin(origin);
      if (!normalized || entries.some((entry) => entry.never && entry.origin === normalized)) return;
      entries.push({ id: globalThis.crypto.randomUUID(), origin: normalized, username: '', never: true, createdAt: Date.now() });
      persist();
    },
    async reveal(id) {
      const entry = entries.find((item) => item.id === id);
      if (!entry || entry.never) return '';
      if (!(await safeStorage.isAsyncEncryptionAvailable())) {
        throw new Error('Secure password storage is unavailable on this computer.');
      }
      const decrypted = await safeStorage.decryptStringAsync(Buffer.from(entry.secret, 'base64'));
      if (decrypted.shouldReEncrypt) {
        entry.secret = await encrypt(decrypted.result);
        persist();
      }
      return decrypted.result;
    },
    async add({ origin, username, password, source }) {
      const normalized = normalizeOrigin(origin);
      if (!normalized || !password) throw new Error('A website and password are required.');
      const user = String(username || '');
      const existing = entries.find((entry) => !entry.never && entry.origin === normalized && entry.username === user);
      if (existing && source === 'update') {
        existing.secret = await encrypt(password);
        existing.updatedAt = Date.now();
        persist();
        return { updated: true };
      }
      if (existing) {
        return { duplicate: true };
      }
      entries.push({
        id: globalThis.crypto.randomUUID(),
        origin: normalized,
        username: user,
        secret: await encrypt(password),
        createdAt: Date.now(),
        source: source || 'righttab',
      });
      persist();
      return { duplicate: false };
    },
    remove(id) {
      entries = entries.filter((entry) => entry.id !== id);
      persist();
    },
  };
}

function normalizeOrigin(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (isWebUrl(text)) return new URL(text).origin;
  if (/^[\w.-]+\.[a-z]{2,}$/i.test(text)) return `https://${text}`;
  return '';
}

module.exports = { openVault, normalizeOrigin };
