# Creator Scout

Creator Scout is a first-party RightTab panel. The toolbar button opens a native `WebContentsView` beside the current tab; it can be resized from its left edge. It uses a sandboxed preload and a narrow IPC bridge. The selected tab URL is read only after the user clicks **This page** in the composer. A creator's site is inspected only after the user opens that site and chooses **Inspect opened creator site**. No background browsing monitor or YouTube page scraping is installed.

## Setup

1. Enable YouTube Data API v3 in a Google Cloud project and obtain an API key restricted to the YouTube Data API. Open Creator Scout → Settings and save the key. RightTab encrypts it with Electron `safeStorage` and uses it only in the main process. `RIGHTTAB_YOUTUBE_API_KEY` can supply a key for a managed installation.
2. Enter a creator topic in the home search box, or ask for videos/thumbnails (for example, “Show thumbnails for 3D printing timelapses”). Video research renders source-linked thumbnail previews, title, channel, publish date, and available public counts; select two or more results for a public-field comparison. On a YouTube search results page, typing **Scout page** uses the search phrase in that page's URL. On a YouTube video or channel page, **Scout page** inspects that creator. You can also click **This page** to attach the selected tab and use the plus menu to scout or inspect it. The header provides search history, Settings, and a new search. Bottom navigation connects Discover, Saved, and Outreach. Ask My Texts remains available through the plus menu.
3. Search cards are API results. Inspect fetches one full public channel profile and up to five recent uploads. Save creators to a project list, add notes, tags, and manual outreach status. Select creators and CSV fields, preview the complete CSV, then save it.

## Conversation and page context

Creator Scout persists an ordered local conversation, including the current research topic, result type, filters, result IDs, and the explicit page-context snapshot used for each request. A new conversation intentionally resets that state. For an attached YouTube search page, a generic “find creators” request inherits its `search_query`; filter-only follow-ups retain the topic and creator output. For example, “over 10K subscribers … last 2 weeks … 300K views” is enforced as one qualifying topic-relevant video, not three unrelated facts. Each strict result shows the matching video and the source-backed facts used to qualify it.

Instagram and TikTok URLs are recognized as page context only. Creator Scout does not silently substitute YouTube results because those discovery connectors are not implemented.

The API key is a local user credential. There is no hosted RightTab server or shared API key in this repository. Production distribution of a shared credential requires a backend service and account controls. A live YouTube search was verified with a key already encrypted in the local RightTab profile. Connector and UI tests use local fixtures; their sample creators are never shown as real search results.

## Data and quotas

