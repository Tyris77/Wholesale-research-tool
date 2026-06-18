# Phase 2 — Harden It: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the backend robust and operable — validated inputs, consistent error responses, a config module that reports which integrations are live, and a `/api/health` endpoint.

**Architecture:** Introduce a `config` module (single source of truth for env + integration status), zod schemas for request bodies, and small Express middleware (`asyncHandler`, `validateBody`, `errorHandler`). `server.js` is refactored to export the Express app (so it can be tested with supertest) and only listen when run directly. Routes get validation middleware and async handlers; a catch-all error handler standardizes failure responses.

**Tech Stack:** Node 20 (ESM), Express 4, **zod** (validation), **supertest** (endpoint tests, devDep), Node built-in `node:test`.

**Scope note (response shape):** This phase standardizes ERROR responses to `{ success: false, error, details? }` and validation. It deliberately does NOT change the existing success payloads of the GET endpoints (e.g. `/api/markets` still returns a bare array), because the current frontend depends on those shapes. The unified `{ success, data }` envelope is folded into Phase 3 alongside the new API client.

**DB note:** `db.js` opens a persistent SQLite connection on import. `node --test` runs each test file in its own process, so supertest-based test files close the db in an `after()` hook to let the process exit cleanly.

---

### Task 1: Add dependencies and the config module

**Files:**
- Modify: `backend/package.json` (deps)
- Create: `backend/src/config.js`
- Test: `backend/src/config.test.js`

- [ ] **Step 1: Install dependencies**

Run from `backend/`:
```bash
npm install zod
npm install --save-dev supertest
```
Expected: `zod` appears under `dependencies` and `supertest` under `devDependencies` in `package.json`.

- [ ] **Step 2: Write the failing test**

Create `backend/src/config.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { integrationStatus, isConfigured } from './config.js';

test('isConfigured treats empty and placeholder values as not configured', () => {
  assert.equal(isConfigured(''), false);
  assert.equal(isConfigured(undefined), false);
  assert.equal(isConfigured('your_groq_api_key_here'), false);
  assert.equal(isConfigured('gsk_realkey123'), true);
});

test('integrationStatus reports a boolean per integration', () => {
  const status = integrationStatus({
    groq: 'gsk_real',
    fred: '',
    census: 'your_census_key_here',
    rentcast: 'rc_real',
  });
  assert.deepEqual(status, { groq: true, fred: false, census: false, rentcast: true });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run from `backend/`:
```bash
npm test -- src/config.test.js
```
Expected: FAIL — `config.js` does not exist yet.

- [ ] **Step 4: Create `backend/src/config.js`**

```js
import 'dotenv/config';

// A key counts as configured only if it is non-empty and not a leftover
// "your_..._here" placeholder from .env.example.
export function isConfigured(value) {
  return Boolean(value) && !String(value).startsWith('your_');
}

export const config = {
  port: Number(process.env.PORT) || 5000,
  corsOrigin: process.env.CORS_ORIGIN || '*',
  nodeEnv: process.env.NODE_ENV || 'development',
  keys: {
    groq: process.env.GROQ_API_KEY || '',
    fred: process.env.FRED_API_KEY || '',
    census: process.env.CENSUS_API_KEY || '',
    rentcast: process.env.RENTCAST_API_KEY || '',
  },
};

