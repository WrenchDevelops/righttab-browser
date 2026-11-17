const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { net } = require('electron');
const Homepage = require('../shared/homepage.cjs');

const PAGE_ROOT = path.join(__dirname, '../src/newtab');
const WALLPAPER_ROOT = path.join(__dirname, '../src/wallpapers');
const CSP = [
  "default-src 'self'",
  "img-src 'self' https: data:",
  "style-src 'self'",
  "script-src 'self'",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ');

function inside(root, file) {
  const base = path.resolve(root);
  const resolved = path.resolve(file);
  return resolved === base || resolved.startsWith(`${base}${path.sep}`);
}

function createHomepageService(userData) {
  const installed = new WeakSet();

  function fileFor(route) {
    if (!route) return '';
    if (route.kind === 'page') return path.join(PAGE_ROOT, route.file);
    if (route.kind === 'wallpaper') return path.join(WALLPAPER_ROOT, route.file);
    if (route.kind === 'user') return path.join(userData, 'homepage', route.bucket, route.file);
    return '';
  }

  async function handle(request) {
    let route = null;
    try { route = Homepage.resolveHomepageRoute(new URL(request.url).pathname); } catch { route = null; }
    const file = fileFor(route);
    const root = route?.kind === 'page' ? PAGE_ROOT : route?.kind === 'wallpaper' ? WALLPAPER_ROOT : route?.kind === 'user' ? path.join(userData, 'homepage', route.bucket) : '';
    if (!file || !root || !inside(root, file) || !fs.existsSync(file)) return new Response('Not found', { status: 404 });
    try {
      const result = await net.fetch(pathToFileURL(file).toString());
      const headers = new Headers(result.headers);
      headers.set('Content-Security-Policy', CSP);
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('Cache-Control', 'no-store');
      return new Response(result.body, { status: result.status, headers });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  }

  function install(ses) {
    if (!ses || installed.has(ses)) return;
    installed.add(ses);
    ses.protocol.handle('righttab', handle);
  }

  async function geocode(query) {
    const name = String(query || '').trim().slice(0, 80);
    if (name.length < 2) return { places: [], error: 'Enter a city name.' };
    try {
      const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=en&format=json`, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) return { places: [], error: 'City search is unavailable right now.' };
      const data = await response.json();
      const places = Homepage.sanitizePlaces(data.results);
      return places.length ? { places } : { places: [], error: 'No matching city.' };
    } catch {
      return { places: [], error: 'City search is unavailable right now.' };
    }
  }

  async function reverse(location) {
    try {
      const response = await fetch(`https://geocoding-api.open-meteo.com/v1/reverse?latitude=${location.latitude}&longitude=${location.longitude}&language=en&format=json`, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) return { ...location, name: location.name || 'Current location' };
      const data = await response.json();
      const places = Homepage.sanitizePlaces(data.results);
      return places[0] ? { ...location, ...places[0] } : { ...location, name: location.name || 'Current location' };
    } catch {
      return { ...location, name: location.name || 'Current location' };
    }
  }

  async function forecast(location, unit) {
    const temperatureUnit = unit === 'celsius' ? 'celsius' : 'fahrenheit';
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(location.latitude));
    url.searchParams.set('longitude', String(location.longitude));
    url.searchParams.set('current', 'temperature_2m,weather_code,is_day');
    url.searchParams.set('hourly', 'temperature_2m,weather_code');
    url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min');
    url.searchParams.set('temperature_unit', temperatureUnit);
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('forecast_days', '4');
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) return { ok: false, error: 'Weather is unavailable right now.' };
      const data = await response.json();
      const report = Homepage.parseForecast(data, location, temperatureUnit);
      if (!report) return { ok: false, error: 'Weather is unavailable right now.' };
      return { ok: true, weather: report };
    } catch {
      return { ok: false, error: 'Weather is unavailable right now.' };
    }
  }

  async function suggestions(engine, query) {
    const endpoints = {
      google: `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}`,
      bing: `https://api.bing.com/osjson.aspx?query=${encodeURIComponent(query)}`,
      duckduckgo: `https://duckduckgo.com/ac/?q=${encodeURIComponent(query)}&type=list`,
      brave: `https://search.brave.com/api/suggest?q=${encodeURIComponent(query)}`,
    };
    const endpoint = endpoints[engine];
    if (!endpoint) return [];
    try {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(2500), headers: { Accept: 'application/json' } });
      if (!response.ok) return [];
      return Homepage.parseRemoteSuggestions(await response.json());
    } catch {
      return [];
    }
  }

  function saveUpload(kind, sourcePath) {
    const allowed = { '.png': 'png', '.jpg': 'jpg', '.jpeg': 'jpg', '.webp': 'webp' };
    const clean = allowed[path.extname(String(sourcePath || '')).toLowerCase()];
    if (!clean) return { ok: false, error: 'Use a PNG, JPEG, or WebP image.' };
    let stat;
    try { stat = fs.statSync(sourcePath); } catch { return { ok: false, error: 'That image could not be read.' }; }
    if (!stat.isFile() || stat.size <= 0 || stat.size > 8 * 1024 * 1024) return { ok: false, error: 'Images need to be 8 MB or smaller.' };
    const bucket = kind === 'icon' ? 'icons' : 'wallpapers';
    const dir = path.join(userData, 'homepage', bucket);
    fs.mkdirSync(dir, { recursive: true });
    const filename = `${crypto.randomUUID()}.${clean}`;
    fs.copyFileSync(sourcePath, path.join(dir, filename));
    return { ok: true, url: `righttab://newtab/user/${kind === 'icon' ? 'icon' : 'wallpaper'}/${filename}` };
  }

  return { install, geocode, reverse, forecast, suggestions, saveUpload };
}

module.exports = { createHomepageService };
