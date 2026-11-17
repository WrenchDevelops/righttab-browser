const api = window.scout;
const $ = (id) => document.getElementById(id);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const fmt = (number) =>
  number == null
    ? "Unavailable"
    : new Intl.NumberFormat("en", {
        notation: number >= 10000 ? "compact" : "standard",
        maximumFractionDigits: 1,
      }).format(number);
const date = (value) => (value ? new Date(value).toLocaleString() : "Unknown");
const safeUrl = (value) => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
};
const icons = {
  history:
    '<svg viewBox="0 0 24 24"><path d="M3 11a9 9 0 1 1 1.5 5M3 5v6h6"/><path d="M12 7v5l3 2"/></svg>',
  compose:
    '<svg viewBox="0 0 24 24"><path d="M12 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-7"/><path d="m11 13 8.5-8.5a2 2 0 0 1 3 3L14 16l-4 1z"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="m15 5-7 7 7 7"/></svg>',
  compass:
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/></svg>',
  bookmark:
    '<svg viewBox="0 0 24 24"><path d="M5 20V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v15l-7-5z"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="8" y="3" width="12" height="14" rx="2"/><path d="M16 17v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2"/></svg>',
  like: '<svg viewBox="0 0 24 24"><path d="M7 10v11H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3ZM7 10l5-8a2 2 0 0 1 2 2l-1 5h5a3 3 0 0 1 3 3l-1 7a3 3 0 0 1-3 2H7"/></svg>',
  refresh:
    '<svg viewBox="0 0 24 24"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9a7 7 0 0 1 12-2L20 12M4 12l2.5 5a7 7 0 0 0 12-2"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>',
  page: '<svg viewBox="0 0 24 24"><path d="M6 2h8l5 5v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z"/><path d="M14 2v6h5"/></svg>',
  send: '<svg viewBox="0 0 24 24"><path d="M12 20V4m-7 7 7-7 7 7"/></svg>',
  youtube:
    '<svg viewBox="0 0 24 18"><rect x="1" y="2" width="22" height="14" rx="4" fill="currentColor"/><path d="m10 6 6 3-6 3z" fill="white"/></svg>',
};
const exportFields = [
  "Platform",
  "Channel",
  "Handle",
  "Channel URL",
  "Subscribers",
  "Views",
  "Video count",
  "Country",
  "Description",
  "Tags",
  "Notes",
  "Project",
  "Outreach status",
  "Contact type",
  "Contact value",
  "Contact source URL",
  "Contact source title",
  "Contact status",
  "Website",
  "Instagram",
  "TikTok",
  "Contact page",
  "Contact discovery source",
  "Data source",
  "Last refreshed",
  "Date added",
];
const exportColumns = new Set([
  "Platform",
  "Channel",
  "Channel URL",
  "Data source",
  "Last refreshed",
]);
const exportIds = new Set();
let state = null,
  view = "chat",
  context = null,
  turns = [],
  detailRecord = null,
  notice = "",
  error = "",
  csvPreview = "",
  menuOpen = false,
  queryLimit = 25,
  sizeFilter = "all",
  conversationId = "",
  selectedVideos = new Set(),
  activeMode = "scout",
  textTurns = [];
let returnView = "chat", renderedView = "", defaultContact = localStorage.getItem("scout-contact") || "auto";
queryLimit = [10, 25, 50].includes(Number(localStorage.getItem("scout-depth"))) ? Number(localStorage.getItem("scout-depth")) : 25;

async function call(action, payload = {}) {
  const result = await api.invoke(action, payload);
  if (result?.error) throw new Error(result.error);
  return result;
}
function status(text, bad = false) {
  notice = bad ? "" : text;
  error = bad ? text : "";
  render();
}
function alertHtml() {
  return `${error ? `<p class="inline-notice error" role="alert">${esc(error)}</p>` : ""}${notice ? `<p class="inline-notice">${esc(notice)}</p>` : ""}`;
}
function applyTheme(theme) {
  if (theme?.mode) document.documentElement.dataset.theme = theme.mode;
}
function saved(id) {
  return !!state?.saved?.[id];
}
function currentRecord(id) {
  return [
    detailRecord,
    ...turns.flatMap((turn) => turn.records || []),
    ...Object.values(state?.saved || {}).map((item) => item.record),
  ].find((item) => item?.id === id);
}
function shortText(value, limit = 150) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}
function isPageRequest(value) {
  return /^(?:scout|inspect|research|analy[sz]e|summarize)(?:\s+(?:this|the|current))?\s+page[.!?]*$/i.test(String(value || "").trim());
}
function isVideoResearch(value) {
  return /\b(thumbnails?|videos?|reviews?|tutorials?|compare|comparison|title ideas?|titles?|timelapse)\b/i.test(String(value || ""));
}
function duration(value) {
  if (!value) return "Unavailable";
  const match = String(value).match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  return match ? [match[1] && `${match[1]}h`, match[2] && `${match[2]}m`, match[3] && `${match[3]}s`].filter(Boolean).join(" ") : "Unavailable";
}
function videoCards(records, index, thumbnails = false) {
  return `<div class="${thumbnails ? "thumbnail-grid" : "video-list"}">${records.map((video) => `<article class="video-card">
    <button class="video-preview" data-action="open-url" data-url="${esc(safeUrl(video.url))}" aria-label="Open ${esc(video.title)} on YouTube">${safeUrl(video.thumbnail) ? `<img src="${esc(safeUrl(video.thumbnail))}" loading="lazy" alt="Thumbnail for ${esc(video.title)}" onerror="this.closest('button').classList.add('image-failed')">` : '<span class="thumbnail-missing">Thumbnail unavailable</span>'}</button>
    <div class="video-info"><h3>${esc(video.title || "Untitled video")}</h3><p>${esc(video.channelName || "Channel unavailable")} · ${date(video.publishedAt)}</p><p>${fmt(video.views)} views${video.likes == null ? " · likes unavailable" : ` · ${fmt(video.likes)} likes`}</p>
    <div class="action-row"><button class="small-button" data-action="toggle-video" data-id="${esc(video.id)}" data-turn="${index}">${selectedVideos.has(video.id) ? "Selected" : "Compare"}</button><button class="small-button" data-action="save-video" data-id="${esc(video.id)}" data-turn="${index}">Save reference</button><button class="small-button" data-action="open-url" data-url="${esc(safeUrl(video.url))}">Source ↗</button></div></div></article>`).join("")}</div>`;
}
function comparisonHtml(records) {
  if (records.length < 2) return "";
  return `<div class="comparison-wrap"><table class="comparison-table"><thead><tr><th>Video</th><th>Published</th><th>Duration</th><th>Views</th><th>Likes</th><th>Comments</th></tr></thead><tbody>${records.map((video) => `<tr><th><button class="text-button" data-action="open-url" data-url="${esc(safeUrl(video.url))}">${esc(shortText(video.title, 55))}</button></th><td>${esc(date(video.publishedAt))}</td><td>${esc(duration(video.duration))}</td><td>${esc(fmt(video.views))}</td><td>${esc(fmt(video.likes))}</td><td>${esc(fmt(video.comments))}</td></tr>`).join("")}</tbody></table></div><p class="data-note">Public lifetime counts; they do not show CTR, retention, first-day performance, or revenue. Retrieved ${date(records[0]?.refreshedAt)}.</p>`;
}
function videoResult(turn, index) {
  const records = turn.records || [];
  const selected = records.filter((video) => selectedVideos.has(video.id));
  const isThumb = /thumbnail/i.test(turn.query);
  const intro = records.length ? `${records.length} public YouTube videos${isThumb ? " with available thumbnail previews" : ""} for “${turn.searchPhrase || turn.query}”.` : "No public YouTube videos matched this research query.";
  return `<div class="turn" data-turn="${index}"><div class="user-bubble">${esc(turn.query)}</div><div class="assistant-response"><div class="assistant-heading">${icons.compass}<span>Creator Scout</span></div>${turn.loading ? '<p class="assistant-copy loading-dots">Researching YouTube</p>' : turn.error ? `<p class="inline-notice error">${esc(turn.error)}</p>` : `<p class="assistant-copy">${esc(intro)}</p>${videoCards(records, index, isThumb)}${selected.length >= 2 ? `<h3 class="section-subtitle">Selected comparison</h3>${comparisonHtml(selected)}` : '<p class="data-note">Select two or more videos to compare public fields.</p>'}<p class="data-note">Source: YouTube Data API v3 · retrieved ${date(turn.retrievedAt)}</p>`}</div></div>`;
}
function contactFor(record) {
  const manual = state?.saved?.[record?.id]?.contact;
  return (manual?.value ? manual : null) || record?.bestContact ||
    (record?.contacts?.email?.value ? { ...record.contacts.email, type: "public_email" } : null);
}
function contactKind(contact) {
  return contact?.type === "contact_form" ? "Form" : contact?.type === "contact page" ? "Page" : "Email";
}
function contactStatus(record) {
  if (contactFor(record)?.value) return { tone: "green", label: "Contact ready" };
  if (record?.contactResearch?.status === "researching") return { tone: "blue", label: "Researching" };
  if (record?.qualification?.status === "needs-verification") return { tone: "amber", label: "Needs verification" };
  return { tone: "grey", label: "No public contact found" };
}
function statusChip(tone, label) {
  return `<span class="status-pill ${tone}"><i aria-hidden="true"></i>${esc(label)}</span>`;
}
function avatar(record, cls = "creator-avatar") {
  return safeUrl(record.image)
    ? `<img class="${cls}" src="${esc(safeUrl(record.image))}" alt="" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="${cls} avatar-fallback" hidden aria-hidden="true">${esc((record.name || "C").slice(0, 1))}</span>`
    : `<span class="${cls} avatar-fallback" aria-hidden="true">${esc((record.name || "C").slice(0, 1))}</span>`;
}
function resultRows(records, turnIndex) {
  return records.map((record) => {
    const contact = contactFor(record), status = contactStatus(record);
    const video = record.matchedVideo || record.recentVideos?.[0];
    return `<article class="creator-row">
      <div class="creator-identity">${avatar(record)}<div class="creator-main"><h3><button class="creator-title" data-action="detail" data-id="${esc(record.id)}">${esc(record.name)}</button></h3><p class="creator-meta">${["approximate", "rounded-down"].includes(record.subscribersStatus) ? "≈" : ""}${fmt(record.subscribers)} subscribers</p></div><button class="bookmark-button ${saved(record.id) ? "saved" : ""}" data-action="save" data-id="${esc(record.id)}" aria-label="${saved(record.id) ? "Saved creator" : "Save creator"}" title="Save creator">${icons.bookmark}</button></div>
      <p class="creator-description">${esc(shortText(record.matchReason || record.description || record.handle || "Public YouTube channel", 120))}</p>
      ${video ? `<button class="matching-video" data-action="open-url" data-url="${esc(safeUrl(video.url))}"><span class="youtube-icon">${icons.youtube}</span><span>${esc(shortText(video.title, 60))}<small>${fmt(video.views)} ${record.matchedVideo ? "qualifying" : "public"} views${video.publishedAt ? ` · ${new Date(video.publishedAt).toLocaleDateString()}` : ""}</small></span><span>↗</span></button>` : ""}
      <div class="contact-summary">${statusChip(status.tone, status.label)}${contact?.value ? `<p class="contact-value">${esc(contact.value)}</p><span class="data-note">${safeUrl(contact.sourceUrl) ? '<button class="text-button" data-action="open-url" data-url="' + esc(safeUrl(contact.sourceUrl)) + '">Source-backed ↗</button> · ' : ""}Ownership unverified</span>` : record.contacts?.website?.url ? `<button class="text-button" data-action="open-url" data-url="${esc(safeUrl(record.contacts.website.url))}">Creator website ↗</button>` : ""}</div>
      <div class="card-actions"><button class="small-button" data-action="detail" data-id="${esc(record.id)}">View profile</button><button class="small-button ${contact?.value ? "contact-button" : ""}" data-action="${contact?.value ? "open-outreach" : "detail"}" data-id="${esc(record.id)}">${contact?.value ? "Contact →" : "Research contact →"}</button></div>
    </article>`;
  }).join("");
}

