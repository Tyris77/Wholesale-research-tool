# Phase 4 — Add Capabilities: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add the four product capabilities: save & track deals, comps-driven ARV estimation, buyer–deal matching, and a printable deal sheet.

**Architecture:** A new `deals` table + CRUD endpoints; pure analytics functions (`medianPricePerSqft`, `estimateArv`, `matchBuyers`) and deal math live in small backend modules and are unit-tested. New promisified `dbAll/dbGet/dbRun` helpers let async endpoints (ARV, matches) use `asyncHandler`. The frontend gains a `Deals` page (history with profit/ROI, status, delete, buyer matches), a `DealSheet` print view, "Save as deal" + "Estimate ARV from comps" on the Calculator, and a print stylesheet.

**Tech Stack:** Express 4, SQLite, zod, supertest, node:test (backend); React 18 + react-router v7, vitest (frontend).

**Profit/ROI:** computed server-side on create/update via `backend/src/deal-math.js` (mirror of the frontend `src/lib/deal.ts` formula) and stored on the row.

---

### Task 1: `deals` table + backend deal-math

**Files:** Modify `backend/src/db.js`; create `backend/src/deal-math.js` + `backend/src/deal-math.test.js`.

- [ ] **Step 1: Add the `deals` table.** In `backend/src/db.js`, inside the `db.serialize(() => { ... })` block, AFTER the comps `db.run(... () => { seedData(); })` call (still inside serialize), add:
```js
    // Deals table
    db.run(`
      CREATE TABLE IF NOT EXISTS deals (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        property_address TEXT,
        city TEXT,
        state TEXT,
        purchase_price REAL,
        repair_budget REAL,
        arv REAL,
        selling_costs REAL,
        holding_costs REAL,
        wholesale_fee REAL,
        profit REAL,
        roi REAL,
        status TEXT,
        created_at TEXT,
        updated_at TEXT
      )
    `);
```

- [ ] **Step 2: Add promisified DB helpers.** At the END of `backend/src/db.js`, append:
```js
export function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || []))));
}
export function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row))));
}
export function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function (err) { return err ? reject(err) : resolve(this); }));
}
```

- [ ] **Step 3: Write the failing test — create `backend/src/deal-math.test.js`:**
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDeal } from './deal-math.js';

test('computeDeal returns stored profit and rounded roi', () => {
  const r = computeDeal({
    purchase_price: 120000, repair_budget: 22000, arv: 185000,
    selling_costs: 12000, holding_costs: 3000, wholesale_fee: 10000,
  });
  assert.equal(r.profit, 6000);
  assert.equal(r.roi, 3.82);
});

