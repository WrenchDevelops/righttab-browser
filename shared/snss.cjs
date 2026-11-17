const COMMANDS = {
  updateTabNavigation: 6,
  setSelectedNavigationIndex: 7,
  setSelectedTabInIndex: 8,
  tabClosed: 16,
  windowClosed: 17,
  setTabIndexInWindow: 2,
  setTabWindow: 0,
  setActiveWindow: 20,
  setTabGroup: 25,
  setTabGroupMetadata2: 27,
};

function createReader(buffer, start = 0, end = buffer.length) {
  let offset = start;
  const limit = end;
  function need(size) {
    if (offset + size > limit) throw new Error('truncated');
  }
  return {
    remaining: () => limit - offset,
    u8() {
      need(1);
      const value = buffer[offset];
      offset += 1;
      return value;
    },
    u16() {
      need(2);
      const value = buffer.readUInt16LE(offset);
      offset += 2;
      return value;
    },
    u32() {
      need(4);
      const value = buffer.readUInt32LE(offset);
      offset += 4;
      return value;
    },
    u64() {
      need(8);
      const lo = buffer.readUInt32LE(offset);
      const hi = buffer.readUInt32LE(offset + 4);
      offset += 8;
      return (BigInt(hi) << 32n) + BigInt(lo);
    },
    string() {
      const size = this.u32();
      if (size > 1_000_000) throw new Error('string too large');
      let padded = size;
      if (padded % 4) padded += 4 - (padded % 4);
      need(padded);
      const value = buffer.subarray(offset, offset + size).toString('utf8');
      offset += padded;
      return value;
    },
    string16() {
      const size = this.u32();
      if (size > 100_000) throw new Error('title too large');
      let padded = size * 2;
      if (padded % 4) padded += 4 - (padded % 4);
      need(padded);
      let value = '';
      for (let i = 0; i < size; i += 1) value += String.fromCharCode(buffer.readUInt16LE(offset + i * 2));
      offset += padded;
      return value;
    },
  };
}

function groupKey(high, low) {
  return `${high.toString(16)}:${low.toString(16)}`;
}

function isUsefulUrl(url) {
  return /^https?:\/\//i.test(url) && !/^https?:\/\/chromewebdata\//i.test(url);
}

