# Phase 5 — Pipeline Analytics & Insights: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Insights page (and `GET /api/insights`) that aggregates existing deals, leads, buyers, and markets into a pipeline command center — KPIs, a status funnel, profit-by-month, buyer-match coverage, and top deals/markets — computed server-side, with no new tables, external services, or chart libraries.

**Architecture:** A new pure-function module `backend/src/insights.js` does all aggregation and is unit-tested in isolation; one `GET /api/insights` endpoint composes those functions over `dbAll` queries. The frontend adds a typed `getInsights()` client call, a thin `Insights` page using `useAsync` + state components, hand-rolled inline-SVG chart components, and a compact KPI strip on the existing Dashboard.

**Tech Stack:** Backend — Node.js (ESM), Express 4, sqlite3, `node:test` + supertest. Frontend — React 18, Vite 5, TypeScript, react-router-dom v7, vitest (node env, pure-logic tests).

## Global Constraints

- No new database tables; aggregate on read from `deals`, `sellers`, `buyers`, `markets`. (Spec: Decisions.)
- No new external services, API keys, or chart libraries; charts are hand-rolled inline SVG. (Spec: Decisions.)
- Aggregation logic is server-side and unit-tested; the frontend stays thin. (Spec: Architecture.)
- Reuse Phase 4's `matchBuyers` from `backend/src/analytics.js` for buyer-match coverage. (Spec: Decisions.)
- Additive: add a `/insights` page; keep the existing Dashboard's quick calculator and hot-markets panels, adding only a KPI strip. (Spec: Decisions.)
- `active` deals = `status` not in (`closed`, `dead`). `pipelineValue`/`projectedProfit`/`avgRoi` are over active deals; `avgRoi` rounded to 2 decimals, `0` when no active deals. (Spec: Architecture.)
- Backend GET endpoints return bare objects/arrays; the typed client throws `ApiError` on non-2xx. (Established pattern.)
- Follow existing patterns: promisified `dbAll` in `backend/src/db.js`; typed client in `src/api/client.ts`; `useAsync` + `Loading`/`ErrorBanner`/`Empty` from `src/components/states.tsx`; `formatCurrency` from `src/lib/deal.ts`.

---

### Task 1: Backend insights aggregation module

Pure functions that compute every metric from plain row arrays. No DB or HTTP here.

**Files:**
- Create: `backend/src/insights.js`
- Test: `backend/src/insights.test.js`

**Interfaces:**
- Consumes: `matchBuyers(deal, buyers)` from `./analytics.js` (Phase 4 — returns an array of matches; empty array means no match).
- Produces:
  - `summarizeDeals(deals) → { total, active, byStatus, pipelineValue, projectedProfit, avgRoi, topByProfit }` where `byStatus` is zero-filled for `analyzing|under_contract|closed|dead` (plus any other status present), and `topByProfit` is up to 5 `{ id, name, profit, roi, status }` sorted by `profit` desc.
  - `profitByMonth(deals) → [{ month: 'YYYY-MM', profit, count }]` sorted ascending by `month` (derived from `created_at`).
  - `leadFunnel(sellers, buyers) → { sellers, buyers, sellersByStatus }` (`sellersByStatus` keyed by each present seller `status`).
  - `matchedDealCount(deals, buyers) → number` (count of deals with ≥1 `matchBuyers` result).
  - `topMarkets(markets, n = 5) → Market[]` sorted by `heat_score` desc, first `n`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/insights.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  summarizeDeals, profitByMonth, leadFunnel, matchedDealCount, topMarkets,
} from './insights.js';

const DEALS = [
  { id: '1', name: 'A', status: 'analyzing', arv: 200000, profit: 6000, roi: 3.82, created_at: '2026-05-10T00:00:00.000Z' },
  { id: '2', name: 'B', status: 'under_contract', arv: 300000, profit: 20000, roi: 10, created_at: '2026-06-01T00:00:00.000Z' },
  { id: '3', name: 'C', status: 'closed', arv: 150000, profit: 8000, roi: 5, created_at: '2026-06-15T00:00:00.000Z' },
  { id: '4', name: 'D', status: 'dead', arv: 999999, profit: -5000, roi: -2, created_at: '2026-06-20T00:00:00.000Z' },
];

