const assert = require('node:assert/strict');
const http = require('node:http');
const { app, dialog } = require('electron');

async function run(browser) {
  const server = http.createServer((_req, res) => res.end(`<!doctype html><title>Fixture</title><h1>Existing tab</h1><p>Public content</p><button onclick="document.title='Clicked'">Do it</button><form><input value="secret-value"><p>private form text</p></form>`));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await browser.ready;
    const win = await browser.whenWindow();
    const tab = browser.createTab(win, { url: `http://127.0.0.1:${server.address().port}/` });
    browser.showPages(win);
    const wc = tab.view.webContents;
    if (wc.isLoading()) await new Promise((resolve, reject) => { wc.once('did-finish-load', resolve); wc.once('did-fail-load', (_e, code) => reject(new Error(`load failed ${code}`))); });
    await new Promise((resolve) => setTimeout(resolve, 500));
    const controller = browser.automationFor(win);
    assert.equal(controller, browser.automationFor(win));
    await assert.rejects(controller.inspect({ taskId: 'denied', tabId: tab.id }), /permission/);
    const state = await controller.inspect({ taskId: 'read', tabId: tab.id, authorize: true });
    assert.equal(state.tabId, tab.id);
    assert.equal(state.title, 'Fixture');
    assert.deepEqual(state.headings, ['Existing tab']);
    assert.match(state.text, /Public content/);
    assert.doesNotMatch(state.text, /secret-value|private form text/);
    browser.showPages(win);
    const opened = browser.openAssistant(win);
    assert.equal(opened.ok, true, JSON.stringify(opened));
    const panel = win.sidePanelView.webContents;
    if (panel.isLoading()) await new Promise((resolve) => panel.once('did-finish-load', resolve));
    const originalDialog = dialog.showMessageBox;
    try {
      dialog.showMessageBox = async () => ({ response: 0 });
      await assert.rejects(panel.executeJavaScript(`window.assistantPreview.click('Do it')`), /not approved/);
      assert.equal(wc.getTitle(), 'Fixture');
      dialog.showMessageBox = async () => ({ response: 1 });
      const clicked = await panel.executeJavaScript(`window.assistantPreview.click('Do it')`);
      assert.equal(clicked.dispatched, true);
      assert.equal(wc.getTitle(), 'Clicked');
      await assert.rejects(panel.executeJavaScript(`window.assistantPreview.click('Missing')`), /missing or ambiguous/);
    } finally { dialog.showMessageBox = originalDialog; }
    console.log('PASS assistant IPC, rejected and approved click on the existing tab, missing target');
    console.log('PASS native inspection of an existing RightTab WebContentsView; permission and form exclusion');
    await new Promise((resolve) => server.close(resolve));
    app.exit(0);
  } catch (error) {
    console.error(error);
    server.close();
    app.exit(1);
  }
}
module.exports = { run };
