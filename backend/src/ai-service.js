import Groq from 'groq-sdk';

const MODEL = 'llama-3.3-70b-versatile';

export function createGroqClient(apiKey = process.env.GROQ_API_KEY) {
  if (!apiKey) return null;
  return new Groq({ apiKey });
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
    return { success: false, error: 'GROQ_API_KEY not configured. Please set it in backend/.env' };
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
    return { success: false, error: 'GROQ_API_KEY not configured. Please set it in backend/.env' };
  }
  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 300,
      messages: [{ role: 'user', content: buildSellerPrompt(sellerData) }],
    });
    return { success: true, scoring: completion.choices[0].message.content };
  } catch (error) {
    console.error('Seller scoring error:', error.message);
    return { success: false, error: error.message };
  }
}
