import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { asyncHandler, validateBody, errorHandler } from './middleware.js';

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

test('asyncHandler forwards a rejected promise to next', async () => {
  const boom = new Error('boom');
  let passed = null;
  const handler = asyncHandler(async () => { throw boom; });
  await handler({}, makeRes(), (err) => { passed = err; });
  assert.equal(passed, boom);
});

test('validateBody rejects an invalid body with 400 and details', () => {
  const schema = z.object({ name: z.string().min(1) });
  const res = makeRes();
  let nextCalled = false;
  validateBody(schema)({ body: {} }, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error, 'Validation failed');
  assert.ok(Array.isArray(res.body.details) && res.body.details.length >= 1);
});

test('validateBody passes a valid body to next and replaces req.body with parsed data', () => {
  const schema = z.object({ name: z.string() });
  const req = { body: { name: 'Jane', extra: 'dropped' } };
  let nextCalled = false;
  validateBody(schema)(req, makeRes(), () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.deepEqual(req.body, { name: 'Jane' });
});

test('errorHandler returns 500 with a success:false envelope', () => {
  const res = makeRes();
  errorHandler(new Error('kaboom'), {}, res, () => {});
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error, 'kaboom');
});
