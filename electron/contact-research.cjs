// Read-only, bounded research of HTTPS sites linked directly by a creator.
const https = require('node:https');
const dns = require('node:dns/promises');
const net = require('node:net');
const { load } = require('cheerio');

const blocked4 = new net.BlockList();
const blocked6 = new net.BlockList();
for (const [address, prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]]) blocked4.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of [['::',128],['::1',128],['::ffff:0:0',96],['64:ff9b::',96],['100::',64],['2001:db8::',32],['2001::',23],['2002::',16],['fc00::',7],['fe80::',10],['ff00::',8]]) blocked6.addSubnet(address, prefix, 'ipv6');
function isPublicAddress(address) { const family = net.isIP(address); return !!family && !(family === 4 ? blocked4.check(address, 'ipv4') : blocked6.check(address, 'ipv6')); }
function allowedUrl(value, host) {
  let url; try { url = new URL(value); } catch { throw new Error('Invalid website URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || net.isIP(url.hostname.replace(/^\[|\]$/g, '')) || /(?:^|\.)(?:localhost|local|internal)$/i.test(url.hostname)) throw new Error('Website URL is not permitted');
  if (host && url.hostname.replace(/^www\./i, '') !== host.replace(/^www\./i, '')) throw new Error('Cross-domain redirects are not followed');
  url.hash = '';
  return url;
}
async function getPage(value, { signal, host, redirects = 0 } = {}) {
  signal?.throwIfAborted();
  const url = allowedUrl(value, host);
  const dnsSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(6000)]) : AbortSignal.timeout(6000);
  dnsSignal.throwIfAborted();
  let onAbort;
  const aborted = new Promise((_resolve, reject) => { onAbort = () => reject(dnsSignal.reason); dnsSignal.addEventListener('abort', onAbort, { once: true }); });
  let addresses;
  try { addresses = await Promise.race([dns.lookup(url.hostname, { all: true, verbatim: true }), aborted]); }
  finally { dnsSignal.removeEventListener('abort', onAbort); }
  signal?.throwIfAborted();
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw new Error('Website resolves to a non-public address');
  const selected = addresses[0];
  const result = await new Promise((resolve, reject) => {
    const timeout = AbortSignal.timeout(6000);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const req = https.request(url, { method: 'GET', family: selected.family, signal: combined, headers: { 'user-agent': 'RightTab-CreatorScout/1.0 (public contact research)', accept: 'text/html' }, lookup: (_name, _opts, callback) => callback(null, selected.address, selected.family) }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); return resolve({ redirect: new URL(res.headers.location, url).href }); }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`Website returned HTTP ${res.statusCode}`)); }
      if (!/^text\/html(?:;|$)/i.test(res.headers['content-type'] || '')) { res.resume(); return reject(new Error('Website did not return HTML')); }
      const chunks = []; let size = 0;
      res.on('data', (chunk) => { size += chunk.length; if (size > 512 * 1024) req.destroy(new Error('Website response exceeded size limit')); else chunks.push(chunk); });
      res.on('end', () => resolve({ html: Buffer.concat(chunks).toString('utf8'), url: url.href }));
      res.on('error', reject);
    });
    req.on('error', reject); req.end();
  });
  if (result.redirect) {
    if (redirects >= 2) throw new Error('Website redirect limit reached');
    return getPage(result.redirect, { signal, host: host || url.hostname, redirects: redirects + 1 });
  }
  return result;
}
function parsePage(html, pageUrl) {
  const $ = load(html); $('script,style,noscript,template,svg').remove();
  const title = $('title').first().text().trim();
  const pageIsContact = /contact|business|partnership|sponsor|inquir|management|representation|booking/i.test(`${new URL(pageUrl).pathname} ${title} ${$('h1').first().text()}`);
  const emails = new Set();
  $('a[href^="mailto:"]').each((_i, e) => { const value = String($(e).attr('href') || '').slice(7).split('?')[0]; try { const email = decodeURIComponent(value).trim(); if (/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email)) emails.add(email); } catch {} });
  const text = $('body').find('*').addBack().contents().filter((_i, node) => node.type === 'text').map((_i, node) => node.data || '').get().join(' ').replace(/\s+/g, ' ').slice(0, 60000);
  if (pageIsContact) for (const email of text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi) || []) emails.add(email);
  const links = [];
  $('a[href]').each((_i, e) => {
    if (!/contact|business|partnership|sponsor|inquir|about|management|representation|booking/i.test(`${$(e).text()} ${$(e).attr('href')}`)) return;
    try { const url = allowedUrl(new URL($(e).attr('href'), pageUrl).href, new URL(pageUrl).hostname); if (!links.includes(url.href)) links.push(url.href); } catch {}
  });
  const form = pageIsContact && $('form').toArray().some((e) => $(e).find('textarea, input[type="email"]').length > 0);
  const score = (url) => /contact|business|inquir/i.test(url) ? 3 : /management|representation|booking|sponsor|partnership/i.test(url) ? 2 : 1;
  links.sort((a, b) => score(b) - score(a));
  return { emails: [...emails].slice(0, 5), links: links.slice(0, 10), form, isContactPage: pageIsContact, context: text.slice(0, 4000) };
}
async function researchCreator(record, { signal, fetchPage = getPage, depth = 'quick', selectEmail = null } = {}) {
  const budget = depth === 'deep' ? { domains: 3, pages: 9 } : depth === 'standard' ? { domains: 2, pages: 5 } : { domains: 1, pages: 3 };
  const roots = [], seenHosts = new Set();
  for (const link of (record.links || []).map((item) => item.url).filter(Boolean)) {
    try {
      const u = allowedUrl(link);
      if (/(^|\.)(youtube\.com|youtu\.be|instagram\.com|tiktok\.com|x\.com|twitter\.com|facebook\.com)$/.test(u.hostname)) continue;
      const key = u.hostname.replace(/^www\./, '');
      if (!seenHosts.has(key)) { seenHosts.add(key); roots.push(u); }
    } catch {}
  }
  roots.sort((a, b) => Number(/contact|business|partner|sponsor|book|management/i.test(b.pathname)) - Number(/contact|business|partner|sponsor|book|management/i.test(a.pathname)));
  if (!roots.length) return { status: 'not-available', candidates: [], pagesVisited: 0, domainsVisited: 0 };
  const visited = new Set(), errors = []; let domainsVisited = 0, contactPagesVisited = 0; const alternatives = [];
  for (const root of roots.slice(0, budget.domains)) {
    if (visited.size >= budget.pages) break;
    domainsVisited++;
    const queue = [root.href];
    let pagesForDomain = 0;
    const perDomain = Math.ceil(budget.pages / budget.domains);
    while (queue.length && visited.size < budget.pages && pagesForDomain < perDomain) {
      signal?.throwIfAborted();
      const url = queue.shift(); if (visited.has(url)) continue; visited.add(url); pagesForDomain++;
      try {
        const page = await fetchPage(url, { signal, host: root.hostname });
        signal?.throwIfAborted();
        const parsed = parsePage(page.html, page.url);
        if (parsed.isContactPage) contactPagesVisited++;
        const base = { sourceUrl: page.url, discoveredAt: new Date().toISOString(), sourceRelationship: 'creator_linked_website', ownershipStatus: 'unverified', deliverability: 'unknown', provider: 'RightTab public website research' };
        if (parsed.emails.length) {
          let ordered = parsed.emails, selectedBy = ''; const warnings = [];
          if (selectEmail && ordered.length > 1) {
            try {
              const selected = await selectEmail({ emails: ordered, context: parsed.context, sourceUrl: page.url });
              signal?.throwIfAborted();
              if (selected && ordered.includes(selected)) { ordered = [selected, ...ordered.filter((value) => value !== selected)]; selectedBy = 'deepseek'; }
            } catch (error) { signal?.throwIfAborted(); warnings.push(`AI selection unavailable: ${error.message}`); }
          }
          return { status: 'found', pagesVisited: visited.size, domainsVisited, contactPagesVisited, candidates: [...ordered.map((value, index) => ({ ...base, type: 'public_email', value, ...(index === 0 && selectedBy ? { selectedBy } : {}) })), ...alternatives], ...(warnings.length ? { warnings } : {}), ...(errors.length ? { errors } : {}) };
        }
        if (parsed.form) alternatives.push({ ...base, type: 'contact_form', value: page.url });
        queue.push(...parsed.links.filter((link) => !visited.has(link)));
      } catch (error) { signal?.throwIfAborted(); errors.push(error.message); }
    }
  }
  return { status: alternatives.length ? 'found' : errors.length ? 'provider-error' : 'no-contact-found', pagesVisited: visited.size, domainsVisited, contactPagesVisited, candidates: alternatives, ...(errors.length ? { errors } : {}) };
}

module.exports = { researchCreator, parsePage, allowedUrl, isPublicAddress };
