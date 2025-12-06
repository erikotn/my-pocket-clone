import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Only POST allowed');

  // We now accept 'tags' from the frontend
  const { link, tags } = req.body;

  try {
    const response = await fetch(link);
    const html = await response.text();
    const $ = cheerio.load(html);
    
    const title = $('meta[property="og:title"]').attr('content') || $('title').text();
    const image = $('meta[property="og:image"]').attr('content');
    const summary = $('meta[property="og:description"]').attr('content');

    // Save to Supabase with the new 'tags' field
    const { data, error } = await supabase
      .from('bookmarks')
      .insert([{ url: link, title, image, summary, tags }]);

    if (error) throw error;

    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