test('computeDeal roi is 0 with no investment', () => {
  const r = computeDeal({ purchase_price: 0, repair_budget: 0, arv: 0, selling_costs: 0, holding_costs: 0, wholesale_fee: 0 });
  assert.equal(r.roi, 0);
  assert.equal(r.profit, 0);
});
```

- [ ] **Step 4: Run to verify it fails.** `npm test -- src/deal-math.test.js` (from `backend/`). Expected: FAIL (module missing).

- [ ] **Step 5: Create `backend/src/deal-math.js`** (snake_case input matching DB columns; mirrors the frontend formula):
```js
// Mirror of the frontend src/lib/deal.ts formula, using snake_case DB column names.
export function computeDeal({ purchase_price, repair_budget, arv, selling_costs, holding_costs, wholesale_fee }) {
  const totalInvestment = purchase_price + repair_budget + holding_costs + selling_costs;
  const exitNet = arv - selling_costs - wholesale_fee;
  const profit = exitNet - totalInvestment;
  const roi = totalInvestment > 0 ? (profit / totalInvestment) * 100 : 0;
  return { profit, roi: Math.round(roi * 100) / 100 };
}
```

- [ ] **Step 6: Run to verify it passes.** `npm test -- src/deal-math.test.js`. Expected: PASS (2).

- [ ] **Step 7: Commit.**
```bash
git add backend/src/db.js backend/src/deal-math.js backend/src/deal-math.test.js
git commit -m "feat: add deals table, db helpers, and deal-math module"
```

---

### Task 2: Analytics (ARV estimate + buyer matching)

**Files:** Create `backend/src/analytics.js` + `backend/src/analytics.test.js`.

- [ ] **Step 1: Write the failing test — create `backend/src/analytics.test.js`:**
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { medianPricePerSqft, estimateArv, matchBuyers } from './analytics.js';

const COMPS = [
  { price_per_sqft: 100 }, { price_per_sqft: 200 }, { price_per_sqft: 150 },
];

test('medianPricePerSqft handles odd and even counts', () => {
  assert.equal(medianPricePerSqft(COMPS), 150);
  assert.equal(medianPricePerSqft([{ price_per_sqft: 100 }, { price_per_sqft: 200 }]), 150);
  assert.equal(medianPricePerSqft([]), null);
});

test('estimateArv multiplies median by sqft and rounds', () => {
  assert.equal(estimateArv(COMPS, 1800), 270000);
  assert.equal(estimateArv([], 1800), null);
  assert.equal(estimateArv(COMPS, 0), null);
});

test('matchBuyers ranks by area + price fit and filters zero scores', () => {
  const deal = { city: 'Atlanta', state: 'GA', purchase_price: 120000 };
  const buyers = [
    { id: 'a', name: 'Anna', preferred_areas: 'Atlanta, Marietta', cash_available: 200000, avg_deal_size: 130000 },
    { id: 'b', name: 'Bob', preferred_areas: 'Phoenix', cash_available: 50000, avg_deal_size: 0 },
    { id: 'c', name: 'Cara', preferred_areas: 'GA statewide', cash_available: 100000, avg_deal_size: 0 },
  ];
  const matches = matchBuyers(deal, buyers);
  assert.equal(matches[0].buyer.id, 'a'); // best fit ranks first
  assert.ok(matches[0].score >= matches[matches.length - 1].score);
  assert.ok(matches.every((m) => m.score > 0)); // zero-score buyers filtered out
  assert.equal(matches.find((m) => m.buyer.id === 'b'), undefined); // Phoenix + no cash => filtered
});
```

- [ ] **Step 2: Run to verify it fails.** `npm test -- src/analytics.test.js`. Expected: FAIL.

- [ ] **Step 3: Create `backend/src/analytics.js`:**
```js
export function medianPricePerSqft(comps) {
  const vals = comps
    .map((c) => c.price_per_sqft)
    .filter((v) => typeof v === 'number' && v > 0)
    .sort((a, b) => a - b);
  if (vals.length === 0) return null;
  const mid = Math.floor(vals.length / 2);
  return vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
}

export function estimateArv(comps, sqft) {
  const median = medianPricePerSqft(comps);
  if (median == null || !(sqft > 0)) return null;
  return Math.round(median * sqft);
}

// Scores each buyer against a deal by area coverage and price/size fit.
// Returns [{ buyer, score, reasons }] sorted desc, excluding zero-score buyers.
export function matchBuyers(deal, buyers) {
  return buyers
    .map((buyer) => {
      let score = 0;
      const reasons = [];
      const areas = (buyer.preferred_areas || '').toLowerCase();
      if (deal.city && areas.includes(deal.city.toLowerCase())) {
        score += 2;
        reasons.push(`Covers ${deal.city}`);
      } else if (deal.state && areas.includes(deal.state.toLowerCase())) {
        score += 1;
        reasons.push(`Covers ${deal.state}`);
      }
      if (buyer.cash_available > 0 && deal.purchase_price <= buyer.cash_available) {
        score += 2;
        reasons.push('Has cash for purchase price');
      }
      if (buyer.avg_deal_size > 0 && Math.abs(deal.purchase_price - buyer.avg_deal_size) <= buyer.avg_deal_size * 0.5) {
        score += 1;
        reasons.push('Matches typical deal size');
      }
      return { buyer, score, reasons };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score);
}
```

- [ ] **Step 4: Run to verify it passes.** `npm test -- src/analytics.test.js`. Expected: PASS (3).

- [ ] **Step 5: Commit.**
```bash
git add backend/src/analytics.js backend/src/analytics.test.js
git commit -m "feat: add ARV estimation and buyer-matching analytics"
```

---

### Task 3: Deal schemas + CRUD endpoints

**Files:** Modify `backend/src/schemas.js`, `backend/src/server.js`; create `backend/src/deals.test.js`.

