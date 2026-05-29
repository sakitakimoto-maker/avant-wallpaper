module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { messages, system } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

    const geminiMessages = messages.map((m, i) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: i === 0 && m.role === 'user' ? system + '\n\n' + m.content : m.content }]
    }));

    const cleaned = [];
    for (const msg of geminiMessages) {
      if (cleaned.length === 0) {
        cleaned.push(msg);
      } else if (cleaned[cleaned.length - 1].role === msg.role) {
        cleaned[cleaned.length - 1].parts[0].text += '\n' + msg.parts[0].text;
      } else {
        cleaned.push(msg);
      }
    }

    const geminiRes = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: cleaned,
          generationConfig: {
            maxOutputTokens: 800,
            temperature: 0.8,
          }
        })
      }
    );

    const data = await geminiRes.json();
    const reply = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] ? data.candidates[0].content.parts[0].text : '';

    if (!reply) {
      console.error('Empty reply. Full response:', JSON.stringify(data));
      return res.status(200).json({ reply: '', error: 'empty_reply' });
    }

    // 最初の一文だけ取り出す
    var separators = ['\u3002', '\uff01', '\uff1f', '\n'];
    var firstSentence = reply;
    for (var i = 0; i < separators.length; i++) {
      var idx = firstSentence.indexOf(separators[i]);
      if (idx !== -1) {
        firstSentence = firstSentence.substring(0, idx);
      }
    }
    firstSentence = firstSentence.trim();
    var finalReply = firstSentence || reply;

    return res.status(200).json({ reply: finalReply });

  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: error.message });
  }
}
