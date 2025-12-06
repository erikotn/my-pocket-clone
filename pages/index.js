import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Only POST allowed');

  const { id, tags, password } = req.body;

  // Security Check
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Wrong password!' });
  }

  // Update the tags for this specific ID
  const { error } = await supabase
    .from('bookmarks')
    .update({ tags: tags })
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });

  res.status(200).json({ success: true });
}
