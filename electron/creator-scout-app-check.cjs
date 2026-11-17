const fs = require("fs");
const path = require("path");

async function until(check, label, timeout = 10000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      if (await check()) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${label}`);
}
async function screenshot(contents) {
  let error;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return (await contents.capturePage()).toPNG();
    } catch (failure) {
      error = failure;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw error;
}

async function run(browser) {
  console.log("scout check: waiting for app");
  await browser.ready;
  const win = await browser.whenWindow();
  console.log("scout check: window ready");
  win.win.setContentSize(1280, 980);
  await until(
    () =>
      win.ui.webContents.executeJavaScript(
        '!!window.righttab && !!document.getElementById("creator-scout-button")',
      ),
    "toolbar button",
  );
  await win.ui.webContents.executeJavaScript(
    "window.righttab.toggleCreatorScout()",
  );
  console.log("scout check: panel opened");
  await until(
    () =>
      win.sidePanelInstallId === "creator-scout" &&
      win.sidePanelView &&
      !win.sidePanelView.webContents.isLoading(),
    "Creator Scout panel",
  );
  const panel = win.sidePanelView;
  console.log("scout check: panel view ready");
  await until(
    () =>
      panel.webContents.executeJavaScript(
        '!!window.scout && document.getElementById("content").textContent.includes("Find creators")',
      ),
    "panel UI",
  );
  const state = browser.snapshot(win);
  console.log("scout check: panel UI ready");
  if (state.sidePanel?.installId !== "creator-scout")
    throw new Error("Toolbar did not report the Creator Scout panel");
  const bounds = panel.getBounds();
  if (bounds.width < 320 || bounds.height < 200)
    throw new Error(`Invalid side-panel bounds: ${JSON.stringify(bounds)}`);
  await panel.webContents.executeJavaScript(`(() => {
    const sample = (letter, name, subscribers, description) => ({ id: 'UC' + letter.repeat(22), platform: 'youtube', source: 'YouTube Data API v3', refreshedAt: new Date().toISOString(), name, handle: '@' + name.toLowerCase().replaceAll(' ', ''), url: 'https://www.youtube.com/channel/UC' + letter.repeat(22), description, subscribers, views: 0, videoCount: 0, image: '', links: [], recentVideos: [] });
    turns = [{ query: 'Find 3D printing creators for KAPO.', records: [sample('a', 'Maya Makes', 412000, 'Printer projects and desk accessories with clean, practical setups.'), sample('b', 'Print Lab Daily', 268000, 'In-depth printer reviews and setup guides for popular models.'), sample('c', 'Tiny Workshop', 187000, 'Hands-on builds and real-world 3D printing tips for makers.')], loading: false }];
    context = { kind: 'video', title: '3D Printing Setup Tour', url: 'https://www.youtube.com/watch?v=vvvvvvvvvvv' };
    render();
  })()`);
  await until(
    () =>
      panel.webContents.executeJavaScript(
        'document.getElementById("content").textContent.includes("Maya Makes")',
      ),
    "sample result layout",
  );
  await new Promise((resolve) => setTimeout(resolve, 200));
  const out = path.join(process.cwd(), "test-results");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(
    path.join(out, "creator-scout-chat-layout.png"),
    await screenshot(panel.webContents),
  );
  await panel.webContents.executeJavaScript(
    "turns = []; context = null; render()",
  );
  const check = await panel.webContents.executeJavaScript(
    'window.scout.invoke("context")',
  );
  console.log("scout check: context checked");
  if (check.kind)
    throw new Error("Default tab was misidentified as a YouTube creator");
  browser.createTab(win, {
    url: "https://www.youtube.com/results?search_query=fortnite",
  });
  await until(async () => {
    const page = await panel.webContents.executeJavaScript(
      'window.scout.invoke("context")',
    );
    return page.kind === "search" && page.query === "fortnite";
  }, "YouTube search context");
  await panel.webContents.executeJavaScript(
    'document.getElementById("ask-input").value = "scout page"; document.getElementById("composer").requestSubmit()',
  );
  await until(
    () => panel.webContents.executeJavaScript(
      'turns.at(-1)?.loading === false && turns.at(-1)?.searchPhrase === "fortnite"',
    ),
    "page-aware search",
  );
  console.log("scout check: page search resolved to fortnite");
  await panel.webContents.executeJavaScript(
    'document.getElementById("attach-button").click()',
  );
  await until(
    () =>
      panel.webContents.executeJavaScript(
        'document.getElementById("page-strip").classList.contains("has-page")',
      ),
    "user-attached tab",
  );
  await panel.webContents.executeJavaScript(
    'document.querySelector("#page-strip [data-action=detach-page]").click()',
  );
  const noKey = await panel.webContents.executeJavaScript(
    'window.scout.invoke("search", { query: "desk accessories", limit: 10 })',
  );
  console.log("scout check: key guard checked");
  if (!/API key/.test(noKey.error || ""))
    throw new Error("Missing-key message was not shown");
  await panel.webContents.executeJavaScript(
    'document.getElementById("ask-input").value = "desk accessories"; document.getElementById("composer").requestSubmit()',
  );
  await until(
    () =>
      panel.webContents.executeJavaScript(
        'document.getElementById("content").textContent.includes("I couldn’t complete that search")',
      ),
    "chat error response",
  );
  await panel.webContents.executeJavaScript(
    'document.getElementById("more-button").click(); document.querySelector("#menu [data-action=go-settings]").click()',
  );
  if (
    !(await panel.webContents.executeJavaScript(
      'document.getElementById("content").textContent.includes("YouTube connection")',
    ))
  )
    throw new Error("Settings panel did not render");
  await panel.webContents.executeJavaScript(`document.getElementById('deepseek-key').value = 'fixture-key'; document.getElementById('deepseek-enabled').checked = true; document.getElementById('deepseek-form').requestSubmit()`);
  await until(() => panel.webContents.executeJavaScript(`state.deepseek?.enabled === true && !JSON.stringify(state.deepseek).includes('fixture-key')`), 'DeepSeek opt-in');
  await panel.webContents.executeJavaScript(`document.getElementById('deepseek-enabled').checked = false; document.getElementById('deepseek-form').requestSubmit()`);
  await until(() => panel.webContents.executeJavaScript(`state.deepseek?.enabled === false`), 'DeepSeek opt-out');
  await panel.webContents.executeJavaScript(
    'document.getElementById("history-button").click(); document.getElementById("more-button").click(); document.querySelector("#menu [data-action=go-saved]").click()',
  );
  if (
    !(await panel.webContents.executeJavaScript(
      'document.getElementById("content").textContent.includes("Saved creators")',
    ))
  )
    throw new Error("Saved research panel did not render");
  await panel.webContents.executeJavaScript(
    'document.getElementById("history-button").click(); document.getElementById("more-button").click(); document.querySelector("#menu [data-action=go-settings]").click()',
  );
  fs.writeFileSync(
    path.join(out, "creator-scout-panel.png"),
    await screenshot(panel.webContents),
  );
  const width = await panel.webContents.executeJavaScript(
    "window.scout.resize(500)",
  );
  console.log("scout check: resize checked");
  if (!width.ok || panel.getBounds().width !== 500)
    throw new Error("Creator Scout resize failed");
  await panel.webContents.executeJavaScript(
    'document.getElementById("history-button").click(); document.getElementById("more-button").click(); document.querySelector("#menu [data-action=close]").click(); true',
  );
  await until(() => !win.sidePanelView, "panel close");
  console.log(
    "OK Creator Scout toolbar, native panel, settings, key guard, resize, and close",
  );
}
module.exports = { run };
