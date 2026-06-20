import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import app from './server.js';
import { db } from './db.js';

after(() => new Promise((resolve) => db.close(() => resolve())));

test('POST /api/webhooks/resend stores a valid event (no secret configured)', async () => {
  delete process.env.RESEND_WEBHOOK_SECRET;
  const res = await request(app)
    .post('/api/webhooks/resend')
    .set('Content-Type', 'application/json')
    .send(JSON.stringify({ type: 'email.delivered', created_at: '2026-06-20T00:00:00.000Z', data: { email_id: 'evt_1', to: ['a@b.com'] } }));
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
});

test('POST /api/webhooks/resend rejects invalid JSON with 400', async () => {
  delete process.env.RESEND_WEBHOOK_SECRET;
  const res = await request(app)
    .post('/api/webhooks/resend')
    .set('Content-Type', 'application/json')
    .send('not json{');
  assert.equal(res.status, 400);
});

test('POST /api/webhooks/resend enforces the Svix signature when a secret is set', async () => {
  process.env.RESEND_WEBHOOK_SECRET = 'whsec_' + Buffer.from('testkey').toString('base64');
  const body = JSON.stringify({ type: 'email.opened', data: { email_id: 'evt_2' } });
  const id = 'msg_1';
  const timestamp = '1718841600';
  const key = Buffer.from(process.env.RESEND_WEBHOOK_SECRET.replace(/^whsec_/, ''), 'base64');
  const sig = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');

  const bad = await request(app).post('/api/webhooks/resend').set('Content-Type', 'application/json').send(body);
  assert.equal(bad.status, 401);

  const good = await request(app)
    .post('/api/webhooks/resend')
    .set('Content-Type', 'application/json')
    .set('svix-id', id).set('svix-timestamp', timestamp).set('svix-signature', `v1,${sig}`)
    .send(body);
  assert.equal(good.status, 200);
  delete process.env.RESEND_WEBHOOK_SECRET;
});

test('GET /api/campaigns/:id/stats returns the documented shape', async () => {
  const deal = await request(app).post('/api/deals').send({
    name: 'Stats Deal', city: 'Atlanta', state: 'GA',
    purchase_price: 100000, repair_budget: 0, arv: 200000, selling_costs: 0, holding_costs: 0, wholesale_fee: 0,
  });
  const campaign = await request(app).post(`/api/deals/${deal.body.id}/campaigns`).send({ offsets_days: [0] });
  const res = await request(app).get(`/api/campaigns/${campaign.body.id}/stats`);
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body).sort(), ['bounced', 'clicked', 'delivered', 'opened', 'sent']);
  assert.equal(res.body.sent, 0);
  await request(app).delete(`/api/deals/${deal.body.id}`);
});
