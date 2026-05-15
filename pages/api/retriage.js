import { createClient } from '@supabase/supabase-js';
import { triageLink, suggestTagsLLM } from '../../lib/llm';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Only POST allowed');

  const { id, password } = req.body;
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Wrong password!' });
  }
  if (!id) return res.status(400).json({ error: 'Missing id' });

  const { data: item, error: fetchErr } = await supabase
    .from('bookmarks')
    .select('id, url, title, summary, tags, note')
    .eq('id', id)
    .single();
  if (fetchErr) return res.status(500).json({ error: fetchErr.message });
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const userHasTags = item.tags && item.tags.trim().length > 0;

  let existingTags = [];
  if (!userHasTags) {
    const { data: tagRows } = await supabase
      .from('bookmarks')
      .select('tags')
      .not('tags', 'is', null);
    existingTags = [...new Set(
      (tagRows || [])
        .flatMap(b => (b.tags || '').split(',').map(t => t.trim().toLowerCase()))
        .filter(Boolean)
    )].sort();
  }

  const [suggested_tags, triage] = await Promise.all([
    userHasTags
      ? Promise.resolve(null)
      : suggestTagsLLM({ title: item.title, summary: item.summary, body: '', note: item.note, existingTags }),
    triageLink({ url: item.url, title: item.title, summary: item.summary, body: '', note: item.note }),
  ]);

  if (!triage) {
    return res.status(500).json({ error: 'LLM call failed, see Vercel logs' });
  }

  const updates = { triage };
  if (!userHasTags && suggested_tags) updates.suggested_tags = suggested_tags;
  const { error: updErr } = await supabase.from('bookmarks').update(updates).eq('id', id);
  if (updErr) return res.status(500).json({ error: updErr.message });

  res.status(200).json({ success: true, triage, suggested_tags });
}
