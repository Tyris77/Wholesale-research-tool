# DC Property Intel Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully autonomous daily agent that scrapes DC public property records, scores every residential parcel on 5 motivation signals, auto-creates Seller records for hot leads (≥75), and emails a daily digest.

**Architecture:** `property-intel.js` contains all DC API fetchers, the scoring engine, and DB upsert/promotion logic. It is imported by `server.js` which adds REST endpoints and hooks the agent into the existing 60-second scheduler. A new Lead Finder React page surfaces results.

**Tech Stack:** Node 18 built-in `fetch`, SQLite via existing `dbRun/dbGet/dbAll` helpers, `node:test` + `supertest` for tests, existing `sendEmail` from `email-service.js`.

## Global Constraints

- ESM modules only — all files use `import`/`export`, no `require()`
- `--test-concurrency=1` is set in `npm test` — sequential test execution is guaranteed
- Tests use `node:test` + `node:assert/strict` + `supertest` — no vitest, no jest
- Every test file imports `app` from `./server.js` and closes DB in `after()`
- `asyncHandler` wraps every async Express route handler
- `uuid()` from the `uuid` package generates all IDs
- `dbRun`, `dbGet`, `dbAll` are the only DB helpers — no raw `db.run()` in new code
- DC ArcGIS REST APIs return `{ features: [{ attributes: {...} }] }` — page with `resultOffset` + `resultRecordCount=1000`
- No new npm dependencies — use Node 18 built-in `fetch`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `backend/src/db.js` | Modify | Add `property_leads` + `lead_signals` table migrations |
| `backend/src/property-intel.js` | Create | DC API fetchers, scoring engine, upsert, promotion, digest |
| `backend/src/property-intel.test.js` | Create | Unit tests: scoring engine + dedup + promotion logic |
| `backend/src/property-intel.routes.test.js` | Create | Integration tests: REST endpoints |
| `backend/src/server.js` | Modify | Import + register routes, hook into `runScheduler()` |
| `src/api/types.ts` | Modify | Add `PropertyLead` interface |
| `src/api/client.ts` | Modify | Add `getPropertyLeads`, `promotePropertyLead`, `dismissPropertyLead`, `runPropertyIntelScan` |
| `src/pages/LeadFinder.tsx` | Create | Lead Finder page: summary bar, filter row, sortable table |
| `src/App.tsx` | Modify | Add `/leads` route before AppLayout |

---

## Task 1: DB Migrations

**Files:**
- Modify: `backend/src/db.js`
- Test: `backend/src/property-intel.test.js` (partial — DB shape verified in Task 3)

**Interfaces:**
- Produces: `property_leads` table with columns: `parcel_id, address, ward, owner_name, owner_address, assessed_value, score, signals, status, promoted_seller_id, last_scanned_at, created_at`
- Produces: `lead_signals` table with columns: `id, parcel_id, signal_type, signal_value, points_awarded, scanned_at`

- [ ] **Step 1: Add migrations inside `initDb()` in `backend/src/db.js`**

Open `backend/src/db.js`. Find the `db.serialize(() => {` block inside `initDb()`. Add these two `db.run()` calls at the END of the serialize block, after all existing table creations:

```js
db.run(`CREATE TABLE IF NOT EXISTS property_leads (
  parcel_id TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  ward TEXT,
  owner_name TEXT,
  owner_address TEXT,
  assessed_value INTEGER,
  score INTEGER NOT NULL DEFAULT 0,
  signals TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'new',
  promoted_seller_id TEXT,
  last_scanned_at TEXT NOT NULL,
  created_at TEXT NOT NULL
)`);

db.run(`CREATE TABLE IF NOT EXISTS lead_signals (
  id TEXT PRIMARY KEY,
  parcel_id TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  signal_value TEXT,
  points_awarded INTEGER NOT NULL,
  scanned_at TEXT NOT NULL
)`);
```

- [ ] **Step 2: Verify migrations run without error**

```bash
cd backend && node -e "import('./src/db.js').then(m => { m.initDb(); setTimeout(() => { m.db.all(\"SELECT name FROM sqlite_master WHERE type='table'\", (e,r) => { console.log(r.map(x=>x.name)); m.db.close(); }); }, 200); })"
```

Expected output includes `property_leads` and `lead_signals` in the array.

- [ ] **Step 3: Commit**

```bash
git add backend/src/db.js
git commit -m "feat(db): add property_leads and lead_signals tables"
```

---

## Task 2: Scoring Engine (Pure Functions)

**Files:**
- Create: `backend/src/property-intel.js` (scoring section only)
- Create: `backend/src/property-intel.test.js`

**Interfaces:**
- Produces: `scoreProperty(signals: string[]) → number`
- Produces: `classifyLead(score: number) → 'hot' | 'warm' | 'cold'`
- Produces: `isAbsentee(ownerAddress: string, propertyAddress: string) → boolean`
- Produces: `isOutOfState(ownerState: string) → boolean`
- Consumes: nothing from earlier tasks

