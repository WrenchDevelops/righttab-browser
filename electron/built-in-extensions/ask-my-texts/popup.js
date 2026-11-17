const status = document.querySelector('#status');
const result = document.querySelector('#result');

function show(response) {
  result.hidden = false;
  result.textContent = response.text || response.error || 'No result returned.';
  status.textContent = response.ok ? 'Local result' : 'Ask My Texts needs attention';
}
async function run(payload) {
  status.textContent = 'Searching your local index…';
  result.hidden = true;
  try { show(await window.askMyTexts.request(payload)); }
  catch (error) { show({ ok: false, error: error.message || 'Could not reach Ask My Texts.' }); }
}
document.querySelector('#search-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const query = document.querySelector('#query').value.trim();
  if (query) run({ action: 'search', query });
});
document.querySelector('#recent').addEventListener('click', () => run({ action: 'recent', limit: 15 }));
run({ action: 'status' });
