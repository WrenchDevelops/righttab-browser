const fs = require('node:fs');
const path = require('node:path');
const { probeDocument } = require('../electron/media-probe.cjs');
const { probeMediaConfigurations } = require('../electron/media-configuration-probe.cjs');

function comparison(left, right) {
  const matrix = (report) => new Map((report.configurations?.matrix || []).map((item) => [`${item.robustness}/${item.encryptionScheme}`, item.supported === true]));
  const l = matrix(left), r = matrix(right);
  const different = [...new Set([...l.keys(), ...r.keys()])].sort().filter((key) => l.get(key) !== r.get(key))
    .map((configuration) => ({ configuration, rightTab: l.get(configuration) ?? 'not measured', supportedBrowser: r.get(configuration) ?? 'not measured' }));
  const status = (report) => (report.events || []).filter((event) => event.category === 'license' && ['http-error', 'license-response'].includes(event.kind)).map((event) => event.status);
  return { format: 'righttab-media-comparison', version: 1,
    productionSignatureVerified: left.productionVerification?.production === true,
    rightTabProtectedVideoObserved: left.playback?.protectedPlaybackObserved === true,
    supportedBrowserProtectedVideoObserved: right.playback?.protectedPlaybackObserved === true,
    titlePlaybackVerified: false,
    configurationsMeasured: { rightTab: l.size, supportedBrowser: r.size }, differences: different,
    cdm: { rightTab: left.mediaRuntime?.components || 'not recorded', supportedBrowser: right.configurations?.cdmVersion || 'not recorded' },
    licenseHttpStatuses: { rightTab: status(left), supportedBrowser: status(right) },
    conclusion: 'A capability difference is not proof that Disney requested that configuration. Certification cannot be inferred from HTTP 400 alone. Verify the same account/title, production VMP, and actual title playback in the control browser before classifying the remaining cause.',
  };
}

function browserProbeSource() {
  return `// Run locally in the Disney+ document in an authorized supported browser.
// Read-only EME/codec/configuration queries and playback snapshots; no license
// payloads, keys, cookies, headers, arbitrary console text, or page URLs saved.
(async () => {
  const configurations = await (${probeMediaConfigurations.toString()})();
  const initial = await (${probeDocument.toString()})();
  await new Promise(resolve => setTimeout(resolve, 5000));
  const final = await (${probeDocument.toString()})();
  const protectedPlaybackObserved = initial.media.some((first, index) => {
    const last = final.media[index];
    return first.kind === 'video' && first.hasMediaKeys && last?.hasMediaKeys && !last.paused && last.readyState >= 2 && last.width > 0 && last.currentTime > first.currentTime + 3 && last.decodedFrames > first.decodedFrames;
  });
  const events = performance.getEntriesByType('resource').flatMap(entry => {
    try {
      const url = new URL(entry.name);
      if (!/license|widevine/i.test(url.pathname)) return [];
      const status = Number(entry.responseStatus) || 0;
      return [{ kind: status >= 400 ? 'http-error' : 'license-response', category: 'license', origin: url.origin, status: status || 'not exposed' }];
    } catch { return []; }
  });
  const report = { format: 'righttab-browser-comparison', version: 1, configurations, initial: [initial], final: [final], events,
    playback: { protectedPlaybackObserved, titlePlaybackVerified: false },
    limitations: ['CDM version is not exposed by EME; record it separately from the components UI.', 'Resource Timing may hide cross-origin HTTP status.', 'Actual title and audio require observation; no service configuration interception is performed.'] };
  const blob = new Blob([JSON.stringify(report, null, 2)], {type:'application/json'});
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = objectUrl; link.download = 'supported-browser-media.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  return report;
})();
`;
}

function main(args = process.argv.slice(2)) {
  const dir = path.join(__dirname, '../test-results');
  fs.mkdirSync(dir, { recursive: true });
  if (args[0] === 'probe' && args.length === 1) {
    const file = path.join(dir, 'supported-browser-media-probe.js');
    fs.writeFileSync(file, browserProbeSource(), { mode: 0o600 });
    return { script: file, executed: false, note: 'Use only after the signed test if comparison is needed; no browser or account has been accessed.' };
  }
  if (args[0] === 'compare' && args.length === 3) {
    const result = comparison(JSON.parse(fs.readFileSync(args[1], 'utf8')), JSON.parse(fs.readFileSync(args[2], 'utf8')));
    const file = path.join(dir, 'media-comparison.json');
    fs.writeFileSync(file, JSON.stringify(result, null, 2), { mode: 0o600 });
    return { report: file, ...result };
  }
  throw new Error('Use probe, or compare /path/to/signed-righttab-report.json /path/to/supported-browser-report.json.');
}

if (require.main === module) { try { console.log(JSON.stringify(main(), null, 2)); } catch (error) { console.error(error.message); process.exitCode = 1; } }
module.exports = { comparison, browserProbeSource };
