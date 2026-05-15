import * as cheerio from 'cheerio';
import { triageLink } from '../../lib/llm';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Only POST allowed');

  const { url, password } = req.body;
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Wrong password' });
  }
  if (!url || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: 'Invalid url' });
  }

  let title = '';
  let summary = '';
  let bodyText = '';

  try {
    if (url.includes('x.com') || url.includes('twitter.com')) {
      const safeLink = url.replace('x.com', 'twitter.com');
      const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(safeLink)}`;
      const r = await fetch(oembedUrl);
      if (r.ok) {
        const j = await r.json();
        title = `Tweet by ${j.author_name}`;
        const $ = cheerio.load(j.html);
        summary = $('p').text();
      } else {
        title = 'X / Twitter Link';
      }
    } else {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' }
      });
      const html = await r.text();
      const $ = cheerio.load(html);
      title = $('meta[property="og:title"]').attr('content') || $('title').text() || '';
      summary = $('meta[property="og:description"]').attr('content') || '';
      $('script, style, nav, header, footer, aside, noscript').remove();
      bodyText = ($('article').text() || $('main').text() || '').trim();
      if (bodyText.length < 200) {
        bodyText = $('p').map((i, el) => $(el).text()).get().join(' ');
      }
      bodyText = bodyText.replace(/\s+/g, ' ').trim().slice(0, 2000);
    }
  } catch (e) {
    console.error('Scrape failed:', e);
  }

  const triage = await triageLink({ url, title, summary, body: bodyText, note: '' });
  if (!triage) {
    return res.status(500).json({ error: 'Triage LLM call failed (see Vercel logs)' });
  }

  res.status(200).json({ ...triage, title, url });
}