function progressHtml(p, turn = {}) {
  if (!p && !turn.loading) return "";
  p ||= {};
  const metric = (value) => value == null ? "—" : esc(fmt(value));
  return `<section class="discovery-panel ${turn.loading ? "is-active" : "is-complete"}" aria-label="Search progress">
    <div class="feature-heading"><span><i class="activity-dot"></i>${turn.loading ? "DISCOVERY IN PROGRESS" : turn.cancelled ? "SEARCH STOPPED" : "SEARCH COMPLETE"}</span>${turn.elapsedMs != null ? `<span>${(turn.elapsedMs / 1000).toFixed(1)} sec</span>` : '<span>YOUTUBE</span>'}</div>
    <div class="discovery-ring ${turn.loading ? "is-active" : ""}" aria-hidden="true"><span><strong>${metric(p.channelsDiscovered)}</strong><small>creators discovered</small></span></div>
    <div class="progress-metrics"><div><strong>${metric(p.videosChecked)}</strong><span>videos checked</span></div><div><strong>${metric(p.qualified)}</strong><span>qualified</span></div><div><strong>${metric(p.contactable)}</strong><span>contact-ready</span></div></div>
    ${turn.loading ? '<p class="feature-note">Finding the right fit. Researching public contacts.</p>' : `<button class="feature-link" data-action="view-results" data-index="${turns.indexOf(turn)}">View creators ↓</button>`}
    </section><details class="diagnostics"><summary>View search details</summary><p>${esc(turn.coverage || "Public YouTube research")}</p><div class="scout-progress"><span>Search calls ${metric(p.searchCalls)}</span><span>Public emails ${metric(p.emailsFound)}</span><span>Forms ${metric(p.formsFound)}</span><span>Website pages ${metric(p.websitePages)}</span>${p.activeContactTasks ? `<span>Active contact checks ${esc(p.activeContactTasks)}</span>` : ""}${p.channelFirstError ? `<span>${esc(p.channelFirstError)}</span>` : ""}${p.aiCalls ? `<span>AI calls ${esc(p.aiCalls)} · estimated $${Number(p.aiEstimatedUsd || 0).toFixed(4)}</span>` : ""}</div></details>`;
}

