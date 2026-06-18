# Phase 3 — Polish the UX: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the frontend into a cohesive product: a persistent sidebar layout (fixes the navigation bug), a typed API client (removes ~7 hardcoded URLs), consistent loading/error/empty states with auto-loaded data, and a refined, token-based restyle.

**Architecture:** Add `react-router-dom` with a shared `AppLayout` (sidebar + `<Outlet/>`). Centralize all HTTP in `src/api/client.ts` (typed, injectable `fetch`) with shared types in `src/api/types.ts`. A `useAsync` hook + presentational `Loading/Error/Empty` components standardize data states across every page. Pure logic (deal math, URL building) is unit-tested with **vitest**; layout/pages are verified via `tsc`+`vite build` and a live click-through. The restyle keeps the existing dark-panel/rounded-card look but drives it from CSS design tokens.

**Tech Stack:** React 18, Vite 5, TypeScript, react-router-dom v6, vitest (node env, for pure-logic tests).

**Visual decisions (locked):** Left sidebar navigation; refined version of the current aesthetic via design tokens.

**Scope note:** Backend GET endpoints return bare arrays/objects (decided in Phase 2). The typed client handles that directly. POST/PUT now may return Phase 2's `{ success:false, error, details }` on validation failure — the client throws an `ApiError` carrying those details.

---

### Task 1: Add dependencies, vitest, and env config

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `.env.example` (project root, frontend)
- Create: `src/vite-env.d.ts` (if missing)
- Test: `src/smoke.test.ts`

- [ ] **Step 1: Install dependencies**

Run from the project root:
```bash
npm install react-router-dom
npm install --save-dev vitest
```
Expected: `react-router-dom` under `dependencies`, `vitest` under `devDependencies`.

- [ ] **Step 2: Add the test script**

In `package.json`, replace the `scripts` block with:
```json
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Ensure `src/vite-env.d.ts` exists** (needed for `import.meta.env` typing)

Create `src/vite-env.d.ts` with:
```ts
/// <reference types="vite/client" />
```

- [ ] **Step 5: Create the frontend `.env.example`** (project root)

```
# Frontend base URL for the backend API (Vite exposes VITE_* to the client)
VITE_API_URL=http://localhost:5000
```

- [ ] **Step 6: Write a smoke test — create `src/smoke.test.ts`:**

```ts
import { test, expect } from 'vitest';