- [ ] **Step 1: Write the failing tests in `backend/src/property-intel.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreProperty, classifyLead, isAbsentee, isOutOfState } from './property-intel.js';

test('scoreProperty: tax delinquent only = 40', () => {
  assert.equal(scoreProperty(['tax_delinquent']), 40);
});

test('scoreProperty: absentee only = 20', () => {
  assert.equal(scoreProperty(['absentee_owner']), 20);
});

test('scoreProperty: out_of_state stacks with absentee = 35', () => {
  assert.equal(scoreProperty(['absentee_owner', 'out_of_state']), 35);
});

test('scoreProperty: vacant only = 25', () => {
  assert.equal(scoreProperty(['vacant']), 25);
});

test('scoreProperty: code_violation only = 15', () => {
  assert.equal(scoreProperty(['code_violation']), 15);
});

test('scoreProperty: all signals = 100 (capped)', () => {
  const s = scoreProperty(['tax_delinquent', 'absentee_owner', 'out_of_state', 'vacant', 'code_violation']);
  assert.equal(s, 100);
});

test('scoreProperty: unknown signal ignored', () => {
  assert.equal(scoreProperty(['unknown_signal']), 0);
});

test('classifyLead: 75 = hot', () => {
  assert.equal(classifyLead(75), 'hot');
});

test('classifyLead: 100 = hot', () => {
  assert.equal(classifyLead(100), 'hot');
});

test('classifyLead: 74 = warm', () => {
  assert.equal(classifyLead(74), 'warm');
});

test('classifyLead: 50 = warm', () => {
  assert.equal(classifyLead(50), 'warm');
});

test('classifyLead: 49 = cold', () => {
  assert.equal(classifyLead(49), 'cold');
});

test('isAbsentee: different addresses = true', () => {
  assert.equal(isAbsentee('5678 SUBURBAN DR, BETHESDA MD', '1234 MAIN ST NW'), true);
});

test('isAbsentee: same street number in address = false', () => {
  assert.equal(isAbsentee('1234 MAIN ST NW', '1234 MAIN ST NW'), false);
});

test('isOutOfState: MD owner = false', () => {
  assert.equal(isOutOfState('MD'), false);
});

test('isOutOfState: VA owner = false', () => {
  assert.equal(isOutOfState('VA'), false);
});

test('isOutOfState: DC owner = false', () => {
  assert.equal(isOutOfState('DC'), false);
});

test('isOutOfState: FL owner = true', () => {
  assert.equal(isOutOfState('FL'), true);
});
```

- [ ] **Step 2: Run to verify tests fail**

```bash
cd backend && node --test src/property-intel.test.js 2>&1 | head -20
```

Expected: `Error: Cannot find module './property-intel.js'` or similar.

- [ ] **Step 3: Create `backend/src/property-intel.js` with scoring functions**

```js
import { v4 as uuid } from 'uuid';
import { dbRun, dbGet, dbAll } from './db.js';
import { sendEmail } from './email-service.js';
import { config } from './config.js';

const SIGNAL_POINTS = {
  tax_delinquent: 40,
  absentee_owner: 20,
  out_of_state: 15,
  vacant: 25,
  code_violation: 15,
};

const DC_MD_VA = new Set(['DC', 'MD', 'VA']);

export function scoreProperty(signals) {
  const total = signals.reduce((sum, s) => sum + (SIGNAL_POINTS[s] ?? 0), 0);
  return Math.min(total, 100);
}

export function classifyLead(score) {
  if (score >= 75) return 'hot';
  if (score >= 50) return 'warm';
  return 'cold';
}

export function isAbsentee(ownerAddress, propertyAddress) {
  if (!ownerAddress || !propertyAddress) return false;
  return ownerAddress.trim().toUpperCase() !== propertyAddress.trim().toUpperCase();
}

export function isOutOfState(ownerState) {
  if (!ownerState) return false;
  return !DC_MD_VA.has(ownerState.trim().toUpperCase());
}
```

- [ ] **Step 4: Run scoring tests**

```bash
cd backend && node --test src/property-intel.test.js 2>&1 | tail -10
```

Expected: all 17 tests pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add backend/src/property-intel.js backend/src/property-intel.test.js
git commit -m "feat(property-intel): scoring engine and lead classification"
```

---

## Task 3: DC API Fetchers

**Files:**
- Modify: `backend/src/property-intel.js` (add fetcher functions)
- Modify: `backend/src/property-intel.test.js` (add dedup + signal-building tests)

**Interfaces:**
- Produces: `fetchWithRetry(url, options?, retries?) → Promise<any>`
- Produces: `fetchPropertyOwnership() → Promise<Array<{parcelId, address, ward, ownerName, ownerAddress, ownerState, assessedValue}>>`
- Produces: `fetchVacantBlighted() → Promise<Set<string>>` (Set of parcel IDs)
- Produces: `fetchCodeViolations() → Promise<Set<string>>` (Set of parcel IDs)
- Produces: `buildSignals(property, vacantSet, violationsSet) → string[]`
- Produces: `deduplicateByParcelId(records) → Map<string, object>`

- [ ] **Step 1: Add dedup and buildSignals tests to `backend/src/property-intel.test.js`**

Append to the existing test file:

```js
import { buildSignals, deduplicateByParcelId } from './property-intel.js';

test('buildSignals: tax delinquent + absentee + out_of_state + vacant + code_violation', () => {
  const property = {
    parcelId: 'A1',
    address: '100 MAIN ST NW',
    ownerAddress: '999 FLORIDA AVE',
    ownerState: 'FL',
    taxDelinquent: true,
  };
  const vacantSet = new Set(['A1']);
  const violationsSet = new Set(['A1']);
  const signals = buildSignals(property, vacantSet, violationsSet);
  assert.ok(signals.includes('tax_delinquent'));
  assert.ok(signals.includes('absentee_owner'));
  assert.ok(signals.includes('out_of_state'));
  assert.ok(signals.includes('vacant'));
  assert.ok(signals.includes('code_violation'));
  assert.equal(signals.length, 5);
});

