import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from './server.js';
import { db } from './db.js';

after(() => new Promise((resolve) => db.close(() => resolve())));

test('GET /api/arv requires a valid sqft', async () => {
  const res = await request(app).get('/api/arv?city=Atlanta&state=GA');
  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
});

test('GET /api/arv estimates from seeded Atlanta comps', async () => {
  const res = await request(app).get('/api/arv?city=Atlanta&state=GA&sqft=1800');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.ok(res.body.estimatedArv > 0);
  assert.ok(res.body.compCount >= 1);
});

test('GET /api/deals/:id/matches returns matches for a saved deal', async () => {
  await request(app).post('/api/buyers').send({
    name: 'Match Buyer', preferred_areas: 'Atlanta', cash_available: 500000, avg_deal_size: 120000,
  });
  const created = await request(app).post('/api/deals').send({
    name: 'Match Deal', city: 'Atlanta', state: 'GA',
    purchase_price: 120000, repair_budget: 0, arv: 200000, selling_costs: 0, holding_costs: 0, wholesale_fee: 0,
  });
  const res = await request(app).get(`/api/deals/${created.body.id}/matches`);
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.ok(Array.isArray(res.body.matches));
  assert.ok(res.body.matches.length >= 1);
  assert.ok(res.body.matches[0].score > 0);
  await request(app).delete(`/api/deals/${created.body.id}`);
});

test('deal_type persists and drives buyer matching end-to-end', async () => {
  const buyer = await request(app).post('/api/buyers').send({
    name: 'Flip Buyer', preferred_areas: 'Atlanta', cash_available: 500000, deal_types: 'flip',
  });
  const created = await request(app).post('/api/deals').send({
    name: 'Flip Deal', city: 'Atlanta', state: 'GA', deal_type: 'flip',
    purchase_price: 120000, repair_budget: 0, arv: 200000, selling_costs: 0, holding_costs: 0, wholesale_fee: 0,
  });
  assert.equal(created.body.deal_type, 'flip');

  const stored = await request(app).get(`/api/deals/${created.body.id}`);
  assert.equal(stored.body.deal_type, 'flip');

  const res = await request(app).get(`/api/deals/${created.body.id}/matches`);
  const match = res.body.matches.find((m) => m.buyer.id === buyer.body.id);
  assert.ok(match, 'flip buyer should appear in matches');
  assert.ok(match.reasons.some((r) => /flip/i.test(r)), 'a reason should cite the deal type');

  await request(app).delete(`/api/deals/${created.body.id}`);
});
