import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  // Only allow POST (because we are sending a password)
  if (req.method !== 'POST') return res.status(405).send('Only POST allowed');

  const { password } = req.body;

  // 1. Check Password against Vercel's Secret
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Wrong password' });
  }

  // 2. Fetch Data from Supabase
  const { data, error } = await supabase
    .from('bookmarks')
    .select('*')
    .order('id', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  // 3. Return the private data
  res.status(200).json({ data });
}
