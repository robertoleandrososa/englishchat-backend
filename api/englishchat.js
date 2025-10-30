// api/englishchat.js
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Sanea la API key (elimina BOM y caracteres invisibles)
    const raw = process.env.OPENAI_API_KEY || '';
    const OPENAI_KEY = raw.replace(/\uFEFF/g, '').replace(/[^\x20-\x7E]/g, '').trim();
    if (!OPENAI_KEY.startsWith('sk-')) {
      return res.status(500).json({ error: 'Invalid API key (empty or malformed)' });
    }

    const { topic, history } = req.body || {};
    const systemPrompt =
`You are a friendly native English tutor. Always reply in English.
Constraints:
- Keep answers 1-3 sentences, simple and clear.
- Topic: ${topic || 'travel'}.
- At the end, output JSON ONLY with keys: reply, grammar, alt, keywords, score.
Return only a pure JSON object.`;

    const msgs = [
      { role: 'system', content: systemPrompt },
      ...(Array.isArray(history) ? history : []).map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content || '')
      })),
      { role: 'user', content: 'Now respond in JSON as specified.' }
    ];

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.6,
        messages: msgs,
        response_format: { type: 'json_object' }
      })
    });

    if (!r.ok) {
      const detail = await r.text();
      return res.status(500).json({ error: 'OpenAI error', detail });
    }

    const j = await r.json();
    const content = j?.choices?.[0]?.message?.content || '{}';

    let payload;
    try { payload = JSON.parse(content); } catch { payload = { reply: content }; }

    return res.status(200).json({
      reply: String(payload.reply || 'Okay.'),
      grammar: payload.grammar ? String(payload.grammar) : null,
      alt: payload.alt ? String(payload.alt) : null,
      keywords: Array.isArray(payload.keywords) ? payload.keywords.slice(0,6).map(String) : [],
      score: Number.isFinite(Number(payload.score)) ? Number(payload.score) : undefined
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server error', detail: String(err) });
  }
}