export function integrationStatus(keys = config.keys) {
  return {
    groq: isConfigured(keys.groq),
    fred: isConfigured(keys.fred),
    census: isConfigured(keys.census),
    rentcast: isConfigured(keys.rentcast),
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run from `backend/`:
```bash
npm test -- src/config.test.js
```
Expected: PASS — 2 tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/config.js backend/src/config.test.js
git commit -m "feat: add config module and zod/supertest deps"
```

---

### Task 2: Make `server.js` export the app and listen only when run directly

This enables endpoint testing with supertest and is a clean separation of "build app" from "start server".

**Files:**
- Modify: `backend/src/server.js`
- Test: `backend/src/server.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/src/server.test.js`:
```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `backend/`:
```bash
npm test -- src/server.test.js
```
Expected: FAIL — `server.js` has no default export (import resolves to undefined; supertest throws).

- [ ] **Step 3: Edit `server.js` imports**

At the TOP of `backend/src/server.js`, ensure the first imports are `config` and the `pathToFileURL` helper. Replace the existing import block top:
```js
import express from 'express';
import cors from 'cors';
import { initDb, db } from './db.js';
import { v4 as uuid } from 'uuid';
import { analyzeDealWithAI, scoreSeller } from './ai-service.js';
import { getMarketTrends, getNeighborhoodDemographics, geocodeAddress, getLiveComps } from './api-services.js';
import 'dotenv/config';
```
with:
```js
import express from 'express';
import cors from 'cors';
import { pathToFileURL } from 'url';
import { config } from './config.js';
import { initDb, db } from './db.js';
import { v4 as uuid } from 'uuid';
import { analyzeDealWithAI, scoreSeller } from './ai-service.js';
import { getMarketTrends, getNeighborhoodDemographics, geocodeAddress, getLiveComps } from './api-services.js';
```
(`config.js` imports `dotenv/config` itself, so the standalone dotenv import is removed and env is loaded before any other module runs.)

- [ ] **Step 4: Use config for CORS**

Replace `app.use(cors());` with:
```js
app.use(cors({ origin: config.corsOrigin }));
```

- [ ] **Step 5: Remove the mid-file listen block**

Delete these lines (currently around lines 165-168), which sit BEFORE the AI/market/geo endpoints:
```js
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
```

- [ ] **Step 6: Add export + guarded listen at the very END of `server.js`**

Append to the end of the file (after ALL route definitions):
```js
export default app;

const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  app.listen(config.port, () => {
    console.log(`Server running on http://localhost:${config.port}`);
  });
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run from `backend/`:
```bash
npm test -- src/server.test.js
```
Expected: PASS — 1 test passes and the process exits (db closed in `after`).

- [ ] **Step 8: Verify the server still starts normally**

Run from `backend/`:
```bash
node src/server.js &
sleep 1
curl -s http://localhost:5000/api/markets | head -c 60
kill %1
```
Expected: prints `Server running on http://localhost:5000` and the curl returns a JSON array.

- [ ] **Step 9: Commit**

```bash
git add backend/src/server.js backend/src/server.test.js
git commit -m "refactor: export Express app; listen only when run directly"
```

---

### Task 3: Add the `/api/health` endpoint

**Files:**
- Modify: `backend/src/server.js`
- Test: `backend/src/health.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/src/health.test.js`:
```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `backend/`:
```bash
npm test -- src/health.test.js
```
Expected: FAIL — 404, `res.body.status` is undefined.

- [ ] **Step 3: Add the import and route in `server.js`**

Change the config import line to also import `integrationStatus`:
```js
import { config, integrationStatus } from './config.js';
```
Add this route immediately after `initDb();` (before the markets endpoints):
```js
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', integrations: integrationStatus() });
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `backend/`:
```bash
npm test -- src/health.test.js
```
Expected: PASS — 1 test passes.

- [ ] **Step 5: Commit**

```bash
git add backend/src/server.js backend/src/health.test.js
git commit -m "feat: add /api/health endpoint reporting integration status"
```

---

### Task 4: Add zod request schemas

**Files:**
- Create: `backend/src/schemas.js`
- Test: `backend/src/schemas.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/src/schemas.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sellerCreateSchema, buyerCreateSchema, dealAnalysisSchema } from './schemas.js';

test('sellerCreateSchema accepts a minimal valid seller', () => {
  const r = sellerCreateSchema.safeParse({ name: 'Jane' });
  assert.equal(r.success, true);
});

test('sellerCreateSchema rejects a missing name', () => {
  const r = sellerCreateSchema.safeParse({ phone: '555' });
  assert.equal(r.success, false);
});

test('sellerCreateSchema rejects an invalid email', () => {
  const r = sellerCreateSchema.safeParse({ name: 'Jane', email: 'not-an-email' });
  assert.equal(r.success, false);
});

test('dealAnalysisSchema accepts six numeric fields', () => {
  const r = dealAnalysisSchema.safeParse({
    purchasePrice: 120000, repairBudget: 22000, arv: 185000,
    sellingCosts: 12000, holdingCosts: 3000, wholesaleFee: 10000,
  });
  assert.equal(r.success, true);
});

test('dealAnalysisSchema rejects a negative price', () => {
  const r = dealAnalysisSchema.safeParse({
    purchasePrice: -1, repairBudget: 0, arv: 0, sellingCosts: 0, holdingCosts: 0, wholesaleFee: 0,
  });
  assert.equal(r.success, false);
});

test('buyerCreateSchema rejects a non-numeric cash_available', () => {
  const r = buyerCreateSchema.safeParse({ name: 'Bob', cash_available: 'lots' });
  assert.equal(r.success, false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `backend/`:
```bash
npm test -- src/schemas.test.js
```
Expected: FAIL — `schemas.js` does not exist.

- [ ] **Step 3: Create `backend/src/schemas.js`**

```js
import { z } from 'zod';

