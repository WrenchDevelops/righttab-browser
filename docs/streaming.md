# Protected streaming in RightTab

Status verified on November 10, 2026, on macOS arm64: native Widevine test video plays through the optional Castlabs runtime. **Disney+ title playback is still failing.** No successful Disney+, Netflix, Hulu, or Spotify playback is claimed.

## Confirmed findings

RightTab uses sandboxed `WebContentsView` tabs in `electron/browser.cjs`. Normal windows share `persist:righttab`; private windows use separate in-memory sessions. Split panes use the same page preferences and session as ordinary tabs. There is no website Node.js access or privileged DRM preload.

The original stock runtime is Electron 45.2.3 / Chromium 156.0.8078.80. In the actual RightTab tab implementation:

- H.264 and AAC both report `probably` through `canPlayType` and are supported by MediaSource. MediaCapabilities reports supported, smooth, power-efficient clear MP4 decoding.
- Clear Key access and media-key creation succeed.
- Widevine MP4, software-robustness MP4, and WebM configurations all fail with `NotSupportedError`. The results are the same in a split pane.
- The permission handler also denied `mediaKeySystem` by default. It now permits protected media on HTTPS and loopback origins while respecting explicit saved denials. Fixing this alone does not add a missing CDM.

The signed-in Disney+ test used the existing saved session in isolated copies of a profile backup, and attempted the existing **How I Met Your Mother** title. Stock Electron produced a key-system error and no advancing playback or decoded frames.

Castlabs Electron 45.2.1+wvcus successfully installs Widevine 4.10.3112.0 through its component updater. The same three Widevine capability configurations and media-key creation succeed. However, the signed-in Disney+ test logs Widevine/license errors and **HTTP 400 on a license request to `disney.playback.edge.bamgrid.com`**. Playback does not advance. Some Conviva telemetry requests also fail DNS resolution; they are distinct from the successful connection returning the license HTTP error.

That establishes a second failure after CDM availability. The precise reason Disney rejects this license request is not established. Production VMP signing, service client requirements, account/content policy, and other provider requirements remain candidates; HTTP 400 alone does not prove which one applies. No CSP failure was captured as the playback blocker. No browser identity, certificate validation, license request, or DRM verification was bypassed or modified.

## Native protected playback verified

