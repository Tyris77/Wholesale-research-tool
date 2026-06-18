import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sellerCreateSchema, buyerCreateSchema, dealAnalysisSchema } from './schemas.js';

test('sellerCreateSchema accepts a minimal valid seller', () => {
  const r = sellerCreateSchema.safeParse({ name: 'Jane' });
  assert.equal(r.success, true);
});

test('sellerCreateSchema rejects a missing name', () => {
  const r = sellerCreateSchema.safeParse({ phone: '555' });
  assert.equal(r.success, false);
});

test('sellerCreateSchema rejects an invalid email', () => {
  const r = sellerCreateSchema.safeParse({ name: 'Jane', email: 'not-an-email' });
  assert.equal(r.success, false);
});

test('dealAnalysisSchema accepts six numeric fields', () => {
  const r = dealAnalysisSchema.safeParse({
    purchasePrice: 120000, repairBudget: 22000, arv: 185000,
    sellingCosts: 12000, holdingCosts: 3000, wholesaleFee: 10000,
  });
  assert.equal(r.success, true);
});

test('dealAnalysisSchema rejects a negative price', () => {
  const r = dealAnalysisSchema.safeParse({
    purchasePrice: -1, repairBudget: 0, arv: 0, sellingCosts: 0, holdingCosts: 0, wholesaleFee: 0,
  });
  assert.equal(r.success, false);
});

test('buyerCreateSchema rejects a non-numeric cash_available', () => {
  const r = buyerCreateSchema.safeParse({ name: 'Bob', cash_available: 'lots' });
  assert.equal(r.success, false);
});
