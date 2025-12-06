import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

// Initialize Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  // Only allow POST requests (sending data)
  if (req.method !== 'POST') return res.status(405).send('Only POST allowed');

  const { link } = req.body;

  try {
    // 1. Fetch the HTML from the URL
    const response = await fetch(link);
    const html = await response.text();

    // 2. Load HTML into Cheerio to scrape it
    const $ = cheerio.load(html);
    
    // 3. Extract Meta Tags (Open Graph tags used by social media)
    const title = $('meta[property="og:title"]').attr('content') || $('title').text();
    const image = $('meta[property="og:image"]').attr('content');
    const summary = $('meta[property="og:description"]').attr('content');

    // 4. Save to Supabase database
    const { data, error } = await supabase
      .from('bookmarks')
      .insert([{ url: link, title, image, summary }]);

    if (error) throw error;

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
}
