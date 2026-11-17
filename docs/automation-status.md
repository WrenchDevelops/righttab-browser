# Browser automation investigation and status

RightTab has an **Assistant preview**, opened with the ✦ toolbar button. It can read the current tab or dispatch a click to a uniquely named visible button. Each operation prompts for approval in a native dialog; the panel shows the result. It does not yet use an AI model or run autonomous tasks. Private windows and split view are excluded.

## Repository findings

Checked upstream HEADs on 2026-11-09: [OpenBrowser](https://github.com/ntegrals/openbrowser) `067fc45d649baa961750da8e2f4a75d87c5c75c8` and [Browser Use](https://github.com/browser-use/browser-use) `1c827a33a06811b25d1bad07355c8963d9db7a6f`. Both declare MIT licensing. OpenBrowser describes a TypeScript agent, Playwright viewport, model providers and sandbox limits. Its documented agent executes commands through its own viewport. Browser Use's Python library documents a CDP connection to an existing browser and a separate cloud option; its project metadata specifies Python 3.11+ and version 0.13.14 at the time of inspection. Browser Use also has JavaScript-related projects, which have not been evaluated for compatibility here.

Neither integration is installed or tested. A browser-wide CDP endpoint would permit operations outside RightTab's controller and conflict with extension debugger ownership; the existence of a CDP option does not establish safe shared-tab integration. A custom, constrained action interface or a thoroughly mediated target-specific bridge must be proven before enabling either backend. Do not expose an unrestricted debugging port or Python execution. No dependency versions are pinned because no upstream dependency has been tested.

## Implementation and limits

The main-process controller is instantiated once per browser window. It serializes its own actions per tab and offers cooperative cancellation. The panel cannot execute arbitrary scripts or selectors; click resolves a unique visible button with an exact name, checks its identifying attributes again after approval, and aborts if a main-frame navigation starts before dispatch. The native prompt identifies the action and page and warns that a click may have sensitive effects. It is shown for every click, including form submission. Approval is not an assessment of what the website will actually do. A click result means dispatch only, not that the desired outcome happened. The operation uses DOM click, so sites requiring trusted input may reject it.

Read output is bounded and omits form/editable text, but page text can still contain personal data or secrets. The page is untrusted and output must not be forwarded to a model without scoped consent and further controls. The queue does not lock normal browsing or extension actions; cancellation cannot interrupt JavaScript already running. URL checks do not detect every same-URL reload or DOM replacement, and identifying attributes are not a stable element identity. These boundaries are insufficient for autonomous or external agents. The prototype does not expose CDP or a model provider. There is no API key configuration.

## Verification

Before changes `npm test` passed 57 tests. `npm run test:automation` starts the real Electron application with a temporary profile and local HTTP fixture. It verifies inspection and form exclusion, the panel IPC, denied and accepted clicks, and a missing target. Approval responses are stubbed, so the native dialog itself requires manual testing. `node --test test/automation-controller.test.cjs` exercises queue ordering and cancellation with a controlled fake. These checks do not prove typing, navigation, grouping, stable element references, sensitive-action classification, restart isolation, hostile-page resistance, framework integration, or agent safety. The full smoke suite has not been rerun. No idle or active resource measurements or framework benchmarks were made.

## Remaining work

A working AI assistant needs provider credential storage and model integration, scoped consent for model context, authenticated-profile handling, privacy review, task progress and cancellation, a complete mediated action API with reliable approvals, stable element references, navigation synchronization, and real integration tests. Creator Scout remains unchanged. Upstream adapters should remain unavailable until they can operate exclusively through that API; compare compatibility, cost and resource use before selecting any backend.