test('buildSignals: same-address owner, in-state, no delinquency', () => {
  const property = {
    parcelId: 'B2',
    address: '200 ELM ST NW',
    ownerAddress: '200 ELM ST NW',
    ownerState: 'DC',
    taxDelinquent: false,
  };
  const signals = buildSignals(property, new Set(), new Set());
  assert.equal(signals.length, 0);
});

test('deduplicateByParcelId: keeps last occurrence per parcel', () => {
  const records = [
    { parcelId: 'X1', address: 'first' },
    { parcelId: 'X2', address: 'other' },
    { parcelId: 'X1', address: 'second' },
  ];
  const map = deduplicateByParcelId(records);
  assert.equal(map.size, 2);
  assert.equal(map.get('X1').address, 'second');
});
```

- [ ] **Step 2: Run to verify new tests fail**

```bash
cd backend && node --test src/property-intel.test.js 2>&1 | grep -E "fail|FAIL|buildSignals|dedup"
```

Expected: 3 new test failures.

- [ ] **Step 3: Add fetchers and helpers to `backend/src/property-intel.js`**

Append after the exported pure functions:

```js
const BASE = 'https://maps2.dcgis.dc.gov/dcgis/rest/services';
const OPEN_DATA = 'https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA';

// ArcGIS layer IDs — verified against DC Open Data portal June 2026
const LAYERS = {
  // Real Property Assessment (CAMA residential)
  realProperty: `${OPEN_DATA}/Property_and_Zoning_WebMercator/MapServer/56/query`,
  // DCRA Vacant and Blighted Buildings
  vacantBlighted: `${OPEN_DATA}/Property_and_Zoning_WebMercator/MapServer/54/query`,
  // DCRA Open Code Violations
  codeViolations: `${OPEN_DATA}/Inspection_and_Enforcement_WebMercator/MapServer/6/query`,
};

