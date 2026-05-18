const DEFAULT_API_BASE = 'https://my-pocket-clone.vercel.app';

const apiBaseEl = document.getElementById('apiBase');
const passwordEl = document.getElementById('password');
const statusEl = document.getElementById('status');

async function loadSettings() {
  const data = await chrome.storage.local.get(['apiBase', 'password']);
  apiBaseEl.value = data.apiBase || DEFAULT_API_BASE;
  passwordEl.value = data.password || '';
}

function setStatus(msg, cls = 'info') {
  statusEl.textContent = msg;
  statusEl.className = 'status ' + cls;
}

function getApiBase() {
  return apiBaseEl.value.trim().replace(/\/$/, '');
}

document.getElementById('save').addEventListener('click', async () => {
  const apiBase = getApiBase();
  const password = passwordEl.value;
  if (!apiBase || !password) {
    setStatus('Vul beide velden in.', 'err');
    return;
  }
  await chrome.storage.local.set({ apiBase, password });
  setStatus('Opgeslagen ✓', 'ok');
});

document.getElementById('test').addEventListener('click', async () => {
  const apiBase = getApiBase();
  const password = passwordEl.value;
  if (!apiBase || !password) {
    setStatus('Vul eerst beide velden in.', 'err');
    return;
  }
  setStatus('Testen…', 'info');
  try {
    const res = await fetch(`${apiBase}/api/fetch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    let json = {};
    try { json = await res.json(); } catch (_) {}

    if (!res.ok) {
      setStatus(`HTTP ${res.status} — controleer URL.`, 'err');
      return;
    }
    if (json.error) {
      setStatus('Fout: ' + json.error, 'err');
      return;
    }
    const count = Array.isArray(json.data) ? json.data.length : 0;
    setStatus(`Verbinding werkt — ${count} bookmarks gevonden.`, 'ok');
  } catch (e) {
    setStatus('Verbinding mislukt: ' + e.message, 'err');
  }
});

loadSettings();
