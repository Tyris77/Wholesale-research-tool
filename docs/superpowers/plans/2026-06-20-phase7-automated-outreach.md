# Phase 7 — Automated Outreach: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Timed drip email campaigns to a deal's matched buyers, sent automatically by an in-process scheduler and fully logged, plus a once-daily emailed digest of sellers due for follow-up.

**Architecture:** Pure, time-injectable scheduling logic (`scheduling.js`) decides what is due; orchestration in `server.js` sends due campaign steps via the Phase 6B email path and logs to `activities`; a `setInterval` tick drives it but starts only when the server runs for real. New `campaigns`, `campaign_steps`, and `app_state` tables persist state. The frontend adds an "Automate" action on deals and a Campaigns page.

**Tech Stack:** Backend — Node.js (ESM), Express 4, sqlite3, zod 4, uuid, `node:test` + supertest, Resend. Frontend — React 18, Vite 5, TypeScript, react-router-dom v7, vitest.

## Global Constraints

- The scheduler (`setInterval`) starts **only inside the `isMain` block** of `server.js`, never on import, so the test suite never fires it. (Spec: Decisions.)
- Email send reuses Phase 6B (`emailMatchedBuyers` + `sendEmail`); every send is logged to the existing `activities` table. (Spec: Decisions.)
- Tests run with email blanked by `backend/test-setup.js` (already wired into `npm test`); automation never sends real email under test. (Spec: Decisions / Testing.)
- Scheduling/due logic is pure and takes an explicit `now`/`today`; the scheduler and endpoints pass the real clock. (Spec: Decisions.)
- A campaign step is marked `sent` once **processed**, regardless of per-buyer delivery outcome. (Spec: Architecture.)
- `processDueCampaigns` only processes `active` campaigns; when all of a campaign's steps are `sent`, the campaign becomes `done`. (Spec: Architecture.)
- Dates are UTC; offsets are whole days. The digest sends at most once per calendar day (`shouldSendDigest`). (Spec: Decisions / Architecture.)
- Idempotent migrations for new tables (`CREATE TABLE IF NOT EXISTS`), matching the existing db.js pattern. (Spec: Architecture.)
- Follow existing patterns: promisified `dbAll/dbGet/dbRun`; `validateBody` + zod; typed client; `useAsync` + state components.

---

### Task 1: Pure scheduling logic (`scheduling.js`)

The deterministic, time-injectable functions that decide step run times, which steps are due, and the digest.

**Files:**
- Create: `backend/src/scheduling.js`
- Test: `backend/src/scheduling.test.js`

**Interfaces:**
- Produces:
  - `campaignRunAts(startISO, offsetsDays) → string[]` — ISO timestamp per offset (`start + offset*86400000` ms).
  - `dueSteps(steps, nowISO) → step[]` — steps with `status==='pending'` and `run_at <= nowISO`.
  - `buildFollowUpDigest(dueList) → { subject, html } | null` — `null` if `dueList` empty; else a digest listing each `{ name, next_follow_up }`.
  - `shouldSendDigest(lastDigestDate, today) → boolean` — `today !== lastDigestDate`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/scheduling.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { campaignRunAts, dueSteps, buildFollowUpDigest, shouldSendDigest } from './scheduling.js';

test('campaignRunAts offsets days from the start time', () => {
  const runs = campaignRunAts('2026-06-20T00:00:00.000Z', [0, 3, 7]);
  assert.deepEqual(runs, [
    '2026-06-20T00:00:00.000Z',
    '2026-06-23T00:00:00.000Z',
    '2026-06-27T00:00:00.000Z',
  ]);
});

test('dueSteps returns pending steps at or before now', () => {
  const steps = [
    { id: 'a', status: 'pending', run_at: '2026-06-20T00:00:00.000Z' },
    { id: 'b', status: 'pending', run_at: '2026-06-25T00:00:00.000Z' },
    { id: 'c', status: 'sent', run_at: '2026-06-19T00:00:00.000Z' },
  ];
  const due = dueSteps(steps, '2026-06-21T00:00:00.000Z');
  assert.deepEqual(due.map((s) => s.id), ['a']);
});

test('buildFollowUpDigest returns null when nobody is due', () => {
  assert.equal(buildFollowUpDigest([]), null);
});

