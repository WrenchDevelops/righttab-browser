// Explicit local test mode only. Uses the existing Disney session, never
// collects credentials or license bodies, and leaves the browser running.
const fs = require('node:fs');
const path = require('node:path');
const { startMediaDiagnostics } = require('./media-diagnostics.cjs');
const { navigateMediaDocument } = require('./media-navigation.cjs');

async function run(browser, mediaRuntime, { outputPath, signedPackageTest = false, captureConfigurations = false } = {}) {
  await browser.ready;
  console.log('SIGNED_IN_TEST', 'tabs restored');
  const win = browser.focused() || await browser.whenWindow();
  browser.reveal(win);
  console.log('SIGNED_IN_TEST', 'window ready');
  const tab = [...win.tabs.values()].find((item) => {
    try { return new URL(item.requestedUrl).hostname === 'www.disneyplus.com' && /^\/(play\/|browse\/entity-)/.test(new URL(item.requestedUrl).pathname); }
    catch { return false; }
  });
  if (!tab) throw new Error('No existing Disney+ title tab found; open a title page before the live check.');
  const wc = tab.view.webContents;
  const originalUrl = tab.requestedUrl;
  await navigateMediaDocument(wc, originalUrl);
  browser.showPages(win);
  browser.selectTab(win, tab.id);
  const capture = await startMediaDiagnostics(wc, mediaRuntime);
  console.log('SIGNED_IN_TEST', 'diagnostics ready');
  const checks = [];
  try {
    let play = new URL(originalUrl).pathname.startsWith('/play/') ? originalUrl : '';
    for (let attempt = 0; !play && attempt < 30; attempt++) {
      play = await wc.executeJavaScript(`(() => {
      const links = [...document.querySelectorAll('a[href]')];
      return (links.find(a => a.textContent.trim().toLowerCase() === 'continue') || links.find(a => /\\/play\\//.test(a.href)))?.href || '';
    })()`);
      if (!play) await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const url = new URL(play);
    if (url.protocol !== 'https:' || url.hostname !== 'www.disneyplus.com' || !url.pathname.startsWith('/play/')) throw new Error('No authorized Disney title playback link found.');
    await navigateMediaDocument(wc, url.href);
    console.log('SIGNED_IN_TEST', 'playback page loaded');
    let progressed = false;
    let protectedPlaybackObserved = false;
    let firstTime = null;
    let firstProtected = null;
    const observeUntil = Date.now() + 45000;
    while (Date.now() < observeUntil) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const snapshots = await Promise.all(wc.mainFrame.framesInSubtree.map(async (frame) => {
        let timer;
        try { return await Promise.race([frame.executeJavaScript(`({ media: [...document.querySelectorAll('video,audio')].map(el => ({
          kind: el.tagName, time: el.currentTime, paused: el.paused, ready: el.readyState,
          width: el.videoWidth || 0, height: el.videoHeight || 0, muted: el.muted, volume: el.volume,
          keys: !!el.mediaKeys, frames: el.getVideoPlaybackQuality?.().totalVideoFrames || 0,
          error: el.error?.code || null
        })) })`), new Promise(resolve => { timer = setTimeout(() => resolve({ media: [], error: 'FrameSnapshotTimeout' }), 2000); })]); }
        catch { return { media: [] }; }
        finally { clearTimeout(timer); }
      }));
      checks.push({ at: new Date().toISOString(), frames: snapshots });
      const video = snapshots.flatMap((item) => item.media).find((item) => item.kind === 'VIDEO' && item.width > 0);
      if (video && !video.paused && video.ready >= 2 && video.frames > 0) {
        if (firstTime === null) firstTime = video.time;
        if (video.time > firstTime + 3) progressed = true;
      }
      const protectedVideo = snapshots.flatMap((item) => item.media).find((item) => item.kind === 'VIDEO' && item.keys && !item.paused && item.ready >= 2 && item.width > 0 && item.frames > 0);
      if (protectedVideo) {
        if (!firstProtected) firstProtected = { time: protectedVideo.time, frames: protectedVideo.frames };
        if (protectedVideo.time > firstProtected.time + 3 && protectedVideo.frames > firstProtected.frames) { protectedPlaybackObserved = true; break; }
      }
    }
    const report = await capture.finish();
    report.service = 'Disney+';
    report.title = wc.getTitle();
    report.signedPackageTest = signedPackageTest;
    report.playback = { progressed, protectedPlaybackObserved, titlePlaybackVerified: false, checks,
      note: 'Protected video progress requires media keys plus advancing frames/time. Actual title versus advertising and audible audio require observation.',
      audio: 'Audibility requires human verification; muted/volume state is recorded.' };
    report.playback.audioOutputDetected = wc.isCurrentlyAudible();
    if (captureConfigurations) {
      const { probeMediaConfigurations } = require('./media-configuration-probe.cjs');
      let timer;
      try {
        report.configurations = await Promise.race([wc.mainFrame.executeJavaScript(`(${probeMediaConfigurations.toString()})()`), new Promise(resolve => {
          timer = setTimeout(() => resolve({ error: 'ConfigurationProbeTimeout' }), 12000);
        })]);
      } finally { clearTimeout(timer); }
    }
    const output = outputPath || path.join(__dirname, '../test-results', mediaRuntime.provider === 'castlabs' ? 'disney-live-castlabs.json' : 'disney-live-stock.json');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2), { mode: 0o600 });
    console.log('DISNEY_LIVE_RESULT', JSON.stringify({ progressed, report: output, mediaRuntime }));
  } finally { capture.stop(); }
}

module.exports = { run };
