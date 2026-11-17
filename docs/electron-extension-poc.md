# Electron extension startup diagnostic

This is a diagnostic proof of concept, not an integrated extension runtime. It uses a disposable profile and does not alter the extension or the user's RightTab profile. The tracer launches a temporary Electron process with a loopback DevTools endpoint, pauses service workers before executing their scripts, and captures caught exceptions as well as uncaught ones. The endpoint exists only for the diagnostic process. The worker may contact its configured services. Do not use the diagnostic profile for sign-in.

Run the baseline with:

```sh
node scripts/trace-extension-worker.cjs "$HOME/Library/Application Support/RightTab/Extensions/dac9adf2-78f7-44c1-aa8d-479deb5408d4"
```

To repeat the isolated bridge experiment, install the pinned third-party package in a disposable directory and pass its absolute entry path:

```sh
npm install --prefix /tmp/righttab-extension-poc electron-chrome-extensions@4.10.0 --no-audit --no-fund
RIGHTTAB_POC_BRIDGE=/tmp/righttab-extension-poc/node_modules/electron-chrome-extensions node scripts/trace-extension-worker.cjs "$HOME/Library/Application Support/RightTab/Extensions/dac9adf2-78f7-44c1-aa8d-479deb5408d4"
```

The package is used only inside the disposable test process. It is not a dependency or part of the shipping browser. The runner reports diagnostic process failure, not whether the extension initialized; inspect the paused exception and worker output. The debugger changes worker timing, so success or failure must also be checked without instrumentation.

## Observed, 2026-11-05

The unmodified ChatGPT 1.26.1102.11740 worker's first captured startup failure was:

```
TypeError: Cannot read properties of undefined (reading 'onFocusChanged')
    at Kt.registerEventListeners (background.js:39:43679)
    at new Kt (background.js:39:41933)
    at Kt.getInstance (background.js:39:41737)
    at dR (background.js:53:55428)
    at Object.main (background.js:53:58960)
```

The source at that location calls `chrome.windows.onFocusChanged?.addListener(...)`; `chrome.windows` itself is undefined. The worker catches the rejected startup and logs the generic startup failure. Its error-reporting code also throws a separate `location` error afterward. The debugger recorded promise rejection; it does not prove no earlier, silently handled exception was executed.

With `electron-chrome-extensions` 4.10.0 initialized in the same isolated harness, the first captured startup failure moves to:

```
TypeError: Cannot read properties of undefined (reading 'onDetach')
    at fE (background.js:39:78819)
    at new pE (background.js:39:79719)
    at dR (background.js:53:55447)
    at Object.main (background.js:53:58960)
```

The source accesses `chrome.debugger.onDetach`; the package supplies windows but does not supply the debugger namespace. This demonstrates that its worker preload can pass the first observed failure in this harness. Neither run starts the actual worker successfully, opens its interface in RightTab, nor completes page control.

The maintained package documents windows, tabs, actions, context menus, and webNavigation support, with caveats including persistent backgrounds and partial navigation support. Its documented API list does not include sidePanel, debugger, or tabGroups. Electron's main-process `WebContents.debugger` can send CDP commands and receive messages and detach events, and RightTab already uses native `WebContentsView` for its manual extension side panel. These are building blocks, not Chrome-compatible extension APIs. Implementing the debugger safely requires authenticated extension identity on every IPC, permission and target checks including private and privileged pages, accurate tab IDs, attach ownership, protocol restrictions and child-target handling, event/lifecycle routing, and a visible working Stop control. The third-party package's permission, target, lifetime and event behavior must be audited and reconciled with RightTab before production use; support claims do not prove isolation or semantics. The current evidence establishes missing implementations, not an impossibility of application-level implementation.

