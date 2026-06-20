import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from './server.js';
import { db } from './db.js';

after(() => new Promise((resolve) => db.close(() => resolve())));

test('POST /api/assistant returns not-configured without a Groq key', async () => {
  // GROQ_API_KEY is blanked by test-setup.js, so this never calls real Groq.
  const res = await request(app).post('/api/assistant').send({ messages: [{ role: 'user', content: 'summarize my pipeline' }] });
  assert.equal(res.status, 200);
  assert.equal(res.body.success, false);
  assert.match(res.body.error, /GROQ_API_KEY/);
});

test('POST /api/assistant validates the messages array', async () => {
  const res = await request(app).post('/api/assistant').send({ messages: [] });
  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
});