export async function fetchWithRetry(url, options = {}, retries = 2) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return await res.json();
  } catch (err) {
    if (retries > 0) {
      await new Promise((r) => setTimeout(r, 1000));
      return fetchWithRetry(url, options, retries - 1);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAllPages(layerUrl, where, outFields) {
  const records = [];
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const params = new URLSearchParams({
      where,
      outFields,
      f: 'json',
      resultOffset: String(offset),
      resultRecordCount: String(pageSize),
    });
    const data = await fetchWithRetry(`${layerUrl}?${params}`);
    const features = data.features ?? [];
    records.push(...features.map((f) => f.attributes));
    if (features.length < pageSize) break;
    offset += pageSize;
  }
  return records;
}

export async function fetchPropertyOwnership() {
  const rows = await fetchAllPages(
    LAYERS.realProperty,
    "PROPTYPE='R'",
    'SSL,PREMISEADD,WARD,OWNERNAME,OWNERADDRESS,OWNERCITY,OWNERSTATE,OWNERZIPCODE,ASSESSED_VAL,TAX_DELINQUENT',
  );
  return rows.map((r) => ({
    parcelId: String(r.SSL ?? '').trim(),
    address: String(r.PREMISEADD ?? '').trim(),
    ward: String(r.WARD ?? '').trim(),
    ownerName: String(r.OWNERNAME ?? '').trim(),
    ownerAddress: [r.OWNERADDRESS, r.OWNERCITY, r.OWNERSTATE, r.OWNERZIPCODE]
      .filter(Boolean).join(', ').trim(),
    ownerState: String(r.OWNERSTATE ?? '').trim(),
    assessedValue: Number(r.ASSESSED_VAL) || 0,
    taxDelinquent: Boolean(r.TAX_DELINQUENT),
  })).filter((r) => r.parcelId && r.address);
}

export async function fetchVacantBlighted() {
  const rows = await fetchAllPages(
    LAYERS.vacantBlighted,
    '1=1',
    'SSL',
  );
  return new Set(rows.map((r) => String(r.SSL ?? '').trim()).filter(Boolean));
}

export async function fetchCodeViolations() {
  const rows = await fetchAllPages(
    LAYERS.codeViolations,
    "STATUS='OPEN'",
    'SSL',
  );
  return new Set(rows.map((r) => String(r.SSL ?? '').trim()).filter(Boolean));
}

export function buildSignals(property, vacantSet, violationsSet) {
  const signals = [];
  if (property.taxDelinquent) signals.push('tax_delinquent');
  if (isAbsentee(property.ownerAddress, property.address)) {
    signals.push('absentee_owner');
    if (isOutOfState(property.ownerState)) signals.push('out_of_state');
  }
  if (vacantSet.has(property.parcelId)) signals.push('vacant');
  if (violationsSet.has(property.parcelId)) signals.push('code_violation');
  return signals;
}

export function deduplicateByParcelId(records) {
  const map = new Map();
  for (const r of records) map.set(r.parcelId, r);
  return map;
}
```

- [ ] **Step 4: Run all property-intel tests**

```bash
cd backend && node --test src/property-intel.test.js 2>&1 | tail -10
```

Expected: all 20 tests pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add backend/src/property-intel.js backend/src/property-intel.test.js
git commit -m "feat(property-intel): DC API fetchers, dedup, and signal builder"
```

---

## Task 4: Agent Orchestration (Upsert, Promote, Digest)

**Files:**
- Modify: `backend/src/property-intel.js` (add `runPropertyIntelScan`, `upsertLeads`, `promoteHotLeads`, `buildDigestEmail`)
- Modify: `backend/src/property-intel.test.js` (add integration tests)

**Interfaces:**
- Produces: `runPropertyIntelScan() → Promise<{ total, hot, warm, cold, promoted, errors }>`
- Produces: `buildDigestEmail(hotLeads: object[]) → { subject: string, html: string } | null`
- Consumes: `scoreProperty`, `classifyLead`, `buildSignals`, `deduplicateByParcelId` from Task 2/3
- Consumes: `dbRun`, `dbGet`, `dbAll` from `db.js`
- Consumes: `sendEmail` from `email-service.js`

- [ ] **Step 1: Add integration tests to `backend/src/property-intel.test.js`**

Add these imports at the top of the test file (after existing imports):

```js
import { after } from 'node:test';
import { db } from './db.js';
import { runPropertyIntelScan, buildDigestEmail } from './property-intel.js';

after(() => new Promise((resolve) => db.close(() => resolve())));
```

Append these tests:

```js
test('buildDigestEmail: returns null when no hot leads', () => {
  assert.equal(buildDigestEmail([]), null);
});

test('buildDigestEmail: returns subject + html for hot leads', () => {
  const leads = [
    { address: '100 MAIN ST NW', ward: 'Ward 1', score: 95, signals: ['tax_delinquent', 'vacant'] },
    { address: '200 ELM ST SE', ward: 'Ward 8', score: 80, signals: ['absentee_owner'] },
  ];
  const result = buildDigestEmail(leads);
  assert.ok(result.subject.includes('2'));
  assert.ok(result.html.includes('100 MAIN ST NW'));
  assert.ok(result.html.includes('Ward 1'));
  assert.ok(result.html.includes('95'));
});
```

- [ ] **Step 2: Run to verify new tests fail**

```bash
cd backend && node --test src/property-intel.test.js 2>&1 | grep -E "fail|buildDigest"
```

- [ ] **Step 3: Append orchestration functions to `backend/src/property-intel.js`**

```js
export function buildDigestEmail(hotLeads) {
  if (!hotLeads || hotLeads.length === 0) return null;
  const top5 = hotLeads.slice(0, 5);
  const rows = top5.map((l) =>
    `<tr>
      <td>${l.address}</td>
      <td>${l.ward ?? '—'}</td>
      <td><strong>${l.score}</strong></td>
      <td>${(JSON.parse(l.signals ?? '[]')).join(', ')}</td>
    </tr>`,
  ).join('');
  return {
    subject: `🏠 ${hotLeads.length} new hot lead${hotLeads.length === 1 ? '' : 's'} found in DC — ${new Date().toLocaleDateString('en-US')}`,
    html: `
      <h2>DC Property Intel — Daily Digest</h2>
      <p>${hotLeads.length} hot lead${hotLeads.length === 1 ? '' : 's'} found today (score ≥ 75).</p>
      <table border="1" cellpadding="6" cellspacing="0">
        <thead><tr><th>Address</th><th>Ward</th><th>Score</th><th>Signals</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p>Log in to Lead Finder to review and promote leads to your Sellers list.</p>
    `,
  };
}

async function upsertLead(property, signals, score, now) {
  await dbRun(
    `INSERT INTO property_leads (parcel_id, address, ward, owner_name, owner_address, assessed_value, score, signals, status, last_scanned_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)
     ON CONFLICT(parcel_id) DO UPDATE SET
       score = excluded.score,
       signals = excluded.signals,
       owner_name = excluded.owner_name,
       owner_address = excluded.owner_address,
       assessed_value = excluded.assessed_value,
       last_scanned_at = excluded.last_scanned_at
     WHERE status != 'dismissed'`,
    [
      property.parcelId, property.address, property.ward,
      property.ownerName, property.ownerAddress, property.assessedValue,
      score, JSON.stringify(signals), now, now,
    ],
  );
  await dbRun('DELETE FROM lead_signals WHERE parcel_id = ? AND scanned_at = ?', [property.parcelId, now]);
  for (const signal of signals) {
    await dbRun(
      'INSERT INTO lead_signals (id, parcel_id, signal_type, signal_value, points_awarded, scanned_at) VALUES (?, ?, ?, ?, ?, ?)',
      [uuid(), property.parcelId, signal, null, SIGNAL_POINTS[signal] ?? 0, now],
    );
  }
}

async function promoteHotLeads(hotParcelIds, now) {
  let promoted = 0;
  for (const parcelId of hotParcelIds) {
    const lead = await dbGet('SELECT * FROM property_leads WHERE parcel_id = ?', [parcelId]);
    if (!lead || lead.promoted_seller_id) continue;
    const arv = Math.round((lead.assessed_value ?? 0) * 1.2);
    const signals = JSON.parse(lead.signals ?? '[]');
    const sellerId = uuid();
    await dbRun(
      `INSERT INTO sellers (id, name, phone, email, property_address, property_city, property_state, motivation, status, created_at, last_contacted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)`,
      [
        sellerId,
        lead.owner_name || 'Unknown Owner',
        null, null,
        lead.address, 'Washington', 'DC',
        `Score: ${lead.score}/100 — Signals: ${signals.join(', ')}. ARV est. $${arv.toLocaleString()}.`,
        now, null,
      ],
    );
    await dbRun(
      "UPDATE property_leads SET promoted_seller_id = ?, status = 'promoted' WHERE parcel_id = ?",
      [sellerId, parcelId],
    );
    promoted++;
  }
  return promoted;
}

export async function runPropertyIntelScan() {
  const now = new Date().toISOString();
  const counts = { total: 0, hot: 0, warm: 0, cold: 0, promoted: 0, errors: [] };

  let properties, vacantSet, violationsSet;
  try {
    [properties, vacantSet, violationsSet] = await Promise.all([
      fetchPropertyOwnership(),
      fetchVacantBlighted(),
      fetchCodeViolations(),
    ]);
  } catch (err) {
    counts.errors.push(`API fetch failed: ${err.message}`);
    console.error('property-intel: fetch failed', err);
    return counts;
  }

  const unique = deduplicateByParcelId(properties);
  counts.total = unique.size;

  const hotParcelIds = [];
  for (const property of unique.values()) {
    const signals = buildSignals(property, vacantSet, violationsSet);
    const score = scoreProperty(signals);
    const tier = classifyLead(score);
    if (tier === 'cold') { counts.cold++; continue; }
    try {
      await upsertLead(property, signals, score, now);
      if (tier === 'hot') { counts.hot++; hotParcelIds.push(property.parcelId); }
      else counts.warm++;
    } catch (err) {
      counts.errors.push(`upsert ${property.parcelId}: ${err.message}`);
    }
  }

  counts.promoted = await promoteHotLeads(hotParcelIds, now);

  if (hotParcelIds.length > 0 && config.notifyEmail) {
    const hotLeads = await dbAll(
      `SELECT * FROM property_leads WHERE parcel_id IN (${hotParcelIds.slice(0,5).map(() => '?').join(',')}) ORDER BY score DESC`,
      hotParcelIds.slice(0,5),
    );
    const email = buildDigestEmail(hotLeads);
    if (email) {
      await sendEmail({ to: config.notifyEmail, subject: email.subject, html: email.html })
        .catch((e) => console.error('digest email failed', e));
    }
  }

  console.log(`property-intel scan complete: ${JSON.stringify(counts)}`);
  return counts;
}
```

- [ ] **Step 4: Run all property-intel tests**

```bash
cd backend && node --test src/property-intel.test.js 2>&1 | tail -10
```

Expected: all 22 tests pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add backend/src/property-intel.js backend/src/property-intel.test.js
git commit -m "feat(property-intel): agent orchestration — upsert, promote, digest"
```

---

## Task 5: Backend Routes + Scheduler Hook

**Files:**
- Create: `backend/src/property-intel.routes.test.js`
- Modify: `backend/src/server.js`

**Interfaces:**
- Produces: `GET /api/property-leads` — `?ward=&minScore=&status=` filters, returns array
- Produces: `GET /api/property-leads/:parcelId` — single lead with signals array
- Produces: `POST /api/property-leads/:parcelId/promote` — promotes to sellers, returns `{ success, sellerId }`
- Produces: `POST /api/property-leads/:parcelId/dismiss` — sets status='dismissed', returns `{ success }`
- Produces: `POST /api/property-intel/run` — fire-and-forget scan, returns `{ success, message }`

- [ ] **Step 1: Write failing route tests in `backend/src/property-intel.routes.test.js`**

```js
import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from './server.js';
import { db, dbRun } from './db.js';

after(() => new Promise((resolve) => db.close(() => resolve())));

const TEST_LEAD = {
  parcel_id: 'TEST001',
  address: '1234 TEST ST NW',
  ward: 'Ward 1',
  owner_name: 'Jane Doe',
  owner_address: '999 FLORIDA AVE, MIAMI FL 33101',
  assessed_value: 400000,
  score: 80,
  signals: JSON.stringify(['tax_delinquent', 'absentee_owner', 'out_of_state']),
  status: 'new',
  last_scanned_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
};

before(async () => {
  await dbRun(
    `INSERT OR REPLACE INTO property_leads (parcel_id, address, ward, owner_name, owner_address, assessed_value, score, signals, status, last_scanned_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    Object.values(TEST_LEAD),
  );
});

test('GET /api/property-leads returns array including test lead', async () => {
  const res = await request(app).get('/api/property-leads');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
  assert.ok(res.body.some((l) => l.parcel_id === 'TEST001'));
});

test('GET /api/property-leads?ward=Ward+1 filters by ward', async () => {
  const res = await request(app).get('/api/property-leads?ward=Ward%201');
  assert.equal(res.status, 200);
  assert.ok(res.body.every((l) => l.ward === 'Ward 1'));
});

test('GET /api/property-leads?minScore=90 filters by score', async () => {
  const res = await request(app).get('/api/property-leads?minScore=90');
  assert.equal(res.status, 200);
  assert.ok(res.body.every((l) => l.score >= 90));
});

test('GET /api/property-leads/:parcelId returns single lead', async () => {
  const res = await request(app).get('/api/property-leads/TEST001');
  assert.equal(res.status, 200);
  assert.equal(res.body.parcel_id, 'TEST001');
  assert.equal(res.body.address, '1234 TEST ST NW');
});

test('GET /api/property-leads/:parcelId 404 for unknown', async () => {
  const res = await request(app).get('/api/property-leads/NOPE');
  assert.equal(res.status, 404);
});

test('POST /api/property-leads/:parcelId/promote creates seller', async () => {
  const res = await request(app).post('/api/property-leads/TEST001/promote');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.ok(res.body.sellerId);
  const check = await request(app).get('/api/property-leads/TEST001');
  assert.equal(check.body.status, 'promoted');
});

test('POST /api/property-leads/:parcelId/dismiss sets status', async () => {
  await dbRun("UPDATE property_leads SET status = 'new', promoted_seller_id = NULL WHERE parcel_id = 'TEST001'");
  const res = await request(app).post('/api/property-leads/TEST001/dismiss');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  const check = await request(app).get('/api/property-leads/TEST001');
  assert.equal(check.body.status, 'dismissed');
});

test('POST /api/property-intel/run returns success immediately', async () => {
  const res = await request(app).post('/api/property-intel/run');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.ok(res.body.message);
});
```

- [ ] **Step 2: Run to verify tests fail**

```bash
cd backend && node --test src/property-intel.routes.test.js 2>&1 | head -20
```

Expected: failures about unknown routes.

- [ ] **Step 3: Add import to `backend/src/server.js`**

Find the existing imports at the top of `server.js`. Add after the existing import block:

```js
import { runPropertyIntelScan } from './property-intel.js';
```

- [ ] **Step 4: Add routes to `backend/src/server.js`**

Find the block just before `app.use(errorHandler)`. Add these routes before it:

```js
// Property Intel routes
app.get('/api/property-leads', asyncHandler(async (req, res) => {
  const { ward, minScore, status } = req.query;
  let sql = 'SELECT * FROM property_leads WHERE 1=1';
  const params = [];
  if (ward) { sql += ' AND ward = ?'; params.push(ward); }
  if (minScore) { sql += ' AND score >= ?'; params.push(Number(minScore)); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY score DESC LIMIT 500';
  const leads = await dbAll(sql, params);
  res.json(leads);
}));

app.get('/api/property-leads/:parcelId', asyncHandler(async (req, res) => {
  const lead = await dbGet('SELECT * FROM property_leads WHERE parcel_id = ?', [req.params.parcelId]);
  if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
  const signals = await dbAll('SELECT * FROM lead_signals WHERE parcel_id = ? ORDER BY scanned_at DESC', [req.params.parcelId]);
  res.json({ ...lead, signal_details: signals });
}));

app.post('/api/property-leads/:parcelId/promote', asyncHandler(async (req, res) => {
  const lead = await dbGet('SELECT * FROM property_leads WHERE parcel_id = ?', [req.params.parcelId]);
  if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
  if (lead.promoted_seller_id) return res.json({ success: true, sellerId: lead.promoted_seller_id });
  const now = new Date().toISOString();
  const arv = Math.round((lead.assessed_value ?? 0) * 1.2);
  const signals = JSON.parse(lead.signals ?? '[]');
  const sellerId = uuid();
  await dbRun(
    `INSERT INTO sellers (id, name, phone, email, property_address, property_city, property_state, motivation, status, created_at, last_contacted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)`,
    [sellerId, lead.owner_name || 'Unknown Owner', null, null,
     lead.address, 'Washington', 'DC',
     `Score: ${lead.score}/100 — Signals: ${signals.join(', ')}. ARV est. $${arv.toLocaleString()}.`,
     now, null],
  );
  await dbRun(
    "UPDATE property_leads SET promoted_seller_id = ?, status = 'promoted' WHERE parcel_id = ?",
    [sellerId, req.params.parcelId],
  );
  res.json({ success: true, sellerId });
}));

app.post('/api/property-leads/:parcelId/dismiss', asyncHandler(async (req, res) => {
  const lead = await dbGet('SELECT * FROM property_leads WHERE parcel_id = ?', [req.params.parcelId]);
  if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
  await dbRun("UPDATE property_leads SET status = 'dismissed' WHERE parcel_id = ?", [req.params.parcelId]);
  res.json({ success: true });
}));

app.post('/api/property-intel/run', asyncHandler(async (req, res) => {
  res.json({ success: true, message: 'Scan started — results visible in Lead Finder in 2-5 minutes' });
  runPropertyIntelScan().catch((e) => console.error('property-intel manual run error', e));
}));
```

- [ ] **Step 5: Hook into `runScheduler()` in `backend/src/server.js`**

Find the `runScheduler()` function (around line 514). Modify it:

```js
async function runScheduler() {
  const send = (msg) => sendEmail(msg);
  const now = new Date();
  const stepsProcessed = await processDueCampaigns(now.toISOString(), send);
  const digestSent = await maybeSendDigest(now.toISOString().slice(0, 10), send, config.notifyEmail || config.emailFrom);

  // Run property intel scan at 8am UTC (3am ET) once per day
  const hour = now.getUTCHours();
  if (hour === 8) {
    const today = now.toISOString().slice(0, 10);
    const lastScan = await dbGet('SELECT MAX(last_scanned_at) as last FROM property_leads');
    if (!lastScan?.last || lastScan.last.slice(0, 10) < today) {
      runPropertyIntelScan().catch((e) => console.error('property intel scheduler error', e));
    }
  }

  return { stepsProcessed, digestSent };
}
```

- [ ] **Step 6: Run route tests**

```bash
cd backend && node --test src/property-intel.routes.test.js 2>&1 | tail -15
```

Expected: 8 tests pass, 0 fail.

- [ ] **Step 7: Run full test suite**

```bash
cd backend && npm test 2>&1 | tail -10
```

Expected: all tests pass (previous 111 + new 8 = 119+), 0 fail.

- [ ] **Step 8: Commit**

```bash
git add backend/src/server.js backend/src/property-intel.routes.test.js backend/src/property-intel.js
git commit -m "feat(api): property-leads routes and scheduler hook"
```

---

## Task 6: Frontend Types + Client

**Files:**
- Modify: `src/api/types.ts`
- Modify: `src/api/client.ts`

**Interfaces:**
- Produces: `PropertyLead` interface
- Produces: `getPropertyLeads(filters?) → Promise<PropertyLead[]>`
- Produces: `getPropertyLead(parcelId) → Promise<PropertyLead>`
- Produces: `promotePropertyLead(parcelId) → Promise<{ success: boolean; sellerId: string }>`
- Produces: `dismissPropertyLead(parcelId) → Promise<{ success: boolean }>`
- Produces: `runPropertyIntelScan() → Promise<{ success: boolean; message: string }>`

- [ ] **Step 1: Add `PropertyLead` to `src/api/types.ts`**

Open `src/api/types.ts`. Append:

```ts
export interface PropertyLead {
  parcel_id: string;
  address: string;
  ward: string | null;
  owner_name: string | null;
  owner_address: string | null;
  assessed_value: number | null;
  score: number;
  signals: string; // JSON array string
  status: 'new' | 'promoted' | 'dismissed';
  promoted_seller_id: string | null;
  last_scanned_at: string;
  created_at: string;
  signal_details?: Array<{
    id: string;
    signal_type: string;
    signal_value: string | null;
    points_awarded: number;
  }>;
}
```

- [ ] **Step 2: Add client functions to `src/api/client.ts`**

Open `src/api/client.ts`. Add `PropertyLead` to the existing import from `./types`. Then append these functions at the end of the file:

```ts
export async function getPropertyLeads(
  filters: { ward?: string; minScore?: number; status?: string } = {},
): Promise<PropertyLead[]> {
  const params = new URLSearchParams();
  if (filters.ward) params.set('ward', filters.ward);
  if (filters.minScore !== undefined) params.set('minScore', String(filters.minScore));
  if (filters.status) params.set('status', filters.status);
  const qs = params.toString();
  return apiFetch<PropertyLead[]>(`/api/property-leads${qs ? `?${qs}` : ''}`);
}

export async function getPropertyLead(parcelId: string): Promise<PropertyLead> {
  return apiFetch<PropertyLead>(`/api/property-leads/${encodeURIComponent(parcelId)}`);
}

export async function promotePropertyLead(
  parcelId: string,
): Promise<{ success: boolean; sellerId: string }> {
  return apiFetch(`/api/property-leads/${encodeURIComponent(parcelId)}/promote`, { method: 'POST' });
}

export async function dismissPropertyLead(
  parcelId: string,
): Promise<{ success: boolean }> {
  return apiFetch(`/api/property-leads/${encodeURIComponent(parcelId)}/dismiss`, { method: 'POST' });
}

export async function runPropertyIntelScan(): Promise<{ success: boolean; message: string }> {
  return apiFetch('/api/property-intel/run', { method: 'POST' });
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd "C:/Users/tyris/Desktop/wholesale-research-tool" && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/api/types.ts src/api/client.ts
git commit -m "feat(client): PropertyLead types and API client functions"
```

---

## Task 7: Lead Finder Page + Routing

**Files:**
- Create: `src/pages/LeadFinder.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `getPropertyLeads`, `promotePropertyLead`, `dismissPropertyLead`, `runPropertyIntelScan` from client.ts
- Consumes: `useAsync` from `../hooks/useAsync`
- Consumes: `PropertyLead` from `../api/types`

- [ ] **Step 1: Check how existing pages add themselves to the sidebar**

```bash
grep -n "Lead\|Seller\|nav\|sidebar" "C:/Users/tyris/Desktop/wholesale-research-tool/src/App.tsx" | head -20
```

Note the pattern — existing pages are listed in the nav array or sidebar component. Match it exactly.

- [ ] **Step 2: Create `src/pages/LeadFinder.tsx`**

```tsx
import { useState } from 'react';
import { useAsync } from '../hooks/useAsync';
import {
  getPropertyLeads,
  promotePropertyLead,
  dismissPropertyLead,
  runPropertyIntelScan,
} from '../api/client';
import type { PropertyLead } from '../api/types';

const SIGNAL_LABELS: Record<string, string> = {
  tax_delinquent: 'Tax Delinquent',
  absentee_owner: 'Absentee',
  out_of_state: 'Out-of-State',
  vacant: 'Vacant',
  code_violation: 'Code Violations',
};

const SIGNAL_COLORS: Record<string, string> = {
  tax_delinquent: '#dc2626',
  absentee_owner: '#d97706',
  out_of_state: '#b45309',
  vacant: '#7c3aed',
  code_violation: '#0369a1',
};

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 75 ? '#dc2626' : score >= 50 ? '#d97706' : '#6b7280';
  return (
    <span style={{
      background: color, color: '#fff', borderRadius: 4,
      padding: '2px 8px', fontWeight: 700, fontSize: 13,
    }}>
      {score}
    </span>
  );
}

function SignalChips({ signals }: { signals: string[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {signals.map((s) => (
        <span key={s} style={{
          background: SIGNAL_COLORS[s] ?? '#6b7280', color: '#fff',
          borderRadius: 4, padding: '1px 6px', fontSize: 11,
        }}>
          {SIGNAL_LABELS[s] ?? s}
        </span>
      ))}
    </div>
  );
}

export default function LeadFinder() {
  const [ward, setWard] = useState('');
  const [minScore, setMinScore] = useState('');
  const [status, setStatus] = useState('new');
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState('');
  const [actionState, setActionState] = useState<Record<string, boolean>>({});

  const leads = useAsync(
    () => getPropertyLeads({
      ward: ward || undefined,
      minScore: minScore ? Number(minScore) : undefined,
      status: status || undefined,
    }),
    true,
  );

  const hotCount = leads.data?.filter((l) => l.score >= 75).length ?? 0;
  const total = leads.data?.length ?? 0;

  async function handleScan() {
    setScanning(true);
    setScanMsg('');
    try {
      const r = await runPropertyIntelScan();
      setScanMsg(r.message);
    } catch {
      setScanMsg('Scan failed — check server logs.');
    } finally {
      setScanning(false);
    }
  }

  async function handlePromote(lead: PropertyLead) {
    setActionState((p) => ({ ...p, [lead.parcel_id]: true }));
    try {
      await promotePropertyLead(lead.parcel_id);
      leads.run();
    } finally {
      setActionState((p) => ({ ...p, [lead.parcel_id]: false }));
    }
  }

  async function handleDismiss(lead: PropertyLead) {
    setActionState((p) => ({ ...p, [lead.parcel_id]: true }));
    try {
      await dismissPropertyLead(lead.parcel_id);
      leads.run();
    } finally {
      setActionState((p) => ({ ...p, [lead.parcel_id]: false }));
    }
  }

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Lead Finder</h1>
        <button
          onClick={handleScan}
          disabled={scanning}
          style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer' }}
        >
          {scanning ? 'Scanning...' : 'Run Scan Now'}
        </button>
      </div>

      {scanMsg && <p style={{ color: '#6b7280', marginBottom: 12 }}>{scanMsg}</p>}

      <div style={{ display: 'flex', gap: 24, marginBottom: 20 }}>
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 20px' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#dc2626' }}>{hotCount}</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Hot Leads (≥75)</div>
        </div>
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 20px' }}>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{total}</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Total Leads Shown</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={ward} onChange={(e) => setWard(e.target.value)} style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #d1d5db' }}>
          <option value="">All Wards</option>
          {['Ward 1','Ward 2','Ward 3','Ward 4','Ward 5','Ward 6','Ward 7','Ward 8'].map((w) => (
            <option key={w} value={w}>{w}</option>
          ))}
        </select>
        <input
          type="number"
          placeholder="Min score"
          value={minScore}
          onChange={(e) => setMinScore(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #d1d5db', width: 100 }}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #d1d5db' }}>
          <option value="">All Statuses</option>
          <option value="new">New</option>
          <option value="promoted">Promoted</option>
          <option value="dismissed">Dismissed</option>
        </select>
        <button onClick={() => leads.run()} style={{ padding: '6px 14px', borderRadius: 4, border: '1px solid #d1d5db', cursor: 'pointer' }}>
          Apply
        </button>
      </div>

      {leads.loading && <p>Loading leads...</p>}
      {leads.error && <p style={{ color: '#dc2626' }}>Error: {leads.error}</p>}
      {leads.data && leads.data.length === 0 && (
        <p style={{ color: '#6b7280' }}>No leads yet. Click "Run Scan Now" to find motivated sellers in DC.</p>
      )}

      {leads.data && leads.data.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                <th style={{ padding: '8px 12px' }}>Address</th>
                <th style={{ padding: '8px 12px' }}>Ward</th>
                <th style={{ padding: '8px 12px' }}>Score</th>
                <th style={{ padding: '8px 12px' }}>Signals</th>
                <th style={{ padding: '8px 12px' }}>Owner</th>
                <th style={{ padding: '8px 12px' }}>Status</th>
                <th style={{ padding: '8px 12px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {leads.data.map((lead) => {
                const signals: string[] = JSON.parse(lead.signals ?? '[]');
                const busy = actionState[lead.parcel_id];
                return (
                  <tr key={lead.parcel_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 500 }}>{lead.address}</td>
                    <td style={{ padding: '8px 12px', color: '#6b7280' }}>{lead.ward ?? '—'}</td>
                    <td style={{ padding: '8px 12px' }}><ScoreBadge score={lead.score} /></td>
                    <td style={{ padding: '8px 12px' }}><SignalChips signals={signals} /></td>
                    <td style={{ padding: '8px 12px', color: '#6b7280' }}>{lead.owner_name ?? '—'}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{ fontSize: 11, textTransform: 'capitalize' }}>{lead.status}</span>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      {lead.status === 'new' && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            disabled={busy}
                            onClick={() => handlePromote(lead)}
                            style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 12 }}
                          >
                            Promote
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => handleDismiss(lead)}
                            style={{ background: '#6b7280', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 12 }}
                          >
                            Dismiss
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add route and nav link to `src/App.tsx`**

Open `src/App.tsx`. Find the import block at the top and add:

```tsx
import LeadFinder from './pages/LeadFinder';
```

Find where other pages are added as routes inside AppLayout. Add:

```tsx
<Route path="leads" element={<LeadFinder />} />
```

Find the sidebar navigation links (where Sellers, Buyers etc. are listed). Add between Sellers and Buyers:

```tsx
<NavLink to="/leads">Lead Finder</NavLink>
```

(Match the exact component name and style used by other nav links in that file.)

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd "C:/Users/tyris/Desktop/wholesale-research-tool" && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 5: Run full backend test suite**

```bash
cd backend && npm test 2>&1 | tail -10
```

Expected: all tests pass, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add src/pages/LeadFinder.tsx src/App.tsx src/api/types.ts src/api/client.ts
git commit -m "feat(ui): Lead Finder page with score badges, signal chips, promote/dismiss actions"
```

---

## Task 8: Build, Push, Deploy

- [ ] **Step 1: Build frontend**

```bash
cd "C:/Users/tyris/Desktop/wholesale-research-tool" && npm run build 2>&1 | tail -5
```

Expected: `dist/` output, no TypeScript errors.

- [ ] **Step 2: Push to GitHub (Railway auto-deploys)**

```bash
git push
```

- [ ] **Step 3: Verify deployment**

After Railway deploys (~2 minutes), fetch the health endpoint:

```bash
curl https://wholesale-research-tool-production.up.railway.app/api/health
```

Expected: `{"status":"ok",...}`

- [ ] **Step 4: Trigger a manual scan in production**

```bash
curl -X POST https://wholesale-research-tool-production.up.railway.app/api/property-intel/run
```

Expected: `{"success":true,"message":"Scan started..."}`

Wait 3-5 minutes, then visit `/leads` in the live app to see DC properties populated.