function assistantResult(turn, index) {
  const all = turn.records || [];
  const records =
    sizeFilter === "small" && index === turns.length - 1
      ? all.filter(
          (record) => record.subscribers != null && record.subscribers < 10000,
        )
      : all;
  const visible = turn.showAll ? records : records.slice(0, 3);
  const introduction = !all.length
    ? "No public YouTube channels matched this search. Try a narrower topic or a creator name."
    : sizeFilter === "small" && index === turns.length - 1
      ? `${records.length} smaller channels matched your search.`
      : turn.searchPhrase
        ? `${all.length} YouTube channels matched this page’s search for “${turn.searchPhrase}.”`
        : `${all.length} YouTube channels matched your search.`;
  let body = "";
  if (turn.loading) {
    body = `<p class="activity-line"><span class="activity-dot"></span>${turn.progress?.activeContactTasks ? "Researching public creator contacts…" : "Discovering creators on YouTube…"}</p>`;
    body += progressHtml(turn.progress, turn);
    if (turn.requestId) body += `<button class="chip" data-action="cancel-search" data-index="${index}">Stop search</button>`;
    if (records.length) body += `<div class="creator-list">${resultRows(visible, index)}</div>`;
  }
  else if (turn.error)
    body = `<section class="calm-error"><span class="empty-icon">↻</span><h3>I couldn’t complete that search.</h3><p>The discovery provider could not finish this request.</p><div class="action-row"><button class="small-button primary-button" data-action="retry" data-index="${index}">Try again</button>${!state?.connected ? '<button class="small-button" data-action="go-settings">Check connection</button>' : ""}</div><details class="diagnostics"><summary>View details</summary><p>${esc(turn.error)}</p></details></section>`;
  else {
    const filters = turn.plan?.filters || {};
    const chips = turn.plan?.topic ? `<div class="filter-chips"><span>${esc(turn.plan.topic)}</span>${filters.minSubscribers ? `<span>≥ ${esc(fmt(filters.minSubscribers))} subscribers</span>` : ""}${filters.maxSubscribers ? `<span>≤ ${esc(fmt(filters.maxSubscribers))} subscribers</span>` : ""}${filters.publishedAfter ? '<span>Recent qualifying video</span>' : ""}${filters.minVideoViews ? `<span>Video views ≥ ${esc(fmt(filters.minVideoViews))}</span>` : ""}${filters.requireContact ? `<span>${filters.contactMode === "email" ? "Business email required" : "Public contact required"}</span>` : ""}</div>` : "";
    body = `${chips}${progressHtml(turn.progress, turn)}<p class="assistant-copy">${esc(introduction)}</p>`;
    if (records.length)
      body += `<div class="creator-list">${resultRows(visible, index)}</div>`;
    if (records.length > 3 && !turn.showAll)
      body += `<button class="chip" data-action="show-all" data-index="${index}">Show all ${records.length} creators</button>`;
    if (all.length) {
      body += `<div class="response-toolbar"><button class="source-pill" data-action="sources" data-index="${index}">${all.length} ${all.length === 1 ? "source" : "sources"}</button><span class="spacer"></span><button class="quiet-button" data-action="copy" data-index="${index}" title="Copy channel links" aria-label="Copy channel links">${icons.copy}</button><button class="quiet-button" data-action="like" title="Helpful" aria-label="Helpful">${icons.like}</button><button class="quiet-button" data-action="retry" data-index="${index}" title="Run search again" aria-label="Run search again">${icons.refresh}</button><button class="quiet-button" data-action="menu" title="More options" aria-label="More options">${icons.more}</button></div>`;
      if (turn.sourcesOpen)
        body += `<div class="source-details">${all.map((record) => `<p><a href="#" data-action="open-url" data-url="${esc(safeUrl(record.url))}">${esc(record.name)}</a> · ${esc(record.source)} · refreshed ${date(record.refreshedAt)}</p>`).join("")}</div>`;
      body += `<div class="followups"><button class="chip" data-action="smaller">Find smaller channels</button><button class="chip" data-action="save-turn" data-index="${index}">Save these creators</button></div>`;
    }
  }
  return `<div class="turn" data-turn="${index}"><div class="search-heading"><span class="eyebrow">${turn.loading ? "DISCOVERING" : "YOUR SEARCH"}</span><h2>${esc(turn.loading && turn.plan?.topic ? `Finding ${turn.plan.topic} creators` : turn.query)}</h2></div><div class="assistant-response">${body}</div></div>`;
}
function chatHtml() {
  if (!turns.length)
    return `<section class="scout-home"><div class="home-eyebrow"><span></span> A LITTLE SCOUTING. A BIG CONNECTION.</div><div class="home-title"><h1>Find creators<br>worth <span>contacting.</span></h1><div class="discovery-orb" aria-hidden="true"><div class="orb-ring"></div><div class="orb-ring orb-ring-two"></div><div class="orb-core">✦</div></div></div><p class="hero-copy">Discover your niche. Find public business contacts.<br>Start a conversation that matters.</p><div id="home-search"></div><div class="platform-label"><span>START WITH A PLATFORM</span><span>01 / 03</span></div><div class="platform-carousel" aria-label="Available platforms"><div class="platform-card active"><span class="platform-mark youtube-mark">${icons.youtube}</span><strong>YouTube</strong><small><i></i> Available</small></div><div class="platform-card"><span class="platform-mark tiktok-mark">♪</span><strong>TikTok</strong><small>Coming soon</small></div><div class="platform-card"><span class="platform-mark instagram-mark">◎</span><strong>Instagram</strong><small>Coming soon</small></div></div><div class="home-footnote"><span>Discover → Qualify → Connect</span><span>Built into RightTab ↗</span></div>${!state?.connected ? '<button class="setup-link" data-action="go-settings">Connect YouTube to verify subscriber & video filters ↗</button>' : ""}${alertHtml()}</section>`;
  return `<div class="conversation">${turns.map((turn, index) => turn.type === "video" ? videoResult(turn, index) : assistantResult(turn, index)).join("")}${alertHtml()}</div>`;
}