- [ ] **Step 1: Add schemas.** Append to `backend/src/schemas.js`:
```js
export const dealCreateSchema = z.object({
  name: z.string().min(1),
  property_address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  purchase_price: money,
  repair_budget: money,
  arv: money,
  selling_costs: money,
  holding_costs: money,
  wholesale_fee: money,
  status: z.string().optional(),
});

export const dealUpdateSchema = dealCreateSchema;
```

- [ ] **Step 2: Write the failing test — create `backend/src/deals.test.js`:**
```js
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from './server.js';
import { db } from './db.js';

after(() => new Promise((resolve) => db.close(() => resolve())));

const VALID = {
  name: 'Test Deal', city: 'Atlanta', state: 'GA',
  purchase_price: 120000, repair_budget: 22000, arv: 185000,
  selling_costs: 12000, holding_costs: 3000, wholesale_fee: 10000,
};

test('POST /api/deals validates the body', async () => {
  const res = await request(app).post('/api/deals').send({ name: '' });
  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
});

test('POST /api/deals computes profit/roi and persists; GET returns it', async () => {
  const created = await request(app).post('/api/deals').send(VALID);
  assert.equal(created.status, 200);
  assert.ok(created.body.id);
  assert.equal(created.body.profit, 6000);
  assert.equal(created.body.roi, 3.82);

  const list = await request(app).get('/api/deals');
  assert.equal(list.status, 200);
  assert.ok(list.body.some((d) => d.id === created.body.id));

  const one = await request(app).get(`/api/deals/${created.body.id}`);
  assert.equal(one.body.name, 'Test Deal');

  const del = await request(app).delete(`/api/deals/${created.body.id}`);
  assert.equal(del.body.success, true);
});
```

- [ ] **Step 3: Run to verify it fails.** `npm test -- src/deals.test.js`. Expected: FAIL (no deals routes).

- [ ] **Step 4: Wire imports + routes in `server.js`.**
(a) Extend the schemas import to include `dealCreateSchema, dealUpdateSchema`.
(b) Extend the db import to include the helpers: `import { initDb, db, dbAll, dbGet, dbRun } from './db.js';`
(c) Add `import { computeDeal } from './deal-math.js';` and `import { estimateArv, medianPricePerSqft, matchBuyers } from './analytics.js';`
(d) Add these routes (place with the other resource routes, before `app.use(errorHandler)`):
```js
// ---------- Deals ----------
app.get('/api/deals', asyncHandler(async (req, res) => {
  const rows = await dbAll('SELECT * FROM deals ORDER BY created_at DESC');
  res.json(rows);
}));

app.get('/api/deals/:id', asyncHandler(async (req, res) => {
  const row = await dbGet('SELECT * FROM deals WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ success: false, error: 'Deal not found' });
  res.json(row);
}));

app.post('/api/deals', validateBody(dealCreateSchema), asyncHandler(async (req, res) => {
  const b = req.body;
  const { profit, roi } = computeDeal(b);
  const id = uuid();
  const now = new Date().toISOString();
  const deal = {
    id, name: b.name, property_address: b.property_address || '', city: b.city || '', state: b.state || '',
    purchase_price: b.purchase_price, repair_budget: b.repair_budget, arv: b.arv,
    selling_costs: b.selling_costs, holding_costs: b.holding_costs, wholesale_fee: b.wholesale_fee,
    profit, roi, status: b.status || 'analyzing', created_at: now, updated_at: now,
  };
  await dbRun(
    `INSERT INTO deals (id, name, property_address, city, state, purchase_price, repair_budget, arv, selling_costs, holding_costs, wholesale_fee, profit, roi, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [deal.id, deal.name, deal.property_address, deal.city, deal.state, deal.purchase_price, deal.repair_budget, deal.arv, deal.selling_costs, deal.holding_costs, deal.wholesale_fee, deal.profit, deal.roi, deal.status, deal.created_at, deal.updated_at],
  );
  res.json(deal);
}));

