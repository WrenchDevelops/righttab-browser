// Read-only capability probe. Runs in the document's origin and session; never
// requests a license, reads credentials, or changes the site's EME functions.
async function probeDocument() {
  const video = document.createElement('video');
  const types = {
    h264: 'video/mp4; codecs="avc1.42E01E"',
    aac: 'audio/mp4; codecs="mp4a.40.2"',
    vp9: 'video/webm; codecs="vp9"',
    opus: 'audio/webm; codecs="opus"',
  };
  const codecs = Object.fromEntries(Object.entries(types).map(([name, type]) => [name, {
    canPlayType: video.canPlayType(type),
    mediaSource: typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(type),
  }]));
  const bounded = (promise) => {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error(), { name: 'TimeoutError' })), 5000);
    })]).finally(() => clearTimeout(timer));
  };
  const configurations = [
    ['widevine-mp4', 'com.widevine.alpha', 'cenc', types.h264, types.aac, ''],
    ['widevine-mp4-software', 'com.widevine.alpha', 'cenc', types.h264, types.aac, 'SW_SECURE_CRYPTO'],
    ['widevine-webm', 'com.widevine.alpha', 'webm', types.vp9, types.opus, ''],
    ['clearkey-mp4', 'org.w3.clearkey', 'cenc', types.h264, types.aac, ''],
  ];
  const keySystems = await Promise.all(configurations.map(async ([name, system, initData, videoType, audioType, robustness]) => {
    if (!navigator.requestMediaKeySystemAccess) return { name, supported: false, error: 'APIUnavailable' };
    try {
      const access = await bounded(navigator.requestMediaKeySystemAccess(system, [{
        initDataTypes: [initData], sessionTypes: ['temporary'],
        distinctiveIdentifier: 'optional', persistentState: 'optional',
        videoCapabilities: [{ contentType: videoType, ...(robustness ? { robustness } : {}) }],
        audioCapabilities: [{ contentType: audioType, ...(robustness ? { robustness } : {}) }],
      }]));
      const keys = await bounded(access.createMediaKeys());
      return { name, supported: true, mediaKeysCreated: !!keys, configuration: access.getConfiguration() };
    } catch (error) { return { name, supported: false, error: error.name }; }
  }));
  let decoding;
  try {
    decoding = navigator.mediaCapabilities?.decodingInfo ? await bounded(navigator.mediaCapabilities.decodingInfo({
      type: 'media-source',
      video: { contentType: types.h264, width: 1280, height: 720, bitrate: 2000000, framerate: 30 },
      audio: { contentType: types.aac, channels: '2', bitrate: 128000, samplerate: 48000 },
    })) : { error: 'APIUnavailable' };
  } catch (error) { decoding = { error: error.name }; }
  return {
    origin: location.origin, secureContext: isSecureContext,
    eme: typeof navigator.requestMediaKeySystemAccess === 'function',
    mediaSource: typeof MediaSource !== 'undefined',
    mediaCapabilities: typeof navigator.mediaCapabilities?.decodingInfo === 'function',
    codecs, keySystems, decoding,
    media: [...document.querySelectorAll('video, audio')].map((el) => ({
      kind: el.tagName.toLowerCase(), paused: el.paused, currentTime: el.currentTime,
      readyState: el.readyState, networkState: el.networkState,
      muted: el.muted, volume: el.volume, width: el.videoWidth || 0, height: el.videoHeight || 0,
      decodedFrames: el.getVideoPlaybackQuality?.().totalVideoFrames || 0,
      hasMediaKeys: !!el.mediaKeys, error: el.error ? { code: el.error.code } : null,
    })),
  };
}

async function probeContents(contents, { timeoutMs = 8000 } = {}) {
  const frames = contents.mainFrame.framesInSubtree;
  return Promise.all(frames.map(async (frame) => {
    let timer;
    try { return await Promise.race([frame.executeJavaScript(`(${probeDocument.toString()})()`), new Promise((resolve) => {
      timer = setTimeout(() => resolve({ error: 'FrameProbeTimeout' }), timeoutMs);
    })]); }
    catch (error) { return { error: error.name || 'FrameUnavailable' }; }
    finally { clearTimeout(timer); }
  }));
}

module.exports = { probeDocument, probeContents };
