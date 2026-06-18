import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from './server.js';
import { db } from './db.js';

after(() => new Promise((resolve) => db.close(() => resolve())));

const VALID = {
  name: 'Test Deal', city: 'Atlanta', state: 'GA',
  purchase_price: 120000, repair_budget: 22000, arv: 185000,
  selling_costs: 12000, holding_costs: 3000, wholesale_fee: 10000,
};

test('POST /api/deals validates the body', async () => {
  const res = await request(app).post('/api/deals').send({ name: '' });
  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
});

test('POST /api/deals computes profit/roi and persists; GET returns it', async () => {
  const created = await request(app).post('/api/deals').send(VALID);
  assert.equal(created.status, 200);
  assert.ok(created.body.id);
  assert.equal(created.body.profit, 6000);
  assert.equal(created.body.roi, 3.82);

  const list = await request(app).get('/api/deals');
  assert.equal(list.status, 200);
  assert.ok(list.body.some((d) => d.id === created.body.id));

  const one = await request(app).get(`/api/deals/${created.body.id}`);
  assert.equal(one.body.name, 'Test Deal');

  const del = await request(app).delete(`/api/deals/${created.body.id}`);
  assert.equal(del.body.success, true);
});
