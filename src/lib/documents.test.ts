import { test, expect } from 'vitest';
import { DOC_TYPES, defaultOverrides, buildDocument } from './documents';
import type { Deal, Buyer } from '../api/types';

const deal: Deal = {
  id: 'd1', name: 'Maple Flip', property_address: '4812 Maple St', city: 'Atlanta', state: 'GA',
  purchase_price: 120000, repair_budget: 22000, arv: 185000, selling_costs: 12000,
  holding_costs: 3000, wholesale_fee: 10000, deal_type: 'wholesale', profit: 6000, roi: 3.82,
  status: 'analyzing', created_at: '2026-06-01', updated_at: '2026-06-01',
};
const buyer: Buyer = {
  id: 'b1', name: 'Acme Investments', phone: '', email: '', cash_available: 300000,
  deal_types: 'flip', preferred_areas: 'Atlanta', avg_deal_size: 150000, status: 'active', created_at: '2026-06-01',
};

test('DOC_TYPES lists all three templates in lifecycle order', () => {
  expect(DOC_TYPES.map((d) => d.type)).toEqual(['letter_of_intent', 'purchase_agreement', 'assignment_agreement']);
});

test('defaultOverrides seeds offer price and assignment fee from the deal', () => {
  const o = defaultOverrides(deal);
  expect(o.offerPrice).toBe(120000);
  expect(o.assignmentFee).toBe(10000);
  expect(o.effectiveDate).toBe('');
});

test('buildDocument letter_of_intent merges property and offer price', () => {
  const doc = buildDocument('letter_of_intent', {
    deal, assignee: null,
    overrides: { ...defaultOverrides(deal), sellerName: 'John Seller', assignorName: 'My Co' },
  });
  expect(doc.title).toMatch(/Letter of Intent/);
  expect(doc.meta.find((m) => m.label === 'Property')?.value).toBe('4812 Maple St, Atlanta, GA');
  expect(JSON.stringify(doc.sections)).toMatch(/\$120,000/);
});

test('buildDocument renders blank dates as a fill-in placeholder', () => {
  const doc = buildDocument('purchase_agreement', { deal, assignee: null, overrides: defaultOverrides(deal) });
  expect(doc.meta.find((m) => m.label === 'Closing date')?.value).toBe('__________');
});

test('buildDocument assignment_agreement computes total to assignee', () => {
  const doc = buildDocument('assignment_agreement', { deal, assignee: buyer, overrides: defaultOverrides(deal) });
  expect(doc.parties.find((p) => p.role === 'Assignee')?.name).toBe('Acme Investments');
  expect(doc.meta.find((m) => m.label === 'Total to assignee')?.value).toBe('$130,000');
});

test('buildDocument throws for an assignment agreement without an assignee', () => {
  expect(() => buildDocument('assignment_agreement', { deal, assignee: null, overrides: defaultOverrides(deal) })).toThrow();
});

test('every document carries the legal disclaimer', () => {
  for (const { type } of DOC_TYPES) {
    const doc = buildDocument(type, { deal, assignee: buyer, overrides: defaultOverrides(deal) });
    expect(doc.disclaimer).toMatch(/not legal advice/i);
  }
});
