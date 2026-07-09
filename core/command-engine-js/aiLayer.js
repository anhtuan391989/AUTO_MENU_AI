const Anthropic = require('@anthropic-ai/sdk'); // npm install @anthropic-ai/sdk

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Danh sách targetId/action hợp lệ — nên đồng bộ với capabilityRegistry.js
// để AI không "bịa" ra action không tồn tại.
const KNOWN_TARGETS = {
  'ableton-live': ['setTempo', 'playToggle'],
  'serum': ['setFilterCutoff'],
  'legacy-plugin-x': ['togglePreset'],
};

const SYSTEM_PROMPT = `Bạn là bộ phân tích lệnh cho một Menu AI điều khiển DAW/plugin.
Chỉ trả về JSON thuần, không giải thích, không markdown, theo đúng schema:
{"targetId": string, "action": string, "value": number | null}

Danh sách targetId và action hợp lệ:
${JSON.stringify(KNOWN_TARGETS, null, 2)}

Nếu câu lệnh không khớp với bất kỳ targetId/action nào ở trên, trả về:
{"targetId": null, "action": null, "value": null}`;

async function parseCommand(userText) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 200,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userText }],
  });

  const raw = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');

  try {
    const intent = JSON.parse(raw.trim());
    if (!intent.targetId || !intent.action) {
      return { ok: false, detail: 'Không nhận diện được lệnh phù hợp' };
    }
    return { ok: true, intent };
  } catch {
    return { ok: false, detail: 'AI trả về định dạng không hợp lệ' };
  }
}

module.exports = { parseCommand };
