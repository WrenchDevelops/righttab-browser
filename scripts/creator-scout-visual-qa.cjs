// Runs the actual RightTab browser/native panel with a disposable profile.
// Live discovery is the primary evidence; synthetic edge cases are explicitly labeled.
const { app } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'test-results/scout-5.2');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'righttab-visual-qa-'));
app.setName('RightTab');
app.setPath('userData', profile);
process.env.RIGHTTAB_YOUTUBEJS_TEST = '1'; // Standard app setup, real providers enabled.
const live = !process.argv.includes('--replay');
if (live) {
  const source = path.join(os.homedir(), 'Library/Application Support/RightTab/creator-scout.json');
  if (fs.existsSync(source)) {
    const { key } = JSON.parse(fs.readFileSync(source, 'utf8'));
    if (key) fs.writeFileSync(path.join(profile, 'creator-scout.json'), JSON.stringify({ key }), { mode: 0o600 });
  }
}
fs.mkdirSync(out, { recursive: true });
const widths = [360, 400, 440, 600];
const report = { native: 'RightTab WebContentsView inside Electron', widths, captures: [], checks: [], live: {}, failures: [] };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return; await pause(100); }
  throw new Error(`Timed out: ${label}`);
}
app.whenReady().then(async () => {
  app.configureHostResolver({ secureDnsMode: 'secure', secureDnsServers: ['https://dns.google/dns-query', 'https://cloudflare-dns.com/dns-query'], enableBuiltInResolver: true });
  const browser = require('../electron/browser.cjs').startBrowser();
  await browser.ready;
  const win = await browser.whenWindow();
  win.win.setContentSize(1280, 980);
  await until(() => win.ui.webContents.executeJavaScript('!!window.righttab'), 'browser');
  await win.ui.webContents.executeJavaScript('window.righttab.toggleCreatorScout()');
  await until(() => win.sidePanelView && !win.sidePanelView.webContents.isLoading(), 'panel');
  const panel = win.sidePanelView.webContents;
  const js = async code => {
    const script = /\bawait\s/.test(code) ? `(async()=>{${code}})()` : code;
    try {
      new (require('node:vm').Script)(script);
      return await panel.executeJavaScript(script);
    } catch (error) {
      console.error('QA script prefix:', script.slice(0, 100), 'length:', script.length);
      throw error;
    }
  };
  await until(() => js('!!state && !!document.querySelector(".scout-home")'), 'renderer ready');
  panel.on('console-message', (event) => {
    if (event.level === 'error' && /Uncaught|TypeError|ReferenceError/.test(event.message)) report.failures.push(event.message);
  });
  async function resize(width) {
    await js(`window.scout.resize(${width})`);
    await until(() => js(`innerWidth === ${width}`), `panel width ${width}`);
    await pause(130);
  }
  async function capture(name, width, provenance, scroll = 'top') {
    await resize(width);
    await js(`document.getElementById('content').scrollTop = ${scroll === 'bottom' ? "document.getElementById('content').scrollHeight" : '0'}`);
    await pause(80);
    const file = `${width}-${name}.png`;
    const png = (await panel.capturePage()).toPNG();
    fs.writeFileSync(path.join(out, file), png);
    const layout = await js(`(() => {
      const content = document.getElementById('content');
      const nav = document.getElementById('primary-nav').getBoundingClientRect();
      const bad = [...document.querySelectorAll('#content *, .topbar *, #bottom-area *, #primary-nav *')].filter(el => {
        if (el.closest('details:not([open])') && !el.closest('summary')) return false;
        const r=el.getBoundingClientRect(); const style=getComputedStyle(el);
        return r.width && r.height && style.display !== 'none' && (r.left < -1 || r.right > innerWidth+1);
      }).map(el => el.tagName + '.' + el.className).slice(0,10);
      return { width: innerWidth, height: innerHeight, horizontalOverflow: content.scrollWidth > content.clientWidth + 1, bad, navVisible: nav.bottom <= innerHeight+1 && nav.height > 0, scrollable: content.scrollHeight > content.clientHeight };
    })()`);
    report.captures.push({ file, name, width, provenance, layout });
    if (layout.horizontalOverflow || layout.bad.length || !layout.navVisible) report.failures.push(`${file}: ${JSON.stringify(layout)}`);
    console.log(`CAPTURE ${file} (${provenance})`);
  }
  if (!live) {
    const initial = JSON.parse(fs.readFileSync(path.join(out, 'live-workspace.json'), 'utf8'));
    await js(`state=${JSON.stringify(initial.state)}; turns=[]; view='chat'; render()`);
  }
  for (const width of widths) await capture('home', width, 'native initial state');
  // Exercise input relocation, depth selection and persisted defaults through real controls.
  if (live) {
    await resize(400);
    await js(`window.scout.onProgress(update => { window.__qaProgress ||= structuredClone(update); }); document.querySelector('[data-depth="10"]').click(); document.getElementById('ask-input').value='Find 5 3d printing creators with over 1000 subscribers'; document.getElementById('composer').requestSubmit()`);
    fs.writeFileSync(path.join(out, '400-active-search.png'), (await panel.capturePage()).toPNG());
    // Preserve original in-progress evidence when --replay refreshes the width matrix.
    fs.copyFileSync(path.join(out, '400-active-search.png'), path.join(out, '400-live-request.png'));
    report.captures.push({file:'400-active-search.png',name:'active-search',width:400,provenance:'live provider request in progress'});
    await js(`await act('go-settings'); document.querySelector('#key-form').closest('details').open=true; document.getElementById('api-key').value='unsaved-qa-input'`);
    await until(() => js('turns.at(-1)?.progress?.channelsDiscovered > 0 || !turns.at(-1)?.loading'), 'live discovery event', 90000);
    const active = await js('({...structuredClone(turns.at(-1)),...structuredClone(window.__qaProgress || {}),loading:true,elapsedMs:null})');
    fs.writeFileSync(path.join(out, 'live-active.json'), JSON.stringify(active, null, 2));
    await until(() => js('turns.at(-1)?.loading === false'), 'live search completion', 120000);
    assert.equal(await js(`document.getElementById('api-key').value`), 'unsaved-qa-input', 'Background search replaced settings input');
    report.checks.push('Background live search preserves unsaved settings input');
    await js(`document.getElementById('api-key').value=''; view='chat'; render()`);
    const completed = await js('structuredClone(turns.at(-1))');
    assert(!completed.error, completed.error);
    assert(completed.records.length, 'Live search returned no creators');
    fs.writeFileSync(path.join(out, 'live-search.json'), JSON.stringify(completed, null, 2));
    report.live = { query: completed.query, creators: completed.records.length, progress: completed.progress, elapsedMs: completed.elapsedMs, inProgressCapture: '400-live-request.png' };
    console.log(`LIVE ${completed.records.length} source-backed creators, ${completed.elapsedMs} ms`);
    for (const width of widths) {
      if (report.captures.some(c => c.name === 'active-search' && c.width === width)) continue;
      await js(`turns = [${JSON.stringify(active)}]; turns[0].loading = true; view='chat'; render()`);
      await capture('active-search', width, 'replayed captured live progress, real provider counts');
    }
    await js(`turns=[${JSON.stringify(completed)}]; view='chat'; render()`);
    // Pick a creator whose source-published contact the connector actually found.
    let selected = completed.records.find(r => r.bestContact);
    if (!selected) {
      const inspected = await js(`window.scout.invoke('inspect', { id: 'UCieIp_wHCFxOCcrOlJAIp5A' })`);
      assert(!inspected.error, inspected.error);
      const research = await js(`window.scout.invoke('researchContact', { id: ${JSON.stringify(inspected.id)}, depth: 'quick' })`);
      assert(!research.error, research.error);
      selected = research.record;
    }
    assert(selected?.id, 'No real creator selected');
    await js(`detailRecord=${JSON.stringify(selected)}; state=await window.scout.invoke('state'); await act('save', {dataset:{id:detailRecord.id}}); await act('open-outreach', {dataset:{id:detailRecord.id}})`);
    assert(await js('!!document.getElementById("draft-form")'), 'Outreach form missing');
    const originalBody = await js('document.getElementById("draft-body").value');
    await js(`document.getElementById('draft-body').value += ${JSON.stringify('\n\n[Visual QA edit]')}; document.getElementById('draft-form').requestSubmit()`);
    await until(() => js('state.saved[detailRecord.id].draft.body.endsWith("[Visual QA edit]")'), 'local draft save');
    await js(`document.getElementById('draft-body').value=${JSON.stringify(originalBody)}; document.getElementById('draft-form').requestSubmit()`);
    await until(() => js(`state.saved[detailRecord.id].draft.body === ${JSON.stringify(originalBody)}`), 'restore draft');
    const snap = await js('({state, turns, detailRecord})');
    fs.writeFileSync(path.join(out, 'live-workspace.json'), JSON.stringify(snap, null, 2));
    report.checks.push('Live API discovery, strict subscriber check, source contact research, save to isolated CRM, create/edit/save local draft');
  } else {
    // Replay uses the same actual provider records captured by a preceding live run.
    const snap = JSON.parse(fs.readFileSync(path.join(out, 'live-workspace.json'), 'utf8'));
    await js(`state=${JSON.stringify(snap.state)}; turns=${JSON.stringify(snap.turns)}; detailRecord=${JSON.stringify(snap.detailRecord)}; render()`);
    report.live = { replay: 'live-workspace.json from preceding real provider run' };
    const active = JSON.parse(fs.readFileSync(path.join(out, 'live-active.json'), 'utf8'));
    const completed = snap.turns;
    for (const width of widths) {
      await js(`turns=[${JSON.stringify(active)}]; turns[0].loading=true; view='chat'; render()`);
      await capture('active-search', width, 'replayed captured live progress');
    }
    await js(`turns=${JSON.stringify(completed)}; render()`);
  }
  const workspace = await js('({state, turns, detailRecord})');
  await js(`notice=''; error=''; queryLimit=10; render()`);
  for (const width of widths) {
    await js(`view='chat'; render()`);
    await capture('search-complete', width, 'real provider result');
    await js(`document.querySelector('.creator-list')?.scrollIntoView({block:'start'})`);
    await pause(60);
    fs.writeFileSync(path.join(out, `${width}-results.png`), (await panel.capturePage()).toPNG());
    report.captures.push({ file:`${width}-results.png`, name:'results', width, provenance:'real provider results' });
    await js(`view='detail'; render()`);
    await capture('creator-profile', width, 'real provider creator and source contact');
    await capture('profile-sources', width, 'real creator sources', 'bottom');
    await js(`view='saved'; render()`);
    await capture('crm', width, 'saved real provider record');
    await js(`view='outreach'; render()`);
    await capture('outreach', width, 'local draft for real creator');
    await capture('outreach-actions', width, 'local draft actions', 'bottom');
    await js(`view='settings'; render()`);
    await capture('settings', width, 'actual connector state, AI disabled');
    await capture('settings-providers', width, 'actual provider availability', 'bottom');
    await js(`state={...state, saved:{}}; view='saved'; render()`);
    await capture('empty-crm', width, 'empty native CRM');
    await js(`view='outreach'; render()`);
    await capture('empty-outreach', width, 'empty native outreach');
    await js(`state=${JSON.stringify(workspace.state)}; turns=[{query:'Find creators',loading:true,records:[]}]; view='chat'; render()`);
    await capture('loading', width, 'explicit loading edge case');
    await js(`turns=[{query:'Find creators',loading:false,records:[],error:'YouTube returned a temporary error. Try again shortly.'}]; render()`);
    await capture('search-error', width, 'synthetic provider failure edge case');
    await js(`state={...state,connected:false}; view='settings'; render()`);
    await capture('api-disconnected', width, 'synthetic disconnected edge case');
    await js(`state=${JSON.stringify(workspace.state)}; detailRecord={...${JSON.stringify(workspace.detailRecord)},id:'edge-case-only',bestContact:null,contacts:{},contactResearch:{status:'not-found'}}; view='detail'; render()`);
    await capture('no-contact', width, 'synthetic no-contact edge case');
    await js(`detailRecord={...detailRecord,name:'A very long creator name with a creative studio, collaborators, and international production',bestContact:{type:'public_email',value:'partnerships-and-creator-collaborations@a-very-long-example-domain.example',sourceUrl:'https://example.com/contact'}}; render()`);
    await capture('long-profile', width, 'synthetic overflow stress case');
    await js(`state.saved={}; turns=[{query:'Layout stress test · 125 synthetic records',loading:false,showAll:true,records:Array.from({length:125},(_,i)=>({...detailRecord,id:'edge-'+i,name:detailRecord.name+' '+(i+1)}))}]; view='chat'; render()`);
    await capture('125-results', width, 'synthetic 125-record stress test');
    await capture('125-results-bottom', width, 'synthetic scroll stress test', 'bottom');
    assert(await js('document.querySelectorAll(".creator-row").length === 125'), 'Results lost');
    assert(await js('document.getElementById("content").scrollTop > 0'), 'Results did not scroll');
    await js(`state=${JSON.stringify(workspace.state)}; turns=${JSON.stringify(workspace.turns)}; detailRecord=${JSON.stringify(workspace.detailRecord)}; view='chat'; render()`);
  }
  // Check secondary capabilities and composer input are retained across navigation.
  await js(`await act('new-chat'); document.getElementById('ask-input').value='kept while navigating'; await act('go-settings'); await act('go-chat')`);
  assert.equal(await js('document.getElementById("ask-input").value'), 'kept while navigating');
  assert(await js('!!document.querySelector("#home-search #composer")'), 'Home lost the live composer');
  await js(`await act('go-texts'); await act('go-chat')`);
  assert.equal(await js('activeMode'), 'scout');
  report.checks.push('All four native widths; no horizontal overflow; long name/email wrapping; 125 rendered rows and scroll; navigation retains search input; Ask My Texts exit');
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  if (live) fs.writeFileSync(path.join(out, 'live-report.json'), JSON.stringify(report, null, 2));
  assert.equal(report.failures.length, 0, report.failures.join('\n'));
  console.log(`PASS ${report.captures.length} native Electron captures; ${report.checks.join('; ')}`);
  app.exit(0);
}).catch(error => {
  report.failures.push(error.message);
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  console.error(error.stack);
  app.exit(1);
});
app.on('will-quit', () => { try { fs.rmSync(profile, {recursive:true,force:true}); } catch {} });
