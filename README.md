# RightTab

RightTab is a desktop browser with tabs in a sidebar on the right. You can collapse that sidebar to favicons, drag its edge to resize it, and drag tabs to reorder them. The Windows port is in development and has not yet been verified on Windows.

New tabs open the RightTab start page. Settings can launch with that page, ChatGPT, or Google, and the new-tab page can be chosen separately. Those choices are saved on this Mac. The address bar is separate: a web address opens that site, and other text searches Google unless you pick Bing, DuckDuckGo, Brave Search, or a custom engine.

## Run on Windows

After cloning or extracting the repository, double-click `start-windows.cmd`, or run this from the repository folder in Command Prompt or PowerShell:

```powershell
.\start-windows.cmd
```

No separate Node.js, npm, Python, or Electron installation is needed. On the first run, the launcher downloads a pinned Node.js runtime, verifies its checksum, and installs the project's locked dependencies into this checkout. This requires internet access and may take several minutes. Later runs reuse those files; a changed lockfile triggers dependency setup again. The launcher requires 64-bit Windows and its built-in PowerShell. The port and launcher have not yet been tested on a Windows machine. See [Windows compatibility](docs/windows-compatibility.md) for the current limitations.

## Run on macOS

```bash
cd ~/Projects/righttab
npm install
npm start
```

Quit with Cmd+Q. On a Mac, closing the last window leaves RightTab running; click the Dock icon to open a window again.

## Protected streaming

The default Electron 45.2.3 runtime does not provide working Widevine playback. An optional Castlabs runtime (`npm run setup:drm`, then `npm run start:drm`) supports native Widevine and has played an authorized protected test video inside RightTab. It is a development build behind the default runtime's security updates. **Disney+ title playback still fails with a license HTTP 400**; successful playback is not claimed. See [streaming findings, diagnostics, and production signing](docs/streaming.md).

**Help → Start Playback Diagnostics** and **Help → Save Playback Diagnostics** capture capability results and error categories without license payloads, keys, or credentials. `npm run diagnose:media` runs an isolated capability check; `npm run diagnose:media:drm -- --vmp` checks the public protected-video sample with Castlabs.

## Test

```bash
npm test
npm run smoke
```

`npm test` checks address-bar behavior, bookmark import, Chrome session parsing, password decryption, extension manifests, and crash recovery decisions without reading your Chrome profile.

`node scripts/check-extensions.cjs` loads a local probe extension inside Electron and checks content scripts, the popup, storage across a restart, and that private windows stay isolated.

`npm run smoke` launches the app against a temporary profile, opens example.com, checks split resizing, swapping, focus, and restoration, downloads a page, and imports a fake Chrome profile. It does not read your real Chrome passwords or keychain.

## Build a Mac app

Packaging is optional. `npm start` is the normal way to run RightTab.

```bash
npm install --save-dev electron-builder
npx electron-builder --mac dir
```

The unpacked app is `dist/mac-arm64/RightTab.app` or `dist/mac/RightTab.app`. It is not signed or notarized. Your data stays in `~/Library/Application Support/RightTab`.

## Architecture

RightTab uses Electron 45 and Chromium. The toolbar and sidebar are one sandboxed page. Each website is a separate `WebContentsView` with no Node.js access and no privileged preload. Pages cannot call the tab, bookmark, or import APIs. Website logins are stored in RightTab’s own persistent session (`persist:righttab`), so signing in once is remembered the next time you open the app. Private windows use an in-memory session that is discarded when the window closes.

Passwords you import or save are encrypted with Electron `safeStorage`, which uses the macOS Keychain. The password list does not keep them in plaintext.

## Import from Chrome

Open it from the first-launch screen or from Settings → Import from Chrome. Pick a Chrome profile, preview the counts, then import. RightTab copies files into a temporary folder and reads those copies. It does not write to `~/Library/Application Support/Google/Chrome`.

| Data | What RightTab does |
| --- | --- |
| Bookmarks and folders | Supported. Script and internal Chrome addresses are skipped. |
| History | Supported, up to 5,000 sites, from a copy of the History database. |
| Saved passwords | Supported on macOS when you approve the Keychain prompt for “Chrome Safe Storage.” They are re-encrypted for RightTab. If you deny the prompt, export a CSV from Chrome’s password manager and import that from Passwords. |
| Preferences | Partial. Bookmark bar, legacy appearance preference, restore-session, Do Not Track, HTTPS-only, a download folder inside your home, and Google, DuckDuckGo, or Bing search. Unknown search engines are refused. |
| Open tabs | Best effort from Chrome’s session file. Private Chrome windows are not included. Order and pinned state can be imperfect. At most 50 tabs are opened. |
| Extensions | Optional. A copied unpacked folder can be loaded into RightTab. The Chrome Web Store and `.crx` packages cannot be installed. Electron supports only some extension APIs, so a loaded extension can still fail at runtime. |
| Cookies and signed-in sessions | Not imported. Sign in again. RightTab then keeps its own session. |
| Google Sync | Not imported. RightTab cannot download sync data. |
| Payment methods and addresses | Not imported. |

Import never changes the ChatGPT / Google startup choice.

