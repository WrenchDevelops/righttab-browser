const { app } = require('electron');
async function until(fn, label, ms = 30000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { if (await fn()) return; await new Promise((resolve) => setTimeout(resolve, 100)); }
  throw new Error(`Timed out waiting for ${label}`);
}
async function run(browser) {
  await browser.ready;
  const win = await browser.whenWindow();
  await until(() => win.ui.webContents.executeJavaScript('!!window.righttab'), 'browser UI');
  await win.ui.webContents.executeJavaScript('window.righttab.toggleCreatorScout()');
  await until(() => win.sidePanelInstallId === 'creator-scout' && win.sidePanelView && !win.sidePanelView.webContents.isLoading(), 'Scout panel');
  const panel = win.sidePanelView.webContents;
  for (const query of ['fortnite creators', 'gaming creators', 'tech creators', '3d printing creators']) {
    const start = Date.now();
    const previous = await panel.executeJavaScript('turns.length');
    if (query === 'fortnite creators') await panel.executeJavaScript('queryLimit = 50');
    else await panel.executeJavaScript('queryLimit = 25');
    await panel.executeJavaScript(`document.getElementById('ask-input').value = ${JSON.stringify(query)}; document.getElementById('composer').requestSubmit()`);
    await until(() => panel.executeJavaScript(`turns.length > ${previous} && !turns.at(-1).loading`), 'live search', 45000);
    const result = await panel.executeJavaScript(`({ error: turns.at(-1).error, records: turns.at(-1).records, coverage: turns.at(-1).coverage })`);
    if (result.error) throw new Error(`${query}: ${result.error}`);
    const first = result.records.find((item) => /^UC[\w-]{22}$/.test(item.id) && item.name && item.url === 'https://www.youtube.com/channel/' + item.id);
    if (query === 'fortnite creators' && result.records.length < 30) throw new Error(`Deep search did not discover enough channels: ${result.coverage}`);
    if (!first) throw new Error(`No valid live channel for ${query}: ${result.coverage}`);
    if (query === 'fortnite creators') {
      const profile = await panel.executeJavaScript(`window.scout.invoke('inspect', { id: ${JSON.stringify(first.id)} })`);
      if (profile.error || !profile.recentVideos?.length) throw new Error(profile.error || 'Live channel did not provide recent uploads');
      const video = profile.recentVideos[0];
      if (!video.url || !video.title) throw new Error('Recent upload metadata missing');
      console.log(`PASS channel inspection: ${profile.name}, ${profile.handle}, ${profile.recentVideos.length} uploads; sample ${video.url}, ${video.views ?? 'unknown'} views, ${video.publishedText || 'date unknown'}`);
    }
    const saved = await panel.executeJavaScript(`window.scout.invoke('save', { record: ${JSON.stringify(first)} })`);
    if (!saved.saved?.[first.id]) throw new Error(saved.error || 'Could not save live result');
    if (query === 'fortnite creators') {
      const draft = await panel.executeJavaScript(`window.scout.invoke('outreachDraft', { id: ${JSON.stringify(first.id)} })`);
      if (!draft.saved?.[first.id]?.draft?.body) throw new Error('Draft was not saved');
      await panel.executeJavaScript(`detailRecord = ${JSON.stringify(first)}; state = ${JSON.stringify(draft)}; view = 'outreach'; render()`);
      if (!await panel.executeJavaScript(`!!document.getElementById('draft-form')`)) throw new Error('Draft editor did not render');
      await panel.executeJavaScript(`document.getElementById('draft-body').value = 'Edited draft'; document.getElementById('draft-form').requestSubmit()`);
      await until(() => panel.executeJavaScript(`state.saved[${JSON.stringify(first.id)}].draft.body === 'Edited draft'`), 'draft save');
      await panel.executeJavaScript(`view = 'chat'; render()`);
      console.log('PASS draft editor saves locally without sending');
    }
    console.log(`PASS ${query}: ${result.records.length} channels; first ${first.id} (${first.name}); saved; ${Date.now() - start}ms`);
  }
  const strict = await panel.executeJavaScript(`window.scout.invoke('runConversation', { requestId: 'strict-live-test', message: 'Find 25 Fortnite creators with 10K–1M subscribers, a video with 500K+ views in the last 14 days, and a publicly available business contact.' })`);
  if (strict.error || strict.plan?.topic?.toLowerCase() !== 'fortnite' || !strict.plan?.filters?.requireContact || strict.plan?.filters?.minVideoViews !== 500000 || strict.progress?.matches !== 0 || strict.records.some((item) => item.qualification?.status !== 'needs-verification')) throw new Error(`Strict no-key search did not preserve verification status: ${JSON.stringify({ error: strict.error, plan: strict.plan, progress: strict.progress })}`);
  console.log(`PASS strict request without API key: ${strict.records.length} unverified candidates, 0 verified contact-ready results`);
  const cancelled = await panel.executeJavaScript(`(async () => {
    const requestId = 'live-cancel-test';
    const task = window.scout.invoke('runConversation', { requestId, message: 'gaming creators' });
    const stop = await window.scout.invoke('cancelSearch', { requestId });
    return { stop, result: await task };
  })()`);
  if (!cancelled.stop.cancelled || !cancelled.result.error) throw new Error('Cancellation was not enforced through panel IPC');
  console.log('PASS panel IPC cancels an active provider search');
  app.exit(0);
}
module.exports = { run };