// Email is optional but, when present, must be valid. Empty string is allowed
// because HTML forms submit "" for untouched fields.
const optionalEmail = z.string().email().optional().or(z.literal(''));
const money = z.number().nonnegative();

export const sellerCreateSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: optionalEmail,
  property_address: z.string().optional(),
  property_city: z.string().optional(),
  property_state: z.string().optional(),
  motivation: z.string().optional(),
});

export const sellerUpdateSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: optionalEmail,
  status: z.string().min(1),
  motivation: z.string().optional(),
});

export const buyerCreateSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: optionalEmail,
  cash_available: money.optional(),
  deal_types: z.string().optional(),
  preferred_areas: z.string().optional(),
  avg_deal_size: money.optional(),
});

export const buyerUpdateSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: optionalEmail,
  cash_available: money.optional(),
  deal_types: z.string().optional(),
  preferred_areas: z.string().optional(),
  status: z.string().min(1),
});

export const dealAnalysisSchema = z.object({
  purchasePrice: money,
  repairBudget: money,
  arv: money,
  sellingCosts: money,
  holdingCosts: money,
  wholesaleFee: money,
});

export const sellerScoreSchema = z.object({
  name: z.string().min(1),
  property_address: z.string().optional(),
  property_city: z.string().optional(),
  property_state: z.string().optional(),
  motivation: z.string().optional(),
  status: z.string().optional(),
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `backend/`:
```bash
npm test -- src/schemas.test.js
```
Expected: PASS — 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/schemas.js backend/src/schemas.test.js
git commit -m "feat: add zod request schemas for sellers, buyers, deals"
```

---

### Task 5: Add Express middleware (asyncHandler, validateBody, errorHandler)

**Files:**
- Create: `backend/src/middleware.js`
- Test: `backend/src/middleware.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/src/middleware.test.js`:
```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `backend/`:
```bash
npm test -- src/middleware.test.js
```
Expected: FAIL — `middleware.js` does not exist.

- [ ] **Step 3: Create `backend/src/middleware.js`**

```js
// Wraps an async route handler so a rejected promise is forwarded to Express's
// error handler instead of becoming an unhandled rejection / hung request.
export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// Validates req.body against a zod schema. On failure responds 400 with a
// structured error; on success replaces req.body with the parsed (stripped) data.
export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    req.body = result.data;
    next();
  };
}

// Catch-all error handler. Must be registered AFTER all routes.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  console.error('Unhandled error:', err.message);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error',
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `backend/`:
```bash
npm test -- src/middleware.test.js
```
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/middleware.js backend/src/middleware.test.js
git commit -m "feat: add asyncHandler, validateBody, and errorHandler middleware"
```

---

### Task 6: Wire validation and error handling into the routes

**Files:**
- Modify: `backend/src/server.js`
- Test: `backend/src/routes.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/src/routes.test.js`:
```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `backend/`:
```bash
npm test -- src/routes.test.js
```
Expected: FAIL — POST with empty body currently returns 200/500 (no validation), not a 400 envelope.

- [ ] **Step 3: Add imports to `server.js`**

After the existing imports, add:
```js
import { asyncHandler, errorHandler, validateBody } from './middleware.js';
import {
  sellerCreateSchema,
  sellerUpdateSchema,
  buyerCreateSchema,
  buyerUpdateSchema,
  dealAnalysisSchema,
  sellerScoreSchema,
} from './schemas.js';
```

- [ ] **Step 4: Add validation middleware to the seller/buyer write routes**

Change these four route signatures in `server.js` (add the middleware argument; the handler body stays the same):

- `app.post('/api/sellers', (req, res) => {` → `app.post('/api/sellers', validateBody(sellerCreateSchema), (req, res) => {`
- `app.put('/api/sellers/:id', (req, res) => {` → `app.put('/api/sellers/:id', validateBody(sellerUpdateSchema), (req, res) => {`
- `app.post('/api/buyers', (req, res) => {` → `app.post('/api/buyers', validateBody(buyerCreateSchema), (req, res) => {`
- `app.put('/api/buyers/:id', (req, res) => {` → `app.put('/api/buyers/:id', validateBody(buyerUpdateSchema), (req, res) => {`

- [ ] **Step 5: Add validation + asyncHandler to the AI routes**

Replace the existing `/api/analyze-deal` and `/api/score-seller` routes with:
```js
app.post('/api/analyze-deal', validateBody(dealAnalysisSchema), asyncHandler(async (req, res) => {
  const result = await analyzeDealWithAI(req.body);
  res.json(result);
}));

app.post('/api/score-seller', validateBody(sellerScoreSchema), asyncHandler(async (req, res) => {
  const result = await scoreSeller(req.body);
  res.json(result);
}));
```

- [ ] **Step 6: Wrap the async GET routes with asyncHandler**

Replace the four async GET handlers so each is wrapped (bodies unchanged):
```js
app.get('/api/market-trends/:metro', asyncHandler(async (req, res) => {
  const { metro } = req.params;
  const result = await getMarketTrends(metro);
  res.json(result);
}));

app.get('/api/neighborhood/:zipCode', asyncHandler(async (req, res) => {
  const { zipCode } = req.params;
  const result = await getNeighborhoodDemographics(zipCode);
  res.json(result);
}));

app.get('/api/geocode', asyncHandler(async (req, res) => {
  const { address, city, state } = req.query;
  const fullAddress = `${address} ${city} ${state}`.trim();
  const result = await geocodeAddress(fullAddress);
  res.json(result);
}));

app.get('/api/live-comps', asyncHandler(async (req, res) => {
  const { address, city, state } = req.query;
  if (!address || !city || !state) {
    return res.status(400).json({ success: false, error: 'Missing address, city, or state' });
  }
  const result = await getLiveComps(address, city, state);
  res.json(result);
}));
```

- [ ] **Step 7: Register the error handler as the LAST middleware**

In the end-of-file block from Phase 2 Task 2, register `errorHandler` BEFORE `export default app;`:
```js
app.use(errorHandler);

export default app;

const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  app.listen(config.port, () => {
    console.log(`Server running on http://localhost:${config.port}`);
  });
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run from `backend/`:
```bash
npm test -- src/routes.test.js
```
Expected: PASS — 3 tests pass.

- [ ] **Step 9: Run the FULL suite (no regressions)**

Run from `backend/`:
```bash
npm test
```
Expected: PASS — all Phase 1 + Phase 2 tests pass, zero failures.

- [ ] **Step 10: Commit**

```bash
git add backend/src/server.js backend/src/routes.test.js
git commit -m "feat: validate request bodies and standardize error responses"
```

---

## Phase 2 Verification (Definition of Done)

- [ ] `npm test` in `backend/` passes all tests (Phase 1 + Phase 2), zero failures.
- [ ] `config.js` exports `config`, `integrationStatus`, `isConfigured`; placeholders count as not-configured.
- [ ] `server.js` default-exports the app and only listens when run directly.
- [ ] `GET /api/health` returns `{ status: 'ok', integrations: { groq, fred, census, rentcast } }` (booleans).
- [ ] POST/PUT to sellers/buyers and POST to analyze-deal/score-seller reject invalid bodies with `400 { success: false, error: 'Validation failed', details: [...] }`.
- [ ] An unhandled error in any async route yields `{ success: false, error }` via `errorHandler` rather than a hung request.
- [ ] `node src/server.js` still boots and serves `/api/markets`.
