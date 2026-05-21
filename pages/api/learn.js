import { createClient } from '@supabase/supabase-js';
import { getTriageContext } from '../../lib/triage-context';

// Analyseer alle user-overrides en stel concrete tekstuele aanvullingen voor aan de
// Notion-prompt. Schrijft niets weg — Erik leest het voorstel en past zelf Notion aan.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const NOTION_PAGE_URL = 'https://www.notion.so/My-Pocket-Triage-Prompt-363050f96a8481a999dcc4d15a02daae';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Only POST allowed');

  const { password } = req.body || {};
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Wrong password!' });
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(500).json({ error: 'OPENROUTER_API_KEY ontbreekt' });
  }

  // 1. Verzamel alle overrides — items waar Erik het LLM-oordeel heeft bijgesteld én waar
  // we het origineel hebben bewaard.
  const { data: rows, error } = await supabase
    .from('bookmarks')
    .select('url, title, summary, note, tags, triage, created_at')
    .not('triage', 'is', null)
    .is('deleted_at', null)
    .order('id', { ascending: false })
    .limit(500);

  if (error) return res.status(500).json({ error: error.message });

  const overrides = (rows || []).filter(
    b => b.triage?.user_set === true && b.triage?.original_verdict
  );

  if (overrides.length === 0) {
    return res.status(200).json({
      overrides_count: 0,
      suggestions: '_Nog geen overrides met bewaard origineel gevonden. Pas je de eerstvolgende keer een verdict aan, dan onthoudt het systeem het oorspronkelijke LLM-oordeel automatisch._',
      notion_url: NOTION_PAGE_URL,
    });
  }

  // 2. Bouw een compact "casebook" voor de LLM
  const casebook = overrides
    .map((o, i) => {
      const title = (o.title || '(geen titel)').slice(0, 100);
      const origReason = o.triage.original_reasoning
        ? String(o.triage.original_reasoning).replace(/\s+/g, ' ').slice(0, 220)
        : '(geen reden)';
      return `### Case ${i + 1}\n- Titel: ${title}\n- URL: ${o.url}\n- LLM-oordeel: **${o.triage.original_verdict}** — "${origReason}"\n- Erik koos: **${o.triage.verdict}**`;
    })
    .join('\n\n');

  // 3. Huidige Notion-prompt ophalen — zo kan de LLM concrete aanvullingen in dezelfde stijl voorstellen
  const currentPrompt = await getTriageContext();

  const systemPrompt = `Je bent een prompt-engineer die de Notion-triage-prompt van Erik tuned op basis van zijn correcties. Erik heeft de tool getraind door verdicts te overrulen — jouw taak is patronen in die overrides te herkennen en concrete, korte aanvullingen voor te stellen op de Notion-prompt.

Schrijf in dezelfde toon als de bestaande prompt (zakelijk Nederlands, geen jargon, geen padding). Voorstellen zijn maximaal 2-3 stuks, elk 1-3 zinnen. Geen losse adviezen of meta-reflecties — alleen tekstblokken die letterlijk in de Notion-prompt geplakt kunnen worden, met de plek waar ze horen.

Format antwoord (markdown):

## Patroon: <korte naam van het patroon>

**Waar in de prompt**: <sectie-naam uit de huidige Notion-prompt, of "Nieuwe sectie">

**Voorgestelde tekst**:
> <de tekst die Erik in Notion kan plakken — direct bruikbaar, geen omschrijving>

**Onderbouwing**: <1-2 zinnen waarom dit patroon erbij hoort, met verwijzing naar specifieke cases (case 1, case 3, etc.)>

Geen patroon te vinden in een dimensie? Dan minder dan 3 voorstellen — niet padden.`;

  const userPrompt = `# Huidige Notion-triage-prompt

\`\`\`
${currentPrompt}
\`\`\`

# Casebook — ${overrides.length} overrides

${casebook}

# Vraag

Analyseer de overrides. Welke 2-3 patronen zie je? Geef per patroon een concrete tekstuele aanvulling die in de Notion-prompt past, in het format zoals beschreven.`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4.6',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Learn OpenRouter status', response.status, text);
      return res.status(500).json({ error: `LLM call faalde (${response.status})` });
    }

    const json = await response.json();
    const suggestions = json.choices?.[0]?.message?.content || '';

    res.status(200).json({
      overrides_count: overrides.length,
      suggestions,
      notion_url: NOTION_PAGE_URL,
    });
  } catch (e) {
    console.error('Learn endpoint threw:', e);
    res.status(500).json({ error: e.message });
  }
}
