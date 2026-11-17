// Main-process debugger transport. Callers must supply authenticated principals.
const ALLOWED_DOMAINS = new Set(['Accessibility', 'Audits', 'CacheStorage', 'Console', 'CSS', 'Database', 'Debugger', 'DOM', 'DOMDebugger', 'DOMSnapshot', 'Emulation', 'Fetch', 'IO', 'Input', 'Inspector', 'Log', 'Network', 'Overlay', 'Page', 'Performance', 'Runtime', 'Storage', 'Tracing', 'WebAudio', 'WebAuthn']);

function safeUrl(url) {
  try { const u = new URL(url); return ['http:', 'https:'].includes(u.protocol) && u.hostname !== 'chromewebstore.google.com' && !(u.hostname === 'chrome.google.com' && u.pathname.startsWith('/webstore')); } catch { return false; }
}

// Fail closed on any subframe until its protocol target can be authorized.
function safeContents(wc) {
  if (!safeUrl(wc.getURL())) return false;
  const frames = wc.mainFrame?.framesInSubtree;
  // A missing frame tree is not evidence that this is a top-level page. Do
  // not attach until Electron has exposed exactly one authorized frame.
  return Array.isArray(frames) && frames.length === 1 && safeUrl(frames[0].url);
}

// getTargets returns only registered, non-private RightTab tabs. authenticate
// must derive the principal from the Electron IPC sender, never its arguments.
function createExtensionDebugger({ authenticate, getTargets, emit, changed }) {
  const attached = new Map();
  const notifyChanged = changed || (() => {});
  function principal(caller) {
    const p = authenticate(caller);
    if (!p || !p.id || !p.permissions?.includes('debugger')) throw new Error('Debugger permission is required.');
    return p;
  }
  function targetFor(id) {
    if (!Number.isInteger(id)) throw new Error('A tabId is required.');
    const target = getTargets().find((t) => t.id === id && !t.private && !t.contents.isDestroyed());
    if (!target || !safeContents(target.contents)) throw new Error(`Cannot access tab ${id}.`);
    return target;
  }
  function targetId(debuggee) {
    if (!debuggee || debuggee.extensionId || (debuggee.tabId !== undefined && debuggee.targetId !== undefined)) throw new Error('Only registered tab targets are supported.');
    if (Number.isInteger(debuggee.tabId)) return debuggee.tabId;
    if (typeof debuggee.targetId === 'string' && /^[1-9]\d*$/.test(debuggee.targetId)) {
      const id = Number(debuggee.targetId);
      if (Number.isSafeInteger(id) && String(id) === debuggee.targetId) return id;
    }
    throw new Error('Only registered tab targets are supported.');
  }
  function recordFor(p, debuggee) {
    const id = targetId(debuggee);
    const record = attached.get(id);
    if (!record || record.owner !== p.id) throw new Error(`Debugger is not attached to tab ${id}.`);
    return record;
  }
  function cleanup(record, reason, sendEvent) {
    if (attached.get(record.target.id) !== record) return;
    attached.delete(record.target.id);
    const wc = record.target.contents;
    wc.debugger.removeListener('message', record.message);
    wc.debugger.removeListener('detach', record.detached);
    wc.removeListener('did-start-navigation', record.navigation);
    wc.removeListener('frame-created', record.frameCreated);
    wc.removeListener('destroyed', record.destroyed);
    if (sendEvent) emit(record.owner, 'onDetach', record.source, reason);
    notifyChanged();
  }
  function disconnect(record, reason, sendEvent) {
    const wc = record.target.contents;
    cleanup(record, reason, sendEvent);
    if (!wc.isDestroyed() && wc.debugger.isAttached()) wc.debugger.detach();
  }
  return {
    attach(caller, debuggee, version) {
      const p = principal(caller);
      const target = targetFor(targetId(debuggee));
      if (attached.has(target.id) || target.contents.debugger.isAttached()) throw new Error('Another debugger is already attached.');
      const wc = target.contents;
      wc.debugger.attach(version);
      const record = { owner: p.id, target, source: debuggee.targetId !== undefined ? { targetId: debuggee.targetId } : { tabId: target.id } };
      record.message = (_event, method, params, sessionId) => emit(p.id, 'onEvent', { ...record.source, ...(sessionId ? { sessionId } : {}) }, method, params);
      record.detached = (_event, reason) => cleanup(record, reason === 'target_closed' ? 'target_closed' : 'canceled_by_user', true);
      record.navigation = () => disconnect(record, 'canceled_by_user', true);
      record.frameCreated = () => disconnect(record, 'canceled_by_user', true);
      record.destroyed = () => cleanup(record, 'target_closed', true);
      attached.set(target.id, record);
      wc.debugger.on('message', record.message);
      wc.debugger.on('detach', record.detached);
      wc.on('did-start-navigation', record.navigation);
      wc.on('frame-created', record.frameCreated);
      wc.on('destroyed', record.destroyed);
      notifyChanged();
    },
    detach(caller, debuggee) { const p = principal(caller); disconnect(recordFor(p, debuggee), null, false); },
    sendCommand(caller, debuggee, method, params) {
      const p = principal(caller);
      const record = recordFor(p, debuggee);
      if (!safeContents(record.target.contents)) throw new Error('The target is restricted.');
      // Target commands can attach unrelated targets. Until child-session target
      // authorization is implemented, reject them rather than permit escape.
      if (typeof method !== 'string' || !ALLOWED_DOMAINS.has(method.split('.')[0])) throw new Error('This debugging protocol domain is not available.');
      if (debuggee.sessionId) throw new Error('Child debugging sessions are not supported.');
      return record.target.contents.debugger.sendCommand(method, params);
    },
    getTargets(caller) {
      principal(caller);
      return getTargets().filter((t) => !t.private && !t.contents.isDestroyed() && safeContents(t.contents)).map((t) => ({ id: String(t.id), tabId: t.id, type: 'page', title: t.contents.getTitle(), url: t.contents.getURL(), attached: t.contents.debugger.isAttached() }));
    },
    list() { return [...attached.values()].map((r) => ({ tabId: r.target.id, extensionId: r.owner })); },
    disconnectByUser(tabId) { const record = attached.get(tabId); if (record) disconnect(record, 'canceled_by_user', true); },
    targetClosed(tabId) { const record = attached.get(tabId); if (record) disconnect(record, 'target_closed', true); },
    unload(extensionId) { for (const record of [...attached.values()]) if (record.owner === extensionId) disconnect(record, null, false); },
    dispose() { for (const record of [...attached.values()]) disconnect(record, null, false); },
  };
}
module.exports = { createExtensionDebugger };