test('buildFollowUpDigest lists due sellers', () => {
  const d = buildFollowUpDigest([{ name: 'Jane', next_follow_up: '2026-06-20' }, { name: 'Bob', next_follow_up: '2026-06-19' }]);
  assert.match(d.subject, /2 seller/i);
  assert.match(d.html, /Jane/);
  assert.match(d.html, /Bob/);
});

test('shouldSendDigest is true only when the date changed', () => {
  assert.equal(shouldSendDigest('2026-06-19', '2026-06-20'), true);
  assert.equal(shouldSendDigest('2026-06-20', '2026-06-20'), false);
  assert.equal(shouldSendDigest('', '2026-06-20'), true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && node --test src/scheduling.test.js`
Expected: FAIL — `Cannot find module './scheduling.js'`.

- [ ] **Step 3: Write the implementation**

Create `backend/src/scheduling.js`:

```js
const DAY_MS = 86400000;

export function campaignRunAts(startISO, offsetsDays) {
  const start = new Date(startISO).getTime();
  return offsetsDays.map((d) => new Date(start + d * DAY_MS).toISOString());
}

export function dueSteps(steps, nowISO) {
  return steps.filter((s) => s.status === 'pending' && s.run_at <= nowISO);
}

export function buildFollowUpDigest(dueList) {
  if (!dueList || dueList.length === 0) return null;
  const rows = dueList.map((s) => `<li>${s.name} — due ${s.next_follow_up}</li>`).join('');
  return {
    subject: `Follow-up digest: ${dueList.length} seller${dueList.length === 1 ? '' : 's'} due`,
    html: `<h2>Sellers due for follow-up</h2><ul>${rows}</ul>`,
  };
}

export function shouldSendDigest(lastDigestDate, today) {
  return lastDigestDate !== today;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && node --test src/scheduling.test.js`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/scheduling.js backend/src/scheduling.test.js
git commit -m "feat(scheduler): pure scheduling, due-step, and digest logic"
```

---

### Task 2: Tables, config, and schema

Persistence for campaigns/steps/app-state, the digest-recipient config, and the campaign-create schema.

**Files:**
- Modify: `backend/src/db.js` (three tables)
- Modify: `backend/src/config.js` (`notifyEmail`)
- Modify: `backend/src/schemas.js` (`campaignCreateSchema`)

**Interfaces:**
- Produces: `campaigns`, `campaign_steps`, `app_state` tables; `config.notifyEmail`;
  `campaignCreateSchema = z.object({ name: z.string().optional(), offsets_days: z.array(z.number().int().nonnegative()).min(1).max(10) })`.

- [ ] **Step 1: Add the tables to `db.js`**

In `backend/src/db.js`, inside `initDb()`'s `db.serialize(...)`, after the `activities` table block and the `ALTER TABLE sellers ADD COLUMN next_follow_up` line, add:

```js
    // Campaigns (automated outreach) + their timed steps
    db.run(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id TEXT PRIMARY KEY,
        deal_id TEXT,
        name TEXT,
        status TEXT,
        created_at TEXT
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS campaign_steps (
        id TEXT PRIMARY KEY,
        campaign_id TEXT,
        step_no INTEGER,
        run_at TEXT,
        status TEXT,
        created_at TEXT
      )
    `);
    // Key/value app state (e.g. last digest date)
    db.run(`
      CREATE TABLE IF NOT EXISTS app_state (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);
```

- [ ] **Step 2: Add the config key**

In `backend/src/config.js`, add `notifyEmail` next to `emailFrom`:

```js
  emailFrom: process.env.EMAIL_FROM || '',
  notifyEmail: process.env.NOTIFY_EMAIL || '',
```

- [ ] **Step 3: Add the schema**

Append to `backend/src/schemas.js`:

```js
export const campaignCreateSchema = z.object({
  name: z.string().optional(),
  offsets_days: z.array(z.number().int().nonnegative()).min(1).max(10),
});
```

- [ ] **Step 4: Verify the backend still boots and tests pass**

Run: `cd backend && npm test`
Expected: all prior pass (68). This only adds tables, a config field, and an unused schema.

- [ ] **Step 5: Commit**

```bash
git add backend/src/db.js backend/src/config.js backend/src/schemas.js
git commit -m "feat(scheduler): campaigns/steps/app_state tables, notifyEmail, schema"
```

---

### Task 3: Campaign CRUD endpoints

Create, list, and change the status of campaigns. (Processing comes in Task 4.)

**Files:**
- Modify: `backend/src/server.js` (imports + endpoints)
- Test: `backend/src/campaigns.routes.test.js`

**Interfaces:**
- Consumes: `campaignRunAts` (`./scheduling.js`); `campaignCreateSchema` (`./schemas.js`); `dbAll/dbGet/dbRun`, `uuid`, `asyncHandler`, `validateBody`.
- Produces (HTTP):
  - `POST /api/deals/:id/campaigns` (body `campaignCreateSchema`) → `{ ...campaign, steps }` (404 if the deal is missing).
  - `GET /api/deals/:id/campaigns` and `GET /api/campaigns` → campaigns with `steps`, newest first.
  - `POST /api/campaigns/:id/pause|resume|cancel` → `{ success:true }` (404 if missing).
- A campaign row: `{ id, deal_id, name, status, created_at }`; a step row: `{ id, campaign_id, step_no, run_at, status, created_at }`.

- [ ] **Step 1: Add imports to `server.js`**

Below the existing `import { emailMatchedBuyers, dueSellers } from './outreach.js';` line, add:

```js
import { campaignRunAts, dueSteps, buildFollowUpDigest, shouldSendDigest } from './scheduling.js';
```

Add `campaignCreateSchema` to the existing `from './schemas.js'` import list.

- [ ] **Step 2: Add a campaign-loading helper and the CRUD endpoints**

In `backend/src/server.js`, immediately before `app.use(errorHandler);`, add:

```js
// ========== AUTOMATED CAMPAIGNS ==========

async function loadCampaigns(where = '', params = []) {
  const campaigns = await dbAll(`SELECT * FROM campaigns ${where} ORDER BY created_at DESC`, params);
  for (const c of campaigns) {
    c.steps = await dbAll('SELECT * FROM campaign_steps WHERE campaign_id = ? ORDER BY step_no', [c.id]);
  }
  return campaigns;
}

app.post('/api/deals/:id/campaigns', validateBody(campaignCreateSchema), asyncHandler(async (req, res) => {
  const deal = await dbGet('SELECT * FROM deals WHERE id = ?', [req.params.id]);
  if (!deal) return res.status(404).json({ success: false, error: 'Deal not found' });
  const now = new Date().toISOString();
  const id = uuid();
  const name = req.body.name || `${deal.name} outreach`;
  await dbRun(
    'INSERT INTO campaigns (id, deal_id, name, status, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, deal.id, name, 'active', now],
  );
  const runAts = campaignRunAts(now, req.body.offsets_days);
  for (let i = 0; i < runAts.length; i++) {
    await dbRun(
      'INSERT INTO campaign_steps (id, campaign_id, step_no, run_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [uuid(), id, i + 1, runAts[i], 'pending', now],
    );
  }
  const [campaign] = await loadCampaigns('WHERE id = ?', [id]);
  res.json(campaign);
}));

app.get('/api/deals/:id/campaigns', asyncHandler(async (req, res) => {
  res.json(await loadCampaigns('WHERE deal_id = ?', [req.params.id]));
}));

app.get('/api/campaigns', asyncHandler(async (req, res) => {
  res.json(await loadCampaigns());
}));

function campaignStatusRoute(path, status) {
  app.post(path, asyncHandler(async (req, res) => {
    const campaign = await dbGet('SELECT * FROM campaigns WHERE id = ?', [req.params.id]);
    if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });
    await dbRun('UPDATE campaigns SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ success: true });
  }));
}
campaignStatusRoute('/api/campaigns/:id/pause', 'paused');
campaignStatusRoute('/api/campaigns/:id/resume', 'active');
campaignStatusRoute('/api/campaigns/:id/cancel', 'cancelled');
```

- [ ] **Step 3: Write the failing integration test**

Create `backend/src/campaigns.routes.test.js`:

```js
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from './server.js';
import { db } from './db.js';

after(() => new Promise((resolve) => db.close(() => resolve())));

async function makeDeal() {
  const res = await request(app).post('/api/deals').send({
    name: 'Campaign Deal', city: 'Atlanta', state: 'GA',
    purchase_price: 100000, repair_budget: 0, arv: 200000, selling_costs: 0, holding_costs: 0, wholesale_fee: 0,
  });
  return res.body.id;
}

test('POST /api/deals/:id/campaigns creates a campaign with steps', async () => {
  const dealId = await makeDeal();
  const res = await request(app).post(`/api/deals/${dealId}/campaigns`).send({ offsets_days: [0, 3, 7] });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'active');
  assert.equal(res.body.steps.length, 3);
  assert.ok(res.body.steps[0].run_at, 'step has a run_at');
  await request(app).delete(`/api/deals/${dealId}`);
});

test('POST /api/deals/:id/campaigns validates offsets_days', async () => {
  const dealId = await makeDeal();
  const res = await request(app).post(`/api/deals/${dealId}/campaigns`).send({ offsets_days: [] });
  assert.equal(res.status, 400);
  await request(app).delete(`/api/deals/${dealId}`);
});

test('pause/resume/cancel change campaign status', async () => {
  const dealId = await makeDeal();
  const created = await request(app).post(`/api/deals/${dealId}/campaigns`).send({ offsets_days: [0] });
  const cid = created.body.id;
  await request(app).post(`/api/campaigns/${cid}/pause`);
  let all = await request(app).get('/api/campaigns');
  assert.equal(all.body.find((c) => c.id === cid).status, 'paused');
  await request(app).post(`/api/campaigns/${cid}/cancel`);
  all = await request(app).get('/api/campaigns');
  assert.equal(all.body.find((c) => c.id === cid).status, 'cancelled');
  await request(app).delete(`/api/deals/${dealId}`);
});
```

- [ ] **Step 4: Run the tests**

Run: `cd backend && node --test src/campaigns.routes.test.js`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/server.js backend/src/campaigns.routes.test.js
git commit -m "feat(scheduler): campaign create/list/pause/resume/cancel endpoints"
```

---

### Task 4: Processing, digest, the scheduler tick, and the manual-run endpoint

Wire the pure logic to the DB and email path: process due steps, send the daily digest, and expose a manual run. Start the interval only when running as main.

**Files:**
- Modify: `backend/src/server.js` (processing functions, `/api/scheduler/run`, interval in `isMain`)
- Test: `backend/src/scheduler.routes.test.js`

**Interfaces:**
- Consumes: `dueSteps`, `buildFollowUpDigest`, `shouldSendDigest` (`./scheduling.js`); `dueSellers`, `emailMatchedBuyers` (`./outreach.js`); `sendEmail` (`./email-service.js`); `matchBuyers` (`./analytics.js`); `recordActivities`, `loadCampaigns`, `config`, `dbAll/dbGet/dbRun`, `uuid`.
- Produces: `processDueCampaigns(nowISO, send)`, `maybeSendDigest(today, send, notifyTo)`, `runScheduler()`; `POST /api/scheduler/run → { success:true, stepsProcessed, digestSent }`.

- [ ] **Step 1: Add the processing functions and endpoint**

In `backend/src/server.js`, inside the `// ========== AUTOMATED CAMPAIGNS ==========` section (after the status routes), add:

```js
async function setAppState(key, value) {
  await dbRun(
    'INSERT INTO app_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
}

async function getAppState(key) {
  const row = await dbGet('SELECT value FROM app_state WHERE key = ?', [key]);
  return row ? row.value : '';
}

async function processDueCampaigns(nowISO, send) {
  const campaigns = await loadCampaigns("WHERE status = 'active'");
  let stepsProcessed = 0;
  for (const campaign of campaigns) {
    const due = dueSteps(campaign.steps, nowISO);
    if (due.length === 0) continue;
    const deal = await dbGet('SELECT * FROM deals WHERE id = ?', [campaign.deal_id]);
    if (!deal) continue;
    const buyers = await dbAll('SELECT * FROM buyers');
    const matches = matchBuyers(deal, buyers);
    for (const step of due) {
      const outcome = await emailMatchedBuyers(deal, matches, send);
      await recordActivities(deal.id, outcome.activities);
      await dbRun('UPDATE campaign_steps SET status = ? WHERE id = ?', ['sent', step.id]);
      stepsProcessed += 1;
    }
    const remaining = await dbGet(
      "SELECT COUNT(*) AS n FROM campaign_steps WHERE campaign_id = ? AND status = 'pending'",
      [campaign.id],
    );
    if (remaining.n === 0) await dbRun('UPDATE campaigns SET status = ? WHERE id = ?', ['done', campaign.id]);
  }
  return stepsProcessed;
}

async function maybeSendDigest(today, send, notifyTo) {
  if (!notifyTo) return false;
  const last = await getAppState('last_digest_date');
  if (!shouldSendDigest(last, today)) return false;
  const sellers = await dbAll('SELECT * FROM sellers');
  const digest = buildFollowUpDigest(dueSellers(sellers, today));
  if (!digest) return false;
  const r = await send({ to: notifyTo, subject: digest.subject, html: digest.html });
  await recordActivities(null, [{
    contact_type: 'owner', contact_id: '', contact_name: notifyTo, channel: 'email',
    subject: digest.subject, status: r.success ? 'sent' : 'failed', detail: r.error || '',
  }]);
  await setAppState('last_digest_date', today);
  return true;
}

async function runScheduler() {
  const send = (msg) => sendEmail(msg);
  const now = new Date();
  const stepsProcessed = await processDueCampaigns(now.toISOString(), send);
  const digestSent = await maybeSendDigest(now.toISOString().slice(0, 10), send, config.notifyEmail || config.emailFrom);
  return { stepsProcessed, digestSent };
}

app.post('/api/scheduler/run', asyncHandler(async (req, res) => {
  const result = await runScheduler();
  res.json({ success: true, ...result });
}));
```

- [ ] **Step 2: Start the interval only when running as main**

In `backend/src/server.js`, in the existing `isMain` block, add the interval inside the `app.listen` callback (or right after it):

```js
if (isMain) {
  app.listen(config.port, () => {
    console.log(`Server running on http://localhost:${config.port}`);
  });
  // Process due campaigns + the daily digest every 60s. Lives here (not on
  // import) so the test suite never starts the scheduler.
  setInterval(() => runScheduler().catch((e) => console.error('scheduler error', e)), 60000);
}
```

(If `isMain`/`app.listen` already exist at the bottom of the file, add only the `setInterval` line inside the `if (isMain)` block.)

- [ ] **Step 3: Write the failing integration test**

Create `backend/src/scheduler.routes.test.js`:

```js
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from './server.js';
import { db } from './db.js';

after(() => new Promise((resolve) => db.close(() => resolve())));

test('POST /api/scheduler/run processes a due campaign step and logs activity', async () => {
  // A buyer with an email in Atlanta will match an Atlanta deal.
  await request(app).post('/api/buyers').send({
    name: 'Campaign Buyer', email: 'cb@example.com', cash_available: 500000,
    deal_types: 'wholesale', preferred_areas: 'Atlanta',
  });
  const deal = await request(app).post('/api/deals').send({
    name: 'Sched Deal', city: 'Atlanta', state: 'GA', deal_type: 'wholesale',
    purchase_price: 100000, repair_budget: 0, arv: 200000, selling_costs: 0, holding_costs: 0, wholesale_fee: 0,
  });
  // Offset 0 => the step is due immediately.
  const campaign = await request(app).post(`/api/deals/${deal.body.id}/campaigns`).send({ offsets_days: [0] });

  const run = await request(app).post('/api/scheduler/run');
  assert.equal(run.status, 200);
  assert.ok(run.body.stepsProcessed >= 1, 'at least one step processed');

  // The campaign's single step is now sent; the campaign is done.
  const all = await request(app).get('/api/campaigns');
  const mine = all.body.find((c) => c.id === campaign.body.id);
  assert.equal(mine.steps[0].status, 'sent');
  assert.equal(mine.status, 'done');

  // An activity was logged for the deal (email disabled in tests => status failed/skipped, never a real send).
  const acts = await request(app).get(`/api/deals/${deal.body.id}/activities`);
  assert.ok(acts.body.length >= 1);

  await request(app).delete(`/api/deals/${deal.body.id}`);
});

test('POST /api/scheduler/run is idempotent for already-sent steps', async () => {
  const res = await request(app).post('/api/scheduler/run');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
});
```

- [ ] **Step 4: Run the tests**

Run: `cd backend && node --test src/scheduler.routes.test.js`
Expected: PASS — 2 tests.

- [ ] **Step 5: Run the full backend suite (twice for stability)**

Run: `cd backend && npm test`
Expected: all pass (68 + Task 1: 5 + Task 3: 3 + Task 4: 2 = 78). Run again to confirm no flakiness from the shared DB.

- [ ] **Step 6: Commit**

```bash
git add backend/src/server.js backend/src/scheduler.routes.test.js
git commit -m "feat(scheduler): process due campaigns + daily digest + manual run + interval"
```

---

### Task 5: Frontend types and client functions

**Files:**
- Modify: `src/api/types.ts`
- Modify: `src/api/client.ts`

**Interfaces:**
- Produces:
  - `CampaignStep { id: string; campaign_id: string; step_no: number; run_at: string; status: string }`; `Campaign { id: string; deal_id: string; name: string; status: string; created_at: string; steps: CampaignStep[] }`.
  - `createCampaign(dealId, body: { name?: string; offsets_days: number[] }): Promise<Campaign>`; `getCampaigns(): Promise<Campaign[]>`; `getDealCampaigns(dealId): Promise<Campaign[]>`; `pauseCampaign(id)`, `resumeCampaign(id)`, `cancelCampaign(id)` each `→ Promise<{ success: boolean }>`; `runScheduler(): Promise<{ success: boolean; stepsProcessed: number; digestSent: boolean }>`.

- [ ] **Step 1: Add types**

Append to `src/api/types.ts`:

```ts
export interface CampaignStep {
  id: string;
  campaign_id: string;
  step_no: number;
  run_at: string;
  status: string;
}

export interface Campaign {
  id: string;
  deal_id: string;
  name: string;
  status: string;
  created_at: string;
  steps: CampaignStep[];
}
```

- [ ] **Step 2: Add client functions**

In `src/api/client.ts`, extend the type import to include `Campaign`, then append:

```ts
export const createCampaign = (dealId: string, body: { name?: string; offsets_days: number[] }) =>
  apiFetch<Campaign>(`/api/deals/${dealId}/campaigns`, jsonBody(body));
export const getCampaigns = () => apiFetch<Campaign[]>('/api/campaigns');
export const getDealCampaigns = (dealId: string) => apiFetch<Campaign[]>(`/api/deals/${dealId}/campaigns`);
export const pauseCampaign = (id: string) => apiFetch<{ success: boolean }>(`/api/campaigns/${id}/pause`, { method: 'POST' });
export const resumeCampaign = (id: string) => apiFetch<{ success: boolean }>(`/api/campaigns/${id}/resume`, { method: 'POST' });
export const cancelCampaign = (id: string) => apiFetch<{ success: boolean }>(`/api/campaigns/${id}/cancel`, { method: 'POST' });
export const runScheduler = () =>
  apiFetch<{ success: boolean; stepsProcessed: number; digestSent: boolean }>('/api/scheduler/run', { method: 'POST' });
```

- [ ] **Step 3: Typecheck and build**

Run: `npm run build`
Expected: `tsc` + Vite build succeed.

- [ ] **Step 4: Commit**

```bash
git add src/api/types.ts src/api/client.ts
git commit -m "feat(scheduler): client types and calls for campaigns"
```

---

### Task 6: Deals "Automate" action

A per-deal cadence picker that creates a campaign after a confirmation.

**Files:**
- Modify: `src/pages/Deals.tsx`

**Interfaces:**
- Consumes: `createCampaign` from the client.
- Produces: no new exports; an "Automate" button + inline preset picker on each deal.

- [ ] **Step 1: Add the cadence presets, handler, and UI to `Deals.tsx`**

Add `createCampaign` to the client import in `src/pages/Deals.tsx`:

```tsx
import { getDeals, updateDeal, deleteDeal, getDealMatches, emailMatchedBuyers, getDealActivities, createCampaign } from '../api/client';
```

Add `Link`-based navigation is already imported. Add the presets constant near the top of the file (after the existing `STATUSES` constant):

```tsx
const CADENCES: { label: string; offsets: number[] }[] = [
  { label: 'Single blast (now)', offsets: [0] },
  { label: 'Two-touch (now, +3d)', offsets: [0, 3] },
  { label: 'Three-touch (now, +3d, +7d)', offsets: [0, 3, 7] },
];
```

Inside the `Deals` component, add state and a handler next to the others:

```tsx
  const [automateFor, setAutomateFor] = useState<string | null>(null);

  const handleAutomate = async (deal: Deal, offsets: number[]) => {
    setActionError(null);
    if (!window.confirm('Create an automated campaign that emails matched buyers on this schedule? Sends fire automatically.')) return;
    try {
      await createCampaign(deal.id, { offsets_days: offsets });
      setAutomateFor(null);
      setEmailMsg((m) => ({ ...m, [deal.id]: 'Campaign created — see the Campaigns page.' }));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };
```

In the per-deal actions row, add an "Automate" button after the "Activity" button:

```tsx
                  <button className="ghost-button" onClick={() => setAutomateFor(automateFor === deal.id ? null : deal.id)}>Automate</button>
```

Immediately after the actions `<div>` (before the `matches[deal.id]` block), add the inline picker:

```tsx
                {automateFor === deal.id && (
                  <div className="results-card">
                    <h3>Automate outreach</h3>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {CADENCES.map((c) => (
                        <button key={c.label} className="ghost-button" onClick={() => handleAutomate(deal, c.offsets)}>{c.label}</button>
                      ))}
                    </div>
                  </div>
                )}
```

- [ ] **Step 2: Typecheck and build**

Run: `npm run build`
Expected: `tsc` + Vite build succeed.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Deals.tsx
git commit -m "feat(scheduler): Deals Automate action with cadence presets"
```

---

### Task 7: Campaigns page + route + nav

A page listing campaigns with step status and controls, plus a manual "Run due now".

**Files:**
- Create: `src/pages/Campaigns.tsx`
- Modify: `src/App.tsx` (route)
- Modify: `src/components/AppLayout.tsx` (nav link)

**Interfaces:**
- Consumes: `getCampaigns`, `pauseCampaign`, `resumeCampaign`, `cancelCampaign`, `runScheduler` from the client; `useAsync`; `Loading`/`ErrorBanner`/`Empty`; type `Campaign`.
- Produces: `export function Campaigns()`; a `/campaigns` route inside `AppLayout`; a "Campaigns" nav entry.

- [ ] **Step 1: Create the page**

Create `src/pages/Campaigns.tsx`:

```tsx
import { useState } from 'react';
import { getCampaigns, pauseCampaign, resumeCampaign, cancelCampaign, runScheduler } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorBanner, Empty } from '../components/states';
import type { Campaign } from '../api/types';

export function Campaigns() {
  const list = useAsync<Campaign[]>(getCampaigns, true);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const campaigns = list.data ?? [];

  const act = async (fn: () => Promise<unknown>, after: string) => {
    setError(null); setMsg(null);
    try {
      await fn();
      await list.run();
      setMsg(after);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <header className="hero-panel">
        <p className="eyebrow">Automation</p>
        <h1>Campaigns</h1>
        <p>Scheduled email outreach to matched buyers. Steps fire automatically; use “Run due now” to process immediately.</p>
      </header>

      <div className="layout-single">
        <section className="panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h2>All campaigns ({campaigns.length})</h2>
            <button onClick={() => act(() => runScheduler(), 'Scheduler run complete.')}>Run due now</button>
          </div>
          <p className="text-muted">Automated sends use Resend. With the test sender <code>onboarding@resend.dev</code>, only your own account email receives mail until you verify a domain.</p>
          {msg && <p className="good-deal">{msg}</p>}
          {error && <ErrorBanner message={error} />}
          {list.loading && <Loading label="Loading campaigns…" />}
          {list.error && <ErrorBanner message={list.error} onRetry={() => list.run()} />}
          {!list.loading && !list.error && campaigns.length === 0 && <Empty message="No campaigns yet. Use Automate on a deal to create one." />}

          <div className="seller-list">
            {campaigns.map((c) => (
              <div key={c.id} className="seller-card">
                <div className="seller-header">
                  <strong>{c.name}</strong>
                  <span className={`pill pill-${c.status}`}>{c.status}</span>
                </div>
                <div className="match-list">
                  {c.steps.map((s) => (
                    <div key={s.id} className="match-row">
                      <span>Step {s.step_no}</span>
                      <span className="text-muted">{new Date(s.run_at).toLocaleString()}</span>
                      <span>{s.status}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  {c.status === 'active' && <button className="ghost-button" onClick={() => act(() => pauseCampaign(c.id), 'Paused.')}>Pause</button>}
                  {c.status === 'paused' && <button className="ghost-button" onClick={() => act(() => resumeCampaign(c.id), 'Resumed.')}>Resume</button>}
                  {(c.status === 'active' || c.status === 'paused') && <button className="ghost-button" onClick={() => act(() => cancelCampaign(c.id), 'Cancelled.')}>Cancel</button>}
                </div>
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
import { Campaigns } from './pages/Campaigns';
```

Add this route inside the `<Route element={<AppLayout />}>` block (e.g. after the `follow-ups` route):

```tsx
        <Route path="campaigns" element={<Campaigns />} />
```

- [ ] **Step 3: Add the nav link in `AppLayout.tsx`**

In the `NAV` array in `src/components/AppLayout.tsx`, add an entry after the `Follow-ups` entry:

```tsx
  { to: '/campaigns', label: 'Campaigns' },
```

- [ ] **Step 4: Typecheck and build**

Run: `npm run build`
Expected: `tsc` + Vite build succeed.

- [ ] **Step 5: Manual click-through**

Start both servers. Create a campaign via **Automate** on a deal, open **Campaigns**: confirm the campaign and its steps render with statuses; click **Run due now** → step statuses advance to `sent` and the campaign becomes `done`; **Pause/Resume/Cancel** change the status. (With `onboarding@resend.dev`, no mail goes to other buyers.)

- [ ] **Step 6: Commit**

```bash
git add src/pages/Campaigns.tsx src/App.tsx src/components/AppLayout.tsx
git commit -m "feat(scheduler): Campaigns page with steps, controls, and Run due now"
```

---

### Task 8: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Backend suite (twice)**

Run: `cd backend && npm test`
Expected: all pass (78). Run again to confirm stability. Confirm no test takes hundreds of ms from a real network call (email is blanked by `test-setup.js`).

- [ ] **Step 2: Frontend suite**

Run: `npm test`
Expected: vitest 18 passing (unchanged; this phase's logic is backend-side).

- [ ] **Step 3: Frontend build**

Run: `npm run build`
Expected: `tsc` + Vite build succeed.

- [ ] **Step 4: End-to-end smoke (manual)**

With both servers running: Automate a deal → Campaigns shows it → Run due now → steps `sent`, campaign `done`, and the deal's activity history shows the send rows. Confirm nav works across the app.

---

## Self-Review

**1. Spec coverage**

| Spec item | Task |
| --- | --- |
| Pure scheduling: `campaignRunAts`, `dueSteps`, `buildFollowUpDigest`, `shouldSendDigest` | Task 1 |
| `campaigns`/`campaign_steps`/`app_state` tables; `notifyEmail`; `campaignCreateSchema` | Task 2 |
| Campaign create/list/pause/resume/cancel endpoints | Task 3 |
| `processDueCampaigns` (active only, mark sent, campaign→done) | Task 4 |
| `maybeSendDigest` once/day to `notifyEmail`‖`emailFrom`, logs activity | Task 4 |
| `runScheduler` + `POST /api/scheduler/run` | Task 4 |
| Interval starts only in `isMain` | Task 4 |
| Reuse `emailMatchedBuyers`/`sendEmail`; log to `activities` | Task 4 |
| Frontend types + client | Task 5 |
| Deals "Automate" cadence picker + confirm | Task 6 |
| Campaigns page (steps, status, pause/resume/cancel, Run due now) + nav/route | Task 7 |
| Tests: pure unit + integration; no auto-fire; email blanked | Tasks 1, 3, 4, 8 |

All spec sections map to tasks.

**2. Placeholder scan:** No `TBD`/`TODO`/"add appropriate…". Every code step has full code; every test step has assertions. `recordActivities` and `loadCampaigns` are defined before use (`recordActivities` already exists from Phase 6B; `loadCampaigns` is defined in Task 3 and used in Task 4).

**3. Type consistency:** `campaignRunAts`/`dueSteps`/`buildFollowUpDigest`/`shouldSendDigest` signatures (Task 1) match their uses in Task 3 (`campaignRunAts`) and Task 4 (the rest). Campaign/step row shapes from the endpoints (Task 3) match the frontend `Campaign`/`CampaignStep` types (Task 5) and the Campaigns page usage (Task 7). `offsets_days` is the field name in the schema (Task 2), endpoint (Task 3), client (Task 5), and Deals picker (Task 6). `runScheduler()` returns `{ stepsProcessed, digestSent }` (Task 4) and the client/UI consume exactly those (Tasks 5, 7). `recordActivities(dealId, activities)` (Phase 6B) is called with a `null` dealId for the digest activity (Task 4), consistent with the nullable `deal_id` column.