app.put('/api/deals/:id', validateBody(dealUpdateSchema), asyncHandler(async (req, res) => {
  const b = req.body;
  const { profit, roi } = computeDeal(b);
  const now = new Date().toISOString();
  await dbRun(
    `UPDATE deals SET name = ?, property_address = ?, city = ?, state = ?, purchase_price = ?, repair_budget = ?, arv = ?, selling_costs = ?, holding_costs = ?, wholesale_fee = ?, profit = ?, roi = ?, status = ?, updated_at = ? WHERE id = ?`,
    [b.name, b.property_address || '', b.city || '', b.state || '', b.purchase_price, b.repair_budget, b.arv, b.selling_costs, b.holding_costs, b.wholesale_fee, profit, roi, b.status || 'analyzing', now, req.params.id],
  );
  res.json({ success: true, profit, roi });
}));

app.delete('/api/deals/:id', asyncHandler(async (req, res) => {
  await dbRun('DELETE FROM deals WHERE id = ?', [req.params.id]);
  res.json({ success: true });
}));
```

- [ ] **Step 5: Run to verify it passes.** `npm test -- src/deals.test.js`. Expected: PASS (2 test blocks).

- [ ] **Step 6: Commit.**
```bash
git add backend/src/schemas.js backend/src/server.js backend/src/deals.test.js
git commit -m "feat: deals CRUD endpoints with server-side profit/roi"
```

---

### Task 4: ARV + buyer-matching endpoints

**Files:** Modify `backend/src/server.js`; create `backend/src/arv-match.test.js`.

- [ ] **Step 1: Write the failing test — create `backend/src/arv-match.test.js`:**
```js
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from './server.js';
import { db } from './db.js';

after(() => new Promise((resolve) => db.close(() => resolve())));

test('GET /api/arv requires a valid sqft', async () => {
  const res = await request(app).get('/api/arv?city=Atlanta&state=GA');
  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
});

test('GET /api/arv estimates from seeded Atlanta comps', async () => {
  const res = await request(app).get('/api/arv?city=Atlanta&state=GA&sqft=1800');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.ok(res.body.estimatedArv > 0);
  assert.ok(res.body.compCount >= 1);
});

test('GET /api/deals/:id/matches returns matches for a saved deal', async () => {
  // ensure a buyer that should match exists
  await request(app).post('/api/buyers').send({
    name: 'Match Buyer', preferred_areas: 'Atlanta', cash_available: 500000, avg_deal_size: 120000,
  });
  const created = await request(app).post('/api/deals').send({
    name: 'Match Deal', city: 'Atlanta', state: 'GA',
    purchase_price: 120000, repair_budget: 0, arv: 200000, selling_costs: 0, holding_costs: 0, wholesale_fee: 0,
  });
  const res = await request(app).get(`/api/deals/${created.body.id}/matches`);
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.ok(Array.isArray(res.body.matches));
  assert.ok(res.body.matches.length >= 1);
  assert.ok(res.body.matches[0].score > 0);
  await request(app).delete(`/api/deals/${created.body.id}`);
});
```

- [ ] **Step 2: Run to verify it fails.** `npm test -- src/arv-match.test.js`. Expected: FAIL.

- [ ] **Step 3: Add routes in `server.js`** (before `app.use(errorHandler)`):
```js
// ---------- ARV estimate from comps ----------
app.get('/api/arv', asyncHandler(async (req, res) => {
  const { city, state } = req.query;
  const sqft = Number(req.query.sqft);
  if (!sqft || sqft <= 0) return res.status(400).json({ success: false, error: 'A valid sqft is required' });

  let sql = 'SELECT * FROM comps';
  const params = [];
  const conds = [];
  if (city) { conds.push('city = ?'); params.push(city); }
  if (state) { conds.push('state = ?'); params.push(state); }
  if (conds.length) sql += ' WHERE ' + conds.join(' AND ');

  const comps = await dbAll(sql, params);
  const estimatedArv = estimateArv(comps, sqft);
  if (estimatedArv == null) {
    return res.json({ success: false, error: 'No comparable sales found for these filters' });
  }
  res.json({ success: true, estimatedArv, medianPricePerSqft: medianPricePerSqft(comps), compCount: comps.length, sqft });
}));

