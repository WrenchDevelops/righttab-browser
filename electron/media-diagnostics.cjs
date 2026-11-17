const { probeContents } = require('./media-probe.cjs');

// Keep report data deliberately narrow: no console text, URL paths/queries,
// request/response bodies, headers, cookies, license payloads, or key IDs.
function originOf(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.origin : url.protocol; }
  catch { return 'unknown'; }
}

function classify(message) {
  const text = String(message || '');
  return ['NotSupportedError', 'NotAllowedError', 'SecurityError', 'QuotaExceededError',
    'widevine', 'license', 'key system', 'decrypt', 'codec', 'CSP', 'Content Security Policy',
    'MEDIA_ERR', 'PIPELINE_ERROR', 'ERR_BLOCKED_BY', 'ERR_CERT', 'ERR_CONNECTION', 'CORS']
    .filter((word) => text.toLowerCase().includes(word.toLowerCase()));
}

async function startMediaDiagnostics(contents, mediaRuntime = {}) {
  if (contents.debugger.isAttached()) throw new Error('Close Developer Tools or disconnect the controlling extension before starting playback diagnostics.');
  const events = [];
  const requests = new Map();
  let attached = false;
  let stopped = false;
  const record = (event) => {
    if (events.length < 500) events.push({ at: new Date().toISOString(), ...event });
  };
  const onConsole = (event) => {
    const categories = classify(event.message);
    if (categories.length) record({ kind: 'console', level: event.level, categories });
  };
  const onFail = (_event, code, _description, url, isMainFrame) => record({ kind: 'navigation-failed', code, origin: originOf(url), isMainFrame });
  const onCdp = (_event, method, params) => {
    if (method === 'Network.requestWillBeSent') {
      if (requests.size >= 1000) requests.delete(requests.keys().next().value);
      let category = 'other';
      try {
        const pathname = new URL(params.request.url).pathname;
        if (/license|widevine/i.test(pathname)) category = 'license';
        else if (/manifest|\.(mpd|m3u8|m4s|mp4|webm)$/i.test(pathname)) category = 'media';
      } catch {}
      requests.set(params.requestId, { origin: originOf(params.request.url), category });
    } else if (method === 'Network.responseReceived' && (params.response.status >= 400 || requests.get(params.requestId)?.category === 'license')) {
      record({ kind: params.response.status >= 400 ? 'http-error' : 'license-response', status: params.response.status, origin: originOf(params.response.url), category: requests.get(params.requestId)?.category, type: params.type });
    } else if (method === 'Network.loadingFailed') {
      // errorText is a Chromium network error constant, not the server's body.
      record({ kind: 'network-failed', ...requests.get(params.requestId), type: params.type, error: /^net::ERR_[A-Z_]+$/.test(params.errorText) ? params.errorText : 'network error', blockedReason: params.blockedReason });
      requests.delete(params.requestId);
    } else if (method === 'Network.loadingFinished') {
      requests.delete(params.requestId);
    } else if (method === 'Media.playerErrorsRaised') {
      for (const error of params.errors || []) record({ kind: 'player-error', errorType: error.errorType, code: error.code });
    } else if (method === 'Media.playerMessagesLogged') {
      for (const entry of params.messages || []) record({ kind: 'player-message', level: entry.level, categories: classify(entry.message) });
    } else if (method === 'Media.playerEventsAdded') {
      for (const entry of params.events || []) {
        try {
          const value = JSON.parse(entry.value);
          if (typeof value.event === 'string' && /^k[A-Za-z]+$/.test(value.event)) record({ kind: 'player-event', event: value.event });
        } catch { /* no raw player data in reports */ }
      }
    }
  };
  const onDetach = () => { attached = false; record({ kind: 'debugger-detached' }); };
  const onPlaying = () => record({ kind: 'media-started-playing' });
  const onPaused = () => record({ kind: 'media-paused' });
  const onFullscreen = () => record({ kind: 'entered-fullscreen' });
  const onDestroyed = () => stop();
  let timer;
  function stop() {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    contents.removeListener('console-message', onConsole);
    contents.removeListener('did-fail-load', onFail);
    contents.removeListener('media-started-playing', onPlaying);
    contents.removeListener('media-paused', onPaused);
    contents.removeListener('enter-html-full-screen', onFullscreen);
    contents.removeListener('destroyed', onDestroyed);
    contents.debugger.removeListener('message', onCdp);
    contents.debugger.removeListener('detach', onDetach);
    if (attached && !contents.isDestroyed()) { try { contents.debugger.detach(); } catch {} }
    attached = false;
  }
  try {
    contents.debugger.attach('1.3');
    attached = true;
    contents.debugger.on('message', onCdp);
    contents.debugger.on('detach', onDetach);
    contents.on('console-message', onConsole);
    contents.on('did-fail-load', onFail);
    contents.on('media-started-playing', onPlaying);
    contents.on('media-paused', onPaused);
    contents.on('enter-html-full-screen', onFullscreen);
    contents.once('destroyed', onDestroyed);
    await contents.debugger.sendCommand('Network.enable');
    await contents.debugger.sendCommand('Media.enable');
    const report = {
      startedAt: new Date().toISOString(), versions: { electron: process.versions.electron, chrome: process.versions.chrome },
      mediaRuntime, initial: await probeContents(contents), events,
      notice: 'Capability detection is not proof of licensed playback. No license data or keys are recorded.',
    };
    timer = setTimeout(stop, 5 * 60 * 1000);
    timer.unref?.();
    return {
      contents,
      stop,
      async finish() {
        try { report.final = contents.isDestroyed() ? [{ error: 'TabClosed' }] : await probeContents(contents); }
        finally { stop(); }
        report.finishedAt = new Date().toISOString();
        return report;
      },
    };
  } catch (error) { stop(); throw error; }
}

function protectedMediaAllowed(url, saved) {
  if (saved === 'deny') return false;
  try {
    const origin = new URL(url);
    return origin.protocol === 'https:' || (origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname));
  } catch { return false; }
}

module.exports = { startMediaDiagnostics, protectedMediaAllowed, originOf, classify };
