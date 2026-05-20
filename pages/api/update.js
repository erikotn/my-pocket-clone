import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Only POST allowed');

  // Now accepts is_archived, note, tags, deleted_at, triage, etc.
  const { id, tags, note, is_archived, deleted_at, triage, password } = req.body;

  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Wrong password!' });
  }

  // Create update object dynamically so we don't overwrite nulls
  const updates = {};
  if (tags !== undefined) updates.tags = tags;
  if (note !== undefined) updates.note = note;
  if (is_archived !== undefined) updates.is_archived = is_archived;
  if (deleted_at !== undefined) updates.deleted_at = deleted_at;
  if (triage !== undefined) updates.triage = triage;

  const { error } = await supabase
    .from('bookmarks')
    .update(updates)
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });

  res.status(200).json({ success: true });
}
