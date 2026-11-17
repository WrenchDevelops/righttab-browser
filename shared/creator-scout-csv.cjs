const COLUMNS = ['Platform','Channel','Handle','Channel URL','Subscribers','Views','Video count','Country','Description','Tags','Notes','Project','Outreach status','Contact type','Contact value','Contact source URL','Contact source title','Contact status','Website','Instagram','TikTok','Contact page','Contact discovery source','Data source','Last refreshed','Date added'];
const DEFAULT_COLUMNS = ['Platform','Channel','Channel URL','Data source','Last refreshed'];

function creatorScoutCsv(snapshot, ids, columns = DEFAULT_COLUMNS) {
  const saved = snapshot.saved || {};
  const lists = snapshot.lists || [];
  const selected = [...new Set((Array.isArray(ids) ? ids : []).filter((id) => saved[id]))].slice(0, 750);
  if (!selected.length) throw new Error('Select saved creators to export.');
  const fields = [...new Set((Array.isArray(columns) ? columns : []).filter((column) => COLUMNS.includes(column)))];
  if (!fields.length) throw new Error('Select at least one CSV field.');
  const cell = (value) => `"${String(value ?? '').replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""')}"`;
  const rows = selected.map((id) => {
    const item = saved[id], r = item.record, list = lists.find((entry) => entry.id === item.listId);
    const contacts = r.contacts || {};
    const values = { Platform:r.platform, Channel:r.name, Handle:r.handle, 'Channel URL':r.url, Subscribers:r.subscribers, Views:r.views, 'Video count':r.videoCount, Country:r.country, Description:r.description, Tags:item.tags, Notes:item.notes, Project:list?.name || '', 'Outreach status':item.outreach, 'Contact type':item.contact?.type || '', 'Contact value':item.contact?.value || '', 'Contact source URL':item.contact?.sourceUrl || '', 'Contact source title':item.contact?.sourceTitle || '', 'Contact status': item.contact?.status || contacts.status || 'not checked', Website:contacts.website?.url || '', Instagram:contacts.instagram?.url || '', TikTok:contacts.tiktok?.url || '', 'Contact page':contacts.contactPage?.url || '', 'Contact discovery source':contacts.source || '', 'Data source':r.source, 'Last refreshed':r.refreshedAt, 'Date added':item.addedAt };
    return fields.map((column) => cell(values[column])).join(',');
  });
  return [fields.map(cell).join(','), ...rows].join('\r\n') + '\r\n';
}
module.exports = { creatorScoutCsv, COLUMNS, DEFAULT_COLUMNS };
