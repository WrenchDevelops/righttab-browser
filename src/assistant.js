const status = document.getElementById('status');
const activity = document.getElementById('activity');
let busy = false;
async function run(label, action) {
  if (busy) return;
  busy = true; status.textContent = `Waiting for approval: ${label}`;
  try {
    const result = await action();
    const entry = document.createElement('article');
    entry.textContent = label === 'Read page' ? `${result.title}\n${result.url}\n\n${result.text}` : `Click dispatched: ${result.label}`;
    activity.prepend(entry);
    status.textContent = label === 'Read page' ? 'Page read' : 'Click dispatched; check the page for the result';
  } catch (error) { status.textContent = error.message || 'Action failed'; }
  finally { busy = false; }
}
document.getElementById('read').addEventListener('click', () => run('Read page', () => window.assistantPreview.read()));
document.getElementById('click-form').addEventListener('submit', (event) => { event.preventDefault(); const label = document.getElementById('label').value.trim(); if (label) run('Click button', () => window.assistantPreview.click(label)); });
