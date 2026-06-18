# Phase 4 — Add Capabilities: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the four Phase 4 capabilities — save/track deals (table + CRUD + Deals page), comps-driven ARV (server-side median $/sqft), buyer–deal matching (server-side ranked list), and a printable deal-sheet export — on top of the existing hardened backend and typed-client frontend.

**Architecture:** All business logic lives server-side in small, pure, unit-tested modules (`deal-math.js`, `arv.js`, `matching.js`) that Express endpoints call. A new `deals` SQLite table stores deals with profit/ROI computed and stored on write. The frontend gains typed client functions, a `Deals` page (list + create/edit/delete + buyer matches), a calculator that can estimate ARV from comps and save a deal, and a standalone printable `DealSheet` route driven by a `@media print` stylesheet.

**Tech Stack:** Backend — Node.js (ESM), Express 4, sqlite3, zod 4, uuid, supertest + `node:test`. Frontend — React 18, Vite 5, TypeScript, react-router-dom v7, vitest (node env, pure-logic tests).

## Global Constraints

- Backend logic (deal math, ARV, matching) MUST be server-side and unit-tested; the frontend stays thin. (Spec: "Comps math and buyer-matching logic live server-side so the frontend stays thin.")
- Export is browser print-to-PDF via a print stylesheet — no PDF dependency. (Spec.)
- Money/number inputs reuse the existing `money = z.number().nonnegative()` validator in `backend/src/schemas.js`.
- Backend GET endpoints return bare arrays/objects; POST/PUT/DELETE return either the resource object or `{ success: boolean }`, and validation failures return `{ success: false, error, details }` (Phase 2 convention). The typed client throws `ApiError` on non-2xx.
- New backend modules follow the dependency-injection-friendly, pure-function style of `api-services.js` (logic separated from HTTP).
- Frontend pages follow the existing pattern: `useAsync` + `Loading`/`ErrorBanner`/`Empty` from `src/components/states.tsx`, typed calls via `src/api/client.ts`.
- `deals` table columns are exactly those in the spec's data model, plus one added column `deal_type` (required to make "buyer matching by deal type" implementable, since the deal must carry a type). Default `'wholesale'`.

---

### Task 1: Backend deal-math module

Pure function that computes `profit` and `roi` (and intermediates) from deal inputs, mirroring the frontend `src/lib/deal.ts` math but using the snake_case field names the `deals` table and API use. Stored profit/ROI come from here.

**Files:**
- Create: `backend/src/deal-math.js`
- Test: `backend/src/deal-math.test.js`

**Interfaces:**
- Produces: `calculateDeal({ purchase_price, repair_budget, arv, selling_costs, holding_costs, wholesale_fee }) → { total_investment, exit_net, profit, roi }`. All inputs and outputs are numbers; `roi` is a percentage (e.g. `3.82` means 3.82%).

- [ ] **Step 1: Write the failing test**

Create `backend/src/deal-math.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateDeal } from './deal-math.js';

test('calculateDeal computes investment, exit, profit, and roi', () => {
  const r = calculateDeal({
    purchase_price: 120000, repair_budget: 22000, arv: 185000,
    selling_costs: 12000, holding_costs: 3000, wholesale_fee: 10000,
  });
  assert.equal(r.total_investment, 157000);
  assert.equal(r.exit_net, 163000);
  assert.equal(r.profit, 6000);
  assert.equal(Math.round(r.roi * 100) / 100, 3.82);
});

test('calculateDeal returns roi 0 when there is no investment', () => {
  const r = calculateDeal({
    purchase_price: 0, repair_budget: 0, arv: 0,
    selling_costs: 0, holding_costs: 0, wholesale_fee: 0,
  });
  assert.equal(r.roi, 0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && node --test src/deal-math.test.js`
Expected: FAIL — `Cannot find module './deal-math.js'`.

- [ ] **Step 3: Write the minimal implementation**

Create `backend/src/deal-math.js`:

```js
// Computes deal economics from snake_case inputs matching the `deals` table.
// roi is returned as a percentage (profit / total_investment * 100).
export function calculateDeal({
  purchase_price,
  repair_budget,
  arv,
  selling_costs,
  holding_costs,
  wholesale_fee,
}) {
  const total_investment = purchase_price + repair_budget + holding_costs + selling_costs;
  const exit_net = arv - selling_costs - wholesale_fee;
  const profit = exit_net - total_investment;
  const roi = total_investment > 0 ? (profit / total_investment) * 100 : 0;
  return { total_investment, exit_net, profit, roi };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && node --test src/deal-math.test.js`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/deal-math.js backend/src/deal-math.test.js
git commit -m "feat(deals): server-side deal-math module (profit/roi)"
```

---

### Task 2: deals table, zod schemas, and CRUD endpoints

Add the `deals` table, create/update zod schemas, and the five CRUD endpoints. Profit/ROI are computed via `calculateDeal` on write and stored.

**Files:**
- Modify: `backend/src/db.js` (add `deals` table inside `initDb`)
- Modify: `backend/src/schemas.js` (add `dealCreateSchema`, `dealUpdateSchema`)
- Modify: `backend/src/server.js` (imports + new endpoints, inserted before `app.use(errorHandler)`)
- Test: `backend/src/deals.routes.test.js`

**Interfaces:**
- Consumes: `calculateDeal` from Task 1; `validateBody`, `asyncHandler` from `middleware.js`; `db` from `db.js`; `uuid`.
- Produces (HTTP):
  - `GET /api/deals` → `Deal[]` (bare array, `created_at DESC`)
  - `GET /api/deals/:id` → `Deal` (404 `{ success:false, error:'Deal not found' }` if absent)
  - `POST /api/deals` (body `dealCreateSchema`) → created `Deal` row
  - `PUT /api/deals/:id` (body `dealUpdateSchema`) → updated `Deal` row
  - `DELETE /api/deals/:id` → `{ success: true }`
- Produces (schema): `dealCreateSchema` / `dealUpdateSchema` accept `{ name?, property_address?, city?, state?, purchase_price, repair_budget, arv, selling_costs, holding_costs, wholesale_fee, deal_type?, status? }`. `purchase_price`/`repair_budget`/`arv`/`selling_costs`/`holding_costs`/`wholesale_fee` are required non-negative numbers; string fields default to `''`; `deal_type` is one of `wholesale|flip|buy_hold` (default `wholesale`); `status` defaults to `analyzing`.
- A `Deal` row has columns: `id, name, property_address, city, state, purchase_price, repair_budget, arv, selling_costs, holding_costs, wholesale_fee, deal_type, profit, roi, status, created_at, updated_at`.

- [ ] **Step 1: Add the `deals` table to `db.js`**

In `backend/src/db.js`, inside `initDb()`'s `db.serialize(() => { ... })`, immediately **after** the `buyers` table `db.run(...)` block and **before** the `comps` table block, add:

```js
    // Deals table
    db.run(`
      CREATE TABLE IF NOT EXISTS deals (
        id TEXT PRIMARY KEY,
        name TEXT,
        property_address TEXT,
        city TEXT,
        state TEXT,
        purchase_price REAL,
        repair_budget REAL,
        arv REAL,
        selling_costs REAL,
        holding_costs REAL,
        wholesale_fee REAL,
        deal_type TEXT,
        profit REAL,
        roi REAL,
        status TEXT,
        created_at TEXT,
        updated_at TEXT
      )
    `);
