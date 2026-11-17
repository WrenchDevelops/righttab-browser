// Main-process only. This deliberately exposes no arbitrary JavaScript or CDP endpoint.
function createAutomationController({ getTab, approveAction = async () => false }) {
  const tails = new Map();
  const tasks = new Map();

  async function enqueue(taskId, tabId, work) {
    if (typeof taskId !== 'string' || !taskId || tasks.has(taskId)) throw new Error('A unique task ID is required.');
    if (typeof tabId !== 'string' || !tabId) throw new Error('A tab ID is required.');
    const task = { cancelled: false };
    tasks.set(taskId, task);
    const previous = tails.get(tabId) || Promise.resolve();
    const run = previous.catch(() => {}).then(async () => {
      if (task.cancelled) throw new Error('Task cancelled.');
      const tab = getTab(tabId);
      const contents = tab?.view?.webContents;
      if (!contents || contents.isDestroyed()) throw new Error('Tab is no longer available.');
      const url = contents.getURL();
      let parsed;
      try { parsed = new URL(url); } catch { throw new Error('Only web pages can be inspected.'); }
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only web pages can be inspected.');
      return work({ task, contents, url });
    });
    tails.set(tabId, run);
    try { return await run; } finally {
      tasks.delete(taskId);
      if (tails.get(tabId) === run) tails.delete(tabId);
    }
  }

  async function inspect({ taskId, tabId, authorize }) {
    if (authorize !== true) throw new Error('Explicit permission to inspect this tab is required.');
    return enqueue(taskId, tabId, async ({ task, contents, url }) => {
      // Visible text only, omitting editable fields and obvious sensitive regions.
      // This is a minimization measure, not a guarantee that page text has no secrets.
      const result = await contents.executeJavaScript(`(() => {
        const root = document.body;
        if (!root) return { text: '', headings: [] };
        const visible = e => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
        const excluded = 'input,textarea,select,option,script,style,noscript,[contenteditable],form,[hidden],[aria-hidden="true"]';
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const pieces = []; let length = 0; let node;
        while ((node = walker.nextNode()) && length < 12000) {
          const parent = node.parentElement;
          if (!parent || parent.closest(excluded) || !visible(parent)) continue;
          const text = node.nodeValue.replace(/\\s+/g, ' ').trim();
          if (text) { pieces.push(text); length += text.length + 1; }
        }
        const headings = Array.from(document.querySelectorAll('h1,h2,h3')).filter(e => !e.closest(excluded) && visible(e)).slice(0, 30).map(e => e.innerText.trim().slice(0, 300));
        return { text: pieces.join(' ').slice(0, 12000), headings };
      })()`);
      if (task.cancelled) throw new Error('Task cancelled.');
      if (contents.isDestroyed() || contents.getURL() !== url) throw new Error('Page changed during inspection; retry.');
      return { tabId, url, title: contents.getTitle(), ...result };
    });
  }

  async function click({ taskId, tabId, label }) {
    if (typeof label !== 'string' || !label.trim() || label.length > 120) throw new Error('A button label is required.');
    return enqueue(taskId, tabId, async ({ task, contents, url }) => {
      let navigated = false;
      const onNavigation = (_event, _url, _inPlace, isMainFrame) => { if (isMainFrame) navigated = true; };
      contents.on('did-start-navigation', onNavigation);
      try {
        // Only exact, unique, visible button names are supported. Never execute
        // selectors or code supplied by an agent or a page.
        const source = (perform) => `(() => {
          const label = ${JSON.stringify(label.trim())};
          const matches = Array.from(document.querySelectorAll('button, input[type=button]')).filter(e => {
            const r = e.getBoundingClientRect(), s = getComputedStyle(e);
            const name = (e.getAttribute('aria-label') || (e.tagName === 'INPUT' ? e.value : e.innerText) || '').trim();
            return name === label && !e.disabled && r.width > 0 && r.height > 0 && s.visibility === 'visible' && s.display !== 'none';
          });
          if (matches.length !== 1) return { error: 'Button is missing or ambiguous.' };
          const e = matches[0];
          const fingerprint = JSON.stringify([e.tagName, e.getAttribute('type'), e.getAttribute('aria-label'), e.innerText, e.getAttribute('name')]);
          if (${perform ? 'true' : 'false'}) {
            if (fingerprint !== ${JSON.stringify(perform || '')}) return { error: 'Button changed; retry.' };
            e.click();
          }
          return { fingerprint };
        })()`;
        const candidate = await contents.executeJavaScript(source(false));
        if (candidate.error) throw new Error(candidate.error);
        const fingerprint = candidate.fingerprint;
        if (task.cancelled || navigated || contents.isDestroyed() || contents.getURL() !== url) throw new Error('Page changed or task cancelled.');
        const approved = await approveAction({ tabId, url, action: 'click', label: label.trim() });
        if (!approved) throw new Error('Action was not approved.');
        if (task.cancelled || navigated || contents.isDestroyed() || contents.getURL() !== url) throw new Error('Page changed or task cancelled.');
        const result = await contents.executeJavaScript(source(fingerprint));
        if (result.error) throw new Error(result.error);
        return { tabId, action: 'click', label: label.trim(), dispatched: true };
      } finally { if (!contents.isDestroyed()) contents.removeListener('did-start-navigation', onNavigation); }
    });
  }
  return { inspect, click, cancelTask: (taskId) => { const task = tasks.get(taskId); if (!task) return false; task.cancelled = true; return true; } };
}
module.exports = { createAutomationController };
