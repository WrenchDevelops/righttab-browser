// A streaming document can be ready while analytics/resources keep its full
// load pending. Diagnose the committed document instead of waiting forever for
// every subresource. TLS/navigation failures still fail closed.
function navigateMediaDocument(contents, url, { timeoutMs = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    const finish = (error) => {
      clearTimeout(timer);
      contents.removeListener('dom-ready', ready);
      contents.removeListener('did-fail-load', fail);
      if (error) reject(error); else resolve();
    };
    const ready = () => finish();
    const fail = (_event, code, _description, _url, mainFrame) => {
      if (mainFrame && code !== -3) finish(new Error(`Streaming document navigation failed (${code}).`));
    };
    const timer = setTimeout(() => finish(new Error('Streaming document did not become ready within the diagnostic deadline.')), timeoutMs);
    contents.once('dom-ready', ready);
    contents.on('did-fail-load', fail);
    try { Promise.resolve(contents.loadURL(url)).catch(() => {}); }
    catch (error) { finish(error); }
  });
}

module.exports = { navigateMediaDocument };
