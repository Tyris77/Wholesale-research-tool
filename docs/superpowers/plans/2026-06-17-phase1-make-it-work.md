# Phase 1 — Make It Work: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the four broken backend integrations (Groq AI, FRED market data, property comps, geocoding) so the existing features actually return real data.

**Architecture:** Each integration function is refactored to accept an injectable dependency (a Groq client or a `fetchFn`) defaulting to the real one. This makes every function testable without network access. Tests use Node's built-in test runner with injected fakes. No behavior depends on real API keys at test time.

**Tech Stack:** Node 20 (ESM), Express, `groq-sdk`, Node built-in `node:test` + `node:assert`, `fetch` (global in Node 20).

**Scope note:** This plan covers Phase 1 only. Phases 2–4 (hardening, UX polish, new features) get their own plans, written after Phase 1 is verified working.

---

### Task 0: Initialize version control and test runner

**Files:**
- Create: `.gitignore` (verify exists; project root already has one)
- Modify: `backend/package.json`

- [ ] **Step 1: Initialize git at project root**

Run from `C:\Users\tyris\Desktop\wholesale-research-tool`:
```bash
git init
git add -A
git commit -m "chore: baseline before Phase 1 fixes"
```
Expected: a commit is created. If `git init` reports already initialized, skip to `git add -A`.

- [ ] **Step 2: Confirm node_modules and env are ignored**

Verify `.gitignore` at project root contains `node_modules` and `backend/.env`. If `backend/.env` is not ignored, add these lines to `.gitignore`:
```
backend/.env
backend/node_modules
```
Then run:
```bash
git rm -r --cached backend/.env 2>/dev/null; git status
```
Expected: `backend/.env` no longer staged/tracked.

- [ ] **Step 3: Add the test script**

In `backend/package.json`, replace the `scripts` block with:
```json
  "scripts": {
    "dev": "node src/server.js",
    "start": "node src/server.js",
    "test": "node --test"
  },
```

- [ ] **Step 4: Verify the test runner works**

Run from `backend/`:
```bash
npm test
```
Expected: exits 0 with "tests 0 / pass 0" (no test files yet). This confirms the runner is wired.

- [ ] **Step 5: Commit**

```bash
git add backend/package.json .gitignore
git commit -m "chore: add node:test runner and test script"
```

---

### Task 1: Fix the Groq AI service

The current `analyzeDealWithAI`/`scoreSeller` use `client.messages.create(...)` (Anthropic shape) and read `message.content[0]`. Groq uses `client.chat.completions.create(...)` returning `choices[0].message.content`. The model `mixtral-8x7b-32768` is retired; use `llama-3.3-70b-versatile`.

**Files:**
- Modify: `backend/src/ai-service.js`
- Test: `backend/src/ai-service.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/src/ai-service.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDealWithAI, scoreSeller } from './ai-service.js';

const DEAL = {
  purchasePrice: 120000, repairBudget: 22000, arv: 185000,
  sellingCosts: 12000, holdingCosts: 3000, wholesaleFee: 10000,
};

function fakeClient(captured) {
  return {
    chat: {
      completions: {
        create: async (args) => {
          captured.args = args;
          return { choices: [{ message: { content: 'YES. Strong deal.' } }] };
        },
      },
    },
  };
}

test('analyzeDealWithAI returns analysis text from Groq chat completion', async () => {
  const captured = {};
  const result = await analyzeDealWithAI(DEAL, fakeClient(captured));
  assert.equal(result.success, true);
  assert.equal(result.analysis, 'YES. Strong deal.');
  assert.equal(captured.args.model, 'llama-3.3-70b-versatile');
  assert.equal(captured.args.messages[0].role, 'user');
});

test('analyzeDealWithAI returns error when no client configured', async () => {
  const result = await analyzeDealWithAI(DEAL, null);
  assert.equal(result.success, false);
  assert.match(result.error, /GROQ_API_KEY/);
});

test('scoreSeller returns scoring text from Groq chat completion', async () => {
  const captured = {};
  const seller = { name: 'Jane', property_address: '1 Main', property_city: 'Atlanta', property_state: 'GA', motivation: 'Divorce', status: 'new' };
  const result = await scoreSeller(seller, fakeClient(captured));
  assert.equal(result.success, true);
  assert.equal(result.scoring, 'YES. Strong deal.');
  assert.equal(captured.args.model, 'llama-3.3-70b-versatile');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `backend/`:
```bash
npm test -- src/ai-service.test.js
```
Expected: FAIL — current `ai-service.js` calls `groqClient.messages.create` (undefined on the fake) and reads `message.content[0]`, so assertions fail or it throws.

- [ ] **Step 3: Rewrite `ai-service.js`**

Replace the entire contents of `backend/src/ai-service.js` with:
```js
import Groq from 'groq-sdk';

