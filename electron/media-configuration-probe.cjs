// Availability/configuration queries only. No license sessions, interception,
// persistent identifiers, or changes to the provider's EME implementation.
async function probeMediaConfigurations() {
  const videoType = 'video/mp4; codecs="avc1.42E01E"';
  const audioType = 'audio/mp4; codecs="mp4a.40.2"';
  const bounded = async (promise) => {
    let timer;
    try { return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error(), { name: 'TimeoutError' })), 5000);
    })]); } finally { clearTimeout(timer); }
  };
  const pairs = ['', 'SW_SECURE_CRYPTO', 'SW_SECURE_DECODE', 'SW_SECURE_ALL', 'HW_SECURE_CRYPTO', 'HW_SECURE_DECODE', 'HW_SECURE_ALL']
    .flatMap(robustness => ['cenc', 'cbcs'].map(encryptionScheme => ({ robustness, encryptionScheme })));
  const matrix = await Promise.all(pairs.map(async ({ robustness, encryptionScheme }) => {
      const config = {
        initDataTypes: ['cenc'], sessionTypes: ['temporary'],
        persistentState: 'not-allowed', distinctiveIdentifier: 'not-allowed',
        videoCapabilities: [{ contentType: videoType, robustness, encryptionScheme }],
        audioCapabilities: [{ contentType: audioType, robustness: robustness ? 'SW_SECURE_CRYPTO' : '', encryptionScheme }],
      };
      try {
        if (!navigator.requestMediaKeySystemAccess) throw Object.assign(new Error(), { name: 'APIUnavailable' });
        const access = await bounded(navigator.requestMediaKeySystemAccess('com.widevine.alpha', [config]));
        return { robustness: robustness || 'unspecified', encryptionScheme, supported: true, selected: access.getConfiguration() };
      } catch (error) { return { robustness: robustness || 'unspecified', encryptionScheme, supported: false, error: error.name }; }
  }));
  let decoding;
  try {
    const result = await bounded(navigator.mediaCapabilities.decodingInfo({
      type: 'media-source',
      video: { contentType: videoType, width: 1920, height: 1080, bitrate: 5000000, framerate: 30 },
      audio: { contentType: audioType, channels: '2', bitrate: 128000, samplerate: 48000 },
      keySystemConfiguration: { keySystem: 'com.widevine.alpha', initDataType: 'cenc',
        distinctiveIdentifier: 'not-allowed', persistentState: 'not-allowed', sessionTypes: ['temporary'],
        video: { robustness: 'SW_SECURE_DECODE' }, audio: { robustness: 'SW_SECURE_CRYPTO' } },
    }));
    decoding = { supported: result.supported, smooth: result.smooth, powerEfficient: result.powerEfficient, keySystemAccess: !!result.keySystemAccess };
  } catch (error) { decoding = { error: error.name || 'APIUnavailable' }; }
  return { format: 'righttab-media-configurations', version: 1, at: new Date().toISOString(),
    origin: location.origin, secureContext: isSecureContext, userAgent: navigator.userAgent,
    cdmVersion: 'not exposed by EME; record separately from the browser components UI',
    matrix, decoding,
    limitation: 'These are requested diagnostic configurations, not evidence of the configuration negotiated by Disney. No license request is made.' };
}

module.exports = { probeMediaConfigurations };