// ---------- Buyer matches for a deal ----------
app.get('/api/deals/:id/matches', asyncHandler(async (req, res) => {
  const deal = await dbGet('SELECT * FROM deals WHERE id = ?', [req.params.id]);
  if (!deal) return res.status(404).json({ success: false, error: 'Deal not found' });
  const buyers = await dbAll('SELECT * FROM buyers');
  res.json({ success: true, matches: matchBuyers(deal, buyers) });
}));
```
NOTE: `/api/deals/:id/matches` must be registered AFTER `/api/deals/:id` is fine (Express matches the more specific path correctly since `/matches` is a distinct segment). Place it with the other deals routes.

- [ ] **Step 4: Run to verify it passes.** `npm test -- src/arv-match.test.js`. Expected: PASS.

- [ ] **Step 5: Run the FULL backend suite.** `npm test`. Expected: all pass, zero failures. Report counts.

- [ ] **Step 6: Commit.**
```bash
git add backend/src/server.js backend/src/arv-match.test.js
git commit -m "feat: ARV-from-comps and buyer-match endpoints"
```

---

### Task 5: Frontend client + types for deals/ARV/matches

**Files:** Modify `src/api/types.ts`, `src/api/client.ts`.

- [ ] **Step 1: Add types.** Append to `src/api/types.ts`:
```ts
export interface DealInputFields {
  name: string;
  property_address?: string;
  city?: string;
  state?: string;
  purchase_price: number;
  repair_budget: number;
  arv: number;
  selling_costs: number;
  holding_costs: number;
  wholesale_fee: number;
  status?: string;
}

export interface Deal extends DealInputFields {
  id: string;
  profit: number;
  roi: number;
  created_at: string;
  updated_at: string;
}

export interface ArvEstimate {
  success: boolean;
  estimatedArv?: number;
  medianPricePerSqft?: number;
  compCount?: number;
  error?: string;
}

export interface BuyerMatch {
  buyer: Buyer;
  score: number;
  reasons: string[];
}

export interface DealMatches {
  success: boolean;
  matches: BuyerMatch[];
}
```

- [ ] **Step 2: Add client functions.** In `src/api/client.ts`, extend the `import type { ... } from './types'` list to include `DealInputFields, Deal, ArvEstimate, DealMatches`, then append:
```ts
export const getDeals = () => apiFetch<Deal[]>('/api/deals');
export const getDeal = (id: string) => apiFetch<Deal>(`/api/deals/${id}`);
export const createDeal = (body: DealInputFields) => apiFetch<Deal>('/api/deals', jsonBody(body));
export const updateDeal = (id: string, body: DealInputFields) =>
  apiFetch<{ success: boolean; profit: number; roi: number }>(`/api/deals/${id}`, { method: 'PUT', body: JSON.stringify(body) });
export const deleteDeal = (id: string) => apiFetch<{ success: boolean }>(`/api/deals/${id}`, { method: 'DELETE' });

export const estimateArv = (city: string, state: string, sqft: number) => {
  const params = new URLSearchParams();
  if (city) params.append('city', city);
  if (state) params.append('state', state);
  params.append('sqft', String(sqft));
  return apiFetch<ArvEstimate>(`/api/arv?${params.toString()}`);
};

export const getDealMatches = (id: string) => apiFetch<DealMatches>(`/api/deals/${id}/matches`);
```

- [ ] **Step 3: Typecheck.** `npm run build` (project root). Expected: build succeeds (new exports unused so far).

- [ ] **Step 4: Commit.**
```bash
git add src/api/types.ts src/api/client.ts
git commit -m "feat: client + types for deals, ARV, and matches"
```

---

### Task 6: Deals page (history, status, delete, matches) + nav + routes

**Files:** Create `src/pages/Deals.tsx`; modify `src/components/AppLayout.tsx`, `src/App.tsx`.

- [ ] **Step 1: Create `src/pages/Deals.tsx`:**
```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getDeals, updateDeal, deleteDeal, getDealMatches } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorBanner, Empty } from '../components/states';
import { formatCurrency } from '../lib/deal';
import type { Deal, BuyerMatch } from '../api/types';

const STATUSES = ['analyzing', 'under_contract', 'closed', 'dead'];

