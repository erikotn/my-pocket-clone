import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';
import { triageLink, suggestTagsLLM } from '../../lib/llm';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

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

    // --- 1. SPECIAL HANDLER FOR X / TWITTER ---
    if (link.includes('x.com') || link.includes('twitter.com')) {
      try {
        const safeLink = link.replace('x.com', 'twitter.com');
        const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(safeLink)}`;
        const response = await fetch(oembedUrl);
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
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' }
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
        bodyText = bodyText.replace(/\s+/g, ' ').trim().slice(0, 2000);
      } catch (e) {
        console.error('Scraping failed', e);
      }
    }

    // --- 3. PARALLEL LLM CALLS: tag suggestions (Gemini Flash) + triage (Sonnet) ---
    const userProvidedTags = tags && String(tags).trim().length > 0;
    let uniqueTags = [];
    if (!userProvidedTags) {
      const { data: tagRows } = await supabase
        .from('bookmarks')
        .select('tags')
        .not('tags', 'is', null);
      uniqueTags = [...new Set(
        (tagRows || [])
          .flatMap(b => (b.tags || '').split(',').map(t => t.trim().toLowerCase()))
          .filter(Boolean)
      )].sort();
    }

    const [suggested_tags, triage] = await Promise.all([
      userProvidedTags
        ? Promise.resolve(null)
        : suggestTagsLLM({ title, summary, body: bodyText, note, existingTags: uniqueTags }),
      triageLink({ url: link, title, summary, body: bodyText, note }),
    ]);

    // Save to Database
    const { data, error } = await supabase
      .from('bookmarks')
      .insert([{ url: link, title, image, summary, tags, note, is_archived: is_archived === true, suggested_tags, triage }]);

    if (error) throw error;

    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
