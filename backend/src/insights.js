import { matchBuyers } from './analytics.js';

const KNOWN_DEAL_STATUSES = ['analyzing', 'under_contract', 'closed', 'dead'];
const INACTIVE = new Set(['closed', 'dead']);

export function summarizeDeals(deals) {
  const byStatus = {};
  for (const s of KNOWN_DEAL_STATUSES) byStatus[s] = 0;
  for (const d of deals) byStatus[d.status] = (byStatus[d.status] || 0) + 1;

  const active = deals.filter((d) => !INACTIVE.has(d.status));
  const pipelineValue = active.reduce((sum, d) => sum + (d.arv || 0), 0);
  const projectedProfit = active.reduce((sum, d) => sum + (d.profit || 0), 0);
  const avgRoi = active.length
    ? Math.round((active.reduce((sum, d) => sum + (d.roi || 0), 0) / active.length) * 100) / 100
    : 0;
  const topByProfit = [...deals]
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 5)
    .map((d) => ({ id: d.id, name: d.name, profit: d.profit, roi: d.roi, status: d.status }));

  return { total: deals.length, active: active.length, byStatus, pipelineValue, projectedProfit, avgRoi, topByProfit };
}

export function profitByMonth(deals) {
  const buckets = new Map();
  for (const d of deals) {
    const month = (d.created_at || '').slice(0, 7);
    if (!month) continue;
    const b = buckets.get(month) || { month, profit: 0, count: 0 };
    b.profit += d.profit || 0;
    b.count += 1;
    buckets.set(month, b);
  }
  return [...buckets.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export function leadFunnel(sellers, buyers) {
  const sellersByStatus = {};
  for (const s of sellers) {
    const k = s.status || 'unknown';
    sellersByStatus[k] = (sellersByStatus[k] || 0) + 1;
  }
  return { sellers: sellers.length, buyers: buyers.length, sellersByStatus };
}

export function matchedDealCount(deals, buyers) {
  return deals.reduce((n, d) => (matchBuyers(d, buyers).length > 0 ? n + 1 : n), 0);
}

export function topMarkets(markets, n = 5) {
  return [...markets].sort((a, b) => b.heat_score - a.heat_score).slice(0, n);
}
