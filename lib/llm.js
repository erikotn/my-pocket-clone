import { TRIAGE_CONTEXT } from './triage-context';

function extractJSON(str) {
  if (!str) return null;
  let s = String(str).trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch (e) {
    console.error('extractJSON parse failed:', e.message, 'raw:', s.slice(0, 200));
    return null;
  }
}

export async function triageLink({ url, title, summary, body, note }) {
  if (!process.env.OPENROUTER_API_KEY) return null;
  const isTwitter = url.includes('x.com') || url.includes('twitter.com');
  const userPrompt = `Beoordeel deze link.

URL: ${url}
Titel: ${title || '(none)'}
Samenvatting: ${summary || '(none)'}
${note ? `Erik's notitie: ${note}\n` : ''}${body ? `Body excerpt:\n${body}` : ''}

${isTwitter ? 'Dit is een X/Twitter-link — voeg ook een follow_advice toe voor het account.' : 'Dit is geen Twitter-link — laat follow_advice op null.'}

Antwoord uitsluitend met JSON in dit exacte format:
{
  "verdict": "take" | "partial" | "try" | "skip",
  "reasoning": "2-4 zinnen, direct, geen omhaal",
  "priority": "⬆⬆" | "⬆" | "⬇" | "⬇⬇" | null,
  "action": "beknopte volgende stap als verdict take of partial, anders null",
  "follow_advice": "follow" | "maybe" | "unfollow" | null
}

priority alleen invullen bij verdict "try", anders null.`;

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
          { role: 'system', content: TRIAGE_CONTEXT },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 600,
      }),
    });
    if (!response.ok) {
      console.error('Triage OpenRouter status', response.status, await response.text());
      return null;
    }
    const json = await response.json();
    const content = json.choices?.[0]?.message?.content;
    const parsed = extractJSON(content);
    if (!parsed || !['take', 'partial', 'try', 'skip'].includes(parsed.verdict)) return null;
    return parsed;
  } catch (e) {
    console.error('Triage failed:', e);
    return null;
  }
}

export async function suggestTagsLLM({ title, summary, body, note, existingTags }) {
  if (!process.env.OPENROUTER_API_KEY) return null;
  const tagList = existingTags.length > 0 ? existingTags.join(', ') : '(none yet)';
  const prompt = `Suggest 0 to 3 tags for this bookmark. Strongly prefer tags from this existing list: ${tagList}. Only invent a new tag (max 1) if none of the existing tags fit. Tags must be short (1-2 lowercase words), comma-separated.

SPECIAL RULE: If the content is about a Dutch regional business (especially in Drenthe, Friesland, or Groningen) or a local Northern-Dutch entrepreneur/company, ALWAYS include the tag "klant?" (with question mark) — this flags possible clients of the user's branding agency for manual review.

Title: ${title || '(none)'}
Summary: ${summary || '(none)'}
${note ? `User note: ${note}\n` : ''}Body excerpt:
${body || '(none)'}

Respond with JSON only: {"tags": ["tag1", "tag2"]}`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 80,
      }),
    });
    if (!response.ok) {
      console.error('OpenRouter status', response.status, await response.text());
      return null;
    }
    const json = await response.json();
    const content = json.choices?.[0]?.message?.content;
    const parsed = extractJSON(content);
    if (!parsed || !Array.isArray(parsed.tags)) return null;
    return parsed.tags
      .map(t => String(t).trim().toLowerCase())
      .filter(t => t.length > 0 && t.length < 30)
      .slice(0, 3)
      .join(', ') || null;
  } catch (e) {
    console.error('Tag suggestion failed:', e);
    return null;
  }
}
