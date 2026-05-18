// My Pocket — Save (Chrome extension service worker, MV3)
//
// Twee triggers:
//   1. Klik op toolbar-icoon → huidige tab opslaan
//   2. Rechtermuisklik op een link → die link opslaan zonder te openen
//
// Resultaat zichtbaar via badge op het icoon:
//   …  = bezig
//   ✓  = succes (3s zichtbaar)
//   ✕  = fout (5s zichtbaar, check console.error voor details)
//   ?  = pagina-URL is geen http(s) (bv. chrome://) — niets gedaan
//
// Eerste keer dat je klikt zonder password → opent settings-pagina.

const DEFAULT_API_BASE = 'https://my-pocket-clone.vercel.app';

async function getConfig() {
  const data = await chrome.storage.local.get(['apiBase', 'password']);
  return {
    apiBase: (data.apiBase || DEFAULT_API_BASE).replace(/\/$/, ''),
    password: data.password || null,
  };
}

let clearBadgeTimer = null;
async function showBadge(text, color, autoClearMs = 0) {
  if (clearBadgeTimer) clearTimeout(clearBadgeTimer);
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text });
  if (autoClearMs > 0) {
    clearBadgeTimer = setTimeout(() => chrome.action.setBadgeText({ text: '' }), autoClearMs);
  }
}

async function saveLink(url) {
  const { apiBase, password } = await getConfig();
  if (!password) {
    // Eerste gebruik: settings openen.
    await chrome.runtime.openOptionsPage();
    return;
  }

  await showBadge('…', '#888888');

  try {
    const res = await fetch(`${apiBase}/api/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        link: url,
        tags: '',
        note: '',
        password,
        is_archived: false, // → komt in Inbox terecht
      }),
    });

    let json = {};
    try { json = await res.json(); } catch (_) {}

    if (res.ok && !json.error) {
      await showBadge('✓', '#10b981', 3000);
    } else {
      console.error('[my-pocket-save] Save failed:', res.status, json);
      await showBadge('✕', '#ef4444', 5000);
    }
  } catch (e) {
    console.error('[my-pocket-save] Save threw:', e);
    await showBadge('✕', '#ef4444', 5000);
  }
}

// Toolbar-icoon → huidige tab
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.url || !/^https?:/i.test(tab.url)) {
    await showBadge('?', '#888888', 3000);
    return;
  }
  await saveLink(tab.url);
});

// Context-menu (rechtermuisklik op een link)
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'mypocket-save-link',
    title: 'Save to My Pocket',
    contexts: ['link'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === 'mypocket-save-link' && info.linkUrl) {
    await saveLink(info.linkUrl);
  }
});
