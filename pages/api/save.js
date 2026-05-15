import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function suggestTagsLLM({ title, summary, body, note, existingTags }) {
  if (!process.env.OPENROUTER_API_KEY) return null;
  const tagList = existingTags.length > 0 ? existingTags.join(', ') : '(none yet)';
  const prompt = `Suggest 0 to 3 tags for this bookmark. Strongly prefer tags from this existing list: ${tagList}. Only invent a new tag (max 1) if none of the existing tags fit. Tags must be short (1-2 lowercase words), comma-separated.

Title: ${title || '(none)'}
Summary: ${summary || '(none)'}
${note ? `User note: ${note}\n` : ''}Body excerpt:
${body || '(none)'}

Respond with JSON only: {"tags": ["tag1", "tag2"]}`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 80,
      }),
    });
    if (!response.ok) {
      console.error('OpenRouter status', response.status, await response.text());
      return null;
    }
    const json = await response.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed.tags)) return null;
    return parsed.tags
      .map(t => String(t).trim().toLowerCase())
      .filter(t => t.length > 0 && t.length < 30)
      .slice(0, 3)
      .join(', ') || null;
  } catch (e) {
    console.error('Tag suggestion failed:', e);
    return null;
  }
}

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

    // --- 3. TAG SUGGESTION (only when user didn't provide tags) ---
    let suggested_tags = null;
    if (!tags || !String(tags).trim()) {
      const { data: tagRows } = await supabase
        .from('bookmarks')
        .select('tags')
        .not('tags', 'is', null);
      const allTags = (tagRows || [])
        .flatMap(b => (b.tags || '').split(',').map(t => t.trim().toLowerCase()))
        .filter(Boolean);
      const uniqueTags = [...new Set(allTags)].sort();

      suggested_tags = await suggestTagsLLM({
        title,
        summary,
        body: bodyText,
        note,
        existingTags: uniqueTags,
      });
    }

    // Save to Database
    const { data, error } = await supabase
      .from('bookmarks')
      .insert([{ url: link, title, image, summary, tags, note, is_archived: is_archived === true, suggested_tags }]);

    if (error) throw error;

    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