function detailHtml() {
  const r = detailRecord;
  if (!r) return emptyHtml("No creator selected.", "Discover someone worth reaching out to.");
  const contact = contactFor(r), status = contactStatus(r);
  const qualified = r.qualification?.status === "qualified";
  const video = r.matchedVideo;
  const sourceRows = [...(r.links || [])];
  if (contact?.sourceUrl && !sourceRows.some(x => x.url === contact.sourceUrl)) sourceRows.unshift({url: contact.sourceUrl, source: "Public contact source"});
  return `<div class="view-heading"><span class="eyebrow">CREATOR PROFILE</span><button class="text-button" data-action="go-back">← Back</button></div>${alertHtml()}<section class="profile-hero panel-card"><div class="detail-heading">${avatar(r, "detail-avatar")}<div><span class="platform-tag">YOUTUBE CREATOR</span><h2>${esc(r.name)}</h2><p class="muted">${esc(r.handle || "YouTube channel")}</p></div></div><div class="stats-grid"><div class="stat"><strong>${fmt(r.subscribers)}</strong><span>subscribers</span></div><div class="stat"><strong>${fmt(video?.views ?? r.views)}</strong><span>${video ? "qualifying video views" : "channel views"}</span></div><div class="stat"><strong>${fmt(r.videoCount)}</strong><span>videos</span></div></div><div class="action-row"><button class="small-button" data-action="open-url" data-url="${esc(safeUrl(r.url))}">View channel ↗</button><button class="small-button" data-action="save" data-id="${esc(r.id)}">${saved(r.id) ? "✓ Saved" : "Save creator"}</button><button class="small-button" data-action="add-note" data-id="${esc(r.id)}">Add note</button></div></section>
    <div class="profile-grid"><section class="panel-card best-contact"><div class="section-heading"><h3>Best business contact</h3>${statusChip(status.tone, status.label)}</div>${contact?.value ? `<p class="best-contact-value">${esc(contact.value)}</p><p class="data-note">${contactKind(contact) === "Form" ? "Creator-linked contact form" : contactKind(contact) === "Page" ? "Creator-provided contact page" : "Public email"}${contact.selectedBy === "deepseek" ? " · ✦ AI-ranked" : ""}</p>${safeUrl(contact.sourceUrl) ? `<button class="source-link" data-action="open-url" data-url="${esc(safeUrl(contact.sourceUrl))}">Source-backed · ${esc(new URL(safeUrl(contact.sourceUrl)).hostname)} ↗</button>` : ""}<p class="data-note">Ownership and deliverability unverified.</p><button class="small-button contact-button" data-action="open-outreach" data-id="${esc(r.id)}">Prepare outreach →</button>` : `<p>Research the creator’s public links to find a way to connect.</p><button class="small-button primary-button" data-action="research-contact" data-id="${esc(r.id)}">Research contact →</button>`}</section>
    <section class="panel-card"><div class="section-heading"><h3>Qualification</h3>${statusChip(qualified ? "green" : "amber", qualified ? "Qualified" : "Needs verification")}</div><div class="qualification-row"><span>Subscriber count</span><strong>${r.subscribers == null ? "Unavailable" : `${fmt(r.subscribers)}${qualified ? " ✓" : " · check"}`}</strong></div><div class="qualification-row"><span>Qualifying video</span><strong>${video ? "Found ✓" : "Not verified"}</strong></div>${video ? `<div class="qualification-row"><span>Published</span><strong>${esc(new Date(video.publishedAt).toLocaleDateString())}</strong></div><div class="qualification-row"><span>Public views</span><strong>${fmt(video.views)}</strong></div>` : ""}<p class="data-note">${esc(r.matchReason || "Inspect this creator to check current public channel metadata.")}</p><button class="small-button" data-action="inspect" data-id="${esc(r.id)}">Refresh profile</button></section></div>
    <details class="panel-card"><summary>About this creator</summary><p class="detail-description">${esc(r.description || "No public channel description.")}</p><p class="data-note">${esc(r.source || "YouTube")} · refreshed ${date(r.refreshedAt)}${r.country ? ` · ${esc(r.country)}` : ""}</p></details>
    <section class="panel-card"><h3>Sources & public links</h3>${sourceRows.length ? `<ul class="list-plain">${sourceRows.map(link => `<li><button class="source-link" data-action="open-url" data-url="${esc(safeUrl(link.url))}">${esc(link.url)} ↗</button><small>${esc(link.source || "Creator-provided link")}</small></li>`).join("")}</ul>` : '<p class="data-note">No creator-provided links returned.</p>'}<div class="action-row"><button class="small-button" data-action="research-contact" data-id="${esc(r.id)}">Research linked website</button><button class="small-button" data-action="inspect-site" data-id="${esc(r.id)}">Inspect opened creator site</button><button class="small-button" data-action="manual-contact" data-id="${esc(r.id)}">Add contact manually</button></div><button class="text-button setup-link" data-action="open-url" data-url="${esc(safeUrl(r.url + '/about'))}">Open YouTube contact details ↗</button></section>
    <details class="panel-card"><summary>Recent public videos</summary>${r.recentVideos?.length ? `<ul class="list-plain">${r.recentVideos.map(v => `<li><button class="source-link" data-action="open-url" data-url="${esc(safeUrl(v.url))}">${esc(v.title)} ↗</button><small>${esc(v.publishedAt ? date(v.publishedAt) : (v.publishedText || "Date unknown"))} · ${fmt(v.views)} views</small></li>`).join("")}</ul>` : '<p>Refresh the profile to fetch recent uploads.</p>'}</details>`;
}
function emptyHtml(title, copy, action = "go-chat", label = "Start a search") {
  return `<section class="empty-state"><span class="empty-icon" aria-hidden="true">✦</span><h2>${esc(title)}</h2><p>${esc(copy)}</p><button class="small-button primary-button" data-action="${action}">${esc(label)} →</button></section>`;
}
function stageFor(item) {
  if (item.outreach === "contacted elsewhere") return { tone: "orange", label: "Contacted" };
  if (item.outreach === "interested") return { tone: "green", label: "Interested" };
  if (item.outreach === "not a fit") return { tone: "grey", label: "Not a fit" };
  if (item.draft) return { tone: "violet", label: "Draft" };
  if (item.outreach === "researching") return { tone: "blue", label: "Researching" };
  return { tone: "grey", label: "Saved" };
}
function outreachHtml() {
  const items = Object.values(state?.saved || {});
  const draft = state?.saved?.[detailRecord?.id]?.draft;
  if (!draft) return `<div class="view-heading"><div><span class="eyebrow">FROM DISCOVERY TO CONVERSATION</span><h2 class="section-title">Outreach</h2></div></div>${alertHtml()}${items.length ? `<p class="view-copy">Pick a creator. Make the first move.</p><div class="outreach-list">${items.map(item => `<button class="outreach-recipient" data-action="open-outreach" data-id="${esc(item.record.id)}">${avatar(item.record)}<span><strong>${esc(item.record.name)}</strong><small>${esc(item.draft?.subject || contactFor(item.record)?.value || "Prepare a local draft")}</small></span><span>${item.draft ? "Edit" : "Draft"} →</span></button>`).join("")}</div>` : emptyHtml("Your next conversation starts here.", "Save a creator, then prepare a personal introduction.")}`;
  const r = detailRecord, contact = contactFor(r);
  return `<div class="view-heading"><div><span class="eyebrow">MAKE A GOOD FIRST IMPRESSION</span><h2 class="section-title">Outreach</h2></div><button class="text-button" data-action="outreach-list">All drafts ↗</button></div>${alertHtml()}<div class="recipient-heading">${avatar(r)}<div><h3>${esc(r.name)}</h3><p>${esc(draft.to || contact?.value || "Add a recipient below")}</p>${safeUrl(contact?.sourceUrl) ? `<button class="text-button" data-action="open-url" data-url="${esc(safeUrl(contact.sourceUrl))}">Source-backed ↗</button>` : ""}</div></div><form id="draft-form" class="outreach-editor"><label class="field">To<input id="draft-to" value="${esc(draft.to)}" maxlength="300" placeholder="Recipient email"></label><label class="field">Subject<input id="draft-subject" value="${esc(draft.subject)}" maxlength="200" required></label><label class="field message-field">Message<textarea id="draft-body" rows="12" maxlength="5000" required>${esc(draft.body)}</textarea></label><div class="editor-actions"><button class="small-button primary-button" type="submit">Save draft</button><button class="small-button" type="button" data-action="copy-draft" data-id="${esc(r.id)}">Copy saved draft</button><button class="text-button" type="button" data-action="prepare-draft" data-id="${esc(r.id)}">Reset template</button></div><p class="data-note">Saved locally · ${date(draft.updatedAt)}<br>Review before reaching out. No message is sent.</p></form>`;
}

