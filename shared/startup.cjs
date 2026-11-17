const { isRestorableTabUrl } = require('./url.cjs');

function startupPlan(session, restoreSession) {
  const windows = Array.isArray(session?.windows)
    ? session.windows.filter((item) => item?.tabs?.some((tab) => isRestorableTabUrl(tab.url)))
    : [];
  if (!windows.length) return { mode: 'home', windows: [] };
  if (session.cleanExit !== true) return { mode: 'crash', windows };
  if (restoreSession) return { mode: 'resume', windows };
  return { mode: 'home', windows: [] };
}

module.exports = { startupPlan };
