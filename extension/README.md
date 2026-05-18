# My Pocket — Save (Chrome extension)

Eén-klik save vanuit Chrome naar je my-pocket-clone.

## Installeren

1. Open Chrome → `chrome://extensions/`
2. Zet **Developer mode** aan (toggle rechtsboven)
3. Klik **Load unpacked**
4. Selecteer deze `extension/` folder
5. Klik op het puzzelstukje-icoon in je toolbar → pin **My Pocket — Save** vast
6. Rechtsklik het icoon → **Options** (of klik 't aan zonder password — opent vanzelf)
7. Vul in:
   - **App URL**: `https://my-pocket-clone.vercel.app` (default; pas aan als je een ander domain hebt)
   - **Password**: hetzelfde wachtwoord als waarmee je inlogt op de web-app
8. Klik **Test verbinding** — moet "Verbinding werkt — N bookmarks gevonden" tonen
9. Klik **Opslaan**

## Gebruik

- **Op elke pagina**: klik het toolbar-icoon → tab wordt opgeslagen in je Inbox
- **Op een link in een pagina**: rechtermuisklik → **Save to My Pocket** → die link wordt opgeslagen zonder dat je 'm hoeft te openen

Feedback via badge op het icoon:
- `…` bezig
- `✓` succes (3 sec zichtbaar)
- `✕` fout (5 sec; check de extension service-worker console voor details via `chrome://extensions` → Inspect service worker)
- `?` URL is geen http(s) (bv. `chrome://settings`)

## Updaten

Pas een bestand aan → ga naar `chrome://extensions/` → klik het refresh-icoontje op de extension-kaart. Geen reload van Chrome nodig.

## Architectuur

- `manifest.json` — MV3 declaratie
- `background.js` — service worker, handelt klik + context-menu af
- `options.html` + `options.js` — settings-pagina (URL + password)
- `icons/` — toolbar-iconen

Alle requests gaan vanuit de service worker rechtstreeks naar `/api/save` op je Vercel-deploy. Chrome-extensions met `host_permissions` voor de doel-URL omzeilen CORS, dus geen backend-wijzigingen nodig.

Password en URL staan in `chrome.storage.local` — alleen toegankelijk voor deze extension, en niet gesynchroniseerd met andere apparaten. Wil je dat wel: gebruik `chrome.storage.sync` in `options.js` en `background.js` (verander `local` naar `sync`).
