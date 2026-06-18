import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from './server.js';
import { db } from './db.js';

after(() => new Promise((resolve) => db.close(() => resolve())));

test('GET /api/health reports status and integration booleans', async () => {
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
  for (const key of ['groq', 'fred', 'census', 'rentcast']) {
    assert.equal(typeof res.body.integrations[key], 'boolean', `${key} should be boolean`);
  }
});
