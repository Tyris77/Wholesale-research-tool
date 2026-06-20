import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from './server.js';
import { db } from './db.js';

after(() => new Promise((resolve) => db.close(() => resolve())));

test('POST /api/deals/:id/email-buyers 404s for a missing deal', async () => {
  const res = await request(app).post('/api/deals/nope/email-buyers');
  assert.equal(res.status, 404);
});

test('POST /api/deals/:id/email-buyers reports not-configured without a key', async () => {
  // RESEND_API_KEY is unset in the test environment, so this must not send.
  const created = await request(app).post('/api/deals').send({
    name: 'Outreach Deal', city: 'Atlanta', state: 'GA',
    purchase_price: 100000, repair_budget: 0, arv: 200000, selling_costs: 0, holding_costs: 0, wholesale_fee: 0,
  });
  const res = await request(app).post(`/api/deals/${created.body.id}/email-buyers`);
  assert.equal(res.status, 200);
  assert.equal(res.body.success, false);
  assert.match(res.body.error, /not configured/i);
  await request(app).delete(`/api/deals/${created.body.id}`);
});

test('POST /api/sellers/:id/log-contact writes an activity and sets next_follow_up', async () => {
  const seller = await request(app).post('/api/sellers').send({ name: 'Follow Seller', motivation: 'relocating' });
  const res = await request(app)
    .post(`/api/sellers/${seller.body.id}/log-contact`)
    .send({ note: 'Left a voicemail', next_follow_up: '2026-12-31' });
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);

  const acts = await request(app).get('/api/activities');
  assert.ok(acts.body.some((a) => a.contact_id === seller.body.id && a.channel === 'note'));
});

test('GET /api/follow-ups returns an array', async () => {
  const res = await request(app).get('/api/follow-ups');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
});

test('GET /api/deals/:id/activities returns an array', async () => {
  const created = await request(app).post('/api/deals').send({
    name: 'Acts Deal', city: 'Atlanta', state: 'GA',
    purchase_price: 100000, repair_budget: 0, arv: 200000, selling_costs: 0, holding_costs: 0, wholesale_fee: 0,
  });
  const res = await request(app).get(`/api/deals/${created.body.id}/activities`);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
  await request(app).delete(`/api/deals/${created.body.id}`);
});