test('summarizeDeals counts statuses and sums active pipeline only', () => {
  const s = summarizeDeals(DEALS);
  assert.equal(s.total, 4);
  assert.equal(s.active, 2); // analyzing + under_contract
  assert.deepEqual(s.byStatus, { analyzing: 1, under_contract: 1, closed: 1, dead: 1 });
  assert.equal(s.pipelineValue, 500000); // 200000 + 300000 (active only)
  assert.equal(s.projectedProfit, 26000); // 6000 + 20000
  assert.equal(s.avgRoi, 6.91); // (3.82 + 10) / 2, rounded
});

test('summarizeDeals zero-fills known statuses and ranks top deals by profit', () => {
  const s = summarizeDeals([{ id: '9', name: 'Z', status: 'analyzing', arv: 1, profit: 100, roi: 1, created_at: '2026-06-01' }]);
  assert.deepEqual(s.byStatus, { analyzing: 1, under_contract: 0, closed: 0, dead: 0 });
  assert.equal(s.topByProfit[0].id, '9');
  assert.equal(s.avgRoi, 1);
});

test('summarizeDeals avgRoi is 0 with no active deals', () => {
  const s = summarizeDeals([{ id: 'x', name: 'X', status: 'closed', arv: 1, profit: 1, roi: 50, created_at: '2026-06-01' }]);
  assert.equal(s.active, 0);
  assert.equal(s.avgRoi, 0);
  assert.equal(s.pipelineValue, 0);
});

test('profitByMonth buckets by YYYY-MM ascending', () => {
  const months = profitByMonth(DEALS);
  assert.deepEqual(months.map((m) => m.month), ['2026-05', '2026-06']);
  assert.equal(months[0].profit, 6000);
  assert.equal(months[1].profit, 23000); // 20000 + 8000 + (-5000)
  assert.equal(months[1].count, 3);
});

test('leadFunnel totals and seller status counts', () => {
  const f = leadFunnel(
    [{ status: 'new' }, { status: 'new' }, { status: 'contacted' }],
    [{ id: 'b1' }],
  );
  assert.equal(f.sellers, 3);
  assert.equal(f.buyers, 1);
  assert.deepEqual(f.sellersByStatus, { new: 2, contacted: 1 });
});

test('matchedDealCount counts deals with at least one buyer match', () => {
  const buyers = [{ id: 'b', preferred_areas: 'Atlanta', cash_available: 500000, deal_types: 'wholesale' }];
  const deals = [
    { city: 'Atlanta', state: 'GA', purchase_price: 100000, deal_type: 'wholesale' }, // matches
    { city: 'Phoenix', state: 'AZ', purchase_price: 100000, deal_type: 'flip' },       // no match
  ];
  assert.equal(matchedDealCount(deals, buyers), 1);
});