Sources: [package documentation](https://github.com/samuelmaddock/electron-browser-shell/blob/master/packages/electron-chrome-extensions/README.md), [Electron debugger](https://www.electronjs.org/docs/latest/api/debugger), [Electron extension support](https://www.electronjs.org/docs/latest/api/extensions).

## Debugger transport prototype

A main-process transport core is present in `electron/extension-debugger.cjs`. It is **not wired into RightTab, any preload, or the extension worker**, and does not establish extension compatibility. Its caller-authentication and tab registry are dependencies to be supplied by a future adapter, not implemented authentication. It intentionally rejects child sessions and all `Target` commands until authorization for related targets is designed; this is a known incompatibility with Chrome's debugger API. Its URL check also does not yet verify frame and child-target restrictions, nor does it implement a user-visible indicator. It must not be exposed to extensions in its current form.

`node --test test/extension-debugger.test.cjs` covers ownership and selected lifecycle cases using fake contents. `node scripts/check-extension-debugger.cjs` uses an isolated Electron profile and a real local WebContents, and verified `Runtime.enable`, `Runtime.evaluate`, delivery of a runtime event, and local user-disconnect cleanup. These checks do not test extension IPC, callbacks, preload execution, packaging, or ChatGPT. The existing application remains unchanged and the last observed real worker failure remains `chrome.debugger.onDetach`.

Inspection of version 4.10.0 of the candidate compatibility package found that its `onExtensionMessage` retrieves an extension by the `extensionId` supplied in the IPC payload, without deriving it there from the sender scope/origin; listener registration similarly accepts that ID. Its preload's `invokeExtension` catches IPC errors and resolves undefined. Those paths require a verified authenticated-sender adapter or maintained patch and correct error behavior before enabling the package in a profile with sensitive browser data. This finding concerns the inspected candidate package, not a claim that Electron cannot implement a safe bridge.

## Sender identity experiment

`electron/extension-sender.cjs` derives a principal from a worker IPC event's session, live worker object/version, scope and registered manifest worker URL, or from a frame IPC event's session, top-level sender frame and an application-supplied extension-page registry. The caller-supplied extension ID is not used. A separate dispatcher in `electron/extension-debugger-adapter.cjs` allows only four named debugger operations and propagates errors. These components are **not registered with IPC or connected to RightTab**. Their extension-page registry and enabled-extension check are supplied by the caller, so they are not a complete security boundary by themselves.

`node scripts/check-extension-sender.cjs` created a synthetic MV3 extension in a temporary profile and verified that Electron 45 delivered usable trusted metadata for both an extension service worker and a top-level extension page. Unit tests cover mismatched sessions, worker object/version/script, ordinary page origins, subframes, payload identity spoofing, unknown methods and rejected errors. This is a minimal metadata reproduction, not an audit of every content-script world or IPC path. Existing core tests and `node scripts/check-extension-debugger.cjs` passed. The candidate compatibility package remains unpatched and must not be enabled as a privileged transport. Worker preload injection, owner-specific event delivery, callback `runtime.lastError`, the real tab registry, visible Disconnect control, frame restrictions and packaged loading are still unimplemented. The actual extension was not run with these new components and its last observed failure remains `chrome.debugger.onDetach`.

## Debugger preload trace (isolated only)

The tracer can load `debugger-trace-host.cjs` and `debugger-trace-preload.cjs` before the third-party compatibility preload. The order matters because version 4.10.0 freezes `chrome`. Run using the earlier package setup and `RIGHTTAB_DEBUGGER_TRACE=1 RIGHTTAB_POC_BRIDGE=/tmp/righttab-extension-poc/node_modules/electron-chrome-extensions node scripts/trace-extension-worker.cjs /path/to/extension`. This is restricted to a disposable profile, only accepts authenticated service-worker senders, and has an empty target registry. It cannot attach to a page and must not be used as an application integration. Callback mode is explicitly unsupported, and the third-party compatibility package remains unpatched and is unsuitable for trusted profile use.

With the actual ChatGPT 1.26.1102.11740 worker and this diagnostic ordering, `chrome.debugger.onDetach.addListener` exists and the worker had a runtime message listener after ten seconds. The first captured exception was `TypeError: Cannot read properties of undefined (reading 'baseUrl')` at `Hn` (`background.js:33:41648`), in a `try/catch` while inspecting absent `chrome.storage.session` data. The tracer pauses on caught exceptions as well as uncaught ones; this observation does not by itself indicate startup failure. The generic background-startup-failed log was not observed in this run. Neither full initialization nor message handling was verified.

The actual extension uses `targetId` debugger calls as well as `tabId`; those and `Target` CDP commands/child sessions remain unsupported in the isolated debugger core. The preload is not registered by RightTab, has no user indicator, and does not establish safe frame-level access restrictions. No actual RightTab interface, authentication or browser-control test was performed with it. A safe integration still requires an authenticated and error-correct replacement for the broader compatibility package, real registered target mapping, event routing for page and worker contexts, callback handling, frame restrictions, visible user disconnect and packaged loading tests.

## Real RightTab test profile

`RIGHTTAB_EXTENSION_TEST=1 npm start` launches the existing Electron application with a separate persistent user-data directory named `RightTab Extension Test`. It does not enable the diagnostic debugger bridge. `electron/actual-extension-check.cjs` exercised the real RightTab host in that separate profile, copied the existing unpacked ChatGPT extension into that profile, and manually opened its manifest side-panel URL. The worker still logged `Chrome extension background startup failed.` The app now listens for extension service-worker console errors, records that startup failure even when it occurs during installation, and prioritizes it in the displayed extension limitations. This does not establish that the panel's embedded application loaded, authenticated or controlled a page. A second run restored the extension and reproduced the same worker error.

The diagnostic debugger preload has not been connected to RightTab. The compatibility package has not been patched or audited sufficiently to expose it, the debugger core has no verified `targetId` or frame authorization, and no controlling-extension indicator or Disconnect control exists. These are unfinished implementation work, not evidence of a fundamental Electron impossibility. Do not use this profile to infer extension compatibility.

## Pinned compatibility patch preparation

`scripts/prepare-compat-patch.cjs` derives `electron/vendor/compat.cjs` and its preload from the SHA-256-checked 4.10.0 package. It compares IPC payload identity with an identity derived from the Electron event, blocks cross-session remote IPC, and changes the upstream preload's fake-success no-ops and suppressed promise errors into errors. The original extension is unchanged. The patch is experimental, is not initialized by RightTab, and is not a complete security or behavior audit: callback `runtime.lastError`, host/target/frame restrictions, extension event registration and delivery, lifecycle integration, permission semantics for the package's other handlers, and the required user-facing control remain unresolved. Its listener-rejection path logs and rejects invalid senders. It must not be enabled in the normal profile.

An isolated trace using this patched package and the diagnostic debugger preload again observed the actual worker register `runtime.onMessage` and make `chrome.debugger.onDetach.addListener` available. It paused on the caught `baseUrl` lookup documented above; no generic startup-failure message was observed in that trace. This is not a functional integration or proof of authentication. The actual app still initializes neither patched preload before `extensionHost.restore()`, so its known `chrome.windows.onFocusChanged` failure remains. No real RightTab control, Disconnect, or restart test has succeeded with the patch.

## Integrated debugger milestone, 2026-11-06

The preceding “not connected” statements are historical. In the experimental
`RIGHTTAB_EXTENSION_TEST=1` profile, RightTab now installs the pinned
compatibility preload and debugger preload before `extensionHost.restore()`.
This path is never enabled for the ordinary RightTab profile.

`electron/extension-debugger-host.cjs` authenticates an IPC sender from its
Electron session, the registered live service-worker object and version, and
the registered extension scope/script URL. It does not accept an extension ID
from an IPC payload. The bridge exposes only `attach`, `detach`,
`sendCommand`, and `getTargets`; it checks the manifest `debugger` permission,
allows only registered non-private RightTab tabs with exactly one authorized
top-level frame, and gives the attachment to one extension owner. Browser
targets, child sessions and `Target.*` protocol commands return explicit
errors. Attachment events are sent only to that owner. Navigation, frame
creation, tab close, worker unload, and browser shutdown release the
attachment. The RightTab chrome shows the owning extension and a Disconnect
button while an attachment exists.

`node scripts/check-debugger-app.cjs` starts the real RightTab application in
temporary profiles with a synthetic MV3 worker. It verified both `tabId` and
registered `targetId` attach flows, `Runtime.enable`/`Runtime.evaluate`, an
`onEvent` delivery, visible control indicator, user Disconnect with
`onDetach`, close-tab cleanup with `target_closed`, and a repeat run. This is
an app integration test, not a claim of generic Chrome debugger compatibility.

`electron/actual-extension-check.cjs` then loaded the unchanged ChatGPT
extension into a disposable RightTab profile. Its actual worker reported both
`chrome.debugger.onEvent` and `chrome.debugger.onDetach`, and an instrumented
call in that worker successfully attached to a local RightTab tab, evaluated
its title, displayed the real Disconnect control, and detached through that
control. This verifies the bridge API in the actual worker, but does **not**
mean the extension autonomously completed a page-control task.

The actual worker's next captured startup failure is now:

```
TypeError: Cannot read properties of undefined (reading 'onCreated')
    at dR (background.js:53:57767)
```

This is `chrome.downloads.onCreated`, which is a separate unsupported API;
the worker still logs `Chrome extension background startup failed`. No stub was
added, and the extension is therefore not fully initialized. The signed-in
side-panel error is also a separate issue: it has not yet been attributed from
sanitized panel logs.
