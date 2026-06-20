import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from './server.js';
import { db } from './db.js';

after(() => new Promise((resolve) => db.close(() => resolve())));

async function makeDeal() {
  const res = await request(app).post('/api/deals').send({
    name: 'Campaign Deal', city: 'Atlanta', state: 'GA',
    purchase_price: 100000, repair_budget: 0, arv: 200000, selling_costs: 0, holding_costs: 0, wholesale_fee: 0,
  });
  return res.body.id;
}

test('POST /api/deals/:id/campaigns creates a campaign with steps', async () => {
  const dealId = await makeDeal();
  const res = await request(app).post(`/api/deals/${dealId}/campaigns`).send({ offsets_days: [0, 3, 7] });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'active');
  assert.equal(res.body.steps.length, 3);
  assert.ok(res.body.steps[0].run_at, 'step has a run_at');
  await request(app).delete(`/api/deals/${dealId}`);
});

test('POST /api/deals/:id/campaigns validates offsets_days', async () => {
  const dealId = await makeDeal();
  const res = await request(app).post(`/api/deals/${dealId}/campaigns`).send({ offsets_days: [] });
  assert.equal(res.status, 400);
  await request(app).delete(`/api/deals/${dealId}`);
});

test('pause/resume/cancel change campaign status', async () => {
  const dealId = await makeDeal();
  const created = await request(app).post(`/api/deals/${dealId}/campaigns`).send({ offsets_days: [0] });
  const cid = created.body.id;
  await request(app).post(`/api/campaigns/${cid}/pause`);
  let all = await request(app).get('/api/campaigns');
  assert.equal(all.body.find((c) => c.id === cid).status, 'paused');
  await request(app).post(`/api/campaigns/${cid}/cancel`);
  all = await request(app).get('/api/campaigns');
  assert.equal(all.body.find((c) => c.id === cid).status, 'cancelled');
  await request(app).delete(`/api/deals/${dealId}`);
});