```

- [ ] **Step 2: Add the deal schemas to `schemas.js`**

In `backend/src/schemas.js`, append at the end of the file (the `money` const already exists near the top):

```js
export const dealCreateSchema = z.object({
  name: z.string().default(''),
  property_address: z.string().default(''),
  city: z.string().default(''),
  state: z.string().default(''),
  purchase_price: money,
  repair_budget: money,
  arv: money,
  selling_costs: money,
  holding_costs: money,
  wholesale_fee: money,
  deal_type: z.enum(['wholesale', 'flip', 'buy_hold']).default('wholesale'),
  status: z.string().default('analyzing'),
});

export const dealUpdateSchema = dealCreateSchema;
```

- [ ] **Step 3: Wire imports and endpoints into `server.js`**

In `backend/src/server.js`, extend the schema import to include the deal schemas:

```js
import {
  sellerCreateSchema,
  sellerUpdateSchema,
  buyerCreateSchema,
  buyerUpdateSchema,
  dealAnalysisSchema,
  sellerScoreSchema,
  dealCreateSchema,
  dealUpdateSchema,
} from './schemas.js';
```

Add this import directly below the existing `import { ... } from './ai-service.js';` / api-services imports:

```js
import { calculateDeal } from './deal-math.js';
```

Then, **after** the `/api/properties/search` endpoint block and **before** the `// ========== AI ANALYSIS ENDPOINTS ==========` comment, insert:

```js
// ========== DEALS ENDPOINTS ==========

app.get('/api/deals', (req, res) => {
  db.all('SELECT * FROM deals ORDER BY created_at DESC', (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json(rows || []);
  });
});

app.get('/api/deals/:id', (req, res) => {
  db.get('SELECT * FROM deals WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    if (!row) return res.status(404).json({ success: false, error: 'Deal not found' });
    res.json(row);
  });
});

app.post('/api/deals', validateBody(dealCreateSchema), (req, res) => {
  const d = req.body;
  const { profit, roi } = calculateDeal(d);
  const id = uuid();
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO deals (id, name, property_address, city, state, purchase_price, repair_budget, arv, selling_costs, holding_costs, wholesale_fee, deal_type, profit, roi, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, d.name, d.property_address, d.city, d.state, d.purchase_price, d.repair_budget, d.arv, d.selling_costs, d.holding_costs, d.wholesale_fee, d.deal_type, profit, roi, d.status, now, now],
    function (err) {
      if (err) return res.status(500).json({ success: false, error: err.message });
      db.get('SELECT * FROM deals WHERE id = ?', [id], (e2, row) => {
        if (e2) return res.status(500).json({ success: false, error: e2.message });
        res.json(row);
      });
    }
  );
});

app.put('/api/deals/:id', validateBody(dealUpdateSchema), (req, res) => {
  const d = req.body;
  const { profit, roi } = calculateDeal(d);
  const updated_at = new Date().toISOString();
  db.run(
    `UPDATE deals SET name = ?, property_address = ?, city = ?, state = ?, purchase_price = ?, repair_budget = ?, arv = ?, selling_costs = ?, holding_costs = ?, wholesale_fee = ?, deal_type = ?, profit = ?, roi = ?, status = ?, updated_at = ? WHERE id = ?`,
    [d.name, d.property_address, d.city, d.state, d.purchase_price, d.repair_budget, d.arv, d.selling_costs, d.holding_costs, d.wholesale_fee, d.deal_type, profit, roi, d.status, updated_at, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ success: false, error: err.message });
      db.get('SELECT * FROM deals WHERE id = ?', [req.params.id], (e2, row) => {
        if (e2) return res.status(500).json({ success: false, error: e2.message });
        if (!row) return res.status(404).json({ success: false, error: 'Deal not found' });
        res.json(row);
      });
    }
  );
});

app.delete('/api/deals/:id', (req, res) => {
  db.run('DELETE FROM deals WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true });
  });
});
```

- [ ] **Step 4: Write the failing integration test**

Create `backend/src/deals.routes.test.js`:

```js
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from './server.js';
import { db } from './db.js';

after(() => new Promise((resolve) => db.close(() => resolve())));

const validDeal = {
  name: 'Test Deal', property_address: '1 Main St', city: 'Atlanta', state: 'GA',
  purchase_price: 120000, repair_budget: 22000, arv: 185000,
  selling_costs: 12000, holding_costs: 3000, wholesale_fee: 10000,
};

test('POST /api/deals computes and stores profit, roi, and defaults', async () => {
  const res = await request(app).post('/api/deals').send(validDeal);
  assert.equal(res.status, 200);
  assert.ok(res.body.id, 'expected a generated id');
  assert.equal(res.body.profit, 6000);
  assert.equal(Math.round(res.body.roi * 100) / 100, 3.82);
  assert.equal(res.body.deal_type, 'wholesale');
  assert.equal(res.body.status, 'analyzing');
});

test('POST /api/deals with missing numeric fields returns 400', async () => {
  const res = await request(app).post('/api/deals').send({ name: 'x' });
  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
});

test('GET /api/deals returns an array including a created deal', async () => {
  const created = await request(app).post('/api/deals').send(validDeal);
  const res = await request(app).get('/api/deals');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
  assert.ok(res.body.some((row) => row.id === created.body.id));
});

test('PUT /api/deals/:id recomputes profit on update', async () => {
  const created = await request(app).post('/api/deals').send(validDeal);
  const res = await request(app)
    .put(`/api/deals/${created.body.id}`)
    .send({ ...validDeal, arv: 200000 });
  assert.equal(res.status, 200);
  assert.equal(res.body.profit, 21000); // exit_net 178000 - investment 157000
});

test('DELETE /api/deals/:id removes the deal', async () => {
  const created = await request(app).post('/api/deals').send(validDeal);
  const del = await request(app).delete(`/api/deals/${created.body.id}`);
  assert.equal(del.status, 200);
  assert.equal(del.body.success, true);
  const after = await request(app).get(`/api/deals/${created.body.id}`);
  assert.equal(after.status, 404);
});
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && node --test src/deals.routes.test.js`
Expected: PASS — 5 tests.

- [ ] **Step 6: Run the full backend suite**

Run: `cd backend && npm test`
Expected: all tests pass (33 prior + 2 from Task 1 + 5 here = 40).

- [ ] **Step 7: Commit**

```bash
git add backend/src/db.js backend/src/schemas.js backend/src/server.js backend/src/deals.routes.test.js
git commit -m "feat(deals): deals table, schemas, and CRUD endpoints"
```

---

### Task 3: Comps-driven ARV (server-side)

Pure `estimateArv` (median price-per-sqft × subject sqft) plus a `GET /api/arv` endpoint that pulls comps from the DB and runs it.