The official [Castlabs Widevine VMP Lab](https://castlabs.github.io/wv-vmp-lab/) played its default Widevine-protected Tears of Steel H.264 sample against the UAT backend inside RightTab's `WebContentsView`:

| Observation | Result |
| --- | --- |
| `play()` | Started |
| Playback time | Advanced to 5.03 seconds |
| Decoded frames | 123 |
| Video dimensions | 1920 × 857 |
| `video.mediaKeys` | Present |
| Ready state | 4 |
| Paused / muted | False / false |
| Volume | 1 |
| Video error | None |
| UAT platform status | `PLATFORM_SECURE_STORAGE_SOFTWARE_VERIFIED` |

This verifies actual protected-video decoding in the development runtime. Audibility was not independently verified. UAT verification is not proof that a commercial provider accepts the application or that the packaged app has production signatures.

## Runtime decision

| Option | Findings and decision |
| --- | --- |
| Stock Electron 46 | Experimental CDM registration requires an appropriately obtained CDM and any necessary signing. Electron does not supply CDM licensing or updates. Version 46 also removes synchronous `safeStorage` APIs used by RightTab's vault and credentials, and changes sandboxed preload APIs. An alpha upgrade would require a broader compatibility migration. |
| Castlabs ECS | Uses the existing Electron APIs and adds a CDM updater plus VMP integration. It preserved the tab, split, extension, import, and encrypted-vault smoke checks. Chosen as an **opt-in native DRM development runtime**. |
| Full Chromium browser | Existing `chromium-prototype` is an isolated experiment. Moving RightTab's Electron UI, views, extensions, password handling, profiles, and updates into a full browser is a substantial rewrite. Custom Chromium still needs an authorized DRM integration and potentially certification; it does not itself resolve a provider license rejection. |

The latest stable ECS release verified during this investigation is 45.2.1+wvcus. Stock 45.2.3 includes newer Chromium and upstream fixes. **The default runtime remains 45.2.3**; the older ECS build is not promoted to the everyday default. The optional runtime is pinned to official commit `ab2120c6a5d49d412bcb2b7e3f9c9c3e74cb0243`, with a separate npm lockfile. The downloaded macOS arm64 archive matched the official SHA-256 `93e1976a66d58004bf25e5b777c979cc3c03513868d5faf294bcd6f58e63bd24`.

References: [Electron 46 changes](https://releases.electronjs.org/release/v46.0.0-alpha.1), [Electron CDM integration](https://github.com/electron/electron/blob/main/docs/tutorial/testing-widevine-cdm.md), [ECS release list](https://github.com/castlabs/electron-releases/releases), [stock 45.2.3 changes](https://releases.electronjs.org/release/v45.2.3), [Castlabs integration](https://github.com/castlabs/electron-releases), [custom Chromium certification](https://github.com/castlabs/electron-releases/wiki/EVS#3pl).

## Run and diagnose

Normal browsing remains `npm start`. To install and use the optional runtime:

```sh
npm run setup:drm
# Quit the existing RightTab process with Cmd+Q before switching runtimes.
npm run start:drm -- . --restore-session
```

`--restore-session` reopens saved tabs for that launch without changing the saved startup preference. Both normal launchers use the existing RightTab data directory. Back up a closed profile before trying a runtime with an older Chromium revision; do not run two runtimes concurrently against the same profile. The original profile backup from this investigation is under `~/Library/Application Support/RightTab Backups/before-drm-2026-11-10`.

ECS component setup runs before the browser starts, with a 12-second wait limit. An offline or slow installation leaves ordinary browsing available; the diagnostic state records `failed` or `pending`. A later successful installation updates the in-memory status; reload the streaming page afterward. No Chrome CDM files are copied.

```sh
npm run diagnose:media
npm run diagnose:media:drm -- --services
npm run diagnose:media:drm -- --vmp
```

These use disposable profiles, not the normal signed-in profile, and write results under `test-results`. Service homepage checks do not sign in, purchase, subscribe, or claim successful playback.

In the running browser, select a streaming tab and choose **Help → Start Playback Diagnostics** before retrying playback. Then choose **Help → Save Playback Diagnostics**. Captures stop after five minutes. Close DevTools or disconnect a controlling debugger extension before starting. Private-window report capture is disabled.

Reports include per-frame capability/media snapshots, selected error categories, HTTP status and origin, network errors, and player events. They omit arbitrary console text, URL paths/queries, headers, cookies, request/response bodies, license payloads, and key IDs. Network observation does not intercept or rewrite requests. No diagnostic listeners or debugger connection run in normal browsing unless explicitly started.

For an authorized signed-in test, `electron/disney-session-check.cjs` requires `RIGHTTAB_MEDIA_TEST_PROFILE` pointing to a separate closed-profile clone. It attempts the clone's existing Disney title, records advancing time/frames, writes a local report, and exits. The original-profile main process has no automatic playback-test hook. The final isolated comparison disabled extensions only in the test clones; extension compatibility was verified separately.

## Packaging and production signing

```sh
npm run package:mac:drm
```

The native development app is generated at `dist-drm/mac-arm64/RightTab.app`. It is not production VMP signed, Apple signed, or notarized. Packaging is intentionally separate from the existing stock app output.

Castlabs documents EVS account registration as necessary for production VMP signing. The user confirmed no EVS account is available, so no account was created and no production signing request was made. The next legitimate step is to complete [EVS registration](https://github.com/castlabs/electron-releases/wiki/EVS#creating-an-evs-account), then sign and retest the packaged application. This is a test route, not a guarantee of Disney acceptance.

EVS client **1.3.3** is installed locally in the ignored `.venv-evs` environment. Its package verification command reports `Certificate is valid for development only` for the generated app, confirming that production signing remains outstanding.

After account setup, use an isolated Python environment and the documented EVS client. The signing command targets the directory **containing** the app:

```sh
python3 -m venv .venv-evs
.venv-evs/bin/python -m pip install castlabs-evs
.venv-evs/bin/python -m castlabs_evs.account signup
.venv-evs/bin/python -m castlabs_evs.vmp sign-pkg dist-drm/mac-arm64
.venv-evs/bin/python -m castlabs_evs.vmp verify-pkg dist-drm/mac-arm64
```

Enter credentials in the local client, not in source or chat. Existing account holders use `reauth` instead of `signup`. For macOS, VMP signing must precede Apple code signing. Retest the VMP Lab and an actual Disney title in the final bundle after signing. A security-current ECS release is also needed before making it the default. See [the official signing workflow](https://github.com/castlabs/electron-releases/wiki/EVS#signing-an-ecs-application-package).

## Service verification matrix

| Service | Homepage | Existing signed-in access | Player / actual playback | Audio, controls, fullscreen |
| --- | --- | --- | --- | --- |
| Disney+ | Loaded, stock and ECS | Existing session worked in the comparison; fresh login flow not tested | Actual title attempted; stock key-system failure, ECS license HTTP 400; no successful playback | Not verified because title does not play |
| Netflix | Loaded, stock and ECS | Not available for the test | Not verified | Not verified |
| Hulu | Loaded, stock and ECS | Not available for a separate Hulu-site test | Not verified; Hulu-included content attempted on Disney+ is not a Hulu-site pass | Not verified |
| YouTube | Loaded, stock and ECS | Existing signed-in UI observed | Video visibly played in the user's stock-runtime RightTab | Player controls and fullscreen observed; audibility not independently verified |
| Spotify Web Player | Loaded, stock and ECS | Not available for the test | Not verified | Not verified |
| Castlabs VMP Lab | Loaded in ECS | Public authorized sample | Actual Widevine-protected sample played | Unmuted/volume and decoding verified; audibility/fullscreen not independently tested |

Existing single-pane fullscreen behavior is preserved. RightTab's current code does not expand a player to window fullscreen while split view is active. No successful commercial-service fullscreen test is claimed.

## Validation and evidence

- `npm test`: **93 passed**, zero failed.
- `npm run smoke`: passed with stock Electron.
- `node scripts/with-castlabs.cjs --npm run smoke`: passed with ECS, including splits, themes, downloads, imports, and encrypted vault operations.
- ECS `test:extensions`: passed, including content scripts, popup isolation, storage/restart, private isolation, disable, and surface checks.
- ECS `test:compat`: passed actual app initialization and extension registration/error paths.
- Stock and ECS media probes: passed codec/Clear Key, normal/split parity, private capability inspection, diagnostic cleanup, and report privacy checks.
- DRM macOS packaging: built successfully.
- Packaged DRM app: passed the native existing-tab inspection and assistant IPC integration check with an isolated profile, including expected permission denials.
- Public Widevine sample: actual protected playback succeeded.
- Disney+ title: attempted and failed as described above.

The initial ECS smoke run sampled a theme mid-transition and failed a color comparison by one channel value. Its fixed 180 ms wait was replaced with a bounded wait for the actual target color; the full ECS smoke rerun passed. A generic fullscreen automation experiment was inconclusive and removed; it is not listed as a passed test.

Evidence files, all ignored by git: `test-results/media-baseline.json`, `media-permission-fixed.json`, `media-castlabs.json`, `media-vmp-lab.json`, `disney-live-stock.json`, and `disney-live-castlabs.json`. Test profiles containing copied account data are separate from the original profile and are removed after the comparison; the original closed-profile backup is retained.

## Files changed or added

| File | Purpose |
| --- | --- |
| `electron/main.cjs` | Initialize optional ECS components before creating browser tabs |
| `electron/browser.cjs` | Protected-media permission handling, opt-in diagnostic menu actions, one-launch session restoration |
| `electron/menu.cjs` | Playback diagnostic capture/save entries |
| `electron/media-runtime.cjs` | Bounded component installation and status |
| `electron/media-probe.cjs` | Codec, MediaCapabilities, EME, and per-frame playback snapshots |
| `electron/media-diagnostics.cjs` | Bounded, metadata-only console/network/player capture |
| `electron/media-check.cjs` | Isolated runtime, homepage, and public protected-video checks |
| `electron/disney-live-check.cjs` | Authorized title playback comparison and evidence collection |
| `electron/disney-session-check.cjs` | Dedicated entry point requiring a separate test profile |
| `electron/theme-smoke.cjs` | Wait for the target theme color instead of assuming transition timing |
| `scripts/diagnose-media.cjs` | Stock diagnostic launcher |
| `scripts/with-castlabs.cjs` | Optional runtime launcher for the app, checks, and packaging |
| `runtimes/castlabs/package.json`, `package-lock.json` | Separate pinned ECS installation |
| `test/media.test.cjs` | Permission, installation/failure/timeout, and report privacy tests |
| Root `package.json`, `package-lock.json` | Launch/diagnostic/package commands and lockfile reconciliation |
| `.gitignore` | Exclude separate DRM build output |
| `README.md`, `docs/streaming.md` | Usage, findings, verification, limitations, and signing route |
