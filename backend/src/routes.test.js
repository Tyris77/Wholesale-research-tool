import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from './server.js';
import { db } from './db.js';

after(() => new Promise((resolve) => db.close(() => resolve())));

test('POST /api/sellers with empty body returns 400 with validation details', async () => {
  const res = await request(app).post('/api/sellers').send({});
  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error, 'Validation failed');
  assert.ok(Array.isArray(res.body.details));
});

test('POST /api/analyze-deal with missing numeric fields returns 400', async () => {
  const res = await request(app).post('/api/analyze-deal').send({ purchasePrice: 1 });
  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
});

test('POST /api/sellers with a valid body returns 200 and an id', async () => {
  const res = await request(app)
    .post('/api/sellers')
    .send({ name: 'Phase2 Test Seller', motivation: 'relocating' });
  assert.equal(res.status, 200);
  assert.ok(res.body.id, 'expected a generated id');
  assert.equal(res.body.name, 'Phase2 Test Seller');
});
