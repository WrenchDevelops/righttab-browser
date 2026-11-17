# Creator Scout live search observations

Measured 2026-11-09 in temporary RightTab Electron profiles using the user's encrypted YouTube Data API key. No DeepSeek key was configured; no model calls or messages were sent. Query: 25 Fortnite YouTubers, 10K–1M subscribers, a video with at least 500K views in the last 14 days, and a public business contact. Subscriber counts are YouTube's rounded public values; contact source publication was checked, but email ownership and deliverability were not verified.

| Observation | Earlier 3-page run | Standard 6-call run | Deep 10-call run |
| --- | ---: | ---: | ---: |
| Total time | ~5.9 s | 11.601 s | 16.300 s |
| First reported discovery | not recorded | 1.827 s | 1.517 s |
| First qualified creator | not recorded | 2.035 s | 1.629 s |
| First source-backed contact | not recorded | 3.886 s | 3.599 s |
| Videos checked | 123 | 257 | 433 |
| Unique channels | 86 | 164 | 279 |
| Statistically qualified | 6 | 11 | 12 |
| Creators with source-backed public contact | 1 | 3 | 2 |
| Search API calls | 3 | 6 | 10 |
| Website pages checked | not recorded | 1 | 1 |
| DeepSeek calls | 0 | 0 | 0 |
| Stop reason | three-page limit | six-call limit | ten-call limit |

No run reached 10 or 25 contactable creators. The standard run's 3 source-backed contacts in 11.601 seconds is about 15.5 per minute over that short observation; the deep run's 2 in 16.300 seconds is about 7.4 per minute. These are not sustained-rate or verified-deliverability measurements. Searches are individual and non-controlled, and YouTube rankings and data change; the results do not establish a general performance improvement. The runs occurred before the later shared metadata-cache addition. API quota beyond the reported search calls, CPU, memory, and monetary provider costs were not measured.

A subsequent Standard run after the shared metadata-cache change used a fresh profile: 12.254 seconds total, first reported discovery 1.525 seconds, first qualified creator 1.642 seconds, first source-backed contact 3.641 seconds; 258 videos, 170 unique channels, 12 qualified creators, and 2 source-backed contacts in six search calls. It did not reach 10 or 25 contacts. A fresh profile means it does not measure warm-cache performance.

Reproduction: `RIGHTTAB_STRICT_ONLY=1 npm run test:contact-live` runs Standard; add `RIGHTTAB_DEEP_TEST=1` for Deep. The test copies only the encrypted saved key into an isolated temporary profile and removes the profile on process exit. It uses real YouTube API quota. Contact and model-ranking tests use fixtures unless explicitly labeled live.

## Hybrid discovery and parallel contact research

On 2026-11-09, the same Deep query was run in fresh isolated profiles immediately before and after the hybrid change. Both used the same 10-search-call cap and no model calls. These are single observations, not a controlled performance study: YouTube search results varied, and the email-only run also overlapped other local test work.

| Observation | Before hybrid, any public contact | After hybrid, any public contact | After hybrid, business email only |
| --- | ---: | ---: | ---: |
| Total time | 17.060 s | 24.471 s | 27.616 s |
| First source-backed contact | 3.654 s | 2.193 s | 5.188 s |
| Videos checked | 443 | 439 | 427 |
| Unique channels discovered | 288 | 319 | 291 |
| Qualified creators | 11 | 14 | 8 |
| Matching contactable creators | 2 | 3 | 2 |
| Channel-first candidates discovered / inspected | unavailable | 20 / 4 | 20 / 5 |
| Exclusively qualified through channel-first | unavailable | 0 | 0 |
| Stop reason | 10-page limit | 10-page limit | 10-page limit |

Neither hybrid run reached 10 or 25 contacts, and the sample does not demonstrate a reliable yield or speed improvement. The contact sources were public, but ownership and deliverability remain unverified. Add `RIGHTTAB_EMAIL_ONLY=1` to the Deep reproduction command to require a business or management email; without it the test accepts any supported public contact method. Separately, an opt-in isolated live OpenRouter test of a creator-linked contact page succeeded with one paid model call; it does not affect the search measurements above.
