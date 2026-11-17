function explainLoadError(code, description) {
  const text = String(description || '');
  if (code === -200 || text.includes('CERT_COMMON_NAME_INVALID')) {
    return 'ERR_CERT_COMMON_NAME_INVALID: The site’s certificate does not match its address. Check the address and your network connection, or contact the site or network administrator.';
  }
  if (text.includes('CERT_')) {
    return `${text}: The site’s security certificate could not be trusted, so the page stayed closed.`;
  }
  return text || 'The page failed to load.';
}

function errorPage({ description, url, dark }) {
  const background = dark ? '#202124' : '#f3f4f6';
  const card = dark ? '#2d2e31' : '#ffffff';
  const text = dark ? '#e8eaed' : '#1f1f1f';
  const muted = dark ? '#9aa0a6' : '#5f6368';
  const safe = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Can't open this page</title>
  <style>
    body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: ${background}; color: ${text}; font: 15px/1.5 -apple-system, BlinkMacSystemFont, sans-serif; }
    .card { width: min(460px, calc(100% - 48px)); background: ${card}; border-radius: 16px; padding: 28px; box-shadow: 0 12px 40px rgba(0,0,0,.12); }
    h1 { margin: 0 0 8px; font-size: 22px; }
    p { margin: 0 0 12px; color: ${muted}; }
    code { display: block; overflow-wrap: anywhere; color: ${text}; font-size: 12px; }
  </style>
</head>
<body>
  <!-- righttab-error-page -->
  <div class="card">
    <h1>Can't open this page</h1>
    <p>${safe(description || 'The page failed to load.')}</p>
    <code>${safe(url || '')}</code>
    <p>Check the address, then press Reload.</p>
  </div>
</body>
</html>`;
}

function errorPageUrl(details) {
  return `data:text/html;charset=utf-8,${encodeURIComponent(errorPage(details))}`;
}

module.exports = { errorPageUrl, explainLoadError };
