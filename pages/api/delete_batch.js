import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Only POST allowed');

  const { ids, password } = req.body;

  // 1. SECURITY CHECK
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Wrong password!' });
  }

  if (!ids || ids.length === 0) {
    return res.status(400).json({ error: 'No items selected' });
  }

  // 2. Delete all items that match the list of IDs
  const { error } = await supabase
    .from('bookmarks')
    .delete()
    .in('id', ids);

  if (error) return res.status(500).json({ error: error.message });

  res.status(200).json({ success: true });
}
