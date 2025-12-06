import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  // 1. CORS for Chrome Extension
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') return res.status(405).send('Only POST allowed');

  const { link, tags, password } = req.body;

  // 2. PASSWORD CHECK
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Wrong password!' });
  }

  try {
    // 3. DUPLICATE CHECK (New Feature)
    // We ask Supabase: "Do we already have this URL?"
    const { data: existing } = await supabase
      .from('bookmarks')
      .select('id')
      .eq('url', link);

    // If we found a match, stop here.
    if (existing && existing.length > 0) {
      return res.status(400).json({ error: 'Link already saved!' });
    }

    // 4. SCRAPE & SAVE
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
