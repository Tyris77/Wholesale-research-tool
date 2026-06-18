import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDeal } from './deal-math.js';

test('computeDeal returns stored profit and rounded roi', () => {
  const r = computeDeal({
    purchase_price: 120000, repair_budget: 22000, arv: 185000,
    selling_costs: 12000, holding_costs: 3000, wholesale_fee: 10000,
  });
  assert.equal(r.profit, 6000);
  assert.equal(r.roi, 3.82);
});

test('computeDeal roi is 0 with no investment', () => {
  const r = computeDeal({ purchase_price: 0, repair_budget: 0, arv: 0, selling_costs: 0, holding_costs: 0, wholesale_fee: 0 });
  assert.equal(r.roi, 0);
  assert.equal(r.profit, 0);
});
