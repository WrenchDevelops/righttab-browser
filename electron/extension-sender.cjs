// Derive the extension principal exclusively from Electron's IPC event, never
// from a value supplied by the renderer. The caller must supply the intended
// session and the set of extension page WebContents owned by this application.
function extensionIdFromUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'chrome-extension:' || !/^[a-p]{32}$/.test(url.hostname)) return '';
    return url.hostname;
  } catch { return ''; }
}

function createExtensionSenderAuthenticator({ session, isEnabled, isExtensionPage }) {
  return function authenticate(event) {
    let id;
    if (event?.type === 'service-worker') {
      const worker = event.serviceWorker;
      if (event.session !== session || !worker || worker.isDestroyed() || event.versionId !== worker.versionId) return null;
      if (session.serviceWorkers.getWorkerFromVersionID(event.versionId) !== worker) return null;
      id = extensionIdFromUrl(worker.scope);
      if (!id || extensionIdFromUrl(worker.scriptURL) !== id || worker.scope !== `chrome-extension://${id}/`) return null;
      const extension = session.extensions.getExtension(id);
      if (!extension || !isEnabled(id)) return null;
      const script = extension.manifest?.background?.service_worker;
      if (typeof script !== 'string') return null;
      const expected = new URL(script, `chrome-extension://${id}/`).href;
      if (worker.scriptURL !== expected) return null;
      return { id, permissions: extension.manifest.permissions || [] };
    }
    const contents = event?.sender;
    const frame = event?.senderFrame;
    if (!contents || contents.isDestroyed() || contents.session !== session || !frame || frame !== contents.mainFrame) return null;
    id = extensionIdFromUrl(frame.url);
    if (!id || extensionIdFromUrl(contents.getURL()) !== id || !isExtensionPage(contents, id)) return null;
    const extension = session.extensions.getExtension(id);
    if (!extension || !isEnabled(id)) return null;
    return { id, permissions: extension.manifest.permissions || [] };
  };
}
module.exports = { createExtensionSenderAuthenticator };
