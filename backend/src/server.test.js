import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from './server.js';
import { db } from './db.js';

after(() => new Promise((resolve) => db.close(() => resolve())));

test('app is exported and GET /api/markets responds 200 with an array', async () => {
  const res = await request(app).get('/api/markets');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
});
