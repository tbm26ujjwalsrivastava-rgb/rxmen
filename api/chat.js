export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

  if (!ANTHROPIC_KEY) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY environment variable not set' });
    return;
  }

  let body;
  try {
    body = req.body;
    if (!body || typeof body !== 'object') {
      body = JSON.parse(req.body);
    }
  } catch(e) {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  const { messages, system } = body;

  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: 'messages array required' });
    return;
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: system || "You are RxAI Coach, a men's health and fitness advisor for RxMen, India's first complete men's health platform. Be direct, practical, and use Indian context where relevant.",
        messages: messages,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      res.status(response.status).json({ error: data.error?.message || 'Anthropic API error' });
      return;
    }

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(data);

  } catch (err) {
    console.error('Chat API error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
