import { createClient } from '@supabase/supabase-js';
import { triageLink, suggestTagsLLM } from '../../lib/llm';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const BATCH_SIZE = 3; // tuned to stay under 10s Vercel Hobby limit

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Only POST allowed');

  const { password } = req.body;
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Wrong password!' });
  }

  // Pending = no triage yet, not deleted
  const { data: pending, error: fetchErr } = await supabase
    .from('bookmarks')
    .select('id, url, title, summary, tags, note')
    .is('triage', null)
    .is('deleted_at', null)
    .order('id', { ascending: false })
    .limit(BATCH_SIZE);

  if (fetchErr) return res.status(500).json({ error: fetchErr.message });
  if (!pending || pending.length === 0) {
    return res.status(200).json({ processed: 0, remaining: 0, done: true });
  }

  // Shared tag vocab across this batch
  const { data: tagRows } = await supabase
    .from('bookmarks')
    .select('tags')
    .not('tags', 'is', null);
  const existingTags = [...new Set(
    (tagRows || [])
      .flatMap(b => (b.tags || '').split(',').map(t => t.trim().toLowerCase()))
      .filter(Boolean)
  )].sort();

  // Process items in parallel
  await Promise.all(pending.map(async item => {
    const userHasTags = item.tags && item.tags.trim().length > 0;
    const [suggested_tags, triage] = await Promise.all([
      userHasTags
        ? Promise.resolve(null)
        : suggestTagsLLM({
            title: item.title,
            summary: item.summary,
            body: '',
            note: item.note,
            existingTags,
          }),
      triageLink({
        url: item.url,
        title: item.title,
        summary: item.summary,
        body: '',
        note: item.note,
      }),
    ]);

    // Sentinel for failed analyses so they don't get retried forever.
    // To retry: UPDATE bookmarks SET triage = NULL WHERE triage->>'failed' = 'true';
    const triageValue = triage || { failed: true, at: new Date().toISOString() };
    const updates = { triage: triageValue };
    if (!userHasTags && suggested_tags) updates.suggested_tags = suggested_tags;

    await supabase.from('bookmarks').update(updates).eq('id', item.id);
  }));

  // Count remaining for progress
  const { count } = await supabase
    .from('bookmarks')
    .select('id', { count: 'exact', head: true })
    .is('triage', null)
    .is('deleted_at', null);

  res.status(200).json({
    processed: pending.length,
    remaining: count || 0,
    done: (count || 0) === 0,
  });
}
