// Test-only inspector; starts before the actual browser restores extensions.
const fs = require('fs');
const path = require('path');
async function inspectWorkers(profile) {
  const file = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !fs.existsSync(file); i++) await new Promise((r) => setTimeout(r, 50));
  const [port, endpoint] = fs.readFileSync(file, 'utf8').trim().split('\n');
  const ws = new WebSocket(`ws://127.0.0.1:${port}${endpoint}`);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let seq = 0, first = null, workerSession = null;
  const pending = new Map();
  function command(method, params, sessionId) {
    const id = ++seq;
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  }
  ws.onmessage = async (event) => {
    const m = JSON.parse(event.data);
    if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } return; }
    if (m.method === 'Target.attachedToTarget') {
      const sid = m.params.sessionId;
      if (m.params.targetInfo.type === 'service_worker') {
        if (m.params.targetInfo.url.startsWith('chrome-extension://hehggadaopoacecdllhhajmbjkdcmajg/')) workerSession = sid;
        await command('Debugger.enable', {}, sid);
        await command('Debugger.setPauseOnExceptions', { state: 'all' }, sid);
      }
      await command('Runtime.runIfWaitingForDebugger', {}, sid);
    }
    if (m.method === 'Debugger.paused') {
      if (!first) first = String(m.params.data?.description || '').split('\n').slice(0, 7).join('\n');
      await command('Debugger.resume', {}, m.sessionId);
    }
  };
  await command('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
  return { first: () => first, async evaluate(expression) {
    if (!workerSession) throw new Error('ChatGPT worker target was not observed.');
    const reply = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, workerSession);
    if (reply.exceptionDetails) throw new Error(reply.exceptionDetails.exception?.description || reply.exceptionDetails.text);
    return reply.result.value;
  }, async workerState() {
    if (!workerSession) throw new Error('ChatGPT worker target was not observed.');
    const reply = await command('Runtime.evaluate', { expression: "JSON.stringify({ windows: typeof chrome.windows, onFocusChanged: typeof chrome.windows?.onFocusChanged?.addListener, hasListener: chrome.windows?.onFocusChanged?.hasListeners(), debuggerEvent: chrome.debugger?.onEvent?.hasListeners(), debuggerDetach: chrome.debugger?.onDetach?.hasListeners() })", returnByValue: true }, workerSession);
    return reply.result.value;
  }, close: () => ws.close() };
}
module.exports = { inspectWorkers };
