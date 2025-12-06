import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  // --- 1. ENABLE CORS (Allow Extension to Connect) ---
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle the "Preflight" check browsers do automatically
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  // ---------------------------------------------------

  if (req.method !== 'POST') return res.status(405).send('Only POST allowed');

  const { link, tags, password } = req.body;

  // 2. CHECK PASSWORD
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Wrong password!' });
  }

  try {
    // 3. SCRAPE & SAVE
    const response = await fetch(link);
    const html = await response.text();
    const $ = cheerio.load(html);
    
    const title = $('meta[property="og:title"]').attr('content') || $('title').text();
    const image = $('meta[property="og:image"]').attr('content');
    const summary = $('meta[property="og:description"]').attr('content');

    const { data, error } = await supabase
      .from('bookmarks')
      .insert([{ url: link, title, image, summary, tags }]);

    if (error) throw error;

    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
