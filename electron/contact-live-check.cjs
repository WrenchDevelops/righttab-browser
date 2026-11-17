const { app } = require('electron');
async function until(fn, label, ms = 30000) { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return; await new Promise(r => setTimeout(r, 100)); } throw new Error(`Timed out waiting for ${label}`); }
async function run(browser) {
  await browser.ready;
  const win = await browser.whenWindow();
  await until(() => win.ui.webContents.executeJavaScript('!!window.righttab'), 'browser');
  await win.ui.webContents.executeJavaScript('window.righttab.toggleCreatorScout()');
  await until(() => win.sidePanelInstallId === 'creator-scout' && win.sidePanelView && !win.sidePanelView.webContents.isLoading(), 'panel');
  const panel = win.sidePanelView.webContents;
  if (process.env.RIGHTTAB_VIDEO_ONLY === '1') {
    const videos = await panel.executeJavaScript(`window.scout.invoke('fetchVideos', { ids: ['ciL_dO_NYmU'] })`);
    const video = Array.isArray(videos) ? videos[0] : null;
    const { bestPublishedContact } = require('./creator-scout.cjs');
    const contact = video && bestPublishedContact({ description: '', url: 'https://www.youtube.com/channel/UCuVF5SaXDHcRkGE4rpbgoNA', refreshedAt: new Date().toISOString() }, video);
    if (!contact || !video.description.includes(contact.value)) throw new Error('Business email was not found in the cited video description');
    console.log(JSON.stringify({ channelId: video.channelId, videoUrl: video.url, publishedAt: video.publishedAt, views: video.views, contact: { value: contact.value, sourceUrl: contact.sourceUrl, ownershipStatus: contact.ownershipStatus, deliverability: contact.deliverability } }));
    app.exit(0); return;
  }
  if (process.env.RIGHTTAB_SITE_ONLY === '1') {
    const id = 'UCieIp_wHCFxOCcrOlJAIp5A';
    const profile = await panel.executeJavaScript(`window.scout.invoke('inspect', { id: ${JSON.stringify(id)} })`);
    if (profile.error || !(profile.links || []).some((item) => /3dpany\.com/i.test(item.url))) throw new Error('Creator-linked website was not present in live channel metadata');
    const research = await panel.executeJavaScript(`window.scout.invoke('researchContact', { id: ${JSON.stringify(id)} })`);
    if (research.error || research.research.status !== 'found') throw new Error(`Live site research failed: ${research.error || research.research.status}`);
    const candidate = research.research.candidates.find((item) => item.sourceUrl === 'https://www.3dpany.com/pages/contact');
    if (!candidate || !['public_email', 'contact_form'].includes(candidate.type)) throw new Error('No contact from the linked contact page');
    if (process.env.RIGHTTAB_OPENROUTER_TEST === '1' && (!research.research.candidates.some((item) => item.selectedBy === 'deepseek') || research.research.aiUsage?.calls !== 1)) throw new Error('OpenRouter did not rank a source-backed candidate');
    const saved = await panel.executeJavaScript(`window.scout.invoke('save', { record: ${JSON.stringify(research.record)}, patch: { notes: 'Test note' } })`);
    if (saved.saved?.[id]?.record?.bestContact?.sourceUrl !== candidate.sourceUrl) throw new Error('Website contact source did not persist');
    console.log(JSON.stringify({ creator: profile.name, channel: profile.url, website: 'https://www.3dpany.com', status: research.research.status, pagesVisited: research.research.pagesVisited, candidate: { type: candidate.type, sourceUrl: candidate.sourceUrl, ownershipStatus: candidate.ownershipStatus, deliverability: candidate.deliverability }, aiUsage: research.research.aiUsage, modelRanked: research.research.candidates.some((item) => item.selectedBy === 'deepseek'), saved: true }));
    app.exit(0);
    return;
  }
  if (process.env.RIGHTTAB_SITE_ONLY !== '1') {
  const start = Date.now();
  const testLimit = process.env.RIGHTTAB_DEEP_TEST === '1' ? 50 : 25;
  const contactMode = process.env.RIGHTTAB_EMAIL_ONLY === '1' ? 'email' : 'any';
  const measured = await panel.executeJavaScript(`(async () => {
    const started = Date.now(), times = { firstReportedDiscoveryMs: null, firstQualifiedMs: null, firstContactableMs: null, tenContactableMs: null, twentyFiveContactableMs: null };
    const unsubscribe = window.scout.onProgress((update) => {
      if (update.requestId !== 'live-contact-search') return;
      const p = update.progress || {}, ms = Date.now() - started;
      if (p.channelsDiscovered > 0 && times.firstReportedDiscoveryMs == null) times.firstReportedDiscoveryMs = ms;
      if (p.qualified > 0 && times.firstQualifiedMs == null) times.firstQualifiedMs = ms;
      if (p.contactable > 0 && times.firstContactableMs == null) times.firstContactableMs = ms;
      if (p.contactable >= 10 && times.tenContactableMs == null) times.tenContactableMs = ms;
      if (p.contactable >= 25 && times.twentyFiveContactableMs == null) times.twentyFiveContactableMs = ms;
    });
    try { return { result: await window.scout.invoke('runConversation', { requestId: 'live-contact-search', limit: ${testLimit}, contactMode: ${JSON.stringify(contactMode)}, message: 'Find 25 Fortnite YouTubers with 10K–1M subscribers and at least one video with 500K+ views in the last 14 days and a public business contact' }), times }; }
    finally { unsubscribe(); }
  })()`);
  const result = measured.result;
  if (result.error) throw new Error(`Live search failed: ${result.error}`);
  for (const record of result.records) {
    if (record.matchedVideo?.channelId !== record.id || record.matchedVideo.views < 500000 || Date.now() - Date.parse(record.matchedVideo.publishedAt) > 14 * 86400000 || record.subscribers < 10000 || record.subscribers > 1000000) throw new Error('A result failed independent qualification checks');
    const contact = record.bestContact;
    if (contactMode === 'email' && !['business_email', 'management_email'].includes(contact?.type)) throw new Error('Email-only search returned a non-business contact');
    if (contact?.sourceUrl === record.url && !record.description.includes(contact.value)) throw new Error('Channel contact was absent from its cited source');
    if (contact?.sourceUrl === record.matchedVideo.url && !record.matchedVideo.description.includes(contact.value)) throw new Error('Video contact was absent from its cited source');
  }
  console.log(JSON.stringify({ elapsedMs: Date.now() - start, milestones: measured.times, progress: result.progress, creators: result.records.map(({ name, id, url, subscribers, matchedVideo, bestContact }) => ({ name, id, url, subscribers, matchedVideo: matchedVideo && { id: matchedVideo.id, url: matchedVideo.url, views: matchedVideo.views, publishedAt: matchedVideo.publishedAt }, bestContact: bestContact && { type: bestContact.type, sourceUrl: bestContact.sourceUrl, deliverability: bestContact.deliverability } })) }));
  if (result.records.length) {
    const saved = await panel.executeJavaScript(`window.scout.invoke('save', { record: ${JSON.stringify(result.records[0])} })`);
    if (!saved.saved?.[result.records[0].id]?.record?.bestContact?.sourceUrl) throw new Error('Could not save creator contact source');
    const draft = await panel.executeJavaScript(`window.scout.invoke('outreachDraft', { id: ${JSON.stringify(result.records[0].id)} })`);
    if (!draft.saved?.[result.records[0].id]?.draft?.body) throw new Error('Could not create draft');
    console.log('PASS saved creator and local draft; no message sent');
  }
  }
  if (process.env.RIGHTTAB_STRICT_ONLY === '1') { app.exit(0); return; }
  const discovered = await panel.executeJavaScript(`window.scout.invoke('search', { query: '3d printing', limit: 50 })`);
  const candidates = (discovered.records || []).filter((creator) => (creator.links || []).some(({ url }) => { try { const u = new URL(url); return !/(^|\.)(youtube\.com|youtu\.be|instagram\.com|tiktok\.com|twitter\.com|x\.com|facebook\.com)$/.test(u.hostname) && u.protocol === 'https:'; } catch { return false; } })).slice(0, 5);
  if (!candidates.length) console.log('No creator-linked website found in the additional live discovery results.');
  for (const creator of candidates) {
    const research = await panel.executeJavaScript(`window.scout.invoke('researchContact', { id: ${JSON.stringify(creator.id)} })`);
    const summary = research.error || { status: research.research.status, pagesVisited: research.research.pagesVisited, candidates: research.research.candidates?.map(({ type, sourceUrl, ownershipStatus, deliverability }) => ({ type, sourceUrl, ownershipStatus, deliverability })), errors: research.research.errors };
    console.log(JSON.stringify({ manualCreator: creator.name, channel: creator.url, creatorLinks: creator.links.map((x) => x.url).slice(0, 4), websiteResearch: summary }));
    if (!research.error && research.research.status === 'found') {
      const saved = await panel.executeJavaScript(`window.scout.invoke('save', { record: ${JSON.stringify(research.record)}, patch: { notes: 'Test note' } })`);
      if (saved.saved?.[creator.id]?.record?.bestContact?.sourceUrl !== research.research.candidates[0].sourceUrl) throw new Error('Website contact source did not persist');
      console.log('PASS creator-linked public contact source saved to local CRM');
      break;
    }
  }
  app.exit(0);
}
module.exports = { run };
