import Groq from 'groq-sdk';

let groq = null;

function initGroq() {
  if (!groq && process.env.GROQ_API_KEY) {
    groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });
  }
  return groq;
}

export async function analyzeDealWithAI(dealData) {
  const groqClient = initGroq();
  
  if (!groqClient) {
    return {
      success: false,
      error: 'GROQ_API_KEY not configured. Please set it in backend/.env',
    };
  }
  
  try {
    const prompt = `
You are a real estate wholesaling expert. Analyze this deal:
- Purchase Price: $${dealData.purchasePrice.toLocaleString()}
- Repair Budget: $${dealData.repairBudget.toLocaleString()}
- ARV (After Repair Value): $${dealData.arv.toLocaleString()}
- Selling Costs: $${dealData.sellingCosts.toLocaleString()}
- Holding Costs: $${dealData.holdingCosts.toLocaleString()}
- Wholesale Fee: $${dealData.wholesaleFee.toLocaleString()}

Provide:
1. Is this a good deal? (YES/NO)
2. Key strengths and weaknesses
3. Recommended offer price
4. Risk assessment
5. Quick market insight for this area

Keep it concise and actionable.
    `.trim();

    const message = await groqClient.messages.create({
      model: 'mixtral-8x7b-32768',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    return {
      success: true,
      analysis: message.content[0].type === 'text' ? message.content[0].text : 'Analysis failed',
      model: 'Groq Mixtral 8x7b',
    };
  } catch (error) {
    console.error('Groq AI error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function scoreSeller(sellerData) {
  const groqClient = initGroq();
  
  if (!groqClient) {
    return {
      success: false,
      error: 'GROQ_API_KEY not configured. Please set it in backend/.env',
    };
  }
  
  try {
    const prompt = `
You are a real estate wholesaling expert. Score this seller lead 1-10 and determine engagement priority:

Seller: ${sellerData.name}
Property: ${sellerData.property_address}, ${sellerData.property_city}, ${sellerData.property_state}
Motivation: ${sellerData.motivation}
Contact Status: ${sellerData.status}

Provide:
1. Lead Score (1-10)
2. Why this score?
3. Recommended next action
4. Estimated deal potential
    `.trim();

    const message = await groqClient.messages.create({
      model: 'mixtral-8x7b-32768',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    return {
      success: true,
      scoring: message.content[0].type === 'text' ? message.content[0].text : 'Scoring failed',
    };
  } catch (error) {
    console.error('Seller scoring error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}
