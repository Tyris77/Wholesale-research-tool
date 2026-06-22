import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from './server.js';
import { db, dbRun } from './db.js';

after(() => new Promise((resolve) => db.close(() => resolve())));

const TEST_LEAD = {
  parcel_id: 'TEST001',
  address: '1234 TEST ST NW',
  ward: 'Ward 1',
  owner_name: 'Jane Doe',
  owner_address: '999 FLORIDA AVE, MIAMI FL 33101',
  assessed_value: 400000,
  score: 80,
  signals: JSON.stringify(['tax_delinquent', 'absentee_owner', 'out_of_state']),
  status: 'new',
  last_scanned_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
};

before(async () => {
  await dbRun(
    `INSERT OR REPLACE INTO property_leads (parcel_id, address, ward, owner_name, owner_address, assessed_value, score, signals, status, last_scanned_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    Object.values(TEST_LEAD),
  );
});

test('GET /api/property-leads returns array including test lead', async () => {
  const res = await request(app).get('/api/property-leads');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
  assert.ok(res.body.some((l) => l.parcel_id === 'TEST001'));
});

test('GET /api/property-leads?ward=Ward+1 filters by ward', async () => {
  const res = await request(app).get('/api/property-leads?ward=Ward%201');
  assert.equal(res.status, 200);
  assert.ok(res.body.every((l) => l.ward === 'Ward 1'));
});

test('GET /api/property-leads?minScore=90 filters by score', async () => {
  const res = await request(app).get('/api/property-leads?minScore=90');
  assert.equal(res.status, 200);
  assert.ok(res.body.every((l) => l.score >= 90));
});

test('GET /api/property-leads/:parcelId returns single lead', async () => {
  const res = await request(app).get('/api/property-leads/TEST001');
  assert.equal(res.status, 200);
  assert.equal(res.body.parcel_id, 'TEST001');
  assert.equal(res.body.address, '1234 TEST ST NW');
});

test('GET /api/property-leads/:parcelId 404 for unknown', async () => {
  const res = await request(app).get('/api/property-leads/NOPE');
  assert.equal(res.status, 404);
});

test('POST /api/property-leads/:parcelId/promote creates seller', async () => {
  const res = await request(app).post('/api/property-leads/TEST001/promote');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.ok(res.body.sellerId);
  const check = await request(app).get('/api/property-leads/TEST001');
  assert.equal(check.body.status, 'promoted');
});

test('POST /api/property-leads/:parcelId/dismiss sets status', async () => {
  await dbRun("UPDATE property_leads SET status = 'new', promoted_seller_id = NULL WHERE parcel_id = 'TEST001'");
  const res = await request(app).post('/api/property-leads/TEST001/dismiss');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  const check = await request(app).get('/api/property-leads/TEST001');
  assert.equal(check.body.status, 'dismissed');
});

test('POST /api/property-intel/run returns success immediately', async () => {
  const res = await request(app).post('/api/property-intel/run');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.ok(res.body.message);
});