const MODEL = 'llama-3.3-70b-versatile';

export function createGroqClient(apiKey = process.env.GROQ_API_KEY) {
  if (!apiKey) return null;
  return new Groq({ apiKey });
}

function buildDealPrompt(d) {
  return `
You are a real estate wholesaling expert. Analyze this deal:
- Purchase Price: $${Number(d.purchasePrice).toLocaleString()}
- Repair Budget: $${Number(d.repairBudget).toLocaleString()}
- ARV (After Repair Value): $${Number(d.arv).toLocaleString()}
- Selling Costs: $${Number(d.sellingCosts).toLocaleString()}
- Holding Costs: $${Number(d.holdingCosts).toLocaleString()}
- Wholesale Fee: $${Number(d.wholesaleFee).toLocaleString()}

Provide:
1. Is this a good deal? (YES/NO)
2. Key strengths and weaknesses
3. Recommended offer price
4. Risk assessment
5. Quick market insight for this area

Keep it concise and actionable.`.trim();
}

function buildSellerPrompt(s) {
  return `
You are a real estate wholesaling expert. Score this seller lead 1-10 and determine engagement priority:

Seller: ${s.name}
Property: ${s.property_address}, ${s.property_city}, ${s.property_state}
Motivation: ${s.motivation}
Contact Status: ${s.status}

Provide:
1. Lead Score (1-10)
2. Why this score?
3. Recommended next action
4. Estimated deal potential`.trim();
}

export async function analyzeDealWithAI(dealData, client = createGroqClient()) {
  if (!client) {
    return { success: false, error: 'GROQ_API_KEY not configured. Please set it in backend/.env' };
  }
  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 500,
      messages: [{ role: 'user', content: buildDealPrompt(dealData) }],
    });
    return { success: true, analysis: completion.choices[0].message.content, model: MODEL };
  } catch (error) {
    console.error('Groq AI error:', error.message);
    return { success: false, error: error.message };
  }
}

