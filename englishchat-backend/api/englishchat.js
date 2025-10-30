// api/englishchat.js
// Serverless en Vercel. Requiere OPENAI_API_KEY en Settings → Environment Variables

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*'); // si querés, poné tu dominio de GoodBarber
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { topic, history } = req.body || {};

    const systemPrompt = `You are a friendly native English tutor. Always reply in English.
Constraints:
- Keep answers 1-3 sentences, simple and clear.
- Topic: ${topic || 'travel'}.
- At the end of your turn, produce JSON ONLY with keys: reply, grammar, alt, keywords, score.
- reply: your natural English response for the chat.
- grammar: 1-2 concise notes correcting the student's last message (if needed).
- alt: a more natural way to say what the student intended.
- keywords: 3-6 useful words/phrases for this topic.
- score: integer 60-95 estimating correctness/pronunciation (text-based approximation).
Return only a pure JSON object. No markdown.`;

    const msgs = [
      { role: 'system', content: systemPrompt },
      ...(Array.isArray(history) ? history : []).map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content || '')
      })),
      { role: 'user', content: 'Now respond in JSON as specified.' }
    ];

    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.6,
        messages: msgs,
        response_format: { type: 'json_object' }
      })
    });

    if (!aiRes.ok) {
      const detail = await aiRes.text();
      return res.status(500).json({ error: 'OpenAI error', detail });
    }

    const aiJson = await aiRes.json();
    const content = aiJson?.choices?.[0]?.message?.content || '{}';

    let payload;
    try { payload = JSON.parse(content); }
    catch { payload = { reply: content }; }

    const out = {
      reply: String(payload.reply || 'Okay.'),
      grammar: payload.grammar ? String(payload.grammar) : null,
      alt: payload.alt ? String(payload.alt) : null,
      keywords: Array.isArray(payload.keywords)
        ? payload.keywords.slice(0, 6).map(String)
        : [],
      score: Number.isFinite(Number(payload.score))
        ? Number(payload.score)
        : undefined
    };

    return res.status(200).json(out);
  } catch (err) {
    return res.status(500).json({ error: 'Server error', detail: String(err) });
  }
}
