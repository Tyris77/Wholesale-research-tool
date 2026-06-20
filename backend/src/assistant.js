export const SYSTEM_PROMPT = [
  'You are an assistant inside a real-estate wholesaling app.',
  "Answer questions about the user's own pipeline by calling the provided tools to read their data.",
  'Always base answers on tool results. If the tools do not contain the answer, say you do not have that data.',
  'Be concise and specific. Do not give legal or financial advice beyond the numbers in the data.',
].join(' ');

function tool(name, description, properties = {}, required = []) {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: { type: 'object', properties, required },
    },
  };
}

export const TOOL_DEFINITIONS = [
  tool('get_pipeline_summary', 'Totals across the pipeline: deal counts by status, pipeline value, projected profit, average ROI, matched-deal count, and lead counts.'),
  tool('list_deals', 'List saved deals with id, name, city, state, deal_type, purchase_price, arv, profit, roi, and status.'),
  tool('list_buyers', 'List cash buyers with id, name, preferred_areas, cash_available, deal_types, and avg_deal_size.'),
  tool('list_markets', 'List markets with city, state, heat_score, and trend.'),
  tool('list_followups', 'List sellers due for follow-up today or earlier (name and next_follow_up date).'),
  tool(
    'match_buyers_for_deal',
    'Rank the cash buyers that best fit a specific saved deal by area, price, and deal type.',
    { deal_id: { type: 'string', description: 'The id of the deal to match buyers against.' } },
    ['deal_id'],
  ),
];

export function buildMessages(history) {
  return [{ role: 'system', content: SYSTEM_PROMPT }, ...history];
}