- Search: YouTube Data API `search.list` for video and channel hits, deduplicated by channel ID; up to 50 matching channels and at most three pages per query. Channel cards come from batched `channels.list` calls. Results must match the query in public channel metadata or a returned video title. Paging stops as soon as enough matching channels are found. Video/thumbnail research runs video-only discovery and follows it with a batched `videos.list` request for only the displayed public fields.
- Inspection: `channels.list`, then `playlistItems.list` for the channel's uploads playlist and `videos.list` for up to five public videos. A YouTube video URL resolves through `videos.list`; a handle resolves through `channels.list`.
- Requests ask for only fields displayed by the panel. Every record carries the API source and refresh timestamp; field metadata is attached to channel fields and recent videos. Search and inspection responses are cached for 24 hours. Saved API metadata is removed after 30 days if it has not been refreshed, while user notes and list membership remain.
- One monthly lookup is one uncached full channel inspection. Search result cards, cached inspections, and internal requests for one inspection do not count as extra creator lookups. The local profile has a hard 750 monthly lookup cap and an 80 search-call daily safety cap. API requests are serialized and spaced by at least 700 ms. YouTube's own project quota can stop requests earlier.
- The [current `search.list` reference](https://developers.google.com/youtube/data/reference/rest/v3/search/list) lists a default 100-call daily search bucket and one search-query unit per call. [Channels](https://developers.google.com/youtube/data/reference/rest/v3/channels/list), [videos](https://developers.google.com/youtube/data/reference/rest/v3/videos/list), and [playlist items](https://developers.google.com/youtube/data/reference/rest/v3/playlistItems/list) have their own documented quota costs. Each additional search page consumes another call.

## Contacts and privacy

The YouTube API does not provide the manually revealed business inquiry email. Creator Scout never automates that flow. It finds URLs only in the channel description returned by the API. For an opened creator-provided site, it scans visible text and links on that one HTTPS page, displays candidates, and requires the user to confirm or edit a candidate before saving it with page URL and title. Manual email entries are labeled user-confirmed. No address is labeled verified. No outreach is sent.

Exports include only checked saved creators and checked CSV fields. Contact details and notes are not selected by default. Formula-like CSV cells are escaped. Creator Scout data can be deleted individually or all at once. It is stored in `creator-scout.json` in the RightTab user-data directory; the key in that file is encrypted by the OS.

## Private channel analytics status

Public research is intentionally separate from private analytics. The private analytics entry point is gated and returns an actionable configuration state rather than requesting broad permissions or exposing a secret in the panel. A production integration needs a backend-owned OAuth client and encrypted token store, using the minimum `https://www.googleapis.com/auth/yt-analytics.readonly` scope for non-monetary reports. It must validate every Analytics report combination before calling `reports.query`, use Reporting API job/report lifecycle states for reach reports, and never send private analytics to a model without a separate user control.

Required configuration name: `RIGHTTAB_GOOGLE_OAUTH_CLIENT_ID`. This repository intentionally has no OAuth client secret, redirect endpoint, token backend, or configured Google Cloud credentials. Interactive channel connection, analytics queries, retention, traffic-source, reach impressions, and thumbnail CTR are therefore not live in this local build. The public Data API key works independently.

## Platform status and pricing

| Platform | Status | Source and access |
| --- | --- | --- |
| YouTube | Implemented, live after a key is configured | Public YouTube Data API v3; no creator OAuth for these public fields. |
| TikTok | Not connected | [Research API](https://developers.tiktok.com/products/research-api/) requires restricted approval and is aimed at eligible research. [Display API](https://developers.tiktok.com/docs/en/display-api-get-started) requires product approval and creator authorization for profile/video display; it is not platform-wide discovery. |
| Instagram | Not connected | [Meta's Instagram API documentation](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api) describes professional-account access and permission requirements. No discovery approval or account connection exists here. |

The previous Lite pricing concept is no longer presented in the workspace. Billing and overages remain disabled. Settings show actual local lookup and search usage. Paid AI assistance is optional and remains explicitly controlled per provider; no third-party email verification is performed.

## Creator Scout 5.2 workspace

The interface uses warm cream surfaces, restrained peach/lilac backgrounds, system display typography, and a compact floating RightTab header. Search starts inside the home hero; the same live form moves below results while preserving its listeners and input. Quick/Standard/Deep controls and contact defaults persist locally. The browser's dark theme does not turn the Scout workspace into an all-dark interface.

The discovery orb expands into a navy progress card during a search. Metrics come directly from pipeline events; unavailable values display a dash. Completion shows measured wall-clock duration. Source-backed contact routes, qualification, creator links, and refresh actions are available in creator profiles. Results and profiles use two columns where useful at 600px. CRM presents a compact creator/contact/stage layout at 600px and cards at narrower widths; project editors, notes, research references, and CSV controls live in disclosures.

Outreach has its own editor, backed by the existing local draft API. Contact actions save a creator if needed and open an existing draft without replacing it. Resetting a draft still requires confirmation. AI remains a contact-research/ranking capability; the editor does not advertise an unimplemented AI writing or sending service. Background search events do not replace unsaved settings input.

### Screenshot verification — November 10, 2026

`npm run test:creator-scout:visual` runs the actual RightTab browser with its native `WebContentsView` and a temporary profile, copies only the existing encrypted YouTube key into that profile, and leaves normal CRM data and provider preferences untouched. It never copies AI credentials or sends outreach. It needs a locally configured YouTube key and network access for the primary live run.

The run captures 80 native Electron screenshots across **360, 400, 440, and 600px**: home, active discovery, completion, results, creator profile/sources, CRM, outreach/editor actions, settings/provider states, empty CRM/outreach, loading, search error, API disconnected, no contact, long creator/email, and 125-result scrolling. Core screens use actual provider records, an actual public contact, and a locally saved draft. The 400px active capture is taken during the live provider request; remaining active layouts replay captured provider events. Error, disconnected, no-contact, long-field, and 125-record cases are deliberately synthetic and exist only in the temporary renderer. They are labeled in the screenshot manifest.

Screenshots were visually inspected at all four widths. The review found and corrected a normal email wrapping onto an orphan final letter in the 600px profile; the full screenshot matrix was re-captured after that fix. Structural checks report no horizontal overflow, visible navigation, and working long-result scrolling. A live search returned five 3D-printing creators, saved a source-backed contact to the isolated CRM, and created, edited, and saved a local outreach draft. The runner also checks that navigation retains the live home form/input and that a background search preserves unsaved settings input.

Evidence is written to `test-results/scout-5.2/`: `live-search.json`, `live-active.json`, `live-workspace.json`, `live-report.json`, `report.json`, and the width-prefixed PNGs. Re-run layout checks without further provider requests using `npm run test:creator-scout:visual -- --replay` after a successful live run. Screenshot captures are not themselves an automatic visual-review approval.

Validation: **90/90 Node tests**, the native Creator Scout regression, and the wider Electron browser smoke check passed. The additional keyless `test:youtubejs-live` check is blocked on this network: Node's request to `www.youtube.com` receives a certificate for `*.securly.com` (`ERR_TLS_CERT_ALTNAME_INVALID`). The existing configured Data API path was verified live. TLS checks and provider implementations were not changed to bypass this environment issue.

## Verification

- `npm test` runs connector, cache, deduplication, quota, persistence, retention, and CSV tests plus the existing suite.
- `npm run test:creator-scout` starts the actual Electron app with an isolated temporary profile and checks toolbar/panel integration, chat errors, settings, resizing, and closing. It writes screenshots to `test-results/creator-scout-panel.png` and `test-results/creator-scout-chat-layout.png`. The latter uses temporary test records solely to verify the layout; those records are not stored or presented as real API results.
- `npm run smoke` checks the wider browser, including split layout.
- `npm run package:mac` builds a local arm64 `.app` under `dist/mac-arm64`. The app bundle was launched with `RIGHTTAB_SCOUT_TEST=1` and passed the same native panel check. This local bundle is unsigned and uses Electron's default icon; it is not ready for public distribution.
