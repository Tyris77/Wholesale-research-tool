import Groq from 'groq-sdk';

const MODEL = 'llama-3.3-70b-versatile';
const NO_KEY_ERROR = 'GROQ_API_KEY not configured. Please set it in backend/.env';

let cachedClient = null;

// Lazy singleton: reads env at call time (after dotenv has loaded) and reuses
// the client across requests instead of allocating one per call.
export function createGroqClient(apiKey = process.env.GROQ_API_KEY) {
  if (!apiKey) return null;
  if (!cachedClient) cachedClient = new Groq({ apiKey });
  return cachedClient;
}

function buildDealPrompt(d) {
  return `
You are a real estate wholesaling expert. Analyze this deal:
- Purchase Price: $${Number(d.purchasePrice).toLocaleString()}
- Repair Budget: $${Number(d.repairBudget).toLocaleString()}
- ARV (After Repair Value): $${Number(d.arv).toLocaleString()}
- Selling Costs: $${Number(d.sellingCosts).toLocaleString()}
- Holding Costs: $${Number(d.holdingCosts).toLocaleString()}
- Wholesale Fee: $${Number(d.wholesaleFee).toLocaleString()}

Provide:
1. Is this a good deal? (YES/NO)
2. Key strengths and weaknesses
3. Recommended offer price
4. Risk assessment
5. Quick market insight for this area

Keep it concise and actionable.`.trim();
}

function buildSellerPrompt(s) {
  return `
You are a real estate wholesaling expert. Score this seller lead 1-10 and determine engagement priority:

Seller: ${s.name}
Property: ${s.property_address}, ${s.property_city}, ${s.property_state}
Motivation: ${s.motivation}
Contact Status: ${s.status}

Provide:
1. Lead Score (1-10)
2. Why this score?
3. Recommended next action
4. Estimated deal potential`.trim();
}

export async function analyzeDealWithAI(dealData, client = createGroqClient()) {
  if (!client) {
    return { success: false, error: NO_KEY_ERROR };
  }
  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 500,
      messages: [{ role: 'user', content: buildDealPrompt(dealData) }],
    });
    return { success: true, analysis: completion.choices[0].message.content, model: MODEL };
  } catch (error) {
    console.error('Groq AI error:', error.message);
    return { success: false, error: error.message };
  }
}

export async function scoreSeller(sellerData, client = createGroqClient()) {
  if (!client) {
    return { success: false, error: NO_KEY_ERROR };
  }
  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 300,
      messages: [{ role: 'user', content: buildSellerPrompt(sellerData) }],
    });
    return { success: true, scoring: completion.choices[0].message.content, model: MODEL };
  } catch (error) {
    console.error('Seller scoring error:', error.message);
    return { success: false, error: error.message };
  }
}

// Bounded tool-calling agent loop. The Groq client and executeTool are injected
// so tests can script the model and never call real Groq.
export async function runAssistant(
  messages,
  { client = createGroqClient(), tools = [], executeTool, maxSteps = 5 } = {},
) {
  if (!client) return { success: false, error: NO_KEY_ERROR };
  const convo = [...messages];
  try {
    for (let step = 0; step < maxSteps; step++) {
      const completion = await client.chat.completions.create({
        model: MODEL,
        max_tokens: 800,
        tools,
        tool_choice: 'auto',
        messages: convo,
      });
      const msg = completion.choices[0].message;
      convo.push(msg);
      const toolCalls = msg.tool_calls || [];
      if (toolCalls.length === 0) {
        return { success: true, reply: msg.content || '' };
      }
      for (const tc of toolCalls) {
        let args = {};
        try { args = JSON.parse(tc.function.arguments || '{}'); } catch { args = {}; }
        const result = await executeTool(tc.function.name, args);
        convo.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
      }
    }
    return { success: true, reply: "I couldn't finish that — try narrowing the question." };
  } catch (error) {
    console.error('Assistant error:', error.message);
    return { success: false, error: error.message };
  }
}
