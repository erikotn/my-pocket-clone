import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

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

    // --- 1. SPECIAL HANDLER FOR X / TWITTER ---
    if (link.includes('x.com') || link.includes('twitter.com')) {
      try {
        // We force the URL to be 'twitter.com' because the oEmbed API works better with it
        const safeLink = link.replace('x.com', 'twitter.com');
        const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(safeLink)}`;
        
        const response = await fetch(oembedUrl);
        
        if (response.ok) {
          const json = await response.json();
          title = `Tweet by ${json.author_name}`;
          
          // Clean up the HTML to get just text
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
      } catch (e) {
        // If scraping fails completely, just save the URL
        console.error('Scraping failed', e);
      }
    }

    // Save to Database
    const { data, error } = await supabase
      .from('bookmarks')
      .insert([{ url: link, title, image, summary, tags, note, is_archived: is_archived === true }]);

    if (error) throw error;

    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
