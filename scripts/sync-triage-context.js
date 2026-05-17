#!/usr/bin/env node
// Build-time sync: fetch the latest triage prompt from Notion and replace the
// TRIAGE_CONTEXT constant in lib/triage-context.js so the bundled fallback is
// always within one deploy of the Notion source.
//
// Runs before `next build` (see package.json). On any failure (missing env,
// Notion down, malformed response, target file structure changed) it logs a
// warning and exits 0 — the build always proceeds, and the previous fallback
// stays in place. This is intentional: a Notion outage should never break a
// deploy.

const fs = require('fs');
const path = require('path');

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_PAGE_ID = process.env.NOTION_PAGE_ID;
const TARGET = path.join(__dirname, '..', 'lib', 'triage-context.js');
const START_MARKER = 'export const TRIAGE_CONTEXT = `';

function warn(msg) {
  console.warn(`[sync-triage-context] ${msg} — keeping current bundled fallback.`);
}

function escapeForTemplateLiteral(s) {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
}

async function main() {
  if (!NOTION_API_KEY || !NOTION_PAGE_ID) {
    warn('NOTION_API_KEY or NOTION_PAGE_ID not set');
    return;
  }

  let res;
  try {
    res = await fetch(
      `https://api.notion.com/v1/blocks/${NOTION_PAGE_ID}/children?page_size=100`,
      {
        headers: {
          Authorization: `Bearer ${NOTION_API_KEY}`,
          'Notion-Version': '2022-06-28',
        },
      }
    );
  } catch (e) {
    warn(`Notion fetch threw: ${e.message}`);
    return;
  }

  if (!res.ok) {
    warn(`Notion returned HTTP ${res.status}`);
    return;
  }

  const json = await res.json();
  const codeBlock = (json.results || []).find((b) => b.type === 'code');
  if (!codeBlock) {
    warn('Notion page has no code block');
    return;
  }

  const text = (codeBlock.code.rich_text || [])
    .map((r) => r.plain_text || '')
    .join('');
  if (!text.trim()) {
    warn('Notion code block is empty');
    return;
  }

  let current;
  try {
    current = fs.readFileSync(TARGET, 'utf8');
  } catch (e) {
    warn(`Cannot read ${TARGET}: ${e.message}`);
    return;
  }

  const startIdx = current.indexOf(START_MARKER);
  if (startIdx === -1) {
    warn(`Start marker "${START_MARKER}" not found in target file`);
    return;
  }
  const contentStart = startIdx + START_MARKER.length;
  const endIdx = current.indexOf('`;', contentStart);
  if (endIdx === -1) {
    warn('Closing "`;" not found in target file');
    return;
  }

  const escaped = escapeForTemplateLiteral(text);
  const updated =
    current.slice(0, contentStart) + escaped + current.slice(endIdx);

  if (updated === current) {
    console.log('[sync-triage-context] Already in sync, no changes written.');
    return;
  }

  fs.writeFileSync(TARGET, updated, 'utf8');
  console.log(
    `[sync-triage-context] Synced ${text.length} chars from Notion into bundled fallback.`
  );
}

main().catch((e) => {
  warn(`Unhandled error: ${e.message}`);
});