test('vitest runs', () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 7: Run the test**

Run from the project root:
```bash
npm test
```
Expected: PASS — 1 test passes. Confirms vitest is wired.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/vite-env.d.ts .env.example src/smoke.test.ts
git commit -m "chore: add react-router-dom, vitest, and frontend env config"
```

---

### Task 2: Extract deal math into a tested util

**Files:**
- Create: `src/lib/deal.ts`
- Test: `src/lib/deal.test.ts`

- [ ] **Step 1: Write the failing test — create `src/lib/deal.test.ts`:**

```ts
import { test, expect } from 'vitest';
import { calculateWholesaleDeal, formatCurrency } from './deal';

test('calculateWholesaleDeal computes investment, exit, profit, and roi', () => {
  const r = calculateWholesaleDeal({
    purchasePrice: 120000, repairBudget: 22000, arv: 185000,
    sellingCosts: 12000, holdingCosts: 3000, wholesaleFee: 10000,
  });
  // totalInvestment = 120000 + 22000 + 3000 + 12000 = 157000
  // exitNet = 185000 - 12000 - 10000 = 163000
  // profit = 163000 - 157000 = 6000
  expect(r.totalInvestment).toBe(157000);
  expect(r.exitNet).toBe(163000);
  expect(r.profit).toBe(6000);
  expect(Math.round(r.roi * 100) / 100).toBe(3.82);
});

test('roi is 0 when there is no investment', () => {
  const r = calculateWholesaleDeal({
    purchasePrice: 0, repairBudget: 0, arv: 0, sellingCosts: 0, holdingCosts: 0, wholesaleFee: 0,
  });
  expect(r.roi).toBe(0);
});

test('formatCurrency renders whole-dollar USD', () => {
  expect(formatCurrency(157000)).toBe('$157,000');
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- src/lib/deal.test.ts
```
Expected: FAIL — `deal.ts` does not exist.

- [ ] **Step 3: Create `src/lib/deal.ts`** (verbatim extraction of the existing logic in `App.tsx` — do not change the formula)

```ts
export interface DealInputs {
  purchasePrice: number;
  repairBudget: number;
  arv: number;
  sellingCosts: number;
  holdingCosts: number;
  wholesaleFee: number;
}

export interface DealResult {
  totalInvestment: number;
  exitNet: number;
  profit: number;
  roi: number;
}

export function calculateWholesaleDeal(inputs: DealInputs): DealResult {
  const { purchasePrice, repairBudget, arv, sellingCosts, holdingCosts, wholesaleFee } = inputs;
  const totalInvestment = purchasePrice + repairBudget + holdingCosts + sellingCosts;
  const exitNet = arv - sellingCosts - wholesaleFee;
  const profit = exitNet - totalInvestment;
  const roi = totalInvestment > 0 ? (profit / totalInvestment) * 100 : 0;
  return { totalInvestment, exitNet, profit, roi };
}

export function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test -- src/lib/deal.test.ts
```
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/deal.ts src/lib/deal.test.ts
git commit -m "feat: extract tested deal-math util"
```

---

### Task 3: Typed API client + shared types

**Files:**
- Create: `src/api/types.ts`
- Create: `src/api/client.ts`
- Test: `src/api/client.test.ts`

- [ ] **Step 1: Create `src/api/types.ts`**

```ts
export interface Market {
  id: string;
  city: string;
  state: string;
  heat_score: number;
  trend: string;
  avg_rent: number;
  avg_home_price: number;
  days_on_market: number;
  inventory_level: string;
}

export interface Comp {
  id: string;
  address: string;
  city: string;
  state: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  sold_date: string;
  price_per_sqft: number;
  days_on_market: number;
}

export interface Seller {
  id: string;
  name: string;
  phone: string;
  email: string;
  property_address: string;
  property_city: string;
  property_state: string;
  motivation: string;
  status: string;
  created_at: string;
  last_contacted?: string;
}

export type NewSeller = Omit<Seller, 'id' | 'status' | 'created_at' | 'last_contacted'>;

export interface Buyer {
  id: string;
  name: string;
  phone: string;
  email: string;
  cash_available: number;
  deal_types: string;
  preferred_areas: string;
  avg_deal_size: number;
  status: string;
  created_at: string;
}

export type NewBuyer = Omit<Buyer, 'id' | 'status' | 'created_at'>;

export interface DealInputs {
  purchasePrice: number;
  repairBudget: number;
  arv: number;
  sellingCosts: number;
  holdingCosts: number;
  wholesaleFee: number;
}

export interface DealAnalysisResult {
  success: boolean;
  analysis?: string;
  model?: string;
  error?: string;
}

export interface SellerScoreInput {
  name: string;
  property_address?: string;
  property_city?: string;
  property_state?: string;
  motivation?: string;
  status?: string;
}

export interface SellerScoreResult {
  success: boolean;
  scoring?: string;
  error?: string;
}

export interface MarketTrend {
  success?: boolean;
  metro?: string;
  series_id?: string;
  observations?: Array<{ date: string; value: string }>;
  last_update?: string;
  error?: string;
}

export interface Neighborhood {
  success?: boolean;
  zipCode?: string;
  population?: number;
  medianIncome?: number;
  povertyRate?: number;
  error?: string;
}

export interface GeocodeResult {
  success?: boolean;
  address?: string;
  latitude?: string;
  longitude?: string;
  error?: string;
}

export interface Health {
  status: string;
  integrations: { groq: boolean; fred: boolean; census: boolean; rentcast: boolean };
}
```

- [ ] **Step 2: Write the failing test — create `src/api/client.test.ts`:**

```ts
import { test, expect } from 'vitest';
import { apiFetch, ApiError } from './client';

function fakeFetch(body: unknown, { ok = true, status = 200 } = {}) {
  const calls: { url: string; options?: RequestInit }[] = [];
  const fn = (async (url: string, options?: RequestInit) => {
    calls.push({ url, options });
    return { ok, status, text: async () => JSON.stringify(body) };
  }) as unknown as typeof fetch;
  return { fn, calls };
}

test('apiFetch builds the URL from base + path and parses JSON', async () => {
  const { fn, calls } = fakeFetch([{ id: '1' }]);
  const data = await apiFetch<{ id: string }[]>('/api/markets', undefined, fn, 'http://x');
  expect(calls[0].url).toBe('http://x/api/markets');
  expect(data[0].id).toBe('1');
});

test('apiFetch throws ApiError with details on a non-ok response', async () => {
  const { fn } = fakeFetch(
    { success: false, error: 'Validation failed', details: [{ path: 'name', message: 'Required' }] },
    { ok: false, status: 400 },
  );
  await expect(apiFetch('/api/sellers', { method: 'POST' }, fn, 'http://x')).rejects.toMatchObject({
    name: 'ApiError',
    status: 400,
    message: 'Validation failed',
  });
});

test('apiFetch sends a JSON content-type header', async () => {
  const { fn, calls } = fakeFetch({});
  await apiFetch('/api/health', undefined, fn, 'http://x');
  const headers = calls[0].options?.headers as Record<string, string>;
  expect(headers['Content-Type']).toBe('application/json');
});
```

- [ ] **Step 3: Run to verify it fails**

```bash
npm test -- src/api/client.test.ts
```
Expected: FAIL — `client.ts` does not exist.

- [ ] **Step 4: Create `src/api/client.ts`**

```ts
import type {
  Market, Comp, Seller, NewSeller, Buyer, NewBuyer,
  DealInputs, DealAnalysisResult, SellerScoreInput, SellerScoreResult,
  MarketTrend, Neighborhood, GeocodeResult, Health,
} from './types';

const DEFAULT_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:5000';

export class ApiError extends Error {
  status: number;
  details?: Array<{ path: string; message: string }>;
  constructor(message: string, status: number, details?: Array<{ path: string; message: string }>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

// Low-level fetch wrapper. fetchImpl/baseUrl are injectable for testing.
export async function apiFetch<T>(
  path: string,
  options?: RequestInit,
  fetchImpl: typeof fetch = fetch,
  baseUrl: string = DEFAULT_BASE_URL,
): Promise<T> {
  const res = await fetchImpl(`${baseUrl}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = (data && data.error) || `Request failed (${res.status})`;
    throw new ApiError(message, res.status, data && data.details);
  }
  return data as T;
}

const jsonBody = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export const getHealth = () => apiFetch<Health>('/api/health');
export const getMarkets = () => apiFetch<Market[]>('/api/markets');

export const getComps = (city?: string, state?: string) => {
  const params = new URLSearchParams();
  if (city) params.append('city', city);
  if (state) params.append('state', state);
  const qs = params.toString();
  return apiFetch<Comp[]>(`/api/comps${qs ? `?${qs}` : ''}`);
};

export const getSellers = () => apiFetch<Seller[]>('/api/sellers');
export const createSeller = (body: NewSeller) => apiFetch<Seller>('/api/sellers', jsonBody(body));
export const updateSeller = (id: string, body: Partial<Seller>) =>
  apiFetch<{ success: boolean }>(`/api/sellers/${id}`, { method: 'PUT', body: JSON.stringify(body) });

export const getBuyers = () => apiFetch<Buyer[]>('/api/buyers');
export const createBuyer = (body: NewBuyer) => apiFetch<Buyer>('/api/buyers', jsonBody(body));

export const analyzeDeal = (body: DealInputs) => apiFetch<DealAnalysisResult>('/api/analyze-deal', jsonBody(body));
export const scoreSeller = (body: SellerScoreInput) => apiFetch<SellerScoreResult>('/api/score-seller', jsonBody(body));

export const getMarketTrends = (metro: string) => apiFetch<MarketTrend>(`/api/market-trends/${encodeURIComponent(metro)}`);
export const getNeighborhood = (zip: string) => apiFetch<Neighborhood>(`/api/neighborhood/${encodeURIComponent(zip)}`);
export const geocode = (address: string, city: string, state: string) => {
  const params = new URLSearchParams({ address, city, state });
  return apiFetch<GeocodeResult>(`/api/geocode?${params.toString()}`);
};
```

- [ ] **Step 5: Run to verify it passes**

```bash
npm test -- src/api/client.test.ts
```
Expected: PASS — 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/api/types.ts src/api/client.ts src/api/client.test.ts
git commit -m "feat: typed API client with shared types"
```

---

### Task 4: useAsync hook + state components

These are presentational/hook modules verified by `npm run build` (typecheck + bundle), since pure-logic-only test infra (node env) cannot render hooks/components.

**Files:**
- Create: `src/hooks/useAsync.ts`
- Create: `src/components/states.tsx`

- [ ] **Step 1: Create `src/hooks/useAsync.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T, A extends unknown[]> {
  data: T | null;
  loading: boolean;
  error: string | null;
  run: (...args: A) => Promise<T | undefined>;
  setData: (data: T | null) => void;
}

// Standardizes the loading/error/data lifecycle for an async function.
// Pass immediate=true to run once on mount (e.g. fetch-on-load views).
export function useAsync<T, A extends unknown[] = []>(
  fn: (...args: A) => Promise<T>,
  immediate = false,
): AsyncState<T, A> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(async (...args: A) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fnRef.current(...args);
      setData(result);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return undefined;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (immediate) run(...([] as unknown as A));
  }, [immediate, run]);

  return { data, loading, error, run, setData };
}
```

- [ ] **Step 2: Create `src/components/states.tsx`**

```tsx
interface LoadingProps { label?: string }
export function Loading({ label = 'Loading…' }: LoadingProps) {
  return (
    <div className="state-block loading-state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

interface ErrorBannerProps { message: string; onRetry?: () => void }
export function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div className="error-banner" role="alert">
      <span>⚠️ {message}</span>
      {onRetry && (
        <button type="button" className="ghost-button" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

interface EmptyProps { message: string }
export function Empty({ message }: EmptyProps) {
  return <div className="state-block empty-state">{message}</div>;
}
```

- [ ] **Step 3: Verify it typechecks and builds**

Run from the project root:
```bash
npm run build
```
Expected: build succeeds (tsc has no errors; vite emits `dist/`). The new modules are unused so far — that is fine; TypeScript does not error on unused exports.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useAsync.ts src/components/states.tsx
git commit -m "feat: add useAsync hook and Loading/Error/Empty components"
```

---

### Task 5: Restyle — design tokens, sidebar layout, state styles

Replace `src/styles.css` with a token-driven stylesheet. Keeps existing class names used by pages (`.panel`, `.form-grid`, `.market-grid`, `.seller-card`, `.status-badge`, `.results-card`, `.text-muted`, etc.) and adds the new app-shell + state classes.

**Files:**
- Modify (full replace): `src/styles.css`

- [ ] **Step 1: Replace the entire contents of `src/styles.css` with:**

```css
:root {
  /* color tokens */
  --bg: #eef1f8;
  --bg-gradient: radial-gradient(circle at top left, #e7ecfb 0%, #f1f4fb 45%, #eef1f8 100%);
  --surface: #ffffff;
  --surface-muted: #f7f9fc;
  --ink: #111827;
  --ink-soft: #6b7280;
  --line: #e5e7eb;
  --brand: #1f2937;
  --brand-ink: #f8fafc;
  --accent: #4f46e5;
  --accent-soft: #eef2ff;
  --good: #047857;
  --bad: #b91c1c;
  --warn: #92400e;

  /* spacing / shape */
  --space-1: 8px;
  --space-2: 12px;
  --space-3: 16px;
  --space-4: 24px;
  --radius-sm: 12px;
  --radius: 18px;
  --radius-lg: 24px;
  --shadow: 0 24px 60px rgba(15, 23, 42, 0.06);
  --sidebar-w: 248px;

  color: var(--ink);
  background: var(--bg);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  min-height: 100vh;
  background: var(--bg-gradient);
}

a { color: inherit; text-decoration: none; }

/* ---------- App shell (sidebar + content) ---------- */
.app-shell {
  display: grid;
  grid-template-columns: var(--sidebar-w) minmax(0, 1fr);
  min-height: 100vh;
}

.sidebar {
  position: sticky;
  top: 0;
  align-self: start;
  height: 100vh;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4) var(--space-3);
  background: var(--brand);
  color: var(--brand-ink);
}

.sidebar-brand {
  font-weight: 800;
  font-size: 1.15rem;
  letter-spacing: 0.02em;
  padding: 0 var(--space-2) var(--space-3);
}

.sidebar-nav { display: flex; flex-direction: column; gap: 4px; }

.nav-link {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 10px var(--space-2);
  border-radius: var(--radius-sm);
  color: #cbd5e1;
  font-size: 0.95rem;
  transition: background 0.15s, color 0.15s;
}
.nav-link:hover { background: rgba(255, 255, 255, 0.08); color: var(--brand-ink); }
.nav-link.active { background: var(--brand-ink); color: var(--brand); font-weight: 600; }

.sidebar-footer {
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2);
  font-size: 0.85rem;
  color: #cbd5e1;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
}
.status-dot { width: 9px; height: 9px; border-radius: 50%; background: #6b7280; }
.status-dot.online { background: #22c55e; }
.status-dot.offline { background: #ef4444; }

.app-main {
  padding: var(--space-4);
  max-width: 1200px;
  width: 100%;
}

/* ---------- Hero + panels ---------- */
.hero-panel {
  background: var(--brand);
  color: var(--brand-ink);
  padding: 28px;
  border-radius: var(--radius-lg);
  margin-bottom: 28px;
}
.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 0.76rem;
  opacity: 0.8;
  margin: 0 0 12px;
}
.hero-panel h1 { margin: 0; font-size: clamp(1.8rem, 3.5vw, 2.8rem); line-height: 1.05; }
.hero-panel p { margin: 16px 0 0; max-width: 680px; }

.layout-grid {
  display: grid;
  gap: var(--space-4);
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.layout-single { display: grid; gap: var(--space-4); grid-template-columns: 1fr; }

.panel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  box-shadow: var(--shadow);
}
.panel h2 { margin-top: 0; font-size: 1.2rem; }
.panel h3 { font-size: 1rem; margin: var(--space-3) 0 var(--space-2); }

/* ---------- Forms ---------- */
.form-grid { display: grid; gap: 18px; }
label { display: grid; gap: var(--space-1); font-size: 0.95rem; }

input, select, textarea {
  border: 1px solid #d1d5db;
  border-radius: 14px;
  padding: 12px 14px;
  font-size: 1rem;
  width: 100%;
  font-family: inherit;
  background: var(--surface);
  color: var(--ink);
}
input:focus, select:focus, textarea:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
textarea { min-height: 80px; resize: vertical; }

button {
  background: var(--brand);
  color: var(--brand-ink);
  border: none;
  border-radius: 14px;
  padding: 12px 16px;
  font-size: 1rem;
  cursor: pointer;
  transition: background 0.2s;
}
button:hover { background: #374151; }
button:disabled { opacity: 0.6; cursor: not-allowed; }

.ghost-button {
  background: transparent;
  color: inherit;
  border: 1px solid currentColor;
  padding: 6px 12px;
  font-size: 0.85rem;
}
.ghost-button:hover { background: rgba(0, 0, 0, 0.05); }

/* ---------- Results / cards ---------- */
.results-card {
  margin-top: var(--space-4);
  padding: 20px;
  border-radius: var(--radius);
  background: var(--surface-muted);
  border: 1px solid var(--line);
}
.results-card p { margin: 0 0 var(--space-2); line-height: 1.6; }
.ai-output { white-space: pre-wrap; font-size: 0.95rem; line-height: 1.6; }
.good-deal { color: var(--good); font-weight: 600; }
.bad-deal { color: var(--bad); font-weight: 600; }

.market-list, .comp-list, .rehab-list, .seller-list, .buyer-list, .property-list {
  display: grid; gap: var(--space-3);
}
.market-card, .comp-card, .rehab-card, .seller-card, .buyer-card, .property-card {
  padding: 18px;
  border-radius: var(--radius);
  background: var(--surface-muted);
  border: 1px solid var(--line);
}
.rehab-card { display: flex; justify-content: space-between; align-items: center; }
.comp-address, .property-card h4 { font-weight: 700; margin-bottom: var(--space-1); }
.property-price { font-size: 1.2rem; font-weight: 700; color: var(--good); }

.market-grid {
  display: grid; gap: var(--space-3);
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
}
.market-heat-card {
  border-left: 4px solid #dc2626;
  padding: 18px;
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  border-right: 1px solid var(--line);
}
.heat-header { display: flex; justify-content: space-between; align-items: start; gap: var(--space-2); margin-bottom: var(--space-2); }
.heat-header h3 { margin: 0; font-size: 1.1rem; }
.heat-score { padding: 6px 12px; border-radius: 8px; color: #fff; font-weight: 700; font-size: 0.9rem; min-width: 50px; text-align: center; }

.kpi-grid { display: grid; gap: var(--space-3); grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); }
.kpi {
  padding: 18px;
  border-radius: var(--radius);
  background: var(--surface-muted);
  border: 1px solid var(--line);
}
.kpi-label { color: var(--ink-soft); font-size: 0.85rem; margin: 0 0 6px; }
.kpi-value { font-size: 1.5rem; font-weight: 700; margin: 0; }

.seller-header { display: flex; justify-content: space-between; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2); }
.status-badge { padding: 6px 12px; border-radius: 8px; border: 1px solid #d1d5db; font-size: 0.85rem; }
.status-badge.new { background: #dbeafe; color: #1e40af; }
.status-badge.contacted { background: #fef3c7; color: var(--warn); }
.status-badge.negotiating { background: #f3e8ff; color: #6b21a8; }
.status-badge.deal { background: #dcfce7; color: #166534; }
.status-badge.lost { background: #fee2e2; color: #991b1b; }

.text-muted { color: var(--ink-soft); font-size: 0.9rem; }
.section-hint { color: var(--ink-soft); font-size: 0.9rem; margin: 0 0 var(--space-3); }
.reference-section { margin-top: var(--space-3); }

.data-table { width: 100%; border-collapse: collapse; }
.data-table th { text-align: left; padding: 8px; border-bottom: 1px solid var(--line); }
.data-table td { padding: 8px; border-bottom: 1px solid #f3f4f6; }
.data-table td.num { text-align: right; }

/* ---------- State blocks ---------- */
.state-block {
  padding: 20px;
  border-radius: var(--radius);
  text-align: center;
  color: var(--ink-soft);
}
.loading-state { display: flex; align-items: center; justify-content: center; gap: var(--space-2); }
.empty-state { background: var(--surface-muted); border: 1px dashed var(--line); }
.spinner {
  width: 18px; height: 18px;
  border: 2px solid var(--line);
  border-top-color: var(--accent);
  border-radius: 50%;
  display: inline-block;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.error-banner {
  display: flex; align-items: center; justify-content: space-between; gap: var(--space-2);
  padding: 12px 16px;
  border-radius: var(--radius-sm);
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: var(--bad);
  margin: var(--space-3) 0;
}

/* ---------- Responsive ---------- */
@media (max-width: 960px) {
  .app-shell { grid-template-columns: 1fr; }
  .sidebar {
    position: static;
    height: auto;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    overflow-x: auto;
  }
  .sidebar-brand { padding: 0 var(--space-2) 0 0; }
  .sidebar-nav { flex-direction: row; flex-wrap: wrap; }
  .sidebar-footer { margin: 0 0 0 auto; border-top: none; padding: 0; }
  .layout-grid { grid-template-columns: 1fr; }
  .market-grid { grid-template-columns: 1fr; }
}
```

- [ ] **Step 2: Verify it builds**

```bash
npm run build
```
Expected: build succeeds (CSS is not type-checked, but confirm no build error).

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "style: token-driven stylesheet with sidebar layout and state styles"
```

---

### Task 6: Router, AppLayout (sidebar), and extracted Dashboard/Calculator

**Files:**
- Create: `src/components/AppLayout.tsx`
- Create: `src/pages/Dashboard.tsx`
- Create: `src/pages/Calculator.tsx`
- Modify (full replace): `src/App.tsx`
- Modify (full replace): `src/main.tsx`

- [ ] **Step 1: Create `src/components/AppLayout.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { getHealth } from '../api/client';

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/calculator', label: 'Calculator' },
  { to: '/markets', label: 'Markets' },
  { to: '/properties', label: 'Properties' },
  { to: '/sellers', label: 'Sellers' },
  { to: '/buyers', label: 'Buyers' },
  { to: '/ai', label: 'AI Analyzer' },
  { to: '/research', label: 'Advanced Research' },
];

export function AppLayout() {
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    getHealth()
      .then(() => active && setOnline(true))
      .catch(() => active && setOnline(false));
    return () => { active = false; };
  }, []);

  const dotClass = online === null ? '' : online ? 'online' : 'offline';
  const statusLabel = online === null ? 'Checking…' : online ? 'API online' : 'API offline';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">WI Lab</div>
        <nav className="sidebar-nav">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className={`status-dot ${dotClass}`} />
          <span>{statusLabel}</span>
        </div>
      </aside>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/pages/Calculator.tsx`** (the full calculator, extracted from `App.tsx`, using the deal util)

```tsx
import { useMemo, useState } from 'react';
import { calculateWholesaleDeal, formatCurrency, type DealInputs } from '../lib/deal';

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

- [ ] **Step 3: Create `src/pages/Dashboard.tsx`** (wired to live markets via the client)

```tsx
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { calculateWholesaleDeal, formatCurrency, type DealInputs } from '../lib/deal';
import { getMarkets } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorBanner } from '../components/states';
import type { Market } from '../api/types';

const QUICK_FIELDS: { label: string; key: keyof DealInputs }[] = [
  { label: 'Purchase price', key: 'purchasePrice' },
  { label: 'Repair budget', key: 'repairBudget' },
  { label: 'ARV', key: 'arv' },
  { label: 'Selling costs', key: 'sellingCosts' },
];

export function Dashboard() {
  const [inputs, setInputs] = useState<DealInputs>({
    purchasePrice: 120000, repairBudget: 22000, arv: 185000,
    sellingCosts: 12000, holdingCosts: 3000, wholesaleFee: 10000,
  });
  const results = useMemo(() => calculateWholesaleDeal(inputs), [inputs]);
  const markets = useAsync<Market[]>(getMarkets, true);

  return (
    <>
      <header className="hero-panel">
        <p className="eyebrow">Wholesale research and deal analyzer</p>
        <h1>Wholesale Intelligence Lab</h1>
        <p>Input your numbers, compare comps, and evaluate deals across hot U.S. markets.</p>
      </header>

      <div className="layout-grid">
        <section className="panel">
          <h2>Quick calculator</h2>
          <div className="form-grid">
            {QUICK_FIELDS.map((field) => (
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
            <p><strong>Profit:</strong> {formatCurrency(results.profit)}</p>
            <p className={results.profit >= 0 ? 'good-deal' : 'bad-deal'}>
              {results.profit >= 0 ? '✓ Good deal' : '✗ Review'}
            </p>
          </div>
          <Link to="/calculator"><button style={{ marginTop: 16, width: '100%' }}>Full calculator</button></Link>
        </section>

        <section className="panel">
          <h2>Hot markets</h2>
          {markets.loading && <Loading label="Loading markets…" />}
          {markets.error && <ErrorBanner message={markets.error} onRetry={() => markets.run()} />}
          {markets.data && (
            <div className="market-list">
              {markets.data.slice(0, 3).map((m) => (
                <div key={m.id} className="market-card">
                  <strong>{m.city}, {m.state}</strong>
                  <p>Heat: {m.heat_score}</p>
                  <p>{m.trend}</p>
                </div>
              ))}
            </div>
          )}
          <Link to="/markets"><button style={{ marginTop: 16, width: '100%' }}>View all markets</button></Link>
        </section>

        <section className="panel">
          <h2>Team</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            <Link to="/sellers"><button style={{ width: '100%' }}>Manage sellers</button></Link>
            <Link to="/buyers"><button style={{ width: '100%' }}>Buyer directory</button></Link>
          </div>
        </section>

        <section className="panel">
          <h2>AI &amp; Research</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            <Link to="/ai"><button style={{ width: '100%' }}>AI deal analyzer</button></Link>
            <Link to="/research"><button style={{ width: '100%' }}>Advanced research</button></Link>
          </div>
        </section>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Replace the entire contents of `src/App.tsx` with the router:**

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
        <Route path="ai" element={<AIAnalyzer />} />
        <Route path="research" element={<AdvancedResearch />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
```

- [ ] **Step 5: Replace the entire contents of `src/main.tsx` with:**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
```

- [ ] **Step 6: Build**

Run from the project root:
```bash
npm run build
```
Expected: build succeeds. NOTE: `MarketHeatmap`, `PropertySearch`, `SellerLeadManager`, `BuyerDirectory`, `AIAnalyzer`, `AdvancedResearch` still export the same named components and still render their own `page-shell` wrapper — that is fine for this task (they will be cleaned up in Tasks 7-8). As long as their named exports exist, the build passes. If any page still default-exports or has a different export name, only fix the export to a named export matching App.tsx; do NOT refactor page internals in this task.

- [ ] **Step 7: Commit**

```bash
git add src/components/AppLayout.tsx src/pages/Dashboard.tsx src/pages/Calculator.tsx src/App.tsx src/main.tsx
git commit -m "feat: sidebar layout + router; extract Dashboard and Calculator pages"
```

---

### Task 7: Refactor data pages (Sellers, Buyers, Markets, Properties)

Each page: use the typed client, the `useAsync` hook, and the state components; drop the outer `page-shell` wrapper (the layout provides the shell); auto-load list data on mount; remove hardcoded URLs and inline styles where reasonable.

**Files:**
- Modify (full replace): `src/pages/SellerLeadManager.tsx`
- Modify (full replace): `src/pages/BuyerDirectory.tsx`
- Modify (full replace): `src/pages/MarketHeatmap.tsx`
- Modify (full replace): `src/pages/PropertySearch.tsx`

- [ ] **Step 1: Replace `src/pages/SellerLeadManager.tsx` with:**

```tsx
import { useState } from 'react';
import { getSellers, createSeller, updateSeller } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorBanner, Empty } from '../components/states';
import type { Seller, NewSeller } from '../api/types';

const EMPTY: NewSeller = {
  name: '', phone: '', email: '', property_address: '', property_city: '', property_state: '', motivation: '',
};

export function SellerLeadManager() {
  const list = useAsync<Seller[]>(getSellers, true);
  const [form, setForm] = useState<NewSeller>(EMPTY);
  const [saveError, setSaveError] = useState<string | null>(null);

  const sellers = list.data ?? [];

  const handleAdd = async () => {
    if (!form.name) return;
    setSaveError(null);
    try {
      const created = await createSeller(form);
      list.setData([created, ...sellers]);
      setForm(EMPTY);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleStatus = async (id: string, status: string) => {
    const seller = sellers.find((s) => s.id === id);
    if (!seller) return;
    list.setData(sellers.map((s) => (s.id === id ? { ...s, status } : s)));
    try {
      await updateSeller(id, { ...seller, status });
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <header className="hero-panel">
        <h1>Seller Lead Manager</h1>
        <p>Track and manage off-market seller leads and opportunities.</p>
      </header>

      <div className="layout-single">
        <section className="panel">
          <h2>Add new seller</h2>
          <div className="form-grid">
            <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input type="tel" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <input placeholder="Property address" value={form.property_address} onChange={(e) => setForm({ ...form, property_address: e.target.value })} />
            <input placeholder="City" value={form.property_city} onChange={(e) => setForm({ ...form, property_city: e.target.value })} />
            <input placeholder="State" value={form.property_state} onChange={(e) => setForm({ ...form, property_state: e.target.value })} />
            <textarea placeholder="Motivation (pre-foreclosure, relocation, etc.)" value={form.motivation} onChange={(e) => setForm({ ...form, motivation: e.target.value })} />
            <button onClick={handleAdd} disabled={!form.name}>Add seller</button>
          </div>
          {saveError && <ErrorBanner message={saveError} />}
        </section>

        <section className="panel">
          <h2>Active leads ({sellers.length})</h2>
          {list.loading && <Loading label="Loading leads…" />}
          {list.error && <ErrorBanner message={list.error} onRetry={() => list.run()} />}
          {!list.loading && !list.error && sellers.length === 0 && <Empty message="No seller leads yet. Add one above." />}
          <div className="seller-list">
            {sellers.map((seller) => (
              <div key={seller.id} className="seller-card">
                <div className="seller-header">
                  <strong>{seller.name}</strong>
                  <select value={seller.status} onChange={(e) => handleStatus(seller.id, e.target.value)} className={`status-badge ${seller.status}`}>
                    <option value="new">New</option>
                    <option value="contacted">Contacted</option>
                    <option value="negotiating">Negotiating</option>
                    <option value="deal">Deal Made</option>
                    <option value="lost">Lost</option>
                  </select>
                </div>
                {seller.email && <p>{seller.email}</p>}
                {seller.phone && <p>{seller.phone}</p>}
                <p>📍 {seller.property_address}, {seller.property_city}, {seller.property_state}</p>
                {seller.motivation && <p>Motivation: {seller.motivation}</p>}
                <p className="text-muted">Added: {new Date(seller.created_at).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Replace `src/pages/BuyerDirectory.tsx` with:**

```tsx
import { useState } from 'react';
import { getBuyers, createBuyer } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorBanner, Empty } from '../components/states';
import { formatCurrency } from '../lib/deal';
import type { Buyer, NewBuyer } from '../api/types';

const EMPTY: NewBuyer = {
  name: '', phone: '', email: '', cash_available: 0, deal_types: '', preferred_areas: '', avg_deal_size: 0,
};

export function BuyerDirectory() {
  const list = useAsync<Buyer[]>(getBuyers, true);
  const [form, setForm] = useState<NewBuyer>(EMPTY);
  const [saveError, setSaveError] = useState<string | null>(null);

  const buyers = list.data ?? [];

  const handleAdd = async () => {
    if (!form.name) return;
    setSaveError(null);
    try {
      const created = await createBuyer(form);
      list.setData([created, ...buyers]);
      setForm(EMPTY);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <header className="hero-panel">
        <h1>Buyer Directory</h1>
        <p>Connect with cash buyers and investors for assignment opportunities.</p>
      </header>

      <div className="layout-single">
        <section className="panel">
          <h2>Add buyer</h2>
          <div className="form-grid">
            <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input type="tel" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <input type="number" placeholder="Cash available" value={form.cash_available} onChange={(e) => setForm({ ...form, cash_available: Number(e.target.value) })} />
            <input placeholder="Deal types (flip, rental, etc.)" value={form.deal_types} onChange={(e) => setForm({ ...form, deal_types: e.target.value })} />
            <input placeholder="Preferred areas" value={form.preferred_areas} onChange={(e) => setForm({ ...form, preferred_areas: e.target.value })} />
            <input type="number" placeholder="Average deal size" value={form.avg_deal_size} onChange={(e) => setForm({ ...form, avg_deal_size: Number(e.target.value) })} />
            <button onClick={handleAdd} disabled={!form.name}>Add buyer</button>
          </div>
          {saveError && <ErrorBanner message={saveError} />}
        </section>

        <section className="panel">
          <h2>Active buyers ({buyers.length})</h2>
          {list.loading && <Loading label="Loading buyers…" />}
          {list.error && <ErrorBanner message={list.error} onRetry={() => list.run()} />}
          {!list.loading && !list.error && buyers.length === 0 && <Empty message="No buyers yet. Add one above." />}
          <div className="buyer-list">
            {buyers.map((buyer) => (
              <div key={buyer.id} className="buyer-card">
                <strong>{buyer.name}</strong>
                <p>{buyer.email} · {buyer.phone}</p>
                <p>💰 {formatCurrency(buyer.cash_available)}</p>
                <p>Deal types: {buyer.deal_types}</p>
                <p>Areas: {buyer.preferred_areas}</p>
                <p>Avg deal: {formatCurrency(buyer.avg_deal_size)}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Replace `src/pages/MarketHeatmap.tsx` with:** (auto-loads on mount)

```tsx
import { getMarkets } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorBanner, Empty } from '../components/states';
import type { Market } from '../api/types';

function heatColor(score: number) {
  if (score >= 80) return '#dc2626';
  if (score >= 70) return '#f97316';
  if (score >= 60) return '#eab308';
  return '#22c55e';
}

export function MarketHeatmap() {
  const markets = useAsync<Market[]>(getMarkets, true);
  const data = markets.data ?? [];

  return (
    <>
      <header className="hero-panel">
        <h1>Market Heatmap</h1>
        <p>Discover the hottest real estate markets in the USA ranked by investment potential.</p>
      </header>

      <div className="layout-single">
        <section className="panel">
          {markets.loading && <Loading label="Loading markets…" />}
          {markets.error && <ErrorBanner message={markets.error} onRetry={() => markets.run()} />}
          {!markets.loading && !markets.error && data.length === 0 && <Empty message="No market data available." />}
          <div className="market-grid">
            {data.map((market) => (
              <div key={market.id} className="market-heat-card" style={{ borderLeftColor: heatColor(market.heat_score) }}>
                <div className="heat-header">
                  <h3>{market.city}, {market.state}</h3>
                  <div className="heat-score" style={{ backgroundColor: heatColor(market.heat_score) }}>{market.heat_score}</div>
                </div>
                <p><strong>Trend:</strong> {market.trend}</p>
                <p><strong>Avg rent:</strong> ${market.avg_rent.toLocaleString()}</p>
                <p><strong>Avg home price:</strong> ${(market.avg_home_price / 1000).toFixed(0)}k</p>
                <p><strong>Days on market:</strong> {market.days_on_market}</p>
                <p><strong>Inventory:</strong> {market.inventory_level}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Replace `src/pages/PropertySearch.tsx` with:** (searches comps by city/state via the client; applies price/beds filters client-side)

```tsx
import { useState } from 'react';
import { getComps } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorBanner, Empty } from '../components/states';
import type { Comp } from '../api/types';

export function PropertySearch() {
  const search = useAsync<Comp[], [string | undefined, string | undefined]>(getComps);
  const [filters, setFilters] = useState({ city: '', state: '', maxPrice: 500000, minBeds: 0 });
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    setSearched(true);
    await search.run(filters.city || undefined, filters.state || undefined);
  };

  const results = (search.data ?? []).filter(
    (p) => p.price <= filters.maxPrice && p.beds >= filters.minBeds,
  );

  return (
    <>
      <header className="hero-panel">
        <h1>Property Search</h1>
        <p>Find comps, analyze neighborhoods, and identify investment opportunities.</p>
      </header>

      <div className="layout-single">
        <section className="panel">
          <h2>Search comps</h2>
          <div className="form-grid">
            <input placeholder="City" value={filters.city} onChange={(e) => setFilters({ ...filters, city: e.target.value })} />
            <input placeholder="State" value={filters.state} onChange={(e) => setFilters({ ...filters, state: e.target.value })} />
            <label>
              <span>Max price: ${(filters.maxPrice / 1000).toFixed(0)}k</span>
              <input type="range" min={50000} max={1000000} step={10000} value={filters.maxPrice} onChange={(e) => setFilters({ ...filters, maxPrice: Number(e.target.value) })} />
            </label>
            <label>
              <span>Min beds</span>
              <select value={filters.minBeds} onChange={(e) => setFilters({ ...filters, minBeds: Number(e.target.value) })}>
                <option value={0}>Any</option>
                <option value={2}>2+</option>
                <option value={3}>3+</option>
                <option value={4}>4+</option>
              </select>
            </label>
            <button onClick={handleSearch} style={{ gridColumn: '1 / -1' }}>Search</button>
          </div>
        </section>

        {searched && (
          <section className="panel">
            <h2>Results ({results.length})</h2>
            {search.loading && <Loading label="Searching…" />}
            {search.error && <ErrorBanner message={search.error} onRetry={handleSearch} />}
            {!search.loading && !search.error && results.length === 0 && <Empty message="No properties match your filters." />}
            <div className="property-list">
              {results.map((prop) => (
                <div key={prop.id} className="property-card">
                  <h4>{prop.address}</h4>
                  <p>{prop.city}, {prop.state}</p>
                  <p className="property-price">${prop.price.toLocaleString()}</p>
                  <p>{prop.beds} bed · {prop.baths} bath · {prop.sqft.toLocaleString()} sqft</p>
                  <p>${prop.price_per_sqft}/sqft</p>
                  <p className="text-muted">Sold {prop.sold_date}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 5: Build**

```bash
npm run build
```
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/pages/SellerLeadManager.tsx src/pages/BuyerDirectory.tsx src/pages/MarketHeatmap.tsx src/pages/PropertySearch.tsx
git commit -m "refactor: data pages use typed client, useAsync, and state components"
```

---

### Task 8: Refactor AIAnalyzer + AdvancedResearch; final verification

**Files:**
- Modify (full replace): `src/pages/AIAnalyzer.tsx`
- Modify (full replace): `src/pages/AdvancedResearch.tsx`

- [ ] **Step 1: Replace `src/pages/AIAnalyzer.tsx` with:**

```tsx
import { useState } from 'react';
import { analyzeDeal, scoreSeller } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorBanner } from '../components/states';
import type { DealInputs, DealAnalysisResult, SellerScoreInput, SellerScoreResult } from '../api/types';

export function AIAnalyzer() {
  const [deal, setDeal] = useState<DealInputs>({
    purchasePrice: 120000, repairBudget: 22000, arv: 185000,
    sellingCosts: 12000, holdingCosts: 3000, wholesaleFee: 10000,
  });
  const analysis = useAsync<DealAnalysisResult, [DealInputs]>(analyzeDeal);

  const [seller, setSeller] = useState<SellerScoreInput>({ name: '', status: 'new' });
  const scoring = useAsync<SellerScoreResult, [SellerScoreInput]>(scoreSeller);

  const dealFields: { label: string; key: keyof DealInputs }[] = [
    { label: 'Purchase price', key: 'purchasePrice' },
    { label: 'Repair budget', key: 'repairBudget' },
    { label: 'ARV', key: 'arv' },
    { label: 'Selling costs', key: 'sellingCosts' },
    { label: 'Holding costs', key: 'holdingCosts' },
    { label: 'Wholesale fee', key: 'wholesaleFee' },
  ];

  const analysisResult = analysis.data;
  const scoreResult = scoring.data;

  return (
    <>
      <header className="hero-panel">
        <h1>AI Deal Analyzer</h1>
        <p>Get instant AI-powered insights on deals and seller leads using Groq's fastest AI.</p>
      </header>

      <div className="layout-single">
        <section className="panel">
          <h2>Deal Analysis (AI-Powered)</h2>
          <div className="form-grid">
            {dealFields.map((f) => (
              <label key={f.key}>
                <span>{f.label}</span>
                <input type="number" value={deal[f.key]} onChange={(e) => setDeal({ ...deal, [f.key]: Number(e.target.value) })} />
              </label>
            ))}
          </div>
          <button onClick={() => analysis.run(deal)} disabled={analysis.loading} style={{ marginTop: 16, width: '100%' }}>
            {analysis.loading ? 'Analyzing with AI…' : 'Analyze Deal with AI'}
          </button>
          {analysis.loading && <Loading label="Asking the model…" />}
          {analysis.error && <ErrorBanner message={analysis.error} onRetry={() => analysis.run(deal)} />}
          {analysisResult && (
            <div className="results-card">
              {analysisResult.success ? (
                <>
                  <p className="text-muted">Model: {analysisResult.model}</p>
                  <div className="ai-output">{analysisResult.analysis}</div>
                </>
              ) : (
                <p className="bad-deal">Error: {analysisResult.error}</p>
              )}
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Seller Lead Scoring</h2>
          <p className="section-hint">Score a prospect from your seller leads.</p>
          <div className="form-grid">
            <input placeholder="Seller name" value={seller.name} onChange={(e) => setSeller({ ...seller, name: e.target.value })} />
            <input placeholder="Property address" onChange={(e) => setSeller({ ...seller, property_address: e.target.value })} />
            <input placeholder="City" onChange={(e) => setSeller({ ...seller, property_city: e.target.value })} />
            <input placeholder="State" onChange={(e) => setSeller({ ...seller, property_state: e.target.value })} />
            <textarea placeholder="Motivation (pre-foreclosure, relocation, divorce, etc.)" onChange={(e) => setSeller({ ...seller, motivation: e.target.value })} style={{ gridColumn: '1 / -1' }} />
            <select value={seller.status} onChange={(e) => setSeller({ ...seller, status: e.target.value })} style={{ gridColumn: '1 / -1' }}>
              <option value="new">Status: New</option>
              <option value="contacted">Status: Contacted</option>
              <option value="negotiating">Status: Negotiating</option>
            </select>
          </div>
          <button onClick={() => scoring.run(seller)} disabled={scoring.loading || !seller.name} style={{ marginTop: 16, width: '100%' }}>
            {scoring.loading ? 'Scoring…' : 'Score This Lead'}
          </button>
          {scoring.error && <ErrorBanner message={scoring.error} onRetry={() => scoring.run(seller)} />}
          {scoreResult && (
            <div className="results-card">
              {scoreResult.success ? (
                <div className="ai-output">{scoreResult.scoring}</div>
              ) : (
                <p className="bad-deal">Error: {scoreResult.error}</p>
              )}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Replace `src/pages/AdvancedResearch.tsx` with:**

```tsx
import { useState } from 'react';
import { getMarketTrends, getNeighborhood, geocode } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorBanner } from '../components/states';
import type { MarketTrend, Neighborhood, GeocodeResult } from '../api/types';

const METROS = ['Atlanta', 'Phoenix', 'Dallas', 'Denver', 'Tampa', 'Charlotte', 'Austin', 'Nashville'];

export function AdvancedResearch() {
  const [metro, setMetro] = useState('Atlanta');
  const trends = useAsync<MarketTrend, [string]>(getMarketTrends);

  const [zip, setZip] = useState('30303');
  const demo = useAsync<Neighborhood, [string]>(getNeighborhood);

  const [addr, setAddr] = useState({ address: '', city: '', state: '' });
  const geo = useAsync<GeocodeResult, [string, string, string]>(geocode);

  const trend = trends.data;
  const neighborhood = demo.data;
  const geocoded = geo.data;

  return (
    <>
      <header className="hero-panel">
        <h1>Advanced Market Research</h1>
        <p>Dive deep into market trends, neighborhood data, and property locations using live government APIs.</p>
      </header>

      <div className="layout-single">
        <section className="panel">
          <h2>Market Trends (FRED Data)</h2>
          <p className="section-hint">Quarterly price trends powered by Federal Reserve Economic Data.</p>
          <div className="form-grid">
            <label>
              <span>Select Metro Area</span>
              <select value={metro} onChange={(e) => setMetro(e.target.value)}>
                {METROS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <button onClick={() => trends.run(metro)} disabled={trends.loading} style={{ gridColumn: '1 / -1' }}>
              {trends.loading ? 'Loading…' : 'Get Market Trends'}
            </button>
          </div>
          {trends.loading && <Loading />}
          {trends.error && <ErrorBanner message={trends.error} onRetry={() => trends.run(metro)} />}
          {trend && (
            <div className="results-card">
              {trend.success === false || trend.error ? (
                <p className="bad-deal">Error: {trend.error}</p>
              ) : (
                <>
                  <p><strong>{trend.metro} Market Trends</strong></p>
                  <p className="text-muted">Series ID: {trend.series_id}</p>
                  {trend.observations && trend.observations.length > 0 ? (
                    <table className="data-table">
                      <thead><tr><th>Date</th><th className="num">% Change</th></tr></thead>
                      <tbody>
                        {trend.observations.slice(0, 10).map((obs, i) => (
                          <tr key={i}>
                            <td>{obs.date}</td>
                            <td className="num" style={{ color: parseFloat(obs.value) > 0 ? '#047857' : '#b91c1c' }}>{obs.value}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-muted">No data available</p>
                  )}
                </>
              )}
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Neighborhood Demographics (Census API)</h2>
          <p className="section-hint">Population, income, and poverty data by zip code.</p>
          <div className="form-grid">
            <label>
              <span>ZIP Code</span>
              <input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="e.g., 30303" />
            </label>
            <button onClick={() => demo.run(zip)} disabled={demo.loading}>{demo.loading ? 'Loading…' : 'Get Demographics'}</button>
          </div>
          {demo.loading && <Loading />}
          {demo.error && <ErrorBanner message={demo.error} onRetry={() => demo.run(zip)} />}
          {neighborhood && (
            <div className="results-card">
              {neighborhood.success === false || neighborhood.error ? (
                <p className="bad-deal">Error: {neighborhood.error}</p>
              ) : (
                <>
                  <p><strong>ZIP Code {neighborhood.zipCode}</strong></p>
                  <p>Population: {neighborhood.population?.toLocaleString() ?? 'N/A'}</p>
                  <p>Median Income: ${neighborhood.medianIncome?.toLocaleString() ?? 'N/A'}</p>
                  <p>Poverty Rate: {neighborhood.povertyRate ?? 'N/A'}%</p>
                </>
              )}
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Geocode Address</h2>
          <p className="section-hint">Convert addresses to coordinates (powered by OpenStreetMap).</p>
          <div className="form-grid">
            <input placeholder="Address" value={addr.address} onChange={(e) => setAddr({ ...addr, address: e.target.value })} />
            <input placeholder="City" value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} />
            <input placeholder="State" value={addr.state} onChange={(e) => setAddr({ ...addr, state: e.target.value })} />
            <button onClick={() => geo.run(addr.address, addr.city, addr.state)} disabled={geo.loading || !addr.address} style={{ gridColumn: '1 / -1' }}>
              {geo.loading ? 'Geocoding…' : 'Geocode Address'}
            </button>
          </div>
          {geo.loading && <Loading />}
          {geo.error && <ErrorBanner message={geo.error} onRetry={() => geo.run(addr.address, addr.city, addr.state)} />}
          {geocoded && (
            <div className="results-card">
              {geocoded.success === false || geocoded.error ? (
                <p className="bad-deal">Error: {geocoded.error}</p>
              ) : (
                <>
                  <p><strong>Address:</strong> {geocoded.address}</p>
                  <p><strong>Latitude:</strong> {geocoded.latitude}</p>
                  <p><strong>Longitude:</strong> {geocoded.longitude}</p>
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Full build + unit tests**

Run from the project root:
```bash
npm run build
npm test
```
Expected: build succeeds with zero TypeScript errors; all vitest tests pass.

- [ ] **Step 4: Live click-through verification**

Start the backend and frontend, then verify in a browser (or via the run/verify skill):
```bash
# terminal 1
cd backend && node src/server.js
# terminal 2 (project root)
npm run dev
```
Confirm:
- The sidebar is present on EVERY page and navigating between pages keeps it (the original nav bug is gone).
- Dashboard "Hot markets" loads live data (shows a loading state then markets).
- Markets page auto-loads; Sellers/Buyers show an empty state then accept a new record; Property search returns comps.
- The API status dot in the sidebar shows "online" when the backend is up.

- [ ] **Step 5: Commit**

```bash
git add src/pages/AIAnalyzer.tsx src/pages/AdvancedResearch.tsx
git commit -m "refactor: AI + research pages use typed client and state components"
```

---

## Phase 3 Verification (Definition of Done)

- [ ] `npm run build` succeeds with zero TypeScript errors.
- [ ] `npm test` passes all vitest tests (deal math + API client).
- [ ] A persistent sidebar appears on every route; sub-pages no longer lose navigation.
- [ ] No `http://localhost:5000` string remains in `src/` (all HTTP goes through `src/api/client.ts`).
- [ ] Every data view shows loading, error (with retry), and empty states as appropriate.
- [ ] Sellers and Buyers auto-load existing records on mount; Markets auto-loads.
- [ ] Dashboard "Hot markets" is wired to live backend data (no hardcoded market array).
- [ ] The restyle is token-driven (`:root` CSS variables) and visually cohesive.
