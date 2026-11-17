# Windows compatibility and release readiness

## Implementation update — 2026-11-17

This section supersedes implementation-status statements in the initial audit below. Windows runtime behavior remains unverified.

- On macOS, `npm run package:win` cross-compiled x64 NSIS and portable builds with a RightTab icon, per-user installation, Start Menu and desktop shortcuts, and retained application data on uninstall. These are unsigned development builds, not release-ready installers; they have not been executed on Windows. A code-signing certificate, distribution policy, SmartScreen reputation, upgrade and uninstall tests remain necessary.
- Windows Chrome, Edge and Brave profile discovery and source selection are implemented; bookmarks, history, supported preferences and session parsing reuse the Chromium importer. The database copy and queries use Node's built-in SQLite API (experimental in Node 24) instead of an external sqlite3 binary. Profile IDs are validated. Fixture tests ran on macOS; real Windows profiles and locked database behavior have not been tested. Firefox import remains absent.
- Direct browser password import is disabled outside macOS; Windows account sessions and RightTab safeStorage have not been verified. macOS Chrome password import remains in place.
- Windows uses the native window frame; macOS-specific menu roles are limited to macOS. DPI, taskbar, multi-monitor restoration, accessibility and Windows keyboard behavior remain unverified.
- `.github/workflows/windows.yml` defines a Windows 2022 Node 24 test and unsigned packaging job. It has not run; there is no Git remote configured in this checkout.
- Chromium and Node services do **not** yet share a proxy configuration. Authenticated proxies, PAC, diagnostics, network-change and captive-portal handling are incomplete. There is no updater, crash reporting, Windows default-browser registration, or supported Windows DRM release. Keep the release blocked until these and the actual Windows installation, authentication and regression tests are completed.

### Windows developer build

To run from a checkout, double-click `start-windows.cmd` or run `.\start-windows.cmd` in the repository folder. On first run it downloads and verifies a pinned Node.js runtime and installs the locked dependencies locally; no separate Node.js installation is needed. This launcher has not been tested on Windows.

To build installers on a Windows x64 development machine with Node.js 24 and npm installed, from the repository root run:

```powershell
npm ci
npm test
npm run package:win
```

The build is configured to produce `dist/RightTab Setup 1.0.0.exe` and `dist/RightTab 1.0.0.exe` (names include the package version). End users of a verified installer should not need Node.js. Do not distribute these unsigned, unvalidated builds as a production release.

## Initial audit (historical)

Audit started 2026-11-17. This is an initial source audit, not a Windows certification or an exhaustive inventory. No Windows machine or VM was available for this pass. Electron remains pinned to 45.2.3. **RightTab is not ready for public Windows distribution.**

## Architecture and baseline

The application starts in `electron/main.cjs`; `electron/browser.cjs` manages Electron `BaseWindow`/`WebContentsView` instances, persistent and private sessions, downloads, IPC, and browser UI. `src/` contains the renderer, `shared/` contains data and import logic, and `electron/store.cjs` stores state under Electron's user-data directory. Electron/Chromium is the browser engine. The default runtime is stock Electron; the separately installed Castlabs runtime is opt-in and has its own licensing, signing and security constraints. See `docs/streaming.md`.

The default dependency tree declares Electron and electron-builder as development dependencies and `cheerio`, `debug`, and `youtubei.js` as runtime dependencies. No project-declared native Node addon was identified; Electron itself and any transitive/platform binaries still require Windows packaging and runtime validation. The checkout has no commits and all source is untracked, so a commit at this point would also capture existing user work.

Categories below describe evidence and remaining work, not promises of support. “Additional testing” does not imply functionality was verified on Windows.