export function Deals() {
  const list = useAsync<Deal[]>(getDeals, true);
  const deals = list.data ?? [];
  const [matches, setMatches] = useState<Record<string, BuyerMatch[]>>({});
  const [actionError, setActionError] = useState<string | null>(null);

  const handleStatus = async (deal: Deal, status: string) => {
    list.setData(deals.map((d) => (d.id === deal.id ? { ...d, status } : d)));
    try {
      await updateDeal(deal.id, { ...deal, status });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDeal(id);
      list.setData(deals.filter((d) => d.id !== id));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleMatches = async (id: string) => {
    try {
      const res = await getDealMatches(id);
      setMatches((m) => ({ ...m, [id]: res.matches }));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <header className="hero-panel">
        <p className="eyebrow">Deal pipeline</p>
        <h1>Saved Deals</h1>
        <p>Track analyzed deals, match them to cash buyers, and print deal sheets.</p>
      </header>

      <div className="layout-single">
        {actionError && <ErrorBanner message={actionError} />}
        <section className="panel">
          <h2>Deals ({deals.length})</h2>
          {list.loading && <Loading label="Loading deals…" />}
          {list.error && <ErrorBanner message={list.error} onRetry={() => list.run()} />}
          {!list.loading && !list.error && deals.length === 0 && (
            <Empty message="No saved deals yet. Use the Calculator to analyze and save a deal." />
          )}
          <div className="seller-list">
            {deals.map((deal) => (
              <div key={deal.id} className="seller-card">
                <div className="seller-header">
                  <strong>{deal.name}</strong>
                  <select className="status-badge" value={deal.status} onChange={(e) => handleStatus(deal, e.target.value)}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </select>
                </div>
                {(deal.city || deal.property_address) && (
                  <p className="text-muted">📍 {[deal.property_address, deal.city, deal.state].filter(Boolean).join(', ')}</p>
                )}
                <div className="kpi-grid">
                  <div className="kpi"><p className="kpi-label">Profit</p><p className="kpi-value">{formatCurrency(deal.profit)}</p></div>
                  <div className="kpi"><p className="kpi-label">ROI</p><p className="kpi-value">{deal.roi.toFixed(1)}%</p></div>
                  <div className="kpi"><p className="kpi-label">ARV</p><p className="kpi-value">{formatCurrency(deal.arv)}</p></div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <button className="ghost-button" onClick={() => handleMatches(deal.id)}>Find buyers</button>
                  <Link to={`/deals/${deal.id}/sheet`}><button className="ghost-button">Print sheet</button></Link>
                  <button className="ghost-button" onClick={() => handleDelete(deal.id)}>Delete</button>
                </div>
                {matches[deal.id] && (
                  <div className="results-card">
                    <h3>Buyer matches ({matches[deal.id].length})</h3>
                    {matches[deal.id].length === 0 ? (
                      <p className="text-muted">No matching buyers found.</p>
                    ) : (
                      matches[deal.id].map((m) => (
                        <div key={m.buyer.id} className="market-card">
                          <strong>{m.buyer.name}</strong> <span className="text-muted">· score {m.score}</span>
                          <p className="text-muted">{m.reasons.join(' · ')}</p>
                        </div>
                      ))
                    )}
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

- [ ] **Step 2: Add the nav link.** In `src/components/AppLayout.tsx`, add to the `NAV` array (after Buyers):
```js
  { to: '/deals', label: 'Deals' },
```

- [ ] **Step 3: Add routes.** In `src/App.tsx`, import `Deals` and `DealSheet` (DealSheet created in Task 8) and add inside the layout route:
```tsx
        <Route path="deals" element={<Deals />} />
        <Route path="deals/:id/sheet" element={<DealSheet />} />
```
Add the imports:
```tsx
import { Deals } from './pages/Deals';
import { DealSheet } from './pages/DealSheet';
```
NOTE: `DealSheet` is created in Task 8. To keep this task's build green, create a TEMPORARY stub `src/pages/DealSheet.tsx` now:
```tsx
export function DealSheet() {
  return <p>Deal sheet…</p>;
}
```
(Task 8 replaces this stub with the real printable sheet.)

- [ ] **Step 4: Build.** `npm run build`. Expected: succeeds.

- [ ] **Step 5: Commit.**
```bash
git add src/pages/Deals.tsx src/pages/DealSheet.tsx src/components/AppLayout.tsx src/App.tsx
git commit -m "feat: Deals page with status, delete, and buyer matches"
```

---

### Task 7: Calculator — Save deal + Estimate ARV from comps

**Files:** Modify `src/pages/Calculator.tsx`.

- [ ] **Step 1: Replace `src/pages/Calculator.tsx` with:**
```tsx
import { useMemo, useState } from 'react';
import { calculateWholesaleDeal, formatCurrency, type DealInputs } from '../lib/deal';
import { createDeal, estimateArv } from '../api/client';
import { ErrorBanner } from '../components/states';
import type { DealInputFields } from '../api/types';

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

export function Calculator() {
  const [inputs, setInputs] = useState<DealInputs>({
    purchasePrice: 120000, repairBudget: 22000, arv: 185000,
    sellingCosts: 12000, holdingCosts: 3000, wholesaleFee: 10000,
  });
  const results = useMemo(() => calculateWholesaleDeal(inputs), [inputs]);
  const spread = inputs.arv - inputs.repairBudget - inputs.sellingCosts - inputs.wholesaleFee;

  const [meta, setMeta] = useState({ name: '', address: '', city: '', state: '', sqft: 1800 });
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [arvMsg, setArvMsg] = useState<string | null>(null);

  const handleSave = async () => {
    setSaveError(null); setSaveMsg(null);
    if (!meta.name) { setSaveError('Give the deal a name before saving.'); return; }
    const body: DealInputFields = {
      name: meta.name, property_address: meta.address, city: meta.city, state: meta.state,
      purchase_price: inputs.purchasePrice, repair_budget: inputs.repairBudget, arv: inputs.arv,
      selling_costs: inputs.sellingCosts, holding_costs: inputs.holdingCosts, wholesale_fee: inputs.wholesaleFee,
    };
    try {
      const deal = await createDeal(body);
      setSaveMsg(`Saved "${deal.name}" — profit ${formatCurrency(deal.profit)}, ROI ${deal.roi.toFixed(1)}%.`);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleEstimateArv = async () => {
    setArvMsg(null);
    try {
      const r = await estimateArv(meta.city, meta.state, meta.sqft);
      if (r.success && r.estimatedArv) {
        setInputs((cur) => ({ ...cur, arv: r.estimatedArv as number }));
        setArvMsg(`ARV set to ${formatCurrency(r.estimatedArv)} from ${r.compCount} comps (median $${r.medianPricePerSqft}/sqft).`);
      } else {
        setArvMsg(r.error || 'No comps found.');
      }
    } catch (e) {
      setArvMsg(e instanceof Error ? e.message : String(e));
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
          </div>
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
          <h2>Estimate ARV from comps</h2>
          <p className="section-hint">Pull recent comps for an area and set ARV to median $/sqft × square footage.</p>
          <div className="form-grid">
            <input placeholder="City" value={meta.city} onChange={(e) => setMeta({ ...meta, city: e.target.value })} />
            <input placeholder="State" value={meta.state} onChange={(e) => setMeta({ ...meta, state: e.target.value })} />
            <label>
              <span>Subject sqft</span>
              <input type="number" min={0} step={50} value={meta.sqft} onChange={(e) => setMeta({ ...meta, sqft: Number(e.target.value) })} />
            </label>
            <button onClick={handleEstimateArv}>Estimate ARV</button>
          </div>
          {arvMsg && <p className="text-muted" style={{ marginTop: 12 }}>{arvMsg}</p>}

          <h2 style={{ marginTop: 24 }}>Save this deal</h2>
          <div className="form-grid">
            <input placeholder="Deal name" value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} />
            <input placeholder="Property address" value={meta.address} onChange={(e) => setMeta({ ...meta, address: e.target.value })} />
            <button onClick={handleSave} disabled={!meta.name}>Save deal</button>
          </div>
          {saveMsg && <p className="good-deal" style={{ marginTop: 12 }}>{saveMsg}</p>}
          {saveError && <ErrorBanner message={saveError} />}

          <h3>Rehab estimator</h3>
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

- [ ] **Step 2: Build.** `npm run build`. Expected: succeeds.

- [ ] **Step 3: Commit.**
```bash
git add src/pages/Calculator.tsx
git commit -m "feat: Calculator can save deals and estimate ARV from comps"
```

---

### Task 8: Printable deal sheet + print CSS; final verification

**Files:** Replace `src/pages/DealSheet.tsx`; modify `src/styles.css`.

- [ ] **Step 1: Replace `src/pages/DealSheet.tsx` with:**
```tsx
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getDeal, getDealMatches } from '../api/client';
import { Loading, ErrorBanner } from '../components/states';
import { formatCurrency } from '../lib/deal';
import type { Deal, BuyerMatch } from '../api/types';

export function DealSheet() {
  const { id } = useParams();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [matches, setMatches] = useState<BuyerMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoading(true);
    Promise.all([getDeal(id), getDealMatches(id).catch(() => ({ matches: [] }))])
      .then(([d, m]) => { if (active) { setDeal(d); setMatches(m.matches || []); } })
      .catch((e) => active && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id]);

  if (loading) return <Loading label="Loading deal sheet…" />;
  if (error) return <ErrorBanner message={error} />;
  if (!deal) return <ErrorBanner message="Deal not found." />;

  const rows: [string, string][] = [
    ['Purchase price', formatCurrency(deal.purchase_price)],
    ['Repair budget', formatCurrency(deal.repair_budget)],
    ['ARV', formatCurrency(deal.arv)],
    ['Selling costs', formatCurrency(deal.selling_costs)],
    ['Holding costs', formatCurrency(deal.holding_costs)],
    ['Wholesale fee', formatCurrency(deal.wholesale_fee)],
  ];

  return (
    <div className="deal-sheet">
      <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => window.print()}>Print / Save as PDF</button>
        <Link to="/deals"><button className="ghost-button">Back to deals</button></Link>
      </div>

      <header className="hero-panel">
        <p className="eyebrow">Deal sheet</p>
        <h1>{deal.name}</h1>
        {(deal.property_address || deal.city) && (
          <p>{[deal.property_address, deal.city, deal.state].filter(Boolean).join(', ')}</p>
        )}
      </header>

      <section className="panel">
        <h2>Numbers</h2>
        <table className="data-table">
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label}><td>{label}</td><td className="num">{value}</td></tr>
            ))}
            <tr><td><strong>Projected profit</strong></td><td className="num"><strong>{formatCurrency(deal.profit)}</strong></td></tr>
            <tr><td><strong>ROI</strong></td><td className="num"><strong>{deal.roi.toFixed(1)}%</strong></td></tr>
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>Matched buyers ({matches.length})</h2>
        {matches.length === 0 ? (
          <p className="text-muted">No matching buyers.</p>
        ) : (
          <div className="market-list">
            {matches.map((m) => (
              <div key={m.buyer.id} className="market-card">
                <strong>{m.buyer.name}</strong> <span className="text-muted">· score {m.score}</span>
                <p>{m.buyer.email} · {m.buyer.phone}</p>
                <p className="text-muted">{m.reasons.join(' · ')}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Add print styles.** Append to `src/styles.css`:
```css
/* ---------- Print (deal sheet) ---------- */
.deal-sheet { max-width: 800px; }
@media print {
  .sidebar, .no-print { display: none !important; }
  .app-shell { display: block; }
  .app-main { padding: 0; max-width: none; }
  .panel, .hero-panel { box-shadow: none; break-inside: avoid; }
  body { background: #fff; }
}
```

- [ ] **Step 3: Full build + tests.**
```bash
npm run build
npm test
```
Expected: build succeeds; vitest passes.

- [ ] **Step 4: Live verification.** Start backend (`cd backend && node src/server.js`) and frontend (`npm run dev`); confirm:
- Calculator: "Estimate ARV" (city Atlanta, state GA, sqft) sets the ARV field; "Save deal" with a name persists and shows profit/ROI.
- Deals page lists the saved deal; status change persists; "Find buyers" shows ranked matches; "Print sheet" opens the deal sheet; the browser print dialog hides the sidebar.

- [ ] **Step 5: Commit.**
```bash
git add src/pages/DealSheet.tsx src/styles.css
git commit -m "feat: printable deal sheet with print stylesheet"
```

---

## Phase 4 Verification (Definition of Done)

- [ ] Backend `npm test` passes all suites (Phase 1–4), zero failures.
- [ ] Frontend `npm run build` clean; `npm test` (vitest) passes.
- [ ] `deals` table exists; POST/PUT compute and store `profit`/`roi` server-side.
- [ ] `GET /api/arv` returns a median-$/sqft estimate; `GET /api/deals/:id/matches` returns ranked buyers.
- [ ] Calculator can estimate ARV from comps and save a deal.
- [ ] Deals page shows history with profit/ROI, status edit, delete, and buyer matches.
- [ ] A deal sheet prints cleanly (sidebar/buttons hidden via `@media print`).
