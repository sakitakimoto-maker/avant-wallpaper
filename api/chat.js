export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { messages, system } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

    // Gemini用にメッセージを変換
    // systemメッセージは最初のuserメッセージに結合する
    const geminiMessages = messages.map((m, i) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: i === 0 && m.role === 'user' ? `${system}\n\n${m.content}` : m.content }]
    }));

    // user/modelが交互になるよう調整（Gemini APIの制約）
    const cleaned = [];
    for (const msg of geminiMessages) {
      if (cleaned.length === 0) {
        cleaned.push(msg);
      } else if (cleaned[cleaned.length - 1].role === msg.role) {
        // 同じroleが連続する場合はテキストを結合
        cleaned[cleaned.length - 1].parts[0].text += '\n' + msg.parts[0].text;
      } else {
        cleaned.push(msg);
      }
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: cleaned,
          generationConfig: {
            maxOutputTokens: 200,
            temperature: 0.8,
          }
        })
      }
    );

    const data = await geminiRes.json();
    console.log('Gemini response:', JSON.stringify(data));

    // レスポンスから返答を取得
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!reply) {
      console.error('Empty reply. Full response:', JSON.stringify(data));
      return res.status(200).json({ reply: '', error: 'empty_reply', raw: data });
    }

    return res.status(200).json({ reply });

  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: error.message });
  }
}
