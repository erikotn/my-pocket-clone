import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Only POST allowed');

  const { link, tags, note, password } = req.body;

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
        // Trick: The oEmbed API prefers 'twitter.com' over 'x.com'
        const safeLink = link.replace('x.com', 'twitter.com');
        const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(safeLink)}`;
        
        const response = await fetch(oembedUrl);
        
        if (response.ok) {
          const json = await response.json();
          
          // The API gives us the Author Name (e.g. "Elon Musk")
          title = `Tweet by ${json.author_name}`;
          
          // The API gives us HTML (<blockquote>...</blockquote>). We strip tags to get clean text.
          const $ = cheerio.load(json.html);
          summary = $('p').text(); // Extract just the tweet text
        } else {
          title = 'X / Twitter Link'; // Fallback if API fails
        }
      } catch (e) {
        console.error('Twitter fetch failed', e);
        title = 'X / Twitter Link';
      }
    } 
    // --- 2. NORMAL HANDLER FOR ALL OTHER SITES ---
    else {
      const response = await fetch(link, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' }
      });
      const html = await response.text();
      const $ = cheerio.load(html);
      
      title = $('meta[property="og:title"]').attr('content') || $('title').text() || 'Untitled Link';
      image = $('meta[property="og:image"]').attr('content');
      summary = $('meta[property="og:description"]').attr('content');
    }

    // Save to Database
    const { data, error } = await supabase
      .from('bookmarks')
      .insert([{ url: link, title, image, summary, tags, note }]);

    if (error) throw error;

    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