**Files:**
- Create: `backend/src/arv.js`
- Modify: `backend/src/server.js` (import + endpoint)
- Test: `backend/src/arv.test.js`
- Test: append one case to `backend/src/deals.routes.test.js`

**Interfaces:**
- Produces: `estimateArv(comps, sqft) → { arv, medianPricePerSqft, sampleSize }`. `comps` is an array of objects with a numeric `price_per_sqft`; `sqft` is the subject square footage. `arv` is `round(medianPricePerSqft * sqft)`, or `null` when there are no usable comps or `sqft <= 0`. `sampleSize` is the count of comps with a positive `price_per_sqft`.
- Produces (HTTP): `GET /api/arv?city=&state=&sqft=` → `{ success, arv, medianPricePerSqft, sampleSize, error? }`. `success:false` with an `error` message when ARV can't be estimated.

- [ ] **Step 1: Write the failing test**

Create `backend/src/arv.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateArv } from './arv.js';

test('estimateArv multiplies median price-per-sqft by sqft (odd count)', () => {
  const r = estimateArv(
    [{ price_per_sqft: 100 }, { price_per_sqft: 200 }, { price_per_sqft: 150 }],
    1000,
  );
  assert.equal(r.medianPricePerSqft, 150);
  assert.equal(r.arv, 150000);
  assert.equal(r.sampleSize, 3);
});

test('estimateArv averages the two middles for an even count', () => {
  const r = estimateArv([{ price_per_sqft: 100 }, { price_per_sqft: 200 }], 1000);
  assert.equal(r.medianPricePerSqft, 150);
  assert.equal(r.arv, 150000);
});

test('estimateArv ignores comps without a positive price_per_sqft', () => {
  const r = estimateArv(
    [{ price_per_sqft: 0 }, { price_per_sqft: null }, { price_per_sqft: 150 }],
    1000,
  );
  assert.equal(r.sampleSize, 1);
  assert.equal(r.medianPricePerSqft, 150);
});

test('estimateArv returns null arv when there are no usable comps', () => {
  const r = estimateArv([], 1000);
  assert.equal(r.arv, null);
  assert.equal(r.sampleSize, 0);
});

test('estimateArv returns null arv when sqft is not positive', () => {
  const r = estimateArv([{ price_per_sqft: 150 }], 0);
  assert.equal(r.arv, null);
  assert.equal(r.medianPricePerSqft, 150);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && node --test src/arv.test.js`
Expected: FAIL — `Cannot find module './arv.js'`.

- [ ] **Step 3: Write the implementation**

Create `backend/src/arv.js`:

```js
function median(nums) {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Estimates ARV as median(price_per_sqft) * subject sqft.
// Comps without a positive price_per_sqft are ignored.
export function estimateArv(comps, sqft) {
  const ppsf = (comps || [])
    .map((c) => Number(c.price_per_sqft))
    .filter((n) => Number.isFinite(n) && n > 0);
  const medianPricePerSqft = median(ppsf);
  if (medianPricePerSqft === null || !(Number(sqft) > 0)) {
    return { arv: null, medianPricePerSqft, sampleSize: ppsf.length };
  }
  return {
    arv: Math.round(medianPricePerSqft * Number(sqft)),
    medianPricePerSqft,
    sampleSize: ppsf.length,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && node --test src/arv.test.js`
Expected: PASS — 5 tests.

- [ ] **Step 5: Add the endpoint to `server.js`**

Add the import below the `deal-math.js` import:

```js
import { estimateArv } from './arv.js';
```

Inside the `// ========== DEALS ENDPOINTS ==========` section (e.g. directly after the `DELETE /api/deals/:id` handler), add:

```js
app.get('/api/arv', (req, res) => {
  const { city, state, sqft } = req.query;
  let query = 'SELECT price_per_sqft FROM comps';
  const params = [];
  if (city) {
    query += ' WHERE city = ?';
    params.push(city);
  }
  if (state) {
    query += (params.length > 0 ? ' AND' : ' WHERE') + ' state = ?';
    params.push(state);
  }
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    const est = estimateArv(rows || [], Number(sqft));
    if (est.arv === null) {
      return res.json({ success: false, error: 'Not enough comps to estimate ARV', ...est });
    }
    res.json({ success: true, ...est });
  });
});
```

- [ ] **Step 6: Add an integration test for the endpoint**

Append to `backend/src/deals.routes.test.js`:

```js
test('GET /api/arv estimates from seeded Atlanta comps', async () => {
  const res = await request(app).get('/api/arv?city=Atlanta&state=GA&sqft=1000');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.medianPricePerSqft, 157); // seeded ppsf: 158, 143, 157 -> median 157
  assert.equal(res.body.arv, 157000);
});

test('GET /api/arv returns success:false when no comps match', async () => {
  const res = await request(app).get('/api/arv?city=Nowhere&state=ZZ&sqft=1000');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, false);
  assert.equal(res.body.arv, null);
});
```

- [ ] **Step 7: Run the tests**

Run: `cd backend && node --test src/arv.test.js src/deals.routes.test.js`
Expected: PASS — all (5 unit + 7 route).

- [ ] **Step 8: Commit**

```bash
git add backend/src/arv.js backend/src/server.js backend/src/arv.test.js backend/src/deals.routes.test.js
git commit -m "feat(arv): comps-driven ARV estimate + /api/arv endpoint"
```

---

### Task 4: Buyer–deal matching (server-side)

Pure `matchBuyers` scoring buyers by area, price fit, and deal type, plus a `GET /api/deals/:id/buyer-matches` endpoint.

**Files:**
- Create: `backend/src/matching.js`
- Modify: `backend/src/server.js` (import + endpoint)
- Test: `backend/src/matching.test.js`
- Test: append one case to `backend/src/deals.routes.test.js`

