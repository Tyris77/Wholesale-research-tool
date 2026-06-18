export function medianPricePerSqft(comps) {
  const vals = comps
    .map((c) => c.price_per_sqft)
    .filter((v) => typeof v === 'number' && v > 0)
    .sort((a, b) => a - b);
  if (vals.length === 0) return null;
  const mid = Math.floor(vals.length / 2);
  return vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
}

export function estimateArv(comps, sqft) {
  const median = medianPricePerSqft(comps);
  if (median == null || !(sqft > 0)) return null;
  return Math.round(median * sqft);
}

// Whole-word match so a 2-letter state code ("GA") isn't matched inside an
// unrelated place name ("Niagara"). The term is escaped before use in a regex.
function areaCovers(areas, term) {
  if (!term) return false;
  const escaped = term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`).test(areas);
}

// Scores each buyer against a deal by area coverage and price/size fit.
// Returns [{ buyer, score, reasons }] sorted desc, excluding zero-score buyers.
export function matchBuyers(deal, buyers) {
  return buyers
    .map((buyer) => {
      let score = 0;
      const reasons = [];
      const areas = (buyer.preferred_areas || '').toLowerCase();
      if (deal.city && areaCovers(areas, deal.city)) {
        score += 2;
        reasons.push(`Covers ${deal.city}`);
      } else if (deal.state && areaCovers(areas, deal.state)) {
        score += 1;
        reasons.push(`Covers ${deal.state}`);
      }
      if (buyer.cash_available > 0 && deal.purchase_price <= buyer.cash_available) {
        score += 2;
        reasons.push('Has cash for purchase price');
      }
      if (buyer.avg_deal_size > 0 && Math.abs(deal.purchase_price - buyer.avg_deal_size) <= buyer.avg_deal_size * 0.5) {
        score += 1;
        reasons.push('Matches typical deal size');
      }
      if (deal.deal_type && (buyer.deal_types || '').toLowerCase().includes(deal.deal_type.toLowerCase())) {
        score += 1;
        reasons.push(`Wants ${deal.deal_type.replace('_', ' ')} deals`);
      }
      return { buyer, score, reasons };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score);
}
