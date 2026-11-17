// ECS installs Widevine through its own authorized component updater. Stock
// Electron remains usable, with an explicit unavailable state, for rollback.
async function initializeMediaRuntime(components, { timeoutMs = 12000 } = {}) {
  const state = { provider: components ? 'castlabs' : 'stock-electron', status: 'unavailable' };
  if (!components?.whenReady) return state;
  state.status = 'installing';
  let timer;
  const ready = Promise.resolve().then(() => components.whenReady()).then(() => {
    state.status = 'ready';
    state.components = components.status();
  }).catch((error) => {
    state.status = 'failed';
    state.error = error.code || error.name || 'ComponentInstallationFailed';
  });
  await Promise.race([ready, new Promise((resolve) => {
    timer = setTimeout(() => { state.status = 'pending'; resolve(); }, timeoutMs);
  })]);
  clearTimeout(timer);
  return state;
}

module.exports = { initializeMediaRuntime };
