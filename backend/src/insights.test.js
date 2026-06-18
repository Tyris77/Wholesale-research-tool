import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  summarizeDeals, profitByMonth, leadFunnel, matchedDealCount, topMarkets,
} from './insights.js';

const DEALS = [
  { id: '1', name: 'A', status: 'analyzing', arv: 200000, profit: 6000, roi: 3.82, created_at: '2026-05-10T00:00:00.000Z' },
  { id: '2', name: 'B', status: 'under_contract', arv: 300000, profit: 20000, roi: 10, created_at: '2026-06-01T00:00:00.000Z' },
  { id: '3', name: 'C', status: 'closed', arv: 150000, profit: 8000, roi: 5, created_at: '2026-06-15T00:00:00.000Z' },
  { id: '4', name: 'D', status: 'dead', arv: 999999, profit: -5000, roi: -2, created_at: '2026-06-20T00:00:00.000Z' },
];

test('summarizeDeals counts statuses and sums active pipeline only', () => {
  const s = summarizeDeals(DEALS);
  assert.equal(s.total, 4);
  assert.equal(s.active, 2); // analyzing + under_contract
  assert.deepEqual(s.byStatus, { analyzing: 1, under_contract: 1, closed: 1, dead: 1 });
  assert.equal(s.pipelineValue, 500000); // 200000 + 300000 (active only)
  assert.equal(s.projectedProfit, 26000); // 6000 + 20000
  assert.equal(s.avgRoi, 6.91); // (3.82 + 10) / 2, rounded
});

test('summarizeDeals zero-fills known statuses and ranks top deals by profit', () => {
  const s = summarizeDeals([{ id: '9', name: 'Z', status: 'analyzing', arv: 1, profit: 100, roi: 1, created_at: '2026-06-01' }]);
  assert.deepEqual(s.byStatus, { analyzing: 1, under_contract: 0, closed: 0, dead: 0 });
  assert.equal(s.topByProfit[0].id, '9');
  assert.equal(s.avgRoi, 1);
});

test('summarizeDeals avgRoi is 0 with no active deals', () => {
  const s = summarizeDeals([{ id: 'x', name: 'X', status: 'closed', arv: 1, profit: 1, roi: 50, created_at: '2026-06-01' }]);
  assert.equal(s.active, 0);
  assert.equal(s.avgRoi, 0);
  assert.equal(s.pipelineValue, 0);
});

test('profitByMonth buckets by YYYY-MM ascending', () => {
  const months = profitByMonth(DEALS);
  assert.deepEqual(months.map((m) => m.month), ['2026-05', '2026-06']);
  assert.equal(months[0].profit, 6000);
  assert.equal(months[1].profit, 23000); // 20000 + 8000 + (-5000)
  assert.equal(months[1].count, 3);
});

test('leadFunnel totals and seller status counts', () => {
  const f = leadFunnel(
    [{ status: 'new' }, { status: 'new' }, { status: 'contacted' }],
    [{ id: 'b1' }],
  );
  assert.equal(f.sellers, 3);
  assert.equal(f.buyers, 1);
  assert.deepEqual(f.sellersByStatus, { new: 2, contacted: 1 });
});

test('matchedDealCount counts deals with at least one buyer match', () => {
  const buyers = [{ id: 'b', preferred_areas: 'Atlanta', cash_available: 150000, deal_types: 'wholesale' }];
  const deals = [
    { city: 'Atlanta', state: 'GA', purchase_price: 100000, deal_type: 'wholesale' }, // area + price + type
    { city: 'Phoenix', state: 'AZ', purchase_price: 9000000, deal_type: 'flip' },      // wrong area, price too high, wrong type
  ];
  assert.equal(matchedDealCount(deals, buyers), 1);
});

test('topMarkets sorts by heat_score desc and limits', () => {
  const markets = [
    { city: 'A', heat_score: 70 }, { city: 'B', heat_score: 90 }, { city: 'C', heat_score: 80 },
  ];
  const top = topMarkets(markets, 2);
  assert.equal(top.length, 2);
  assert.deepEqual(top.map((m) => m.city), ['B', 'C']);
});
