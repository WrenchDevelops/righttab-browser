const COMPONENT_LOCATIONS = new Set([1, 5, 10]);

const LOCATION_LABELS = {
  0: 'unknown',
  1: 'component',
  2: 'external',
  3: 'registry',
  4: 'unpacked',
  5: 'component',
  6: 'external download',
  7: 'policy',
  8: 'command line',
  9: 'policy',
  10: 'component',
};

function listChromeExtensions(prefs) {
  const settings = prefs?.extensions?.settings;
  if (!settings || typeof settings !== 'object') return [];
  const items = [];
  for (const [id, ext] of Object.entries(settings)) {
    if (!/^[a-p]{32}$/.test(id)) continue;
    const location = Number(ext?.location);
    if (COMPONENT_LOCATIONS.has(location)) continue;
    const manifest = ext?.manifest || {};
    const permissions = []
      .concat(manifest.permissions || [], manifest.host_permissions || [], manifest.optional_permissions || [])
      .filter((permission) => typeof permission === 'string')
      .slice(0, 40);
    const name = String(manifest.name || ext?.manifest?.short_name || id);
    if (name.startsWith('__MSG_')) continue;
    items.push({
      id,
      name: name.slice(0, 200),
      version: String(manifest.version || ''),
      enabled: ext.state === 1 && !ext.disable_reasons,
      location,
      locationLabel: LOCATION_LABELS[location] || 'installed',
      unpacked: location === 4,
      path: typeof ext.path === 'string' ? ext.path : '',
      permissions,
    });
  }
  items.sort((a, b) => a.name.localeCompare(b.name));
  return items;
}

module.exports = { listChromeExtensions, COMPONENT_LOCATIONS };
