import { test, expect } from 'vitest';
import { calculateWholesaleDeal, formatCurrency } from './deal';

test('calculateWholesaleDeal computes investment, exit, profit, and roi', () => {
  const r = calculateWholesaleDeal({
    purchasePrice: 120000, repairBudget: 22000, arv: 185000,
    sellingCosts: 12000, holdingCosts: 3000, wholesaleFee: 10000,
  });
  expect(r.totalInvestment).toBe(157000);
  expect(r.exitNet).toBe(163000);
  expect(r.profit).toBe(6000);
  expect(Math.round(r.roi * 100) / 100).toBe(3.82);
});

test('roi is 0 when there is no investment', () => {
  const r = calculateWholesaleDeal({
    purchasePrice: 0, repairBudget: 0, arv: 0, sellingCosts: 0, holdingCosts: 0, wholesaleFee: 0,
  });
  expect(r.roi).toBe(0);
});

test('formatCurrency renders whole-dollar USD', () => {
  expect(formatCurrency(157000)).toBe('$157,000');
});
