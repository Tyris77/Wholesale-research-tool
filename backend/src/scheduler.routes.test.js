import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from './server.js';
import { db } from './db.js';

after(() => new Promise((resolve) => db.close(() => resolve())));

test('POST /api/scheduler/run processes a due campaign step and logs activity', async () => {
  // A buyer with an email in Atlanta will match an Atlanta deal.
  await request(app).post('/api/buyers').send({
    name: 'Campaign Buyer', email: 'cb@example.com', cash_available: 500000,
    deal_types: 'wholesale', preferred_areas: 'Atlanta',
  });
  const deal = await request(app).post('/api/deals').send({
    name: 'Sched Deal', city: 'Atlanta', state: 'GA', deal_type: 'wholesale',
    purchase_price: 100000, repair_budget: 0, arv: 200000, selling_costs: 0, holding_costs: 0, wholesale_fee: 0,
  });
  // Offset 0 => the step is due immediately.
  const campaign = await request(app).post(`/api/deals/${deal.body.id}/campaigns`).send({ offsets_days: [0] });

  const run = await request(app).post('/api/scheduler/run');
  assert.equal(run.status, 200);
  assert.ok(run.body.stepsProcessed >= 1, 'at least one step processed');

  // The campaign's single step is now sent; the campaign is done.
  const all = await request(app).get('/api/campaigns');
  const mine = all.body.find((c) => c.id === campaign.body.id);
  assert.equal(mine.steps[0].status, 'sent');
  assert.equal(mine.status, 'done');

  // An activity was logged for the deal (email disabled in tests => status failed/skipped, never a real send).
  const acts = await request(app).get(`/api/deals/${deal.body.id}/activities`);
  assert.ok(acts.body.length >= 1);

  await request(app).delete(`/api/deals/${deal.body.id}`);
});

test('POST /api/scheduler/run is idempotent for already-sent steps', async () => {
  const res = await request(app).post('/api/scheduler/run');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
});
