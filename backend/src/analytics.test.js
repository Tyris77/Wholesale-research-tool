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

test('matchBuyers does not credit a state code that only appears as a substring', () => {
  const deal = { city: 'Atlanta', state: 'GA', purchase_price: 120000 };
  // "Niagara" contains "ga" as a substring but is not Georgia coverage.
  const buyers = [{ id: 'n', name: 'N', preferred_areas: 'Niagara Falls', cash_available: 0, avg_deal_size: 0 }];
  assert.equal(matchBuyers(deal, buyers).length, 0);
});

test('matchBuyers credits a buyer whose deal_types include the deal type', () => {
  const deal = { city: 'Atlanta', state: 'GA', purchase_price: 120000, deal_type: 'flip' };
  const buyers = [
    { id: 'x', name: 'X', preferred_areas: 'Atlanta', cash_available: 200000, avg_deal_size: 0, deal_types: 'flip, rental' },
    { id: 'y', name: 'Y', preferred_areas: 'Atlanta', cash_available: 200000, avg_deal_size: 0, deal_types: 'wholesale' },
  ];
  const matches = matchBuyers(deal, buyers);
  const x = matches.find((m) => m.buyer.id === 'x');
  const y = matches.find((m) => m.buyer.id === 'y');
  assert.ok(x.score > y.score, 'deal-type match should outscore a non-matching buyer');
  assert.ok(x.reasons.some((r) => /flip/i.test(r)), 'should explain the deal-type match');
});
