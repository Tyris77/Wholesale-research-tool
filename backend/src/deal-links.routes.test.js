import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from './server.js';
import { db } from './db.js';

after(() => new Promise((resolve) => db.close(() => resolve())));

const DEAL = {
  name: 'Link Test Deal', city: 'Atlanta', state: 'GA',
  purchase_price: 100000, repair_budget: 20000, arv: 160000,
  selling_costs: 10000, holding_costs: 2000, wholesale_fee: 8000,
};

let dealId;
let slug;

test('setup: create a deal', async () => {
  const res = await request(app).post('/api/deals').send(DEAL);
  assert.equal(res.status, 200);
  dealId = res.body.id;
});

test('POST /api/deals/:id/link creates a slug', async () => {
  const res = await request(app).post(`/api/deals/${dealId}/link`);
  assert.equal(res.status, 200);
  assert.match(res.body.slug, /^[0-9a-f]{8}$/);
  assert.match(res.body.url, /^\/p\/[0-9a-f]{8}$/);
  slug = res.body.slug;
});

test('POST /api/deals/:id/link regenerates and old slug is gone', async () => {
  const old = slug;
  const res = await request(app).post(`/api/deals/${dealId}/link`);
  assert.equal(res.status, 200);
  slug = res.body.slug;
  const gone = await request(app).get(`/api/public/deals/${old}`);
  assert.equal(gone.status, 404);
});

test('GET /api/public/deals/:slug returns whitelisted deal fields', async () => {
  const res = await request(app).get(`/api/public/deals/${slug}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'Link Test Deal');
  assert.ok('purchase_price' in res.body);
  assert.ok('arv' in res.body);
  assert.ok('profit' in res.body);
  assert.ok('roi' in res.body);
  assert.ok(!('id' in res.body));
});

test('GET /api/public/deals/:slug increments view_count', async () => {
  const res = await request(app).get(`/api/public/deals/${slug}`);
  assert.equal(res.status, 200);
});

test('GET /api/public/deals/unknown returns 404', async () => {
  const res = await request(app).get('/api/public/deals/deadbeef');
  assert.equal(res.status, 404);
});

test('POST /api/public/deals/:slug/inquire stores inquiry and creates activity', async () => {
  const res = await request(app)
    .post(`/api/public/deals/${slug}/inquire`)
    .send({ name: 'Jane Buyer', email: 'jane@example.com', message: 'Interested!' });
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);

  const acts = await request(app).get(`/api/deals/${dealId}/activities`);
  assert.equal(acts.status, 200);
  assert.ok(acts.body.some((a) => a.contact_name === 'Jane Buyer'));
});

test('POST /api/public/deals/:slug/inquire returns 400 without email or phone', async () => {
  const res = await request(app)
    .post(`/api/public/deals/${slug}/inquire`)
    .send({ name: 'No Contact' });
  assert.equal(res.status, 400);
});

test('DELETE /api/deals/:id/link deactivates; slug returns 404', async () => {
  const del = await request(app).delete(`/api/deals/${dealId}/link`);
  assert.equal(del.status, 200);
  assert.equal(del.body.success, true);

  const gone = await request(app).get(`/api/public/deals/${slug}`);
  assert.equal(gone.status, 404);
});

test('POST /api/public/deals/:slug/inquire returns 404 on inactive slug', async () => {
  const res = await request(app)
    .post(`/api/public/deals/${slug}/inquire`)
    .send({ name: 'Late Buyer', phone: '555-1234' });
  assert.equal(res.status, 404);
});

test('GET /api/deals/:id/link returns active slug', async () => {
  // Re-activate a link first
  const linkRes = await request(app).post(`/api/deals/${dealId}/link`);
  slug = linkRes.body.slug;
  const res = await request(app).get(`/api/deals/${dealId}/link`);
  assert.equal(res.status, 200);
  assert.equal(res.body.slug, slug);
});

test('GET /api/deals/:id/link returns null when no active link', async () => {
  await request(app).delete(`/api/deals/${dealId}/link`);
  const res = await request(app).get(`/api/deals/${dealId}/link`);
  assert.equal(res.status, 200);
  assert.equal(res.body, null);
});
