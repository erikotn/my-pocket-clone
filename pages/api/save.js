import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';
import { waitUntil } from '@vercel/functions';
import { triageLink, suggestTagsLLM, fetchRecentOverrides } from '../../lib/llm';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Paginatekst wordt bewaard (link rot, zoeken, hertriëren zonder opnieuw ophalen).
// De LLM krijgt alleen het begin ervan — ongewijzigd t.o.v. voorheen.
const MAX_CONTENT_CHARS = 50000;
const LLM_BODY_CHARS = 2000;
const FETCH_TIMEOUT_MS = 5000; // trage sites houden het opslaan niet langer op

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Only POST allowed');

  const { link, tags, note, password, is_archived } = req.body;

  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Wrong password!' });
  }

  try {
    let title = 'Untitled Link';
    let image = null;
    let summary = '';
    let bodyText = '';

    // Tags en correcties alvast opvragen, tegelijk met het ophalen van de pagina
    const userProvidedTags = tags && String(tags).trim().length > 0;
    const tagRowsPromise = userProvidedTags
      ? Promise.resolve({ data: [] })
      : supabase.from('bookmarks').select('tags').not('tags', 'is', null);
    // Haal recente overrides op als kalibratie voor de triage-call (acuut leren)
    const overridesPromise = fetchRecentOverrides(supabase, 10);

    // --- 1. SPECIAL HANDLER FOR X / TWITTER ---
    if (link.includes('x.com') || link.includes('twitter.com')) {
      try {
        const safeLink = link.replace('x.com', 'twitter.com');
        const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(safeLink)}`;
        const response = await fetch(oembedUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        if (response.ok) {
          const json = await response.json();
          title = `Tweet by ${json.author_name}`;
          const $ = cheerio.load(json.html);
          summary = $('p').text();
        } else {
          title = 'X / Twitter Link';
        }
      } catch (e) {
        console.error('Twitter fetch failed', e);
        title = 'X / Twitter Link';
      }
    }
    // --- 2. NORMAL HANDLER FOR ALL OTHER SITES ---
    else {
      try {
        const response = await fetch(link, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        const html = await response.text();
        const $ = cheerio.load(html);

        title = $('meta[property="og:title"]').attr('content') || $('title').text() || 'Untitled Link';
        image = $('meta[property="og:image"]').attr('content');
        summary = $('meta[property="og:description"]').attr('content');

        // Extract article body for LLM context
        $('script, style, nav, header, footer, aside, noscript').remove();
        bodyText = ($('article').text() || $('main').text() || '').trim();
        if (bodyText.length < 200) {
          bodyText = $('p').map((i, el) => $(el).text()).get().join(' ');
        }
        bodyText = bodyText.replace(/\s+/g, ' ').trim().slice(0, MAX_CONTENT_CHARS);
      } catch (e) {
        console.error('Scraping failed', e);
      }
    }

    // --- 3. Direct opslaan; tags en triage volgen op de achtergrond ---
    const { data, error } = await supabase
      .from('bookmarks')
      .insert([{ url: link, title, image, summary, tags, note, is_archived: is_archived === true, suggested_tags: null, triage: null, content: bodyText || null }])
      .select('id')
      .single();

    if (error) throw error;

    const llmBody = bodyText.slice(0, LLM_BODY_CHARS);
    waitUntil((async () => {
      try {
        const [{ data: tagRows }, recentOverrides] = await Promise.all([tagRowsPromise, overridesPromise]);
        const uniqueTags = [...new Set(
          (tagRows || [])
            .flatMap(b => (b.tags || '').split(',').map(t => t.trim().toLowerCase()))
            .filter(Boolean)
        )].sort();
        const [suggested_tags, triage] = await Promise.all([
          userProvidedTags
            ? Promise.resolve(null)
            : suggestTagsLLM({ title, summary, body: llmBody, note, existingTags: uniqueTags }),
          triageLink({ url: link, title, summary, body: llmBody, note, recentOverrides }),
        ]);
        const { error: updErr } = await supabase.from('bookmarks').update({ suggested_tags, triage }).eq('id', data.id);
        if (updErr) console.error('Triage update failed', updErr);
      } catch (e) {
        console.error('Background triage failed', e);
      }
    })());

    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