export async function scoreSeller(sellerData, client = createGroqClient()) {
  if (!client) {
    return { success: false, error: 'GROQ_API_KEY not configured. Please set it in backend/.env' };
  }
  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 300,
      messages: [{ role: 'user', content: buildSellerPrompt(sellerData) }],
    });
    return { success: true, scoring: completion.choices[0].message.content };
  } catch (error) {
    console.error('Seller scoring error:', error.message);
    return { success: false, error: error.message };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `backend/`:
```bash
npm test -- src/ai-service.test.js
```
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Delete the dead old file**

Remove the leftover `backend/src/ai-service-old.js`:
```bash
git rm backend/src/ai-service-old.js
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/ai-service.js backend/src/ai-service.test.js
git commit -m "fix: use Groq chat completions API with current model"
```

---

### Task 2: Fix FRED market trends

The function hits `/fred/series/data` (wrong; correct is `/fred/series/observations`) and uses invalid series IDs. Use FHFA All-Transactions House Price Index series (`ATNHPIUS{CBSA}Q`), with `USSTHPI` as the national fallback. Make `fetch` injectable.

**Files:**
- Modify: `backend/src/api-services.js` (the `getMarketTrends` function)
- Test: `backend/src/api-services.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/src/api-services.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getMarketTrends } from './api-services.js';

function okFetch(captured, body) {
  return async (url, opts) => {
    captured.url = url;
    captured.opts = opts;
    return { ok: true, status: 200, json: async () => body };
  };
}

test('getMarketTrends calls the observations endpoint with a valid series', async () => {
  const captured = {};
  const body = { observations: [{ date: '2024-01-01', value: '1.2' }] };
  const result = await getMarketTrends('Atlanta', { apiKey: 'test', fetchFn: okFetch(captured, body) });

  assert.equal(result.success, true);
  assert.equal(result.metro, 'Atlanta');
  assert.match(captured.url, /\/fred\/series\/observations/);
  assert.match(captured.url, /series_id=ATNHPIUS12060Q/);
  assert.match(captured.url, /api_key=test/);
  assert.equal(result.observations.length, 1);
});

test('getMarketTrends falls back to national series for unknown metro', async () => {
  const captured = {};
  const result = await getMarketTrends('Nowhere', { apiKey: 'test', fetchFn: okFetch(captured, { observations: [] }) });
  assert.match(captured.url, /series_id=USSTHPI/);
  assert.equal(result.success, true);
});

test('getMarketTrends returns error when no api key', async () => {
  const result = await getMarketTrends('Atlanta', { apiKey: undefined, fetchFn: async () => { throw new Error('should not be called'); } });
  assert.equal(result.error, 'FRED API key not configured');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `backend/`:
```bash
npm test -- src/api-services.test.js
```
Expected: FAIL — current signature is `getMarketTrends(metroArea)` (no options object), reads `process.env`, and builds the wrong URL.

- [ ] **Step 3: Replace `getMarketTrends` in `api-services.js`**

Replace the existing `getMarketTrends` function (lines 1–37) with:
```js
// FRED API - Federal Reserve Economic Data (FHFA All-Transactions House Price Index)
const FRED_SERIES_BY_METRO = {
  Atlanta: 'ATNHPIUS12060Q',
  Phoenix: 'ATNHPIUS38060Q',
  Dallas: 'ATNHPIUS19100Q',
  Denver: 'ATNHPIUS19740Q',
  Tampa: 'ATNHPIUS45300Q',
  Charlotte: 'ATNHPIUS16740Q',
  Austin: 'ATNHPIUS12420Q',
  Nashville: 'ATNHPIUS34980Q',
};
const FRED_NATIONAL_SERIES = 'USSTHPI';

export async function getMarketTrends(metroArea = 'Atlanta', { apiKey = process.env.FRED_API_KEY, fetchFn = fetch } = {}) {
  try {
    if (!apiKey) return { error: 'FRED API key not configured' };

    const seriesId = FRED_SERIES_BY_METRO[metroArea] || FRED_NATIONAL_SERIES;
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}`
      + `&units=pch&frequency=q&sort_order=desc&limit=12&api_key=${apiKey}&file_type=json`;

    const response = await fetchFn(url);
    if (!response.ok) throw new Error(`FRED API error: ${response.status}`);

    const data = await response.json();
    return {
      success: true,
      metro: metroArea,
      series_id: seriesId,
      observations: data.observations || [],
      last_update: data.observations?.[0]?.date || 'N/A',
    };
  } catch (error) {
    console.error('FRED API error:', error.message);
    return { error: error.message };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `backend/`:
```bash
npm test -- src/api-services.test.js
```
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Verify the series IDs resolve against live FRED (manual, requires a key)**

If a real `FRED_API_KEY` is available, run this for each metro id (example shows Atlanta):
```bash
curl -s "https://api.stlouisfed.org/fred/series?series_id=ATNHPIUS12060Q&api_key=$FRED_API_KEY&file_type=json"
```
Expected: a JSON `seriess` array with one entry (HTTP 200). If any id returns `error_code 400 / does not exist`, find the correct CBSA code via `https://fred.stlouisfed.org` search for "All-Transactions House Price Index <metro>" and update `FRED_SERIES_BY_METRO`. If no key is available yet, note this step as deferred and proceed — the unit tests do not depend on it.

- [ ] **Step 6: Commit**

```bash
git add backend/src/api-services.js backend/src/api-services.test.js
git commit -m "fix: use correct FRED observations endpoint and valid HPI series"
```

---

### Task 3: Replace RealtyMole comps with RentCast

RealtyMole is shut down. Use RentCast's AVM value endpoint (`https://api.rentcast.io/v1/avm/value`), which returns an estimated value plus `comparables`. Auth header is `X-Api-Key`. Make `fetch` injectable.

**Files:**
- Modify: `backend/src/api-services.js` (the `getLiveComps` function)
- Test: `backend/src/api-services.test.js` (add cases)

- [ ] **Step 1: Add the failing tests**

Append to `backend/src/api-services.test.js`:
```js
import { getLiveComps } from './api-services.js';

test('getLiveComps queries RentCast AVM and maps comps', async () => {
  const captured = {};
  const body = {
    price: 312000,
    priceRangeLow: 300000,
    priceRangeHigh: 325000,
    comparables: [{ formattedAddress: '5 Oak St', price: 305000 }],
  };
  const fetchFn = async (url, opts) => {
    captured.url = url;
    captured.opts = opts;
    return { ok: true, status: 200, json: async () => body };
  };
  const result = await getLiveComps('4812 Maple St', 'Atlanta', 'GA', { apiKey: 'k', fetchFn });

  assert.equal(result.success, true);
  assert.equal(result.estimatedValue, 312000);
  assert.equal(result.count, 1);
  assert.match(captured.url, /api\.rentcast\.io\/v1\/avm\/value/);
  assert.equal(captured.opts.headers['X-Api-Key'], 'k');
});

test('getLiveComps returns error when no api key', async () => {
  const result = await getLiveComps('a', 'b', 'c', { apiKey: undefined, fetchFn: async () => { throw new Error('nope'); } });
  assert.equal(result.success, false);
  assert.match(result.error, /RENTCAST_API_KEY/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run from `backend/`:
```bash
npm test -- src/api-services.test.js
```
Expected: FAIL — current `getLiveComps` uses RealtyMole URL/headers and a different signature.

- [ ] **Step 3: Replace `getLiveComps` in `api-services.js`**

Replace the existing `getLiveComps` function (the RealtyMole block) with:
```js
// RentCast API - property value estimate + comparable sales
export async function getLiveComps(address, city, state, { apiKey = process.env.RENTCAST_API_KEY, fetchFn = fetch } = {}) {
  try {
    if (!apiKey) return { success: false, error: 'RENTCAST_API_KEY not configured' };

    const fullAddress = `${address}, ${city}, ${state}`;
    const url = `https://api.rentcast.io/v1/avm/value?address=${encodeURIComponent(fullAddress)}`;

    const response = await fetchFn(url, {
      headers: { 'X-Api-Key': apiKey, accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`RentCast error: ${response.status}`);

    const data = await response.json();
    const comps = data.comparables || [];
    return {
      success: true,
      estimatedValue: data.price ?? null,
      valueRange: { low: data.priceRangeLow ?? null, high: data.priceRangeHigh ?? null },
      comps,
      count: comps.length,
    };
  } catch (error) {
    console.error('RentCast API error:', error.message);
    return { success: false, error: error.message };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run from `backend/`:
```bash
npm test -- src/api-services.test.js
```
Expected: PASS — all api-services tests (FRED + RentCast) pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/api-services.js backend/src/api-services.test.js
git commit -m "fix: replace dead RealtyMole comps with RentCast AVM"
```

---

### Task 4: Fix Nominatim geocoding (User-Agent header)

Nominatim's usage policy requires a `User-Agent` identifying the app; without it requests get blocked (HTTP 403). Add the header and make `fetch` injectable.

**Files:**
- Modify: `backend/src/api-services.js` (the `geocodeAddress` function)
- Test: `backend/src/api-services.test.js` (add a case)

- [ ] **Step 1: Add the failing test**

Append to `backend/src/api-services.test.js`:
```js
import { geocodeAddress } from './api-services.js';

test('geocodeAddress sends a User-Agent and returns coordinates', async () => {
  const captured = {};
  const body = [{ display_name: '4812 Maple St, Atlanta, GA', lat: '33.7', lon: '-84.4', boundingbox: ['1','2','3','4'] }];
  const fetchFn = async (url, opts) => {
    captured.opts = opts;
    return { ok: true, status: 200, json: async () => body };
  };
  const result = await geocodeAddress('4812 Maple St, Atlanta, GA', { fetchFn });

  assert.equal(result.success, true);
  assert.equal(result.latitude, '33.7');
  assert.ok(captured.opts.headers['User-Agent'], 'User-Agent header must be set');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `backend/`:
```bash
npm test -- src/api-services.test.js
```
Expected: FAIL — current `geocodeAddress(address)` takes no options and calls `fetch` with no headers, so `captured.opts` is `undefined`.

- [ ] **Step 3: Replace `geocodeAddress` in `api-services.js`**

Replace the existing `geocodeAddress` function with:
```js
// Nominatim (OpenStreetMap) - Free Geocoding (requires a User-Agent per usage policy)
export async function geocodeAddress(address, { fetchFn = fetch } = {}) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
    const response = await fetchFn(url, {
      headers: { 'User-Agent': 'WholesaleResearchTool/1.0 (https://github.com/local/wholesale-research-tool)' },
    });
    if (!response.ok) throw new Error(`Geocoding error: ${response.status}`);

    const data = await response.json();
    if (data.length > 0) {
      const result = data[0];
      return {
        success: true,
        address: result.display_name,
        latitude: result.lat,
        longitude: result.lon,
        boundingBox: result.boundingbox,
      };
    }
    return { error: 'Address not found' };
  } catch (error) {
    console.error('Geocoding error:', error.message);
    return { error: error.message };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `backend/`:
```bash
npm test -- src/api-services.test.js
```
Expected: PASS — all api-services tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/api-services.js backend/src/api-services.test.js
git commit -m "fix: send required User-Agent header to Nominatim geocoder"
```

---

### Task 5: Update environment template

Reflect the real integrations: RentCast replaces RealtyMole; drop the unused OpenAI/Google placeholders that no code reads (Census stays — it is used by `getNeighborhoodDemographics`).

**Files:**
- Modify: `backend/.env.example`

- [ ] **Step 1: Replace `backend/.env.example` contents**

```
# Environment variables for Wholesale Research Tool

# Groq API (AI Deal Analysis) - free at https://console.groq.com
GROQ_API_KEY=your_groq_api_key_here

# FRED API (Market / House Price Index data) - free at https://fred.stlouisfed.org
FRED_API_KEY=your_fred_api_key_here

# Census Bureau API (Demographics) - free at https://api.census.gov
CENSUS_API_KEY=your_census_api_key_here

# RentCast API (Property value + comps) - free tier at https://app.rentcast.io
RENTCAST_API_KEY=your_rentcast_api_key_here

# Server config
NODE_ENV=development
PORT=5000
CORS_ORIGIN=http://localhost:4173
DATABASE_URL=./wholesale.db
```

- [ ] **Step 2: Run the full backend test suite**

Run from `backend/`:
```bash
npm test
```
Expected: PASS — all ai-service and api-services tests pass (no regressions).

- [ ] **Step 3: Commit**

```bash
git add backend/.env.example
git commit -m "docs: update .env.example for RentCast and remove unused keys"
```

---

## Phase 1 Verification (Definition of Done)

- [ ] `npm test` in `backend/` passes all tests with zero failures.
- [ ] `backend/src/ai-service-old.js` is deleted.
- [ ] `analyzeDealWithAI` / `scoreSeller` use `client.chat.completions.create` and `llama-3.3-70b-versatile`.
- [ ] `getMarketTrends` calls `/fred/series/observations` with a valid series id.
- [ ] `getLiveComps` calls RentCast (`api.rentcast.io/v1/avm/value`) with `X-Api-Key`.
- [ ] `geocodeAddress` sends a `User-Agent` header.
- [ ] `.env.example` lists `RENTCAST_API_KEY` and no longer lists RealtyMole.
- [ ] (If a real key is available) a live smoke test of each endpoint returns `success: true`.