function savedHtml() {
  const savedRecords = Object.entries(state?.saved || {});
  const videoReferences = Object.values(state?.videoReferences || {});
  const ready = savedRecords.filter(([,item]) => contactFor(item.record)?.value).length;
  const drafts = savedRecords.filter(([,item]) => item.draft).length;
  return `<div class="view-heading"><div><span class="eyebrow">YOUR CREATOR NETWORK</span><h2 class="section-title">Saved creators</h2></div><span class="outline-label">LOCAL CRM</span></div><p class="view-copy">Good discoveries deserve a follow-up.</p>${alertHtml()}<div class="crm-stats"><div><strong>${savedRecords.length}</strong><span>saved</span></div><div><strong>${ready}</strong><span>contact-ready</span></div><div><strong>${drafts}</strong><span>drafts</span></div></div>
    ${savedRecords.length ? `<div class="crm-table-head"><span>Creator</span><span>Contact</span><span>Stage</span></div><div class="crm-list">${savedRecords.map(([id,item]) => {
      const c = contactFor(item.record), stage = stageFor(item);
      return `<article class="crm-card"><div class="crm-overview"><button class="crm-creator" data-action="detail" data-id="${esc(id)}">${avatar(item.record)}<span><strong>${esc(item.record.name)}</strong><small>${fmt(item.record.subscribers)} subscribers</small></span></button><div class="crm-contact">${statusChip(c?.value ? "green" : "grey", c?.value ? contactKind(c) : "No contact")}<small>${esc(c?.value || "Research needed")}</small></div><div class="crm-stage">${statusChip(stage.tone,stage.label)}</div></div><div class="crm-actions"><label class="checkbox"><input type="checkbox" data-export-id="${esc(id)}" ${exportIds.has(id) ? "checked" : ""}>Export</label><button class="text-button" data-action="open-outreach" data-id="${esc(id)}">${item.draft ? "Edit draft" : "Prepare outreach"} →</button></div><details class="crm-edit"><summary>Notes, project & status</summary><label class="field">Project<select data-save-field="listId" data-id="${esc(id)}"><option value="">No list</option>${(state.lists || []).map(list => `<option value="${esc(list.id)}" ${item.listId === list.id ? "selected" : ""}>${esc(list.name)}</option>`).join("")}</select></label><label class="field">Tags<input data-save-field="tags" data-id="${esc(id)}" value="${esc(item.tags || "")}"></label><label class="field">Notes<textarea data-save-field="notes" data-id="${esc(id)}">${esc(item.notes || "")}</textarea></label><label class="field">Outreach status<select data-save-field="outreach" data-id="${esc(id)}">${["not contacted", "researching", "contacted elsewhere", "interested", "not a fit"].map(status => `<option ${item.outreach === status ? "selected" : ""}>${status}</option>`).join("")}</select></label><p class="data-note">Added ${date(item.addedAt)}</p><button class="small-button danger" data-action="remove" data-id="${esc(id)}">Delete creator</button></details></article>`;
    }).join("")}</div>` : emptyHtml("No saved creators yet.", "Find a creator worth reaching out to.")}
    <details class="panel-card secondary-section"><summary>Projects & inspiration boards</summary><form id="list-form" class="form-row"><input id="list-name" aria-label="New project list" placeholder="New project list" maxlength="80" required><button class="small-button" type="submit">Create</button></form><form id="board-form" class="form-row"><input id="board-name" aria-label="New inspiration board" placeholder="New inspiration board" maxlength="80" required><button class="small-button" type="submit">Create</button></form><ul class="list-plain">${(state?.lists || []).map(list => `<li class="form-row"><span>${esc(list.name)}</span><button class="text-button danger" data-action="delete-list" data-id="${esc(list.id)}">Delete</button></li>`).join("")}</ul><h3 class="section-subtitle">Saved video references (${videoReferences.length})</h3>${videoReferences.length ? videoReferences.map((item) => `<article class="video-card saved-video"><button class="video-preview" data-action="open-url" data-url="${esc(safeUrl(item.record.url))}">${safeUrl(item.record.thumbnail) ? `<img src="${esc(safeUrl(item.record.thumbnail))}" loading="lazy" alt="">` : '<span class="thumbnail-missing">Thumbnail unavailable</span>'}</button><div class="video-info"><h3>${esc(item.record.title)}</h3><p>${esc(item.record.channelName)} · ${date(item.record.publishedAt)}</p><p class="data-note">${esc((state.boards || []).find((board) => board.id === item.boardId)?.name || "Unfiled")} · saved ${date(item.addedAt)}</p><button class="small-button danger" data-action="remove-video-reference" data-id="${esc(item.record.id)}">Remove</button></div></article>`).join("") : '<p class="data-note">Save a video or thumbnail reference from research results.</p>'}
    </details>
    <details class="panel-card secondary-section"><summary>Export & manage data</summary><h3 class="section-subtitle">CSV export</h3><div class="panel-card"><details><summary>Choose fields</summary><div class="field">${exportFields.map((field) => `<label class="checkbox"><input type="checkbox" data-export-field="${esc(field)}" ${exportColumns.has(field) ? "checked" : ""}>${esc(field)}</label>`).join("")}</div></details><div class="action-row"><button class="small-button" data-action="preview-export">Preview CSV</button>${csvPreview ? '<button class="small-button" data-action="export-csv">Save CSV</button>' : ""}</div>${csvPreview ? `<textarea class="preview-area" readonly aria-label="CSV preview">${esc(csvPreview)}</textarea>` : ""}</div><button class="small-button danger" data-action="clear">Delete all saved research</button></details>`;
}
function settingsHtml() {
  return `<span class="eyebrow">MAKE SCOUT YOURS</span><h2 class="section-title">Settings</h2><p class="view-copy">Connections, assistance, and your local workspace.</p><section class="panel-card"><h3>Search defaults</h3><label class="field">Default depth<select id="default-depth"><option value="10" ${queryLimit === 10 ? "selected" : ""}>Quick</option><option value="25" ${queryLimit === 25 ? "selected" : ""}>Standard</option><option value="50" ${queryLimit === 50 ? "selected" : ""}>Deep</option></select></label><label class="field">Contact requirement<select id="default-contact"><option value="auto">Auto contact</option><option value="email">Business email</option><option value="any">Any public contact</option></select></label></section>${alertHtml()}<div class="panel-card"><div class="section-heading"><h3>YouTube connection</h3>${statusChip(state?.connected ? "green" : "grey", state?.connected ? "Connected" : "API disconnected")}</div><p>${state?.connected ? "API key configured on this device." : "Public discovery works without a key. Add a YouTube Data API v3 key to verify strict filters."}</p><details class="connection-details"><summary>${state?.connected ? "Manage API key" : "Connect API key"}</summary><form id="key-form"><label class="field">API key<input id="api-key" type="password" autocomplete="off" placeholder="YouTube Data API key"></label><div class="action-row"><button class="small-button" type="submit">Save key securely</button><button class="small-button danger" type="button" data-action="remove-key">Remove key</button></div></form></details><p>The key is encrypted with OS storage and used only by the RightTab main process.</p></div>
    <div class="panel-card"><div class="section-heading"><h3>✦ OpenRouter</h3>${statusChip(state?.openrouter?.enabled ? "green" : "grey", state?.openrouter?.enabled ? "Enabled" : "Disabled")}</div><p>DeepSeek V4.1 Flash · contact ranking</p><p>${state?.openrouter?.enabled ? "Enabled for ambiguous contact pages." : "Disabled; no OpenRouter model calls will run."}</p><details class="connection-details"><summary>Configure assistance</summary><form id="openrouter-form"><label class="field">OpenRouter API key<input id="openrouter-key" type="password" autocomplete="off" placeholder="${state?.openrouter?.configured ? "Key saved; leave blank to keep" : "OpenRouter API key"}"></label><label class="checkbox"><input id="openrouter-enabled" type="checkbox" ${state?.openrouter?.enabled ? "checked" : ""}> Enable paid OpenRouter assistance</label><p>Up to three calls and $0.01 estimated per search. Page excerpts and public email candidates are sent to OpenRouter and its model provider. OpenRouter takes priority if both AI providers are enabled. Model prices can change.</p><div class="action-row"><button class="small-button" type="submit">Save OpenRouter settings</button><button class="small-button danger" type="button" data-action="remove-openrouter">Remove key</button></div></form></details></div>
    <div class="panel-card"><div class="section-heading"><h3>✦ Direct DeepSeek</h3>${statusChip(state?.deepseek?.enabled ? "green" : "grey", state?.deepseek?.enabled ? "Enabled" : "Disabled")}</div><p>${state?.deepseek?.enabled ? "Enabled for ambiguous public contact pages during searches and manual research." : "Disabled; deterministic research remains available."}</p><details class="connection-details"><summary>Configure assistance</summary><form id="deepseek-form"><label class="field">DeepSeek API key<input id="deepseek-key" type="password" autocomplete="off" placeholder="${state?.deepseek?.configured ? "Key saved; leave blank to keep" : "DeepSeek API key"}"></label><label class="checkbox"><input id="deepseek-enabled" type="checkbox" ${state?.deepseek?.enabled ? "checked" : ""}> Enable paid assistance</label><p>When multiple public emails are found during searches or manual research, a short page excerpt and candidates are sent to DeepSeek. Maximum 3 calls and $0.01 estimated per search. Prices can change, so this estimate is not a billing guarantee.</p><p>Model: deepseek-flash · peak estimate as of 2026-11-09: $0.30/M input and $1.20/M output tokens.</p><div class="action-row"><button class="small-button" type="submit">Save AI settings</button><button class="small-button danger" type="button" data-action="remove-deepseek">Remove key</button></div></form></details></div>
    <div class="panel-card"><strong>Lookup usage</strong><p>${state?.used || 0} / ${state?.limit || 750} full creator lookups this month · ${state?.remaining ?? 750} left.</p><p>${state?.searchCallsToday || 0} / ${state?.dailySearchLimit || 80} search calls used today. Repeated queries and inspections are cached for 24 hours.</p><p>One lookup is one uncached full channel inspection. Search cards do not use monthly profile lookups. The limit is a hard stop; overages are off.</p></div>
    <h3 class="section-subtitle">Platform availability</h3>${Object.entries(
      state?.platforms || {},
    )
      .map(
        ([name, platform]) =>
          `<details class="panel-card"><summary>${esc(name)} · ${name === "youtube" ? "Available" : "Coming soon"}</summary><p>${esc(platform.source)} · ${platform.live ? "Live API response received" : name === "youtube" ? "Ready for a live test" : "Not connected"}</p><p>${esc(platform.auth)}</p><p>Available: ${esc(platform.fields.join(", ") || "None")}</p><p>Unavailable: ${esc(platform.unavailable.join(", "))}</p></details>`,
      )
      .join("")}`;
}
function historyHtml() {
  return `<h2 class="section-title">Recent searches</h2>${alertHtml()}<ul class="list-plain">${(state?.recentQueries || []).length ? state.recentQueries.map((entry) => `<li><button class="text-button" data-action="history-search" data-query="${esc(entry.query)}">${esc(entry.query)}</button><br><small>${date(entry.at)} · cached for 24 hours</small></li>`).join("") : '<li class="data-note">No recent searches on this device.</li>'}</ul>`;
}
function textsHtml() {
  if (!textTurns.length) return `<div class="empty-state text-empty"><span class="empty-icon">✦</span><h2>Ask your texts</h2><p>Searches run against the local Ask My Texts index on this Mac. Nothing is sent to a website.</p></div>`;
  return `<div class="conversation text-conversation">${textTurns.map((turn) => `<div class="turn"><div class="user-bubble">${esc(turn.query)}</div><div class="assistant-response"><div class="assistant-heading"><span class="text-spark">✦</span><span>Ask My Texts</span></div>${turn.loading ? '<p class="assistant-copy loading-dots">Searching your local index</p>' : turn.error ? `<p class="inline-notice error">${esc(turn.error)}</p>` : `<pre class="text-result">${esc(turn.result || 'No result returned.')}</pre>`}</div></div>`).join("")}</div>`;
}
function render() {
  const texts = activeMode === "texts";
  // Keep the live form and its listeners when moving it into/out of the home hero.
  const bottomArea = $("bottom-area");
  if ($("content").contains(bottomArea)) $("scout-app").insertBefore(bottomArea, $("primary-nav"));
  const home = !texts && view === "chat" && !turns.length;
  document.documentElement.dataset.mode = activeMode;
  document.documentElement.dataset.view = texts ? "texts" : home ? "home" : view;
  document.querySelectorAll(".mode-tab").forEach((tab) => tab.setAttribute("aria-selected", String(tab.dataset.mode === activeMode)));
  $("history-button").innerHTML = view === "chat" ? icons.history : icons.back;
  $("history-button").setAttribute(
    "aria-label",
    view === "chat" ? "Search history" : "Back to conversation",
  );
  $("history-button").hidden = texts;
  $("new-chat-button").innerHTML = icons.compose;
  $("new-chat-button").title = texts ? "New text search" : "New search";
  $("new-chat-button").setAttribute("aria-label", texts ? "New text search" : "New search");
  $("attach-button").innerHTML = `${icons.page}<span>This page</span>`;
  $("send-button").innerHTML = `<span>${texts ? "Search texts" : "Search creators"}</span>${icons.send}`;
  const strip = $("page-strip");
  strip.classList.toggle("has-page", !texts && !!context);
  strip.innerHTML = !texts && context
    ? `<div class="page-row"><span class="youtube-icon">${context.kind ? icons.youtube : icons.page}</span><span class="page-divider"></span><span class="page-title"><span class="muted">${context.kind ? "YouTube" : "This page"}</span> · ${esc(context.kind === "search" ? `Search: ${context.query}` : (context.title || context.url || "Selected tab"))}</span><button type="button" data-action="detach-page" aria-label="Detach page">×</button></div>`
    : "";
  $("bottom-area").hidden = texts ? false : view !== "chat";
  $("attach-button").hidden = texts;
  $("limit").closest(".quick-control").hidden = texts;
  $("contact-mode").closest(".quick-control").hidden = texts;
  $("depth-controls").closest(".depth-row").hidden = texts;
  $("limit").value = String(queryLimit);
  $("depth-controls").querySelectorAll("button").forEach(button => button.setAttribute("aria-pressed", String(Number(button.dataset.depth) === queryLimit)));
  $("more-button").hidden = texts;
  $("ask-input").placeholder = texts ? "Ask about your indexed texts..." : "Find creators in any niche...";
  $("send-button").setAttribute("aria-label", texts ? "Search texts" : "Search creators");
  $("send-button").title = texts ? "Search texts" : "Search creators";
  $("bottom-area").querySelector(".footer-note").textContent = texts ? "Searches stay on this Mac." : "Check creator details before reaching out.";
  const content = $("content");
  const nextView = texts ? "texts" : home ? "home" : view;
  const previousScroll = renderedView === nextView ? content.scrollTop : 0;
  content.innerHTML =
    texts
      ? textsHtml()
      : view === "chat"
      ? chatHtml()
      : view === "detail"
        ? detailHtml()
        : view === "saved"
          ? savedHtml()
          : view === "outreach"
            ? outreachHtml()
          : view === "settings"
            ? settingsHtml()
            : historyHtml();
  if (home) $("home-search").appendChild(bottomArea);
  if ($("default-contact")) $("default-contact").value = $("contact-mode").value;
  content.scrollTop = previousScroll;
  renderedView = nextView;
  $("primary-nav").hidden = false;
  $("saved-count").textContent = Object.keys(state?.saved || {}).length || "";
  $("primary-nav").querySelectorAll("button").forEach(button => button.setAttribute("aria-current", button.dataset.action === `go-${view === "detail" ? returnView : view}` ? "page" : "false"));
  $("menu").hidden = !menuOpen;
  $("menu").innerHTML = menuOpen
    ? `<button data-action="go-chat">Search</button><button data-action="inspect-page">${context?.kind === "search" ? "Scout this YouTube search" : `Inspect this creator${context?.kind ? "" : " (attach page first)"}`}</button><button data-action="go-saved">Saved creators</button><button data-action="go-outreach">Outreach</button><button data-action="go-history">Search history</button><button data-action="go-settings">Settings and usage</button><button data-action="go-texts">Ask My Texts</button><button data-action="close">Close panel</button>`
    : "";
}
async function searchTexts(query) {
  query = String(query || "").trim();
  if (!query) return;
  const turn = { query, loading: true, result: "", error: "" };
  textTurns.push(turn);
  $("ask-input").value = "";
  render();
  try {
    const result = await call("askTexts", { kind: "search", query });
    turn.result = result.text || "No indexed messages matched that query.";
  } catch (failure) { turn.error = failure.message || "Ask My Texts could not complete that search."; }
  turn.loading = false;
  render();
}
async function refreshState() {
  state = await call("state");
  if (!conversationId) {
    const newest = state.conversations?.[0];
    const conversation = await call("conversation", { id: newest?.id || "" });
    conversationId = conversation.id;
  }
  applyTheme(state.theme);
  render();
}
async function search(query) {
  query = String(query || "").trim();
  if (!query) return;
  view = "chat";
  notice = "";
  error = "";
  menuOpen = false;
  const turn = {
    query,
    records: [],
    type: "channel",
    loading: true,
    error: "",
    showAll: false,
    sourcesOpen: false,
    startedAt: performance.now(),
  };
  turns.push(turn);
  $("ask-input").value = "";
  render();
  const last = $("content").querySelector(".turn:last-child");
  if (last)
    $("content").scrollTop +=
      last.getBoundingClientRect().top -
      $("content").getBoundingClientRect().top;
  try {
    let apiQuery = query;
    const snapshot = context ? await call("context") : null;
    if (snapshot?.kind || snapshot?.platform) context = snapshot;
    if (isPageRequest(query)) {
      context = await call("context");
      if (context.kind === "search") {
        apiQuery = context.query;
        turn.searchPhrase = apiQuery;
      } else if (["video", "channel", "handle"].includes(context.kind)) {
        detailRecord = await call("inspectPage");
        state = await call("state");
        turns.pop();
        turn.loading = false;
        view = "detail";
        render();
        return;
      } else {
        throw new Error("Open a YouTube video, channel, or search results page, then try Scout page again.");
      }
      render();
    }
    const requestId = crypto.randomUUID();
    turn.requestId = requestId;
    render();
    const unsubscribe = api.onProgress((update) => {
      if (update.requestId !== requestId || !turn.loading) return;
      turn.records = update.records || [];
      turn.plan = update.plan;
      turn.progress = update.progress;
      turn.coverage = update.coverage;
      if (view === "chat" && activeMode === "scout") render();
    });
    let result;
    try { result = await call("runConversation", { conversationId, message: apiQuery, context: snapshot, limit: queryLimit, requestId, contactMode: $("contact-mode").value }); }
    finally { unsubscribe(); }
    conversationId = result.conversation.id;
    turn.records = result.records || [];
    turn.type = result.plan?.output === "thumbnails" ? "video" : "channel";
    turn.plan = result.plan;
    turn.progress = result.progress;
    turn.coverage = result.coverage;
    turn.cached = !!result.cached;
    turn.retrievedAt = result.retrievedAt || result.refreshedAt;
    state = await call("state");
  } catch (failure) {
    if (turn.cancelled) turn.coverage = `Search stopped. ${turn.records.length} candidates retained.`;
    else turn.error = failure.message;
  }
  turn.loading = false;
  turn.elapsedMs = performance.now() - turn.startedAt;
  if (view === "chat" && activeMode === "scout") render();
}
async function saveRecord(id, patch = {}) {
  const record = currentRecord(id);
  if (!record) throw new Error("Select a creator first.");
  state = await call("save", { record, patch });
}
async function inspectSite(id) {
  const found = await call("inspectSite", { id });
  const options = [...(found.emails || []), ...(found.contactLinks || [])];
  if (!options.length)
    return status(
      "No visible public contact information found on this opened page.",
    );
  const choice = prompt(
    `Visible contact details on ${found.title}\n${found.url}\n\nChoose one to save by entering its number:\n${options.map((value, index) => `${index + 1}. ${value}`).join("\n")}`,
  );
  const index = Number(choice) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= options.length) return;
  const value = prompt(
    "Confirm or edit the contact detail before saving:",
    options[index],
  );
  if (!value?.trim()) return;
  const type = found.emails.includes(options[index])
    ? "public email"
    : "contact page";
  await saveRecord(id, {
    contact: {
      type,
      value: value.trim(),
      sourceUrl: found.url,
      sourceTitle: found.title,
    },
  });
  status("Contact route saved with its source page.");
}
async function manualContact(id) {
  const value = prompt(
    "Enter a creator-provided contact URL or an email you personally revealed:",
  );
  if (!value?.trim()) return;
  const sourceUrl = prompt("Enter the exact public source page URL:");
  if (!safeUrl(sourceUrl))
    throw new Error("A valid source page URL is required.");
  const sourceTitle = prompt(
    "Enter the source page title:",
    "Creator contact page",
  );
  const email = value.includes("@") && !value.startsWith("http");
  const type = email
    ? /^(www\.)?youtube\.com$/.test(new URL(sourceUrl).hostname)
      ? "manual YouTube email"
      : "manual email"
    : "contact page";
  await saveRecord(id, {
    contact: {
      type,
      value: value.trim(),
      sourceUrl,
      sourceTitle: sourceTitle || "User-confirmed source",
    },
  });
  status("Manual contact route saved as user-confirmed.");
}
async function act(action, node = {}) {
  try {
    error = "";
    notice = "";
    const id = node.dataset?.id;
    if (action === "go-texts") {
      activeMode = "texts";
      menuOpen = false;
      render();
      return;
    }
    if (action === "go-back") {
      view = returnView;
      render();
      return;
    }
    if (action === "view-results") {
      const results = $("content").querySelector(`[data-turn="${Number(node.dataset.index)}"] .creator-list`);
      if (results) results.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (action === "outreach-list") {
      detailRecord = null;
      render();
      return;
    }
    if (action === "open-outreach") {
      detailRecord = currentRecord(id);
      if (!detailRecord) throw new Error("Select a creator first.");
      if (!saved(id)) await saveRecord(id);
      if (!state.saved[id].draft) state = await call("outreachDraft", { id });
      view = "outreach";
      render();
      return;
    }
    if (action === "cancel-search") {
      const turn = turns[Number(node.dataset.index)];
      if (turn?.requestId && turn.loading) {
        turn.cancelled = true;
        await call("cancelSearch", { requestId: turn.requestId });
      }
      return;
    }
    if (action === "menu") {
      menuOpen = !menuOpen;
      render();
      return;
    }
    if (action === "go-chat") {
      activeMode = "scout";
      view = "chat";
      menuOpen = false;
      render();
      return;
    }
    if (
      action === "go-saved" ||
      action === "go-outreach" ||
      action === "go-settings" ||
      action === "go-history"
    ) {
      view = action.slice(3);
      activeMode = "scout";
      if (view === "outreach") detailRecord = null;
      menuOpen = false;
      render();
      return;
    }
    if (action === "new-chat") {
      if (activeMode === "texts") {
        textTurns = [];
        render();
        $("ask-input").focus();
        return;
      }
      const conversation = await call("newConversation");
      conversationId = conversation.id;
      turns = [];
      sizeFilter = "all";
      view = "chat";
      menuOpen = false;
      render();
      $("ask-input").focus();
      return;
    }
    if (action === "close") {
      await call("close");
      return;
    }
    if (action === "detach-page") {
      context = null;
      render();
      return;
    }
    if (action === "attach-page") {
      context = await call("context");
      render();
      return;
    }
    if (action === "inspect-page") {
      menuOpen = false;
      if (!context?.kind) {
        context = await call("context");
        if (!context?.kind)
          throw new Error(
            "Open a YouTube video or channel, then attach this page.",
          );
      }
      if (context.kind === "search") {
        await search(context.query);
        return;
      }
      detailRecord = await call("inspectPage");
      state = await call("state");
      view = "detail";
      render();
      return;
    }
    if (action === "history-search") {
      await search(node.dataset.query);
      return;
    }
    if (action === "detail") {
      returnView = view === "detail" ? returnView : view;
      detailRecord = currentRecord(id);
      view = "detail";
      render();
      return;
    }
    if (action === "inspect") {
      detailRecord = await call("inspect", { id });
      state = await call("state");
      view = "detail";
      render();
      return;
    }
    if (action === "open-url") {
      const url = safeUrl(node.dataset.url);
      if (url) await call("openUrl", { url });
      return;
    }
    if (action === "save") {
      await saveRecord(id);
      status("Creator saved.");
      return;
    }
    if (action === "research-contact") {
      status("Researching the creator-linked website…");
      const result = await call("researchContact", { id, depth: queryLimit >= 50 ? "deep" : queryLimit <= 10 ? "quick" : "standard" });
      detailRecord = result.record;
      state = result.state;
      status(result.research.status === "found" ? "Public contact found; ownership and deliverability remain unverified." : `Contact research: ${result.research.status}.${result.research.errors?.length ? ` ${result.research.errors.slice(0, 2).join("; ")}` : ""}`);
      return;
    }
    if (action === "copy-draft") {
      await call("copyDraft", { id });
      status("Saved draft copied. No message was sent.");
      return;
    }
    if (action === "prepare-draft") {
      if (state?.saved?.[id]?.draft && !confirm("Replace the existing draft?")) return;
      state = await call("outreachDraft", { id });
      view = "outreach";
      render();
      return;
    }
    if (action === "save-draft") {
      if (!detailRecord) return;
      state = await call("outreachDraft", { id: detailRecord.id, patch: { to: $("draft-to").value, subject: $("draft-subject").value, body: $("draft-body").value } });
      status("Draft saved locally. No message was sent.");
      return;
    }
    if (action === "toggle-video") {
      const turn = turns[Number(node.dataset.turn)];
      const video = turn?.records?.find((item) => item.id === id);
      if (!video) throw new Error("Video is no longer available.");
      if (selectedVideos.has(id)) selectedVideos.delete(id); else selectedVideos.add(id);
      render();
      return;
    }
    if (action === "save-video") {
      const turn = turns[Number(node.dataset.turn)];
      const video = turn?.records?.find((item) => item.id === id);
      if (!video) throw new Error("Video is no longer available.");
      const boards = state?.boards || [];
      const choice = boards.length ? prompt(`Save to an inspiration board (optional):\n${boards.map((board, i) => `${i + 1}. ${board.name}`).join("\n")}\n\nEnter a number, or leave blank.`) : "";
      const board = choice ? boards[Number(choice) - 1] : null;
      state = await call("saveVideoReference", { record: video, boardId: board?.id || "" });
      status("Video reference saved with source attribution.");
      return;
    }
    if (action === "save-turn") {
      const index = Number(node.dataset.index),
        turn = turns[index];
      const candidates =
        sizeFilter === "small" && index === turns.length - 1
          ? (turn?.records || []).filter(
              (record) =>
                record.subscribers != null && record.subscribers < 10000,
            )
          : turn?.records || [];
      for (const record of turn?.showAll ? candidates : candidates.slice(0, 3))
        await saveRecord(record.id);
      status("Shown creators saved.");
      return;
    }
    if (action === "add-note") {
      const note = prompt(
        "Add or edit your note:",
        state.saved?.[id]?.notes || "",
      );
      if (note == null) return;
      await saveRecord(id, { notes: note });
      status("Note saved.");
      return;
    }
    if (action === "inspect-site") return await inspectSite(id);
    if (action === "manual-contact") return await manualContact(id);
    if (action === "sources") {
      const turn = turns[Number(node.dataset.index)];
      if (turn) turn.sourcesOpen = !turn.sourcesOpen;
      render();
      return;
    }
    if (action === "show-all") {
      const turn = turns[Number(node.dataset.index)];
      if (turn) turn.showAll = true;
      render();
      return;
    }
    if (action === "smaller") {
      sizeFilter = "small";
      render();
      return;
    }
    if (action === "retry") {
      const turn = turns[Number(node.dataset.index)];
      if (turn) await search(turn.query);
      return;
    }
    if (action === "like") {
      status("Thanks for the feedback.");
      return;
    }
    if (action === "copy") {
      const turn = turns[Number(node.dataset.index)];
      await call("copyLinks", {
        links: (turn?.records || []).map((record) => ({
          name: record.name,
          url: record.url,
        })),
      });
      status("Channel links copied.");
      return;
    }
    if (action === "create-list") {
      state = await call("createList", { name: $("list-name").value });
      render();
      return;
    }
    if (action === "create-board") {
      state = await call("createBoard", { name: $("board-name").value });
      render();
      return;
    }
    if (action === "remove-video-reference") {
      state = await call("removeVideoReference", { id });
      render();
      return;
    }
    if (action === "delete-list") {
      state = await call("deleteList", { id });
      render();
      return;
    }
    if (action === "remove") {
      state = await call("remove", { id });
      exportIds.delete(id);
      render();
      return;
    }
    if (action === "clear") {
      if (!confirm("Delete all saved Creator Scout research and lists?"))
        return;
      state = await call("clear");
      exportIds.clear();
      csvPreview = "";
      render();
      return;
    }
    if (action === "set-openrouter") {
      state = await call("setOpenRouter", { key: $("openrouter-key").value, enabled: $("openrouter-enabled").checked });
      status(state.openrouter.enabled ? "Paid OpenRouter assistance enabled." : "OpenRouter assistance disabled.");
      return;
    }
    if (action === "remove-openrouter") {
      state = await call("setOpenRouter", { clear: true });
      status("OpenRouter key removed and assistance disabled.");
      return;
    }
    if (action === "set-deepseek") {
      state = await call("setDeepSeek", { key: $("deepseek-key").value, enabled: $("deepseek-enabled").checked });
      status(state.deepseek.enabled ? "Paid DeepSeek contact assistance enabled." : "DeepSeek assistance disabled.");
      return;
    }
    if (action === "remove-deepseek") {
      state = await call("setDeepSeek", { clear: true });
      status("DeepSeek key removed and assistance disabled.");
      return;
    }
    if (action === "set-key") {
      state = await call("setKey", { key: $("api-key").value });
      status("YouTube API key saved.");
      return;
    }
    if (action === "remove-key") {
      state = await call("setKey", { key: "" });
      status("Saved YouTube API key removed.");
      return;
    }
    if (action === "preview-export") {
      if (!exportIds.size) throw new Error("Select saved creators to export.");
      csvPreview = await call("previewExport", {
        ids: [...exportIds],
        columns: [...exportColumns],
      });
      render();
      return;
    }
    if (action === "export-csv") {
      if (!csvPreview) throw new Error("Preview the CSV before saving.");
      const result = await call("export", {
        ids: [...exportIds],
        columns: [...exportColumns],
      });
      if (result.ok) status("CSV saved.");
      return;
    }
  } catch (failure) {
    status(
      failure.message || "Creator Scout could not complete that action.",
      true,
    );
  }
}

$("history-button").innerHTML = icons.history;
$("new-chat-button").innerHTML = icons.compose;
$("history-button").onclick = () =>
  act(view === "chat" ? "go-history" : "go-chat");
$("new-chat-button").onclick = () => act("new-chat");
$("settings-button").onclick = () => act("go-settings");
$("primary-nav").onclick = (event) => {
  const node = event.target.closest("[data-action]");
  if (node) act(node.dataset.action, node);
};
function setDepth(value) {
  queryLimit = Number(value);
  localStorage.setItem("scout-depth", String(queryLimit));
  $("limit").value = String(queryLimit);
  $("depth-controls").querySelectorAll("button").forEach(button => button.setAttribute("aria-pressed", String(Number(button.dataset.depth) === queryLimit)));
}
$("depth-controls").onclick = event => {
  const button = event.target.closest("[data-depth]");
  if (button) setDepth(button.dataset.depth);
};
$("contact-mode").value = defaultContact;
$("contact-mode").onchange = event => {
  defaultContact = event.target.value;
  localStorage.setItem("scout-contact", defaultContact);
};
$("more-button").onclick = () => act("menu");
$("attach-button").onclick = () => act("attach-page");
$("composer").onsubmit = (event) => {
  event.preventDefault();
  activeMode === "texts" ? searchTexts($("ask-input").value) : search($("ask-input").value);
};
$("ask-input").onkeydown = (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    activeMode === "texts" ? searchTexts($("ask-input").value) : search($("ask-input").value);
  }
};
$("limit").onchange = (event) => {
  setDepth(event.target.value);
};
document.querySelector(".mode-tabs").onclick = (event) => {
  const tab = event.target.closest("[data-mode]");
  if (!tab || tab.dataset.mode === activeMode) return;
  activeMode = tab.dataset.mode;
  menuOpen = false;
  render();
  $("ask-input").focus();
};
$("content").onclick = (event) => {
  const node = event.target.closest("[data-action]");
  if (node) {
    event.preventDefault();
    act(node.dataset.action, node);
  }
};
$("page-strip").onclick = (event) => {
  const node = event.target.closest("[data-action]");
  if (node) act(node.dataset.action, node);
};
$("menu").onclick = (event) => {
  const node = event.target.closest("[data-action]");
  if (node) act(node.dataset.action, node);
};
$("content").onsubmit = (event) => {
  event.preventDefault();
  if (event.target.id === "list-form") act("create-list");
  if (event.target.id === "board-form") act("create-board");
  if (event.target.id === "key-form") act("set-key");
  if (event.target.id === "deepseek-form") act("set-deepseek");
  if (event.target.id === "openrouter-form") act("set-openrouter");
  if (event.target.id === "draft-form") act("save-draft");
};
$("content").onchange = async (event) => {
  const node = event.target;
  if (node.id === "default-depth") setDepth(node.value);
  if (node.id === "default-contact") {
    $("contact-mode").value = node.value;
    defaultContact = node.value;
    localStorage.setItem("scout-contact", defaultContact);
  }
  if (node.dataset.exportId || node.dataset.exportField) csvPreview = "";
  if (node.dataset.exportId) {
    if (node.checked) exportIds.add(node.dataset.exportId);
    else exportIds.delete(node.dataset.exportId);
  }
  if (node.dataset.exportField) {
    if (node.checked) exportColumns.add(node.dataset.exportField);
    else exportColumns.delete(node.dataset.exportField);
  }
  if (node.dataset.saveField) {
    const item = state.saved[node.dataset.id];
    if (!item) return;
    try {
      await saveRecord(node.dataset.id, {
        listId: item.listId,
        tags: item.tags,
        notes: item.notes,
        outreach: item.outreach,
        [node.dataset.saveField]: node.value,
      });
    } catch (failure) {
      status(failure.message, true);
    }
  }
};
const resize = $("panel-resize");
resize.onkeydown = (event) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  api.resize(event.key === "Home" ? 360 : event.key === "End" ? 600 : window.innerWidth + (event.key === "ArrowLeft" ? 20 : -20));
};
resize.onpointerdown = (event) => {
  if (event.button !== 0) return;
  resize.setPointerCapture(event.pointerId);
  const startX = event.screenX,
    startWidth = window.innerWidth;
  const move = (next) => api.resize(startWidth + startX - next.screenX);
  const stop = () => {
    resize.removeEventListener("pointermove", move);
    resize.removeEventListener("pointerup", stop);
    resize.removeEventListener("pointercancel", stop);
    if (resize.hasPointerCapture(event.pointerId))
      resize.releasePointerCapture(event.pointerId);
  };
  resize.addEventListener("pointermove", move);
  resize.addEventListener("pointerup", stop);
  resize.addEventListener("pointercancel", stop);
};
api.onContext(() => {
  context = null;
  render();
});
api.onTheme(applyTheme);
refreshState().catch((failure) => status(failure.message, true));