function scanUrls(buffer) {
  const text = buffer.toString('latin1');
  const found = text.match(/https?:\/\/[^\s\x00-\x1f"'<>\\]{4,500}/g) || [];
  const urls = [];
  const seen = new Set();
  for (const raw of found) {
    const url = raw.replace(/[),.;]+$/g, '');
    if (!isUsefulUrl(url) || seen.has(url)) continue;
    if (/^https?:\/\/(chrome|chromewebdata)\b/i.test(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

function parseSnss(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) {
    return { ok: false, method: 'none', windows: [], error: 'Session file is empty or too small.' };
  }
  if (buffer.subarray(0, 4).toString('utf8') !== 'SNSS') {
    return { ok: false, method: 'none', windows: [], error: 'Session file is not in Chrome’s SNSS format.' };
  }

  const tabs = new Map();
  const windows = new Map();
  const groups = new Map();
  const warnings = [];
  let activeWindowId = null;

  function tab(id) {
    if (!tabs.has(id)) tabs.set(id, { id, history: [], index: 0, windowId: 0, deleted: false, current: 0, group: null });
    return tabs.get(id);
  }
  function win(id) {
    if (!windows.has(id)) windows.set(id, { id, activeIndex: 0, deleted: false });
    return windows.get(id);
  }

  const header = createReader(buffer);
  header.u32();
  const version = header.u32();
  if (version !== 1 && version !== 3) warnings.push(`Unfamiliar session version ${version}. Tabs may be incomplete.`);

  while (header.remaining() >= 3) {
    let size;
    let type;
    let payload;
    try {
      size = header.u16();
      type = header.u8();
      const payloadSize = size - 1;
      if (payloadSize < 0 || header.remaining() < payloadSize) break;
      const start = buffer.length - header.remaining();
      payload = buffer.subarray(start, start + payloadSize);
      header.u32 && null;
      for (let i = 0; i < payloadSize; i += 1) header.u8();
    } catch {
      break;
    }

    try {
      const reader = createReader(payload);
      if (type === COMMANDS.updateTabNavigation) {
        reader.u32();
        const id = reader.u32();
        const histIndex = reader.u32();
        const url = reader.string();
        const title = reader.string16();
        const record = tab(id);
        let item = record.history.find((entry) => entry.index === histIndex);
        if (!item) {
          item = { index: histIndex, url: '', title: '' };
          record.history.push(item);
        }
        item.url = url;
        item.title = title;
      } else if (type === COMMANDS.setSelectedNavigationIndex) {
        const id = reader.u32();
        tab(id).current = reader.u32();
      } else if (type === COMMANDS.setSelectedTabInIndex) {
        const id = reader.u32();
        win(id).activeIndex = reader.u32();
      } else if (type === COMMANDS.tabClosed) {
        tab(reader.u32()).deleted = true;
      } else if (type === COMMANDS.windowClosed) {
        win(reader.u32()).deleted = true;
      } else if (type === COMMANDS.setTabIndexInWindow) {
        const id = reader.u32();
        tab(id).index = reader.u32();
      } else if (type === COMMANDS.setTabWindow) {
        const windowId = reader.u32();
        const id = reader.u32();
        tab(id).windowId = windowId;
        win(windowId);
      } else if (type === COMMANDS.setActiveWindow) {
        activeWindowId = reader.u32();
      } else if (type === COMMANDS.setTabGroup) {
        const id = reader.u32();
        reader.u32();
        const high = reader.u64();
        const low = reader.u64();
        tab(id).group = groupKey(high, low);
        if (!groups.has(tab(id).group)) groups.set(tab(id).group, '');
      } else if (type === COMMANDS.setTabGroupMetadata2) {
        reader.u32();
        const high = reader.u64();
        const low = reader.u64();
        const name = reader.string16();
        groups.set(groupKey(high, low), name);
      }
    } catch (error) {
      warnings.push(error.message);
    }
  }

  const built = [];
  for (const record of windows.values()) {
    const members = [...tabs.values()].filter((item) => item.windowId === record.id && !item.deleted);
    members.sort((a, b) => a.index - b.index);
    const outTabs = [];
    for (const item of members) {
      const history = item.history.slice().sort((a, b) => a.index - b.index);
      const current = history.find((entry) => entry.index === item.current) || history[history.length - 1];
      if (!current || !isUsefulUrl(current.url)) continue;
      outTabs.push({
        url: current.url,
        title: current.title || current.url,
        group: item.group ? (groups.get(item.group) || 'Group') : '',
      });
    }
    if (outTabs.length) {
      built.push({ deleted: record.deleted, active: record.id === activeWindowId, tabs: outTabs });
    }
  }

  const openWindows = built.filter((item) => !item.deleted);
  const chosen = openWindows.length ? openWindows : built;
  if (chosen.some((item) => item.tabs.length)) {
    return { ok: true, method: 'snss', windows: chosen, warnings };
  }

  const scanned = scanUrls(buffer).map((url) => ({ url, title: url, group: '' }));
  if (scanned.length) {
    return {
      ok: true,
      method: 'url-scan',
      windows: [{ tabs: scanned, deleted: false, active: true }],
      warnings: warnings.concat('Structured session data could not be read. URLs were recovered with a best-effort scan and may be out of order.'),
    };
  }
  return { ok: false, method: 'none', windows: [], warnings, error: 'No open web pages were found in the session file.' };
}

function writeString(value) {
  const body = Buffer.from(value, 'utf8');
  const size = Buffer.alloc(4);
  size.writeUInt32LE(body.length, 0);
  const pad = (4 - (body.length % 4)) % 4;
  return Buffer.concat([size, body, Buffer.alloc(pad)]);
}

function writeString16(value) {
  const body = Buffer.alloc(value.length * 2);
  for (let i = 0; i < value.length; i += 1) body.writeUInt16LE(value.charCodeAt(i), i * 2);
  const size = Buffer.alloc(4);
  size.writeUInt32LE(value.length, 0);
  const pad = (4 - (body.length % 4)) % 4;
  return Buffer.concat([size, body, Buffer.alloc(pad)]);
}

function command(type, payload) {
  const header = Buffer.alloc(3);
  header.writeUInt16LE(payload.length + 1, 0);
  header.writeUInt8(type, 2);
  return Buffer.concat([header, payload]);
}

function buildSampleSession({ url, title, tabId = 1, windowId = 1 }) {
  const pickleBody = Buffer.concat([
    uint32(tabId),
    uint32(0),
    writeString(url),
    writeString16(title),
  ]);
  const navigation = Buffer.concat([uint32(pickleBody.length), pickleBody]);
  const magic = Buffer.from('SNSS');
  const version = uint32(1);
  return Buffer.concat([
    magic,
    version,
    command(COMMANDS.setTabWindow, Buffer.concat([uint32(windowId), uint32(tabId)])),
    command(COMMANDS.updateTabNavigation, navigation),
    command(COMMANDS.setSelectedNavigationIndex, Buffer.concat([uint32(tabId), uint32(0)])),
  ]);
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0, 0);
  return buffer;
}

module.exports = { parseSnss, buildSampleSession, scanUrls, COMMANDS };