| Area | Classification | Evidence and Windows work |
| --- | --- | --- |
| Electron engine and core browsing | Additional testing | 45.2.3 is pinned. Startup, navigation, Windows 10/11, x64, GPU/Direct3D, codecs, audio, WebRTC, WebSocket, HTTP/2 and HTTP/3 need real Windows tests. ARM64 is not a release target yet. |
| User data, settings and sessions | Additional testing | Electron user-data and a persistent Chromium partition are used; restart, permissions, upgrades, concurrent instances and private-session cleanup are unverified on Windows. |
| Window controls and scaling | Requires Windows-specific implementation | macOS hidden inset/traffic-light settings now apply only on macOS; other platforms use the native frame. Layout, DPI, multiple monitors, taskbar, snapping and theme behavior remain untested. Mica has not been implemented. |
| Menus and shortcuts | Requires Windows-specific implementation | `electron/menu.cjs` includes macOS application-menu roles. Keyboard accelerators use CommandOrControl in many places; Windows menu and actual keyboard behavior need review. |
| Bookmarks and Chrome profile import | Requires Windows-specific implementation | Profile discovery in `shared/chrome-profile.cjs` assumes `~/Library/Application Support/Google/Chrome`. Bookmark format parsing is shared; discovery and imports from Edge, Brave and Firefox are absent. History/password inspection shells out to sqlite3, which is not bundled for Windows. |
| Third-party passwords | Currently unsupported on Windows | Existing macOS Chrome import calls `/usr/bin/security` and uses macOS Chrome password decryption. The existing RightTab vault stores user-saved passwords via Electron safeStorage; Windows protection and UX need verification. The requested account flows must not collect third-party passwords. Do not assume Chrome password formats are portable. |
| Authentication and cookies | Additional testing | Persistent Chromium partition and popups exist; Google/Microsoft/Apple flows and persistence on Windows are unverified. Google may reject embedded browsers. Chrome cookies and sync are not imported. |
| Extensions | Additional testing | Unpacked extensions use Electron's partial extension support; Web Store/CRX installation and full Chrome APIs are not supported. Windows file paths and extensions must be tested. |
| Downloads, clipboard, notifications and context menus | Additional testing | Electron APIs are used for portions of these; end-to-end behavior, permissions, filenames and native integration require Windows verification. |
| Onboarding | Requires Windows-specific implementation | A welcome/import flow exists, but the requested full cross-browser import, privacy, proxy, extension and optional account onboarding is not established. Several strings in `src/renderer.js` explicitly refer to macOS and Keychain. |
| Proxy, DNS and enterprise networking | Requires Windows-specific implementation | Chromium system behavior is unverified. Forced public secure-DNS configuration was removed in this pass. No user-configurable proxy UI, authenticated-proxy flow, network-transition handling or dedicated diagnostics exists. Node `fetch` and `https.request` used by homepage and Creator Scout services have separate networking behavior from Chromium and must be assessed independently for proxy, DNS and TLS policy. |
| TLS, captive portals and failure handling | Requires additional testing | Certificate errors are rejected in `electron/browser.cjs`; this does not prove enterprise trust-store behavior. Captive portal, firewall, DNS, proxy authentication and WebSocket failure diagnosis is not implemented. A certificate mismatch cannot by itself identify network filtering. |
| Video, streaming and DRM | Currently unsupported for a release claim | Stock runtime does not provide working Widevine according to `docs/streaming.md`. Windows licensing, deployment and actual Netflix/Disney+ title playback are unverified. |
| Ask My Texts | Currently unsupported on Windows | Discovery in `electron/browser.cjs` targets macOS app/build paths; integration depends on the separate local application. |
| Creator Scout and homepage services | Additional testing | Network/API features use YouTube, OpenRouter/DeepSeek and Open-Meteo integrations and/or Node networking. API credentials use safeStorage. Test service behavior, proxy handling and Windows credential storage independently. |
| Installer, updates and signing | Requires Windows-specific implementation | `package.json` configures only macOS targets. No Windows installer, portable build, updater, signing configuration, release pipeline, crash reporting or uninstall policy is present. No installer has been produced. |
| Security and IPC | Additional testing | Browser UI and page configurations include sandbox, context isolation and disabled Node integration; IPC authorization, dependencies, Windows credential protection, protocol handlers and installer privileges need a comprehensive security review. This audit is not a security assessment. |
| Startup, default browser, file associations and deep links | Requires Windows-specific implementation | Windows registration, startup integration, protocol/file association and update behavior are not established. |

No area is classified as compatible without changes solely on source inspection: all Windows behavior needs validation. Existing shared data transformations can be reused, but passing platform-neutral unit tests is not Windows acceptance.

## Known platform assumptions

- `shared/chrome-profile.cjs`: macOS Chrome root; sqlite3 external command and Unix-oriented SQLite URI construction; macOS-specific import descriptions.
- `electron/importer.cjs`: macOS `security` command and Chrome Safe Storage flow.
- `electron/browser.cjs`: Ask My Texts macOS binary candidates; native menus, layout and Windows-specific behaviors require review.
- `src/renderer.js`: Keychain and Chrome extension folder instructions name macOS paths.
- `electron/main.cjs` and `scripts/creator-scout-visual-qa.cjs`: opt-in live/visual test helpers reference `~/Library/Application Support/RightTab`. `electron/smoke.cjs` optionally invokes `/usr/sbin/screencapture`. DRM scripts are principally macOS-oriented; inspect them before adapting.
- Development and package outputs are excluded by `.gitignore`; no Windows release infrastructure is configured. Review the separate `chromium-prototype/` independently before treating it as a supported build.

## Release gates and next steps

1. Establish a Windows 10/11 x64 VM or physical test host, clean npm installation and repeatable CI. Capture baseline macOS smoke tests and actual Windows failures. Preserve Electron 45.2.3 during the initial port.
2. Design platform-specific profile discovery, SQLite access without an undeclared executable, safe import boundaries and truthful capability reporting. Add Edge, Brave and Firefox imports with fixture and actual-profile tests. Do not introduce a Windows password-decryption workaround without a separate security design.
3. Review native frame, layout, menus, controls, paths, first-run copy and all integrations on Windows; keep macOS behavior intact. Test safeStorage and the existing vault rather than claiming Windows protection from an API name alone.
4. Design diagnostics and proxy configuration across Chromium sessions **and** Node services. Respect system/administrator policy and certificate verification; distinguish observed errors from inferred causes. Test system/PAC/manual and authenticated proxies, VPN, transitions, DNS and captive portals in controlled networks without bypassing policy.
5. Configure and exercise Windows x64 installation, upgrade, uninstallation and optionally portable packaging; decide data retention explicitly. Implement and test a secure update mechanism and privacy-conscious crash reporting. Obtain an appropriate Windows code-signing certificate through the release owner; signing and SmartScreen reputation require real distribution validation.
6. Exercise clean and upgrade installations, onboarding, supported account flows, import, profiles, downloads, extensions, multiple windows, themes, network failures, crash recovery and updates on real Windows. Verify protected playback only with properly licensed runtimes and actual services. Document evidence and unresolved limitations before release.

## Development and installation status

On the current macOS checkout, `npm ci`, `npm test`, `npm start`, and `npm run package:mac` are the existing development/build entry points. `npm ci` replaces the local dependency installation; use it only when appropriate. No supported Windows build or installation instructions exist yet. Windows users should not be directed to install this checkout as a release. Release, update, code-signing and uninstall procedures remain to be designed and verified.