test('topMarkets sorts by heat_score desc and limits', () => {
  const markets = [
    { city: 'A', heat_score: 70 }, { city: 'B', heat_score: 90 }, { city: 'C', heat_score: 80 },
  ];
  const top = topMarkets(markets, 2);
  assert.equal(top.length, 2);
  assert.deepEqual(top.map((m) => m.city), ['B', 'C']);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && node --test src/insights.test.js`
Expected: FAIL — `Cannot find module './insights.js'`.

- [ ] **Step 3: Write the implementation**

Create `backend/src/insights.js`:

```js
import { matchBuyers } from './analytics.js';

const KNOWN_DEAL_STATUSES = ['analyzing', 'under_contract', 'closed', 'dead'];
const INACTIVE = new Set(['closed', 'dead']);

export function summarizeDeals(deals) {
  const byStatus = {};
  for (const s of KNOWN_DEAL_STATUSES) byStatus[s] = 0;
  for (const d of deals) byStatus[d.status] = (byStatus[d.status] || 0) + 1;

  const active = deals.filter((d) => !INACTIVE.has(d.status));
  const pipelineValue = active.reduce((sum, d) => sum + (d.arv || 0), 0);
  const projectedProfit = active.reduce((sum, d) => sum + (d.profit || 0), 0);
  const avgRoi = active.length
    ? Math.round((active.reduce((sum, d) => sum + (d.roi || 0), 0) / active.length) * 100) / 100
    : 0;
  const topByProfit = [...deals]
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 5)
    .map((d) => ({ id: d.id, name: d.name, profit: d.profit, roi: d.roi, status: d.status }));

  return { total: deals.length, active: active.length, byStatus, pipelineValue, projectedProfit, avgRoi, topByProfit };
}

export function profitByMonth(deals) {
  const buckets = new Map();
  for (const d of deals) {
    const month = (d.created_at || '').slice(0, 7);
    if (!month) continue;
    const b = buckets.get(month) || { month, profit: 0, count: 0 };
    b.profit += d.profit || 0;
    b.count += 1;
    buckets.set(month, b);
  }
  return [...buckets.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export function leadFunnel(sellers, buyers) {
  const sellersByStatus = {};
  for (const s of sellers) {
    const k = s.status || 'unknown';
    sellersByStatus[k] = (sellersByStatus[k] || 0) + 1;
  }
  return { sellers: sellers.length, buyers: buyers.length, sellersByStatus };
}

export function matchedDealCount(deals, buyers) {
  return deals.reduce((n, d) => (matchBuyers(d, buyers).length > 0 ? n + 1 : n), 0);
}

export function topMarkets(markets, n = 5) {
  return [...markets].sort((a, b) => b.heat_score - a.heat_score).slice(0, n);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && node --test src/insights.test.js`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/insights.js backend/src/insights.test.js
git commit -m "feat(insights): server-side pipeline aggregation functions"
```

---

### Task 2: `GET /api/insights` endpoint

Compose the Task 1 functions over the four tables behind one endpoint.

**Files:**
- Modify: `backend/src/server.js` (import + endpoint, inserted before `app.use(errorHandler)`)
- Test: `backend/src/insights.routes.test.js`

**Interfaces:**
- Consumes: `summarizeDeals`, `profitByMonth`, `leadFunnel`, `matchedDealCount`, `topMarkets` from `./insights.js`; `dbAll` (already imported in `server.js`); `asyncHandler` (already imported).
- Produces (HTTP): `GET /api/insights` →
  ```json
  {
    "deals": { "total", "active", "byStatus", "pipelineValue", "projectedProfit",
               "avgRoi", "matchedCount", "profitByMonth", "topByProfit" },
    "leads": { "sellers", "buyers", "sellersByStatus" },
    "markets": { "top": [Market, ...] }
  }
  ```

- [ ] **Step 1: Add the import to `server.js`**

In `backend/src/server.js`, directly below the existing line
`import { estimateArv, medianPricePerSqft, matchBuyers } from './analytics.js';`, add:

```js
import { summarizeDeals, profitByMonth, leadFunnel, matchedDealCount, topMarkets } from './insights.js';
```

- [ ] **Step 2: Add the endpoint**

In `backend/src/server.js`, immediately **before** the `app.use(errorHandler);` line near the end of the file, add:

```js
// ========== INSIGHTS / ANALYTICS ==========

app.get('/api/insights', asyncHandler(async (req, res) => {
  const [deals, sellers, buyers, markets] = await Promise.all([
    dbAll('SELECT * FROM deals'),
    dbAll('SELECT * FROM sellers'),
    dbAll('SELECT * FROM buyers'),
    dbAll('SELECT * FROM markets'),
  ]);

  res.json({
    deals: {
      ...summarizeDeals(deals),
      matchedCount: matchedDealCount(deals, buyers),
      profitByMonth: profitByMonth(deals),
    },
    leads: leadFunnel(sellers, buyers),
    markets: { top: topMarkets(markets, 5) },
  });
}));
```

- [ ] **Step 3: Write the failing integration test**

Create `backend/src/insights.routes.test.js`:

```js
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from './server.js';
import { db } from './db.js';

after(() => new Promise((resolve) => db.close(() => resolve())));

test('GET /api/insights returns the documented shape', async () => {
  const res = await request(app).get('/api/insights');
  assert.equal(res.status, 200);
  assert.ok(res.body.deals, 'has deals');
  assert.ok(res.body.deals.byStatus, 'has byStatus');
  assert.ok(Array.isArray(res.body.deals.profitByMonth), 'profitByMonth is an array');
  assert.ok(Array.isArray(res.body.deals.topByProfit), 'topByProfit is an array');
  assert.ok(res.body.leads, 'has leads');
  assert.ok(Array.isArray(res.body.markets.top), 'markets.top is an array');
  assert.equal(typeof res.body.deals.matchedCount, 'number');
});

test('GET /api/insights reflects a newly saved active deal', async () => {
  const before = await request(app).get('/api/insights');
  const created = await request(app).post('/api/deals').send({
    name: 'Insights Deal', city: 'Atlanta', state: 'GA', deal_type: 'wholesale',
    purchase_price: 100000, repair_budget: 0, arv: 250000, selling_costs: 0, holding_costs: 0, wholesale_fee: 0,
  });
  const after = await request(app).get('/api/insights');
  assert.equal(after.body.deals.total, before.body.deals.total + 1);
  assert.ok(after.body.deals.pipelineValue >= before.body.deals.pipelineValue + 250000);
  await request(app).delete(`/api/deals/${created.body.id}`);
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && node --test src/insights.routes.test.js`
Expected: PASS — 2 tests.

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && npm test`
Expected: all pass (prior 45 + 7 from Task 1 + 2 here = 54).

- [ ] **Step 6: Commit**

```bash
git add backend/src/server.js backend/src/insights.routes.test.js
git commit -m "feat(insights): GET /api/insights endpoint"
```

---

### Task 3: Frontend types, client call, and chart-scale helper

Add the `Insights` type, the `getInsights()` client function, and a pure `barHeights` helper for the SVG charts.

**Files:**
- Modify: `src/api/types.ts`
- Modify: `src/api/client.ts`
- Create: `src/lib/insights.ts`
- Test: `src/lib/insights.test.ts`

**Interfaces:**
- Consumes: `apiFetch` (module-private in `client.ts`).
- Produces:
  - Type `Insights` (and supporting `InsightDeal`, `InsightMarket`) matching the Task 2 JSON.
  - `getInsights(): Promise<Insights>`.
  - `barHeights(values: number[], maxPx: number): number[]` — scales each value to a pixel height proportional to the max value; returns all `0` when every value is `0` or the array is empty.

- [ ] **Step 1: Add the failing helper test**

Create `src/lib/insights.test.ts`:

```ts
import { test, expect } from 'vitest';
import { barHeights } from './insights';

test('barHeights scales values proportionally to the max', () => {
  expect(barHeights([0, 50, 100], 100)).toEqual([0, 50, 100]);
});

test('barHeights returns zeros when all values are zero', () => {
  expect(barHeights([0, 0, 0], 80)).toEqual([0, 0, 0]);
});

test('barHeights returns an empty array for empty input', () => {
  expect(barHeights([], 80)).toEqual([]);
});

test('barHeights handles negative values as zero-height', () => {
  expect(barHeights([-10, 10], 100)).toEqual([0, 100]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test` (project root)
Expected: FAIL — cannot resolve `./insights`.

- [ ] **Step 3: Create the helper**

Create `src/lib/insights.ts`:

```ts
// Scales each value to a pixel height proportional to the largest value.
// Negative values clamp to 0; an all-zero or empty input yields zeros.
export function barHeights(values: number[], maxPx: number): number[] {
  const max = Math.max(0, ...values);
  if (max === 0) return values.map(() => 0);
  return values.map((v) => (v <= 0 ? 0 : Math.round((v / max) * maxPx)));
}
```

- [ ] **Step 4: Add the `Insights` types**

Append to `src/api/types.ts`:

```ts
export interface InsightDeal {
  id: string;
  name: string;
  profit: number;
  roi: number;
  status: string;
}

export interface InsightMarket {
  id: string;
  city: string;
  state: string;
  heat_score: number;
  trend: string;
}

export interface Insights {
  deals: {
    total: number;
    active: number;
    byStatus: Record<string, number>;
    pipelineValue: number;
    projectedProfit: number;
    avgRoi: number;
    matchedCount: number;
    profitByMonth: { month: string; profit: number; count: number }[];
    topByProfit: InsightDeal[];
  };
  leads: {
    sellers: number;
    buyers: number;
    sellersByStatus: Record<string, number>;
  };
  markets: { top: InsightMarket[] };
}
```

- [ ] **Step 5: Add the client function**

In `src/api/client.ts`, extend the type import to include `Insights`:

```ts
import type {
  Market, Comp, Seller, NewSeller, Buyer, NewBuyer,
  DealInputs, DealAnalysisResult, SellerScoreInput, SellerScoreResult,
  MarketTrend, Neighborhood, GeocodeResult, Health,
  DealInputFields, Deal, ArvEstimate, DealMatches, Insights,
} from './types';
```

Append at the end of the file:

```ts
export const getInsights = () => apiFetch<Insights>('/api/insights');
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `npm test`
Expected: PASS — `barHeights` tests green.

Run: `npm run build`
Expected: `tsc` + Vite build succeed.

- [ ] **Step 7: Commit**

```bash
git add src/api/types.ts src/api/client.ts src/lib/insights.ts src/lib/insights.test.ts
git commit -m "feat(insights): client types, getInsights, and barHeights helper"
```

---

### Task 4: Charts, Insights page, route, and nav

The presentational chart components and the Insights page, wired into the router and sidebar.

**Files:**
- Create: `src/components/charts.tsx`
- Create: `src/pages/Insights.tsx`
- Modify: `src/App.tsx` (route)
- Modify: `src/components/AppLayout.tsx` (nav link)
- Modify: `src/styles.css` (insights/chart styles)

**Interfaces:**
- Consumes: `getInsights` from the client; `useAsync`; `Loading`/`ErrorBanner`/`Empty`; `formatCurrency`; `barHeights`; types `Insights`.
- Produces: `MiniBars` and `StatusBars` components; `export function Insights()`; a `/insights` route inside `AppLayout`; an "Insights" nav entry.

- [ ] **Step 1: Create the chart components**

Create `src/components/charts.tsx`:

```tsx
import { barHeights } from '../lib/insights';

interface MiniBarsProps {
  data: { label: string; value: number }[];
  height?: number;
}

// Inline-SVG bar chart. No external dependency.
export function MiniBars({ data, height = 120 }: MiniBarsProps) {
  if (data.length === 0) return <p className="text-muted">No data yet.</p>;
  const heights = barHeights(data.map((d) => d.value), height - 24);
  const barW = 36;
  const gap = 16;
  const width = data.length * (barW + gap);
  return (
    <svg className="mini-bars" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="bar chart">
      {data.map((d, i) => {
        const h = heights[i];
        const x = i * (barW + gap) + gap / 2;
        return (
          <g key={d.label}>
            <rect x={x} y={height - 18 - h} width={barW} height={h} rx={6} className="bar-rect" />
            <text x={x + barW / 2} y={height - 4} textAnchor="middle" className="bar-label">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

interface StatusBarsProps {
  counts: Record<string, number>;
}

// Horizontal proportional bars for the deal-status funnel.
export function StatusBars({ counts }: StatusBarsProps) {
  const entries = Object.entries(counts);
  const max = Math.max(1, ...entries.map(([, n]) => n));
  return (
    <div className="status-bars">
      {entries.map(([status, n]) => (
        <div key={status} className="status-bar-row">
          <span className="status-bar-label">{status.replace('_', ' ')}</span>
          <span className="status-bar-track">
            <span className="status-bar-fill" style={{ width: `${(n / max) * 100}%` }} />
          </span>
          <span className="status-bar-count">{n}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create the Insights page**

Create `src/pages/Insights.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { getInsights } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorBanner, Empty } from '../components/states';
import { MiniBars, StatusBars } from '../components/charts';
import { formatCurrency } from '../lib/deal';
import type { Insights as InsightsData } from '../api/types';

export function Insights() {
  const insights = useAsync<InsightsData>(getInsights, true);

  if (insights.loading) return <Loading label="Loading insights…" />;
  if (insights.error) return <ErrorBanner message={insights.error} onRetry={() => insights.run()} />;
  if (!insights.data) return <Empty message="No insights yet." />;

  const { deals, leads, markets } = insights.data;
  const totalLeads = leads.sellers + leads.buyers;

  const kpis = [
    { label: 'Pipeline value', value: formatCurrency(deals.pipelineValue) },
    { label: 'Projected profit', value: formatCurrency(deals.projectedProfit) },
    { label: 'Avg ROI', value: `${deals.avgRoi.toFixed(1)}%` },
    { label: 'Active deals', value: String(deals.active) },
    { label: 'Total leads', value: String(totalLeads) },
    { label: 'Matched deals', value: `${deals.matchedCount} / ${deals.total}` },
  ];

  return (
    <>
      <header className="hero-panel">
        <p className="eyebrow">Analytics</p>
        <h1>Pipeline Insights</h1>
        <p>Your deals, leads, and markets at a glance.</p>
      </header>

      {deals.total === 0 ? (
        <Empty message="No deals yet. Save a deal from the Calculator to see your pipeline come to life." />
      ) : (
        <div className="layout-single">
          <section className="panel">
            <div className="kpi-grid">
              {kpis.map((k) => (
                <div key={k.label} className="kpi">
                  <p className="kpi-label">{k.label}</p>
                  <p className="kpi-value">{k.value}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="layout-grid">
            <section className="panel">
              <h2>Deals by status</h2>
              <StatusBars counts={deals.byStatus} />
            </section>

            <section className="panel">
              <h2>Profit by month</h2>
              <MiniBars data={deals.profitByMonth.map((m) => ({ label: m.month.slice(5), value: m.profit }))} />
            </section>
          </div>

          <div className="layout-grid">
            <section className="panel">
              <h2>Top deals</h2>
              {deals.topByProfit.length === 0 ? (
                <Empty message="No deals to rank yet." />
              ) : (
                <div className="market-list">
                  {deals.topByProfit.map((d) => (
                    <Link key={d.id} to={`/deals/${d.id}/sheet`} className="market-card">
                      <strong>{d.name}</strong>
                      <p>{formatCurrency(d.profit)} · {d.roi.toFixed(1)}% ROI</p>
                      <p className="text-muted">{d.status.replace('_', ' ')}</p>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <section className="panel">
              <h2>Hot markets</h2>
              <div className="market-list">
                {markets.top.map((m) => (
                  <Link key={m.id} to="/markets" className="market-card">
                    <strong>{m.city}, {m.state}</strong>
                    <p>Heat {m.heat_score} · {m.trend}</p>
                  </Link>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 3: Add the route in `App.tsx`**

Add the import alongside the other page imports:

```tsx
import { Insights } from './pages/Insights';
```

Add this route inside the `<Route element={<AppLayout />}>` block (e.g. after the `deals` route):

```tsx
        <Route path="insights" element={<Insights />} />
```

- [ ] **Step 4: Add the nav link in `AppLayout.tsx`**

In the `NAV` array in `src/components/AppLayout.tsx`, add an entry after the `Deals` entry:

```tsx
  { to: '/insights', label: 'Insights' },
```

- [ ] **Step 5: Add styles to `styles.css`**

Append to the end of `src/styles.css`:

```css
/* ---------- Insights charts ---------- */
.mini-bars { width: 100%; height: auto; }
.mini-bars .bar-rect { fill: var(--accent); }
.mini-bars .bar-label { fill: var(--ink-soft); font-size: 11px; }

.status-bars { display: grid; gap: var(--space-2); }
.status-bar-row { display: grid; grid-template-columns: 120px 1fr 32px; align-items: center; gap: var(--space-2); }
.status-bar-label { color: var(--ink-soft); text-transform: capitalize; font-size: 0.9rem; }
.status-bar-track { background: var(--surface-muted); border-radius: 999px; height: 12px; overflow: hidden; }
.status-bar-fill { display: block; height: 100%; background: var(--accent); border-radius: 999px; }
.status-bar-count { text-align: right; font-variant-numeric: tabular-nums; }
```

- [ ] **Step 6: Typecheck and build**

Run: `npm run build`
Expected: `tsc` + Vite build succeed.

- [ ] **Step 7: Manual click-through**

Start both servers (`cd backend && npm run dev`; `npm run dev` at root). Open **Insights**: confirm KPI cards, the status funnel, the profit-by-month bars, and the top-deals/markets lists render. With no deals saved, confirm the empty-state message shows instead. Confirm the nav link works from every page.

- [ ] **Step 8: Commit**

```bash
git add src/components/charts.tsx src/pages/Insights.tsx src/App.tsx src/components/AppLayout.tsx src/styles.css
git commit -m "feat(insights): Insights page with inline-SVG charts + nav/route"
```

---

### Task 5: Dashboard KPI strip

Surface three headline KPIs on the existing Dashboard with a link to Insights, without removing its current panels.

**Files:**
- Modify: `src/pages/Dashboard.tsx`

**Interfaces:**
- Consumes: `getInsights` from the client; the existing `useAsync`; `formatCurrency`; type `Insights`.
- Produces: no new exports; the existing `Dashboard` gains a KPI strip. If the insights call fails, the strip renders nothing (the rest of the Dashboard is unaffected).

- [ ] **Step 1: Add the insights call and strip to `Dashboard.tsx`**

In `src/pages/Dashboard.tsx`, add to the imports (the file already imports `useAsync`, `getMarkets`, `formatCurrency`, `Link`):

```tsx
import { getMarkets, getInsights } from '../api/client';
import type { Market, Insights } from '../api/types';
```

(Replace the existing `getMarkets`-only import and the existing `Market`-only type import with the lines above.)

Inside the `Dashboard` component, after the existing `const markets = useAsync<Market[]>(getMarkets, true);` line, add:

```tsx
  const insights = useAsync<Insights>(getInsights, true);
```

Then, immediately after the closing `</header>` of the hero panel and **before** the existing `<div className="layout-grid">`, add the strip:

```tsx
      {insights.data && insights.data.deals.total > 0 && (
        <section className="panel">
          <div className="kpi-grid">
            <div className="kpi"><p className="kpi-label">Pipeline value</p><p className="kpi-value">{formatCurrency(insights.data.deals.pipelineValue)}</p></div>
            <div className="kpi"><p className="kpi-label">Projected profit</p><p className="kpi-value">{formatCurrency(insights.data.deals.projectedProfit)}</p></div>
            <div className="kpi"><p className="kpi-label">Active deals</p><p className="kpi-value">{insights.data.deals.active}</p></div>
          </div>
          <Link to="/insights"><button style={{ marginTop: 12 }}>View insights</button></Link>
        </section>
      )}
```

- [ ] **Step 2: Typecheck and build**

Run: `npm run build`
Expected: `tsc` + Vite build succeed.

- [ ] **Step 3: Manual click-through**

With both servers running and at least one saved deal: open the **Dashboard**, confirm the KPI strip appears above the existing panels with correct numbers and a working "View insights" link. Confirm the strip is absent when no deals exist.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "feat(insights): Dashboard KPI strip linking to Insights"
```

---

### Task 6: Full verification

Confirm both suites and the build are green across the whole phase.

**Files:** none (verification only).

- [ ] **Step 1: Backend suite**

Run: `cd backend && npm test`
Expected: all backend tests pass (prior 45 + 7 insights unit + 2 insights route = 54).

- [ ] **Step 2: Frontend suite**

Run: `npm test`
Expected: all vitest tests pass (prior 7 + 4 `barHeights` = 11).

- [ ] **Step 3: Frontend build**

Run: `npm run build`
Expected: `tsc` + Vite build succeed with no type errors.

- [ ] **Step 4: End-to-end smoke (manual)**

With both servers running: save a deal from the Calculator, open **Insights**, and confirm KPIs/funnel/profit-by-month/top-deals reflect it; confirm the Dashboard strip shows the same headline numbers; confirm nav works from every page.

---

## Self-Review

**1. Spec coverage**

| Spec item | Task |
| --- | --- |
| Server-side pure aggregation module (`summarizeDeals`, `profitByMonth`, `leadFunnel`, `matchedDealCount`, `topMarkets`) | Task 1 |
| `GET /api/insights` composing the four tables | Task 2 |
| KPI cards (pipeline value, projected profit, avg ROI, active deals, total leads, matched deals) | Task 4 (page) + Task 5 (Dashboard strip) |
| Deal status funnel | Task 4 (`StatusBars`) |
| Profit by month (inline SVG) | Task 4 (`MiniBars`) + Task 3 (`barHeights`) |
| Top deals + top markets | Task 4 |
| Buyer-match coverage reusing `matchBuyers` | Task 1 (`matchedDealCount`) |
| New `/insights` page + nav; Dashboard keeps panels + gains KPI strip | Tasks 4, 5 |
| Typed `getInsights()` client + `Insights` type | Task 3 |
| No new tables / external deps / chart libs | All tasks (inline SVG only; reads existing tables) |
| Tests: backend unit + integration, frontend helper unit, build/click-through | Tasks 1, 2, 3, 4, 5, 6 |

All spec sections map to tasks. No gaps.

**2. Placeholder scan:** No `TBD`/`TODO`/"add appropriate…" placeholders; every code step contains full code and every test step contains assertions.

**3. Type consistency:** Backend functions return the exact shapes the endpoint composes (`summarizeDeals` fields + `matchedCount` + `profitByMonth`); the frontend `Insights` type mirrors that JSON (`deals.byStatus` as `Record<string, number>`, `profitByMonth` items `{ month, profit, count }`, `topByProfit` as `InsightDeal[]`, `markets.top` as `InsightMarket[]`). `barHeights(values, maxPx)` is defined in Task 3 and consumed identically in Task 4's `MiniBars`. `getInsights()` is used identically in Tasks 4 and 5.