## Extensions

RightTab is Electron 45.2.3 (Chromium 156.0.8078.80). Electron can load an unpacked extension into the persistent session, and it does not install Chrome Web Store packages or `.crx` files. The puzzle-piece button and Settings → Extensions load a folder that contains `manifest.json`, show the permissions before the copy is kept, and remember the extension across restarts. Pinned icons sit beside the address bar. Other extensions stay in the puzzle menu. Private windows do not load extensions.

Electron’s documented extension surface is smaller than Chrome’s. RightTab draws toolbar icons and opens an extension’s popup, options page, or declared side-panel page in a sandboxed view with no Node.js and no access to RightTab’s desktop APIs. `chrome.action`, `chrome.sidePanel`, `chrome.contextMenus`, `chrome.commands`, `chrome.identity`, and native messaging are not available as Chrome implements them. Content scripts, extension service workers, `chrome.storage.local`, and runtime messaging are the parts Electron documents and RightTab exercises. A Chrome Web Store URL cannot be installed from this app.

## Split view

Right-click another tab and choose **Open beside current tab**, or use the browser menu’s **Split ChatGPT to the side**. Drag the divider to resize the pages, or focus it and use the arrow keys. Double-click the divider (or press Home) to return to equal widths.

The split toolbar lets you focus either page, swap sides, or close the split while keeping both tabs. Navigation, find, bookmarks, passwords, and zoom act on the focused page. Zoom is shared by pages from the same site, following Chromium’s behavior. Closing either visible tab expands the surviving page. Splits and their widths are restored with saved sessions and crash recovery.

## Themes

Open **Settings → Appearance → Themes**, or use **Appearance** in the browser menu. Cloud is the default. Twelve built-in presets theme the toolbar, bookmarks, address bar, right sidebar, settings, and floating menus without reloading websites. All, Light, Dark, and Custom filters narrow the preview grid. Manual selection is the default; optional system appearance uses separately selected light and dark presets.

**Create theme** starts from the current theme. Color pickers and hex fields edit a live miniature preview. Save applies and persists the result; Cancel and Escape discard the draft. Built-in themes can only be edited as custom copies. Select a custom theme to rename, edit, duplicate, export, or delete it. Deleting the active custom theme switches to Cloud. Reset to Cloud leaves saved custom themes available.

Custom themes include separate toolbar and bookmarks colors, sidebar, address bar, active tab, accent, text and icon colors, menu/dialog defaults, and button corners. Low contrast combinations are flagged and block saving until corrected; Auto adjust repairs them. Foreground tokens also adapt per surface for readability. Color transitions respect the system’s reduced-motion setting. Websites keep their own styling and appearance preferences. Native macOS menus, context menus, and file/confirmation dialogs retain operating-system styling.

Exported files contain `{ "format": "righttab-theme", "version": 1, "theme": { ... } }`. Import accepts only the defined color and appearance fields, rejects unknown fields, scripts, CSS, URLs, unsupported versions, invalid hex colors, and files over 32 KB, then opens a preview before saving or applying. Duplicate names receive a suggested unique name; saving an editor name already in use shows an error. Up to 100 custom themes are supported.

Theme verification runs with `npm test`, `npm run smoke`, and `npm run test:theme-restart`. Smoke uses a temporary profile and tests the real settings controls, all preset tokens and floating menus, custom theme lifecycle, contrast repair, JSON dialogs with fixture selections, system appearance, keyboard activation/focus containment, and preservation of tabs and cookies. The restart check launches two separate Electron processes against one temporary profile to verify theme and login-cookie persistence. Screenshots for all presets and the custom editor are written to `test-results`.

## Restore previous session

The switch is off by default, so every launch opens ChatGPT or Google.

When you turn it on, the next launch reopens the normal windows and tabs from the last quit instead of only the startup page. After an unexpected exit, the last recorded tabs recover even when this switch is off. Private windows are never saved. RightTab still records the last session while the switch is off, so turning it on later has something to restore. New tabs continue to use the startup page you picked.

## Limitations

- Google sometimes blocks sign-in inside any non-Chrome shell, including Electron. RightTab keeps Chromium’s own user agent, allows sign-in popups, and does not pretend to be the Chrome app. If Google shows “this browser or app may not be secure,” use an email login where the site allows it. After a site accepts the sign-in, that session stays in RightTab.
- Cookies and Google Sync do not come across as they do in Chrome. Unpacked extensions can be loaded, but RightTab is not a Chrome-compatible extension host. See Extensions below.
- Chrome’s session format is internal and can change. Tab import is best effort and the preview shows the pages before you accept them.
- Password autofill fills the visible username and password fields from the main process when you choose a saved login. It does not inject a privileged API into the page.
- This build is unsigned. Gatekeeper may warn if you move a packaged copy to another Mac.

## Creator Scout

Creator Scout is a built-in research side panel for YouTube. Open it from the toolbar, add a YouTube Data API key under Settings, and search or inspect the selected YouTube tab. Saved lists, notes, contact sources, and selected-field CSV export are local. Billing and TikTok/Instagram access are not connected. See [Creator Scout documentation](docs/creator-scout.md).
