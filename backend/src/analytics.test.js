import { test } from 'node:test';
import assert from 'node:assert/strict';
import { medianPricePerSqft, estimateArv, matchBuyers } from './analytics.js';

const COMPS = [
  { price_per_sqft: 100 }, { price_per_sqft: 200 }, { price_per_sqft: 150 },
];

test('medianPricePerSqft handles odd and even counts', () => {
  assert.equal(medianPricePerSqft(COMPS), 150);
  assert.equal(medianPricePerSqft([{ price_per_sqft: 100 }, { price_per_sqft: 200 }]), 150);
  assert.equal(medianPricePerSqft([]), null);
});

test('estimateArv multiplies median by sqft and rounds', () => {
  assert.equal(estimateArv(COMPS, 1800), 270000);
  assert.equal(estimateArv([], 1800), null);
  assert.equal(estimateArv(COMPS, 0), null);
});

test('matchBuyers ranks by area + price fit and filters zero scores', () => {
  const deal = { city: 'Atlanta', state: 'GA', purchase_price: 120000 };
  const buyers = [
    { id: 'a', name: 'Anna', preferred_areas: 'Atlanta, Marietta', cash_available: 200000, avg_deal_size: 130000 },
    { id: 'b', name: 'Bob', preferred_areas: 'Phoenix', cash_available: 50000, avg_deal_size: 0 },
    { id: 'c', name: 'Cara', preferred_areas: 'GA statewide', cash_available: 100000, avg_deal_size: 0 },
  ];
  const matches = matchBuyers(deal, buyers);
  assert.equal(matches[0].buyer.id, 'a');
  assert.ok(matches[0].score >= matches[matches.length - 1].score);
  assert.ok(matches.every((m) => m.score > 0));
  assert.equal(matches.find((m) => m.buyer.id === 'b'), undefined);
});
