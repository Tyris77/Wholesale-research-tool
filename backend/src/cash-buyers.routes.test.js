import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from './server.js';
import { db, dbRun } from './db.js';

after(() => new Promise((resolve) => db.close(() => resolve())));

const TEST_BUYER = {
  id: 'CB_TEST_1', name: 'TEST FLIPPER LLC', mailing_address: '1 INVESTOR ST, WASHINGTON DC 20001',
  buyer_state: 'DC', purchase_count: 5, total_spend: 2000000, avg_price: 400000,
  zips: JSON.stringify(['20019', '20020']), last_purchase_date: '2025-06-01', saved: 0,
  last_seen_at: new Date().toISOString(), created_at: new Date().toISOString(),
};

before(async () => {
  await dbRun(
    `INSERT OR REPLACE INTO cash_buyers (id, name, mailing_address, buyer_state, purchase_count, total_spend, avg_price, zips, last_purchase_date, saved, last_seen_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    Object.values(TEST_BUYER),
  );
});

test('GET /api/cash-buyers returns array including the test buyer', async () => {
  const res = await request(app).get('/api/cash-buyers');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
  assert.ok(res.body.some((b) => b.id === 'CB_TEST_1'));
});

test('GET /api/cash-buyers?minPurchases=4 filters by purchase count', async () => {
  const res = await request(app).get('/api/cash-buyers?minPurchases=4');
  assert.equal(res.status, 200);
  assert.ok(res.body.every((b) => b.purchase_count >= 4));
});

test('POST /api/cash-buyers/:id/save marks saved and mirrors into buyers', async () => {
  const res = await request(app).post('/api/cash-buyers/CB_TEST_1/save');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  const buyersList = await request(app).get('/api/buyers');
  assert.ok(buyersList.body.some((b) => b.name === 'TEST FLIPPER LLC'));
});

test('POST /api/cash-buyers/:id/save 404 for unknown id', async () => {
  const res = await request(app).post('/api/cash-buyers/NOPE/save');
  assert.equal(res.status, 404);
});

test('POST /api/cash-buyers/find returns success immediately', async () => {
  const res = await request(app).post('/api/cash-buyers/find');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
});