**Interfaces:**
- Produces: `matchBuyers(deal, buyers) → Array<{ buyer, score, reasons: { area, price, type } }>`, filtered to `score > 0` and sorted by `score` descending. Scoring: `area` (1 if the deal's city OR state appears, case-insensitively, in `buyer.preferred_areas`), `price` (1 if `buyer.cash_available > 0` and `deal.purchase_price <= buyer.cash_available`), `type` (1 if `buyer.deal_types` is blank OR contains `deal.deal_type`, case-insensitively). `score` is their sum (0–3).
- Produces (HTTP): `GET /api/deals/:id/buyer-matches` → ranked `BuyerMatch[]` (404 if the deal is absent).

- [ ] **Step 1: Write the failing test**

Create `backend/src/matching.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchBuyers } from './matching.js';

const deal = { city: 'Atlanta', state: 'GA', purchase_price: 120000, deal_type: 'wholesale' };

test('matchBuyers scores area, price, and type and sorts descending', () => {
  const buyers = [
    { id: 'a', preferred_areas: 'Atlanta, Marietta', cash_available: 200000, deal_types: 'wholesale, flip' }, // 3
    { id: 'b', preferred_areas: 'Phoenix', cash_available: 50000, deal_types: 'rental' }, // 0 -> excluded
    { id: 'c', preferred_areas: 'Atlanta', cash_available: 0, deal_types: 'wholesale' }, // area+type = 2
  ];
  const result = matchBuyers(deal, buyers);
  assert.equal(result.length, 2);
  assert.equal(result[0].buyer.id, 'a');
  assert.equal(result[0].score, 3);
  assert.equal(result[1].buyer.id, 'c');
  assert.equal(result[1].score, 2);
});

test('matchBuyers matches on state and treats blank deal_types as open', () => {
  const buyers = [{ id: 'd', preferred_areas: 'GA statewide', cash_available: 130000, deal_types: '' }];
  const result = matchBuyers(deal, buyers);
  assert.equal(result.length, 1);
  assert.equal(result[0].score, 3);
  assert.deepEqual(result[0].reasons, { area: true, price: true, type: true });
});

test('matchBuyers excludes buyers with no matching dimension', () => {
  const buyers = [{ id: 'e', preferred_areas: 'Dallas', cash_available: 50000, deal_types: 'rental' }];
  assert.equal(matchBuyers(deal, buyers).length, 0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && node --test src/matching.test.js`
Expected: FAIL — `Cannot find module './matching.js'`.

- [ ] **Step 3: Write the implementation**

Create `backend/src/matching.js`:

```js
// Ranks buyers against a deal by area, price fit, and deal type.
// Returns matches with score > 0, sorted by score descending.
export function matchBuyers(deal, buyers) {
  const city = (deal.city || '').toLowerCase();
  const state = (deal.state || '').toLowerCase();
  const dealType = (deal.deal_type || '').toLowerCase();
  const price = Number(deal.purchase_price) || 0;

  return (buyers || [])
    .map((buyer) => {
      const areas = (buyer.preferred_areas || '').toLowerCase();
      const types = (buyer.deal_types || '').toLowerCase();
      const cash = Number(buyer.cash_available) || 0;

      const area = (!!city && areas.includes(city)) || (!!state && areas.includes(state));
      const price_fit = cash > 0 && price <= cash;
      const type = types.trim() === '' || (!!dealType && types.includes(dealType));

      const score = (area ? 1 : 0) + (price_fit ? 1 : 0) + (type ? 1 : 0);
      return { buyer, score, reasons: { area, price: price_fit, type } };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && node --test src/matching.test.js`
Expected: PASS — 3 tests.

- [ ] **Step 5: Add the endpoint to `server.js`**

Add the import below the `arv.js` import:

```js
import { matchBuyers } from './matching.js';
```

Inside the `// ========== DEALS ENDPOINTS ==========` section (after the `/api/arv` handler), add:

```js
app.get('/api/deals/:id/buyer-matches', (req, res) => {
  db.get('SELECT * FROM deals WHERE id = ?', [req.params.id], (err, deal) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    if (!deal) return res.status(404).json({ success: false, error: 'Deal not found' });
    db.all('SELECT * FROM buyers', (err2, buyers) => {
      if (err2) return res.status(500).json({ success: false, error: err2.message });
      res.json(matchBuyers(deal, buyers || []));
    });
  });
});
```

- [ ] **Step 6: Add an integration test**

Append to `backend/src/deals.routes.test.js`:

```js
test('GET /api/deals/:id/buyer-matches returns ranked matches', async () => {
  await request(app).post('/api/buyers').send({
    name: 'Cash Buyer', cash_available: 200000,
    deal_types: 'wholesale', preferred_areas: 'Atlanta',
  });
  const deal = await request(app).post('/api/deals').send(validDeal);
  const res = await request(app).get(`/api/deals/${deal.body.id}/buyer-matches`);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
  assert.ok(res.body.length >= 1);
  assert.equal(res.body[0].reasons.area, true);
});

test('GET /api/deals/:id/buyer-matches 404s for an unknown deal', async () => {
  const res = await request(app).get('/api/deals/does-not-exist/buyer-matches');
  assert.equal(res.status, 404);
});
```

- [ ] **Step 7: Run the full backend suite**

Run: `cd backend && npm test`
Expected: all pass (Task 1: 2, Task 2: 5, Task 3: 5 unit + 2 route, Task 4: 3 unit + 2 route, plus the original 33 = 52).

- [ ] **Step 8: Commit**

```bash
git add backend/src/matching.js backend/src/server.js backend/src/matching.test.js backend/src/deals.routes.test.js
git commit -m "feat(matching): buyer-deal matching + /api/deals/:id/buyer-matches"
```

---

### Task 5: Frontend types and typed client functions

Add `Deal`/`NewDeal`/`BuyerMatch`/`ArvEstimate` types and the client functions for deals, ARV, and buyer matches. Mirror the existing `client.ts` style.

**Files:**
- Modify: `src/api/types.ts`
- Modify: `src/api/client.ts`
- Test: `src/api/client.test.ts` (append)

**Interfaces:**
- Consumes: `apiFetch`, `jsonBody` (module-private — reuse the existing pattern), `Buyer` type.
- Produces:
  - Types `Deal`, `NewDeal = Omit<Deal,'id'|'profit'|'roi'|'created_at'|'updated_at'>`, `BuyerMatch`, `ArvEstimate`.
  - `getDeals(): Promise<Deal[]>`, `getDeal(id): Promise<Deal>`, `createDeal(body: NewDeal): Promise<Deal>`, `updateDeal(id, body: NewDeal): Promise<Deal>`, `deleteDeal(id): Promise<{ success: boolean }>`, `getBuyerMatches(id): Promise<BuyerMatch[]>`, `getArvEstimate(city, state, sqft): Promise<ArvEstimate>`.

- [ ] **Step 1: Add types to `types.ts`**

Append to `src/api/types.ts`:

```ts
export interface Deal {
  id: string;
  name: string;
  property_address: string;
  city: string;
  state: string;
  purchase_price: number;
  repair_budget: number;
  arv: number;
  selling_costs: number;
  holding_costs: number;
  wholesale_fee: number;
  deal_type: string;
  profit: number;
  roi: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export type NewDeal = Omit<Deal, 'id' | 'profit' | 'roi' | 'created_at' | 'updated_at'>;

export interface BuyerMatch {
  buyer: Buyer;
  score: number;
  reasons: { area: boolean; price: boolean; type: boolean };
}

export interface ArvEstimate {
  success: boolean;
  arv: number | null;
  medianPricePerSqft: number | null;
  sampleSize: number;
  error?: string;
}
```

- [ ] **Step 2: Add the failing client test**

Append to `src/api/client.test.ts` (add `vi` to the existing `import { test, expect } from 'vitest';` line so it reads `import { test, expect, vi } from 'vitest';`, and import the new functions):

```ts
import { getArvEstimate, getBuyerMatches } from './client';

function stubFetch(body: unknown) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', (async (url: string) => {
    calls.push(url);
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  }) as unknown as typeof fetch);
  return calls;
}

test('getArvEstimate requests /api/arv with city, state, and sqft', async () => {
  const calls = stubFetch({ success: true, arv: 1, medianPricePerSqft: 1, sampleSize: 1 });
  await getArvEstimate('Atlanta', 'GA', 1800);
  expect(calls[0]).toContain('/api/arv?');
  expect(calls[0]).toContain('city=Atlanta');
  expect(calls[0]).toContain('state=GA');
  expect(calls[0]).toContain('sqft=1800');
  vi.unstubAllGlobals();
});

test('getBuyerMatches requests the deal buyer-matches path', async () => {
  const calls = stubFetch([]);
  await getBuyerMatches('abc123');
  expect(calls[0]).toContain('/api/deals/abc123/buyer-matches');
  vi.unstubAllGlobals();
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test` (from project root)
Expected: FAIL — `getArvEstimate`/`getBuyerMatches` are not exported.

- [ ] **Step 4: Add the client functions**

In `src/api/client.ts`, extend the type import at the top to include the new types:

```ts
import type {
  Market, Comp, Seller, NewSeller, Buyer, NewBuyer,
  DealInputs, DealAnalysisResult, SellerScoreInput, SellerScoreResult,
  MarketTrend, Neighborhood, GeocodeResult, Health,
  Deal, NewDeal, BuyerMatch, ArvEstimate,
} from './types';
```

Append at the end of the file:

```ts
export const getDeals = () => apiFetch<Deal[]>('/api/deals');
export const getDeal = (id: string) => apiFetch<Deal>(`/api/deals/${id}`);
export const createDeal = (body: NewDeal) => apiFetch<Deal>('/api/deals', jsonBody(body));
export const updateDeal = (id: string, body: NewDeal) =>
  apiFetch<Deal>(`/api/deals/${id}`, { method: 'PUT', body: JSON.stringify(body) });
export const deleteDeal = (id: string) =>
  apiFetch<{ success: boolean }>(`/api/deals/${id}`, { method: 'DELETE' });
export const getBuyerMatches = (id: string) => apiFetch<BuyerMatch[]>(`/api/deals/${id}/buyer-matches`);

export const getArvEstimate = (city: string, state: string, sqft: number) => {
  const params = new URLSearchParams({ city, state, sqft: String(sqft) });
  return apiFetch<ArvEstimate>(`/api/arv?${params.toString()}`);
};
```

- [ ] **Step 5: Run the test and typecheck**

Run: `npm test`
Expected: PASS — new client tests green.

Run: `npm run build`
Expected: `tsc` passes (types resolve) and Vite build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/api/types.ts src/api/client.ts src/api/client.test.ts
git commit -m "feat(client): deal, ARV, and buyer-match types + client functions"
```

---

### Task 6: Deals page (list, create/edit/delete, buyer matches) + route + nav

A `Deals` page that auto-loads deals, supports create/edit (one form that toggles), delete, and on-demand buyer matches per deal. Add the route and a nav link.

**Files:**
- Create: `src/pages/Deals.tsx`
- Modify: `src/App.tsx` (route)
- Modify: `src/components/AppLayout.tsx` (nav link)

**Interfaces:**
- Consumes: `getDeals`, `createDeal`, `updateDeal`, `deleteDeal`, `getBuyerMatches` from the client; `useAsync`; `Loading`/`ErrorBanner`/`Empty`; `formatCurrency` from `src/lib/deal`; types `Deal`, `NewDeal`, `BuyerMatch`.
- Produces: `export function Deals()`; a `/deals` route rendered inside `AppLayout`; a "Deals" nav entry.

- [ ] **Step 1: Create the Deals page**

Create `src/pages/Deals.tsx`:

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getDeals, createDeal, updateDeal, deleteDeal, getBuyerMatches } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorBanner, Empty } from '../components/states';
import { formatCurrency } from '../lib/deal';
import type { Deal, NewDeal, BuyerMatch } from '../api/types';

const EMPTY: NewDeal = {
  name: '', property_address: '', city: '', state: '',
  purchase_price: 0, repair_budget: 0, arv: 0,
  selling_costs: 0, holding_costs: 0, wholesale_fee: 0,
  deal_type: 'wholesale', status: 'analyzing',
};

const NUMBER_FIELDS: { label: string; key: keyof NewDeal }[] = [
  { label: 'Purchase price', key: 'purchase_price' },
  { label: 'Repair budget', key: 'repair_budget' },
  { label: 'ARV', key: 'arv' },
  { label: 'Selling costs', key: 'selling_costs' },
  { label: 'Holding costs', key: 'holding_costs' },
  { label: 'Wholesale fee', key: 'wholesale_fee' },
];

export function Deals() {
  const list = useAsync<Deal[]>(getDeals, true);
  const [form, setForm] = useState<NewDeal>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [matches, setMatches] = useState<Record<string, BuyerMatch[]>>({});

  const deals = list.data ?? [];

  const resetForm = () => { setForm(EMPTY); setEditingId(null); };

  const handleSave = async () => {
    setSaveError(null);
    try {
      if (editingId) {
        const updated = await updateDeal(editingId, form);
        list.setData(deals.map((d) => (d.id === editingId ? updated : d)));
      } else {
        const created = await createDeal(form);
        list.setData([created, ...deals]);
      }
      resetForm();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleEdit = (deal: Deal) => {
    setEditingId(deal.id);
    setForm({
      name: deal.name, property_address: deal.property_address, city: deal.city, state: deal.state,
      purchase_price: deal.purchase_price, repair_budget: deal.repair_budget, arv: deal.arv,
      selling_costs: deal.selling_costs, holding_costs: deal.holding_costs, wholesale_fee: deal.wholesale_fee,
      deal_type: deal.deal_type, status: deal.status,
    });
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDeal(id);
      list.setData(deals.filter((d) => d.id !== id));
      if (editingId === id) resetForm();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleFindBuyers = async (id: string) => {
    try {
      const result = await getBuyerMatches(id);
      setMatches((cur) => ({ ...cur, [id]: result }));
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <header className="hero-panel">
        <p className="eyebrow">Pipeline</p>
        <h1>Deals</h1>
        <p>Save deals, track profit and ROI, and match them to your cash buyers.</p>
      </header>

      <div className="layout-single">
        <section className="panel">
          <h2>{editingId ? 'Edit deal' : 'Add deal'}</h2>
          <div className="form-grid">
            <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input placeholder="Property address" value={form.property_address} onChange={(e) => setForm({ ...form, property_address: e.target.value })} />
            <input placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            <input placeholder="State" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
            {NUMBER_FIELDS.map((field) => (
              <label key={field.key}>
                <span>{field.label}</span>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={form[field.key] as number}
                  onChange={(e) => setForm({ ...form, [field.key]: Number(e.target.value) })}
                />
              </label>
            ))}
            <label>
              <span>Deal type</span>
              <select value={form.deal_type} onChange={(e) => setForm({ ...form, deal_type: e.target.value })}>
                <option value="wholesale">Wholesale</option>
                <option value="flip">Flip</option>
                <option value="buy_hold">Buy &amp; hold</option>
              </select>
            </label>
            <label>
              <span>Status</span>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="analyzing">Analyzing</option>
                <option value="under_contract">Under contract</option>
                <option value="closed">Closed</option>
                <option value="dead">Dead</option>
              </select>
            </label>
            <button onClick={handleSave}>{editingId ? 'Save changes' : 'Add deal'}</button>
            {editingId && <button className="ghost-button" onClick={resetForm}>Cancel</button>}
          </div>
          {saveError && <ErrorBanner message={saveError} />}
        </section>

        <section className="panel">
          <h2>Saved deals ({deals.length})</h2>
          {list.loading && <Loading label="Loading deals…" />}
          {list.error && <ErrorBanner message={list.error} onRetry={() => list.run()} />}
          {!list.loading && !list.error && deals.length === 0 && <Empty message="No deals yet. Add one above." />}
          <div className="deal-list">
            {deals.map((deal) => (
              <div key={deal.id} className="deal-card">
                <div className="deal-card-head">
                  <strong>{deal.name || deal.property_address || 'Untitled deal'}</strong>
                  <span className={`pill pill-${deal.status}`}>{deal.status.replace('_', ' ')}</span>
                </div>
                <p>{[deal.property_address, deal.city, deal.state].filter(Boolean).join(', ')}</p>
                <div className="kpi-grid">
                  <div className="kpi"><p className="kpi-label">Profit</p><p className={`kpi-value ${deal.profit >= 0 ? 'good-deal' : 'bad-deal'}`}>{formatCurrency(deal.profit)}</p></div>
                  <div className="kpi"><p className="kpi-label">ROI</p><p className="kpi-value">{deal.roi.toFixed(1)}%</p></div>
                  <div className="kpi"><p className="kpi-label">Type</p><p className="kpi-value">{deal.deal_type.replace('_', ' ')}</p></div>
                </div>
                <div className="deal-card-actions">
                  <button className="ghost-button" onClick={() => handleEdit(deal)}>Edit</button>
                  <button className="ghost-button" onClick={() => handleFindBuyers(deal.id)}>Find buyers</button>
                  <Link to={`/deals/${deal.id}/sheet`}><button className="ghost-button">Deal sheet</button></Link>
                  <button className="ghost-button" onClick={() => handleDelete(deal.id)}>Delete</button>
                </div>
                {matches[deal.id] && (
                  <div className="match-list">
                    {matches[deal.id].length === 0 && <Empty message="No buyer matches." />}
                    {matches[deal.id].map((m) => (
                      <div key={m.buyer.id} className="match-row">
                        <strong>{m.buyer.name}</strong>
                        <span>Score {m.score}/3</span>
                        <span>{[m.reasons.area && 'area', m.reasons.price && 'price', m.reasons.type && 'type'].filter(Boolean).join(' · ')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Add the route in `App.tsx`**

Add the import alongside the other page imports:

```tsx
import { Deals } from './pages/Deals';
```

Add this route inside the `<Route element={<AppLayout />}>` block (e.g. after the `buyers` route):

```tsx
        <Route path="deals" element={<Deals />} />
```

- [ ] **Step 3: Add the nav link in `AppLayout.tsx`**

In the `NAV` array in `src/components/AppLayout.tsx`, add an entry after `Buyers`:

```tsx
  { to: '/deals', label: 'Deals' },
```

- [ ] **Step 4: Typecheck and build**

Run: `npm run build`
Expected: `tsc` + Vite build succeed.

- [ ] **Step 5: Manual click-through**

Start both servers (`cd backend && npm run dev` in one shell; `npm run dev` at root in another). In the browser: open **Deals**, add a deal (numbers fill profit/ROI), edit it, click **Find buyers** (after adding a buyer whose `preferred_areas` matches), and delete it. Confirm loading/empty/error states render.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Deals.tsx src/App.tsx src/components/AppLayout.tsx
git commit -m "feat(deals): Deals page with CRUD and buyer matches + nav/route"
```

---

### Task 7: Calculator — estimate ARV from comps and save a deal

Extend the calculator with location/sqft/name fields, an "Estimate ARV from comps" button that calls `/api/arv` and fills the ARV input, and a "Save deal" button that POSTs to `/api/deals`.

**Files:**
- Modify: `src/pages/Calculator.tsx`

**Interfaces:**
- Consumes: `getArvEstimate`, `createDeal` from the client; existing `calculateWholesaleDeal`, `formatCurrency`, `DealInputs` from `src/lib/deal`; `NewDeal` type; `ErrorBanner` for feedback.
- Produces: no new exports; the existing `Calculator` gains ARV-estimate and save-deal behavior. The save maps the calculator's camelCase `DealInputs` to the snake_case `NewDeal` shape.

- [ ] **Step 1: Replace `Calculator.tsx`**

Replace the entire contents of `src/pages/Calculator.tsx` with:

```tsx
import { useMemo, useState } from 'react';
import { calculateWholesaleDeal, formatCurrency, type DealInputs } from '../lib/deal';
import { getArvEstimate, createDeal } from '../api/client';
import { ErrorBanner } from '../components/states';
import type { NewDeal } from '../api/types';

const FIELDS: { label: string; key: keyof DealInputs }[] = [
  { label: 'Purchase price', key: 'purchasePrice' },
  { label: 'Repair budget', key: 'repairBudget' },
  { label: 'ARV (after repair value)', key: 'arv' },
  { label: 'Selling costs', key: 'sellingCosts' },
  { label: 'Holding costs', key: 'holdingCosts' },
  { label: 'Wholesale fee', key: 'wholesaleFee' },
];

const REHAB = [
  { category: 'Kitchen', range: '$12k - $18k' },
  { category: 'Bathrooms', range: '$8k - $12k' },
  { category: 'Roof', range: '$6k - $10k' },
  { category: 'Paint + Flooring', range: '$5k - $8k' },
  { category: 'Systems / Misc', range: '$4k - $7k' },
];

interface Meta {
  name: string;
  property_address: string;
  city: string;
  state: string;
  sqft: number;
}

export function Calculator() {
  const [inputs, setInputs] = useState<DealInputs>({
    purchasePrice: 120000, repairBudget: 22000, arv: 185000,
    sellingCosts: 12000, holdingCosts: 3000, wholesaleFee: 10000,
  });
  const [meta, setMeta] = useState<Meta>({ name: '', property_address: '', city: '', state: '', sqft: 0 });
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const results = useMemo(() => calculateWholesaleDeal(inputs), [inputs]);
  const spread = inputs.arv - inputs.repairBudget - inputs.sellingCosts - inputs.wholesaleFee;

  const handleEstimateArv = async () => {
    setError(null); setFeedback(null);
    try {
      const est = await getArvEstimate(meta.city, meta.state, meta.sqft);
      if (!est.success || est.arv === null) {
        setError(est.error || 'Could not estimate ARV from comps.');
        return;
      }
      setInputs((cur) => ({ ...cur, arv: est.arv as number }));
      setFeedback(`ARV set to ${formatCurrency(est.arv)} (median $${est.medianPricePerSqft}/sqft, ${est.sampleSize} comps).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleSaveDeal = async () => {
    setError(null); setFeedback(null);
    const body: NewDeal = {
      name: meta.name, property_address: meta.property_address, city: meta.city, state: meta.state,
      purchase_price: inputs.purchasePrice, repair_budget: inputs.repairBudget, arv: inputs.arv,
      selling_costs: inputs.sellingCosts, holding_costs: inputs.holdingCosts, wholesale_fee: inputs.wholesaleFee,
      deal_type: 'wholesale', status: 'analyzing',
    };
    try {
      const saved = await createDeal(body);
      setFeedback(`Saved "${saved.name || 'deal'}" — profit ${formatCurrency(saved.profit)}, ROI ${saved.roi.toFixed(1)}%.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <header className="hero-panel">
        <p className="eyebrow">Deal analysis</p>
        <h1>Deal Calculator</h1>
        <p>Model purchase, rehab, and exit costs to see profit and ROI in real time.</p>
      </header>

      <div className="layout-grid">
        <section className="panel">
          <h2>Inputs</h2>
          <div className="form-grid">
            <input placeholder="Deal name" value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} />
            <input placeholder="Property address" value={meta.property_address} onChange={(e) => setMeta({ ...meta, property_address: e.target.value })} />
            <input placeholder="City" value={meta.city} onChange={(e) => setMeta({ ...meta, city: e.target.value })} />
            <input placeholder="State" value={meta.state} onChange={(e) => setMeta({ ...meta, state: e.target.value })} />
            <label>
              <span>Square footage</span>
              <input type="number" min={0} step={50} value={meta.sqft} onChange={(e) => setMeta({ ...meta, sqft: Number(e.target.value) })} />
            </label>
            {FIELDS.map((field) => (
              <label key={field.key}>
                <span>{field.label}</span>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={inputs[field.key]}
                  onChange={(e) => setInputs((cur) => ({ ...cur, [field.key]: Number(e.target.value) }))}
                />
              </label>
            ))}
            <button className="ghost-button" onClick={handleEstimateArv}>Estimate ARV from comps</button>
            <button onClick={handleSaveDeal}>Save deal</button>
          </div>
          {feedback && <p className="good-deal">{feedback}</p>}
          {error && <ErrorBanner message={error} />}
          <div className="results-card">
            <div className="kpi-grid">
              <div className="kpi"><p className="kpi-label">Profit</p><p className="kpi-value">{formatCurrency(results.profit)}</p></div>
              <div className="kpi"><p className="kpi-label">ROI</p><p className="kpi-value">{results.roi.toFixed(1)}%</p></div>
              <div className="kpi"><p className="kpi-label">Offer spread</p><p className="kpi-value">{formatCurrency(spread)}</p></div>
            </div>
            <p className={results.profit >= 0 ? 'good-deal' : 'bad-deal'}>
              {results.profit >= 0 ? '✓ Good deal signal' : '✗ Review assumptions'}
            </p>
          </div>
        </section>

        <section className="panel">
          <h2>Rehab estimator</h2>
          <div className="rehab-list">
            {REHAB.map((item) => (
              <div key={item.category} className="rehab-card">
                <span>{item.category}</span>
                <strong>{item.range}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Typecheck and build**

Run: `npm run build`
Expected: `tsc` + Vite build succeed.

- [ ] **Step 3: Manual click-through**

With both servers running: on **Calculator**, enter `City=Atlanta`, `State=GA`, `Square footage=1800`, click **Estimate ARV from comps** → ARV fills (~$282,600 from seeded comps) and a feedback line appears. Click **Save deal** → success feedback; confirm it appears on the **Deals** page.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Calculator.tsx
git commit -m "feat(calculator): estimate ARV from comps and save a deal"
```

---

### Task 8: Printable deal-sheet export

A standalone `/deals/:id/sheet` route (outside `AppLayout`, so no sidebar) that renders a clean one-page deal sheet with a "Print / Save as PDF" button (`window.print()`), plus a `@media print` stylesheet.

**Files:**
- Create: `src/pages/DealSheet.tsx`
- Modify: `src/App.tsx` (top-level route)
- Modify: `src/styles.css` (deal-sheet + print styles)

**Interfaces:**
- Consumes: `getDeal` from the client; `useAsync`; `Loading`/`ErrorBanner`; `formatCurrency`; `useParams` from react-router-dom; type `Deal`.
- Produces: `export function DealSheet()`; a top-level `/deals/:id/sheet` route (sibling of the `AppLayout` route, so the print view has no app chrome).

- [ ] **Step 1: Create the DealSheet page**

Create `src/pages/DealSheet.tsx`:

```tsx
import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getDeal } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorBanner } from '../components/states';
import { formatCurrency } from '../lib/deal';
import type { Deal } from '../api/types';

const ROWS: { label: string; key: keyof Deal; money?: boolean }[] = [
  { label: 'Purchase price', key: 'purchase_price', money: true },
  { label: 'Repair budget', key: 'repair_budget', money: true },
  { label: 'ARV', key: 'arv', money: true },
  { label: 'Selling costs', key: 'selling_costs', money: true },
  { label: 'Holding costs', key: 'holding_costs', money: true },
  { label: 'Wholesale fee', key: 'wholesale_fee', money: true },
];

export function DealSheet() {
  const { id } = useParams<{ id: string }>();
  const fetchDeal = useCallback(() => getDeal(id as string), [id]);
  const deal = useAsync<Deal>(fetchDeal, true);

  if (deal.loading) return <div className="sheet-wrap"><Loading label="Loading deal…" /></div>;
  if (deal.error || !deal.data) {
    return (
      <div className="sheet-wrap">
        <ErrorBanner message={deal.error || 'Deal not found'} onRetry={() => deal.run()} />
        <Link to="/deals" className="no-print">← Back to deals</Link>
      </div>
    );
  }

  const d = deal.data;

  return (
    <div className="sheet-wrap">
      <div className="sheet-toolbar no-print">
        <Link to="/deals">← Back to deals</Link>
        <button onClick={() => window.print()}>Print / Save as PDF</button>
      </div>

      <article className="deal-sheet">
        <header className="deal-sheet-header">
          <h1>{d.name || 'Deal Sheet'}</h1>
          <p>{[d.property_address, d.city, d.state].filter(Boolean).join(', ')}</p>
          <p className="deal-sheet-meta">{d.deal_type.replace('_', ' ')} · {d.status.replace('_', ' ')}</p>
        </header>

        <table className="deal-sheet-table">
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.key}>
                <th>{row.label}</th>
                <td>{row.money ? formatCurrency(d[row.key] as number) : String(d[row.key])}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="deal-sheet-summary">
          <div><span>Projected profit</span><strong className={d.profit >= 0 ? 'good-deal' : 'bad-deal'}>{formatCurrency(d.profit)}</strong></div>
          <div><span>ROI</span><strong>{d.roi.toFixed(1)}%</strong></div>
        </div>

        <footer className="deal-sheet-footer">Generated {new Date().toLocaleDateString()}</footer>
      </article>
    </div>
  );
}
```

- [ ] **Step 2: Add the top-level route in `App.tsx`**

Add the import:

```tsx
import { DealSheet } from './pages/DealSheet';
```

Restructure the `<Routes>` so the sheet route sits **outside** the `AppLayout` route. The full file should read:

```tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { Dashboard } from './pages/Dashboard';
import { Calculator } from './pages/Calculator';
import { MarketHeatmap } from './pages/MarketHeatmap';
import { PropertySearch } from './pages/PropertySearch';
import { SellerLeadManager } from './pages/SellerLeadManager';
import { BuyerDirectory } from './pages/BuyerDirectory';
import { AIAnalyzer } from './pages/AIAnalyzer';
import { AdvancedResearch } from './pages/AdvancedResearch';
import { Deals } from './pages/Deals';
import { DealSheet } from './pages/DealSheet';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="calculator" element={<Calculator />} />
        <Route path="markets" element={<MarketHeatmap />} />
        <Route path="properties" element={<PropertySearch />} />
        <Route path="sellers" element={<SellerLeadManager />} />
        <Route path="buyers" element={<BuyerDirectory />} />
        <Route path="deals" element={<Deals />} />
        <Route path="ai" element={<AIAnalyzer />} />
        <Route path="research" element={<AdvancedResearch />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
      <Route path="deals/:id/sheet" element={<DealSheet />} />
    </Routes>
  );
}
```

> Note: keep the `Deals` route from Task 6; this step only adds the `DealSheet` import and the sibling route (and re-confirms the `deals` route is present).

- [ ] **Step 3: Add deal-sheet and print styles to `styles.css`**

Append to the end of `src/styles.css`:

```css
/* ---------- Deal sheet (printable) ---------- */
.sheet-wrap { max-width: 760px; margin: 0 auto; padding: var(--space-4); }
.sheet-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-3); }
.deal-sheet {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: var(--space-4);
  box-shadow: var(--shadow);
}
.deal-sheet-header h1 { margin: 0 0 4px; }
.deal-sheet-meta { color: var(--ink-soft); text-transform: capitalize; }
.deal-sheet-table { width: 100%; border-collapse: collapse; margin: var(--space-3) 0; }
.deal-sheet-table th { text-align: left; padding: 8px 0; color: var(--ink-soft); font-weight: 500; }
.deal-sheet-table td { text-align: right; padding: 8px 0; border-bottom: 1px solid var(--line); }
.deal-sheet-summary { display: flex; gap: var(--space-4); margin-top: var(--space-3); }
.deal-sheet-summary span { display: block; color: var(--ink-soft); font-size: 0.85rem; }
.deal-sheet-summary strong { font-size: 1.5rem; }
.deal-sheet-footer { margin-top: var(--space-4); color: var(--ink-soft); font-size: 0.8rem; }

/* ---------- Deal cards (Deals page) ---------- */
.deal-list { display: grid; gap: var(--space-3); }
.deal-card { border: 1px solid var(--line); border-radius: var(--radius-sm); padding: var(--space-3); background: var(--surface-muted); }
.deal-card-head { display: flex; justify-content: space-between; align-items: center; }
.deal-card-actions { display: flex; flex-wrap: wrap; gap: var(--space-1); margin-top: var(--space-2); }
.match-list { margin-top: var(--space-2); display: grid; gap: 6px; }
.match-row { display: flex; gap: var(--space-2); align-items: center; font-size: 0.9rem; }
.pill { padding: 2px 10px; border-radius: 999px; font-size: 0.75rem; background: var(--accent-soft); color: var(--accent); text-transform: capitalize; }

@media print {
  body { background: #fff; }
  .no-print, .sidebar, .sheet-toolbar { display: none !important; }
  .sheet-wrap { max-width: none; padding: 0; }
  .deal-sheet { box-shadow: none; border: none; }
}
```

- [ ] **Step 4: Typecheck and build**

Run: `npm run build`
Expected: `tsc` + Vite build succeed.

- [ ] **Step 5: Manual verification**

With both servers running and at least one saved deal: from **Deals**, click **Deal sheet** on a deal → standalone sheet renders (no sidebar). Click **Print / Save as PDF** → the browser print dialog opens and the preview shows a clean sheet with the toolbar/back-link hidden.

- [ ] **Step 6: Commit**

```bash
git add src/pages/DealSheet.tsx src/App.tsx src/styles.css
git commit -m "feat(export): printable deal-sheet route + print stylesheet"
```

---

### Task 9: Full verification

Run the complete test suites and a build to confirm Phase 4 leaves the app green.

**Files:** none (verification only).

- [ ] **Step 1: Backend suite**

Run: `cd backend && npm test`
Expected: all backend tests pass (original 33 + 2 deal-math + 5 deals CRUD + 5 ARV unit + 2 ARV route + 3 matching unit + 2 matching route = 52).

- [ ] **Step 2: Frontend suite**

Run: `npm test`
Expected: all vitest tests pass (original 7 + 2 new client tests = 9).

- [ ] **Step 3: Frontend build**

Run: `npm run build`
Expected: `tsc` + Vite build succeed with no type errors.

- [ ] **Step 4: End-to-end smoke (manual)**

With both servers running, walk the full flow: Calculator → estimate ARV → save deal → Deals page shows it with profit/ROI → Find buyers (after adding a matching buyer) → Deal sheet → Print preview. Confirm nav works from every page (Phase 3 layout intact).

- [ ] **Step 5: Final commit (if any uncommitted verification fixes)**

```bash
git add -A
git commit -m "chore(phase4): verification pass"
```

---

## Self-Review

**1. Spec coverage**

| Spec Phase 4 item | Task |
| --- | --- |
| Save & track deals: `deals` table + CRUD + Deals page with profit/ROI + edit | Tasks 2 (table/CRUD), 6 (page, edit) |
| Comps-driven ARV (median $/sqft × sqft), computed server-side, auto-fill calculator | Tasks 3 (server-side), 7 (calculator auto-fill) |
| Buyer–deal matching by area/price/deal type, server-side, ranked list | Tasks 4 (server-side), 6 (Deals page UI) |
| Export / reports: printable deal-sheet (print stylesheet → Save as PDF) | Task 8 |
| Data model: `deals` table columns | Task 2 (all spec columns + `deal_type`) |
| Testing: backend unit tests for deal math, ARV, matching; integration tests for endpoints | Tasks 1, 3, 4 (unit) + 2, 3, 4 (integration), 9 (full run) |

All Phase 4 items map to tasks. The one deviation from the spec's table — adding `deal_type` — is documented in Global Constraints and is required to make "matching by deal type" implementable.

**2. Placeholder scan:** No `TBD`/`TODO`/"add appropriate…" placeholders; every code step contains full code and every test step contains assertions.

**3. Type consistency:** Backend uses snake_case end-to-end (`purchase_price`, `selling_costs`, …); `calculateDeal` returns `{ total_investment, exit_net, profit, roi }`; `estimateArv` returns `{ arv, medianPricePerSqft, sampleSize }`; `matchBuyers` returns `{ buyer, score, reasons: { area, price, type } }`. Frontend `Deal`/`NewDeal`/`BuyerMatch`/`ArvEstimate` match the JSON the endpoints emit; the Calculator maps its camelCase `DealInputs` to the snake_case `NewDeal` in `handleSaveDeal`. Client function names (`getDeals`, `getDeal`, `createDeal`, `updateDeal`, `deleteDeal`, `getBuyerMatches`, `getArvEstimate`) are used identically in Tasks 5–8.
