import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from './server.js';
import { db } from './db.js';

after(() => new Promise((resolve) => db.close(() => resolve())));

test('GET /api/insights returns the documented shape', async () => {
  const res = await request(app).get('/api/insights');
  assert.equal(res.status, 200);
  assert.ok(res.body.deals, 'has deals');
  assert.ok(res.body.deals.byStatus, 'has byStatus');
  assert.ok(Array.isArray(res.body.deals.profitByMonth), 'profitByMonth is an array');
  assert.ok(Array.isArray(res.body.deals.topByProfit), 'topByProfit is an array');
  assert.ok(res.body.leads, 'has leads');
  assert.ok(Array.isArray(res.body.markets.top), 'markets.top is an array');
  assert.equal(typeof res.body.deals.matchedCount, 'number');
});

test('GET /api/insights reflects a newly saved active deal', async () => {
  const before = await request(app).get('/api/insights');
  const created = await request(app).post('/api/deals').send({
    name: 'Insights Deal', city: 'Atlanta', state: 'GA', deal_type: 'wholesale',
    purchase_price: 100000, repair_budget: 0, arv: 250000, selling_costs: 0, holding_costs: 0, wholesale_fee: 0,
  });
  const after = await request(app).get('/api/insights');
  assert.equal(after.body.deals.total, before.body.deals.total + 1);
  assert.ok(after.body.deals.pipelineValue >= before.body.deals.pipelineValue + 250000);
  await request(app).delete(`/api/deals/${created.body.id}`);
});
