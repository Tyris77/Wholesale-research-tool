# Phase 8 — Campaign Analytics: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ingest Resend delivery webhooks (Svix-verified), attribute each event to the campaign that sent the email, and surface per-campaign delivered/opened/clicked/bounced stats.

**Architecture:** Pure functions (`analytics-events.js`) parse events, verify Svix signatures with Node `crypto`, and aggregate stats. Campaign sends now record the Resend `email_id` + `campaign_id` on their `activities` row; a public webhook stores events in `email_events`; a stats endpoint joins them by `email_id`. The Campaigns page gains a per-campaign Stats view.

**Tech Stack:** Backend — Node.js (ESM), Express 4, sqlite3, `node:test` + supertest, Node `crypto`. Frontend — React 18, Vite 5, TypeScript, vitest.

## Global Constraints

- Verify webhooks with **Svix signatures** using Node's built-in `crypto` — no new dependency. (Spec: Decisions.)
- The webhook secret is read **live** from `process.env.RESEND_WEBHOOK_SECRET` in the endpoint (not frozen config); when unset, the webhook accepts (dev). (Spec: Decisions.)
- Attribute events via the Resend `email_id` stored on the send's `activities` row, plus `campaign_id`. (Spec: Decisions.)
- Stat metrics are **de-duped by `email_id`** (a metric counts distinct emails with ≥1 matching event). (Spec: Architecture.)
- The webhook is the only public write endpoint; it only appends `email_events` rows. (Spec: Security.)
- Tests never perform a real send (email blanked by `backend/test-setup.js`); attribution correctness is covered by the `summarizeEvents` unit test. (Spec: Testing.)
- Idempotent migrations (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE … ADD COLUMN` with swallowed-error callback). (Spec: Architecture.)
- Resend event type strings: `email.delivered`, `email.opened`, `email.clicked`, `email.bounced`. (Spec: Architecture.)
- Follow existing patterns: promisified `dbAll/dbGet/dbRun`; `asyncHandler`; typed client; `useAsync` + state components.

---

### Task 1: Pure analytics-events module (parse, summarize, verify)

The deterministic functions: parse a Resend event, aggregate stats, and verify a Svix signature.

**Files:**
- Create: `backend/src/analytics-events.js`
- Test: `backend/src/analytics-events.test.js`

**Interfaces:**
- Produces:
  - `parseResendEvent(body) → { email_id, type, recipient, created_at } | null`.
  - `summarizeEvents(sentEmailIds, events) → { sent, delivered, opened, clicked, bounced }`.
  - `verifySvixSignature({ secret, id, timestamp, signature, body }) → boolean`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/analytics-events.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { parseResendEvent, summarizeEvents, verifySvixSignature } from './analytics-events.js';

test('parseResendEvent extracts id, type, recipient, and time', () => {
  const evt = parseResendEvent({
    type: 'email.opened',
    created_at: '2026-06-20T00:00:00.000Z',
    data: { email_id: 'e1', to: ['a@b.com'] },
  });
  assert.deepEqual(evt, { email_id: 'e1', type: 'email.opened', recipient: 'a@b.com', created_at: '2026-06-20T00:00:00.000Z' });
});

test('parseResendEvent returns null without a type or email id', () => {
  assert.equal(parseResendEvent({ data: { email_id: 'e1' } }), null);
  assert.equal(parseResendEvent({ type: 'email.opened', data: {} }), null);
  assert.equal(parseResendEvent(null), null);
});

test('summarizeEvents counts distinct emails per event type', () => {
  const sent = ['e1', 'e2', 'e3'];
  const events = [
    { email_id: 'e1', type: 'email.delivered' },
    { email_id: 'e1', type: 'email.opened' },
    { email_id: 'e1', type: 'email.opened' }, // duplicate open, still one
    { email_id: 'e2', type: 'email.delivered' },
    { email_id: 'e9', type: 'email.opened' },  // not in sent set, ignored
  ];
  assert.deepEqual(summarizeEvents(sent, events), { sent: 3, delivered: 2, opened: 1, clicked: 0, bounced: 0 });
});

test('verifySvixSignature accepts a correctly signed body and rejects tampering', () => {
  const secret = 'whsec_' + Buffer.from('supersecretkey').toString('base64');
  const id = 'msg_1';
  const timestamp = '1718841600';
  const body = JSON.stringify({ type: 'email.opened', data: { email_id: 'e1' } });
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const sig = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
  const signature = `v1,${sig}`;

  assert.equal(verifySvixSignature({ secret, id, timestamp, signature, body }), true);
  assert.equal(verifySvixSignature({ secret, id, timestamp, signature, body: body + 'x' }), false);
  assert.equal(verifySvixSignature({ secret, id, timestamp, signature: 'v1,bad', body }), false);
  assert.equal(verifySvixSignature({ secret, id: '', timestamp, signature, body }), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && node --test src/analytics-events.test.js`
Expected: FAIL — `Cannot find module './analytics-events.js'`.

- [ ] **Step 3: Write the implementation**

Create `backend/src/analytics-events.js`:

```js
import crypto from 'node:crypto';

export function parseResendEvent(body) {
  if (!body || !body.type || !body.data || !body.data.email_id) return null;
  const to = body.data.to;
  return {
    email_id: body.data.email_id,
    type: body.type,
    recipient: Array.isArray(to) ? (to[0] || '') : (to || ''),
    created_at: body.created_at || new Date().toISOString(),
  };
}

export function summarizeEvents(sentEmailIds, events) {
  const ids = new Set(sentEmailIds);
  const distinct = (type) =>
    new Set(events.filter((e) => e.type === type && ids.has(e.email_id)).map((e) => e.email_id)).size;
  return {
    sent: ids.size,
    delivered: distinct('email.delivered'),
    opened: distinct('email.opened'),
    clicked: distinct('email.clicked'),
    bounced: distinct('email.bounced'),
  };
}

function timingSafeEqualStr(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function verifySvixSignature({ secret, id, timestamp, signature, body }) {
  if (!secret || !id || !timestamp || !signature) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
  return signature.split(' ').some((part) => {
    const comma = part.indexOf(',');
    const sig = comma >= 0 ? part.slice(comma + 1) : part;
    return sig.length > 0 && timingSafeEqualStr(sig, expected);
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && node --test src/analytics-events.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/analytics-events.js backend/src/analytics-events.test.js
git commit -m "feat(analytics): pure event parse, stats summary, and Svix verify"
```

---

### Task 2: Tables, attribution columns, and send wiring

The `email_events` table, the `activities` attribution columns, and recording `email_id` + `campaign_id` on sends.

**Files:**
- Modify: `backend/src/db.js` (table + two migrations)
- Modify: `backend/src/outreach.js` (`emailMatchedBuyers` records `email_id`)
- Modify: `backend/src/server.js` (`recordActivities` writes `email_id`/`campaign_id`; campaign processing passes `campaign.id`)
- Modify: `backend/.env.example`
- Test: `backend/src/outreach.test.js` (extend)

**Interfaces:**
- Consumes: `emailMatchedBuyers` (Phase 6B) now returns activity objects that include `email_id`.
- Produces: `email_events` table; `activities.email_id`, `activities.campaign_id`; `recordActivities(dealId, activities, campaignId = null)`.

- [ ] **Step 1: Write the failing test (email_id on activity objects)**

Add to `backend/src/outreach.test.js`:

```js
test('emailMatchedBuyers records the Resend email_id on a sent activity', async () => {
  const matches = [{ buyer: { id: 'b1', name: 'Anna', email: 'anna@x.com' } }];
  const send = async () => ({ success: true, id: 'email_abc' });
  const r = await emailMatchedBuyers(deal, matches, send);
  assert.equal(r.activities[0].email_id, 'email_abc');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && node --test src/outreach.test.js`
Expected: FAIL — `email_id` is `undefined`.

- [ ] **Step 3: Add `email_id` to the activity objects in `outreach.js`**

In `backend/src/outreach.js`, in `emailMatchedBuyers`, set `email_id` on each pushed activity. Replace the loop body's three `activities.push(...)` calls so each includes `email_id`:

```js
    if (!buyer.email) {
      skipped += 1;
      activities.push({ ...base, status: 'skipped', detail: 'No email on file', email_id: '' });
      results.push({ buyer_id: buyer.id, name: buyer.name, status: 'skipped' });
      continue;
    }
    const r = await send({ to: buyer.email, subject, html });
    if (r.success) {
      sent += 1;
      activities.push({ ...base, status: 'sent', detail: r.id || '', email_id: r.id || '' });
      results.push({ buyer_id: buyer.id, name: buyer.name, status: 'sent' });
    } else {
      failed += 1;
      activities.push({ ...base, status: 'failed', detail: r.error || 'send failed', email_id: '' });
      results.push({ buyer_id: buyer.id, name: buyer.name, status: 'failed', error: r.error });
    }
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd backend && node --test src/outreach.test.js`
Expected: PASS.

- [ ] **Step 5: Add the table + migrations to `db.js`**

In `backend/src/db.js`, inside `initDb()`'s `db.serialize(...)`, after the `app_state` table block, add:

```js
    // Email delivery events (Resend webhooks)
    db.run(`
      CREATE TABLE IF NOT EXISTS email_events (
        id TEXT PRIMARY KEY,
        email_id TEXT,
        type TEXT,
        recipient TEXT,
        created_at TEXT,
        received_at TEXT
      )
    `);
    // Attribution columns on activities (migration for pre-existing DBs).
    db.run('ALTER TABLE activities ADD COLUMN email_id TEXT', () => {});
    db.run('ALTER TABLE activities ADD COLUMN campaign_id TEXT', () => {});
```

- [ ] **Step 6: Update `recordActivities` and campaign processing in `server.js`**

In `backend/src/server.js`, replace the existing `recordActivities` function with the version below (adds the `campaignId` param and the two columns):

```js
async function recordActivities(dealId, activities, campaignId = null) {
  const now = new Date().toISOString();
  for (const a of activities) {
    await dbRun(
      `INSERT INTO activities (id, deal_id, campaign_id, contact_type, contact_id, contact_name, channel, subject, status, detail, email_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuid(), dealId, campaignId, a.contact_type, a.contact_id, a.contact_name, a.channel, a.subject, a.status, a.detail, a.email_id || '', now],
    );
  }
}
```

In `processDueCampaigns`, pass the campaign id when recording:

```js
      await recordActivities(deal.id, outcome.activities, campaign.id);
```

- [ ] **Step 7: Document the webhook secret**

Append to `backend/.env.example`:

```
# Resend webhook signing secret (Phase 8 analytics). Copy the "whsec_..." value
# Resend shows when you add a webhook endpoint. Leave unset to skip verification.
RESEND_WEBHOOK_SECRET=whsec_your_webhook_signing_secret
```

- [ ] **Step 8: Run the backend suite**

Run: `cd backend && npm test`
Expected: all pass (78 + Task 1: 4 + this task's 1 = 83). The existing email-buyers/scheduler tests still pass — the new `activities` columns are additive and `recordActivities` keeps the same call sites (campaign processing now passes a third arg).

- [ ] **Step 9: Commit**

```bash
git add backend/src/db.js backend/src/outreach.js backend/src/outreach.test.js backend/src/server.js backend/.env.example
git commit -m "feat(analytics): email_events table, activity attribution, send wiring"
```

---

### Task 3: Webhook + stats endpoints

The public Svix-verified webhook that stores events, and the per-campaign stats endpoint.

**Files:**
- Modify: `backend/src/server.js` (raw-body carve-out, imports, two endpoints)
- Test: `backend/src/analytics.routes.test.js`

**Interfaces:**
- Consumes: `parseResendEvent`, `summarizeEvents`, `verifySvixSignature` (`./analytics-events.js`); `dbAll/dbRun`, `uuid`, `asyncHandler`, `express`.
- Produces (HTTP):
  - `POST /api/webhooks/resend` — stores a parsed event; `401` on bad signature when a secret is set; `400` on invalid JSON; else `200 { success:true }`.
  - `GET /api/campaigns/:id/stats` → `{ sent, delivered, opened, clicked, bounced }`.

- [ ] **Step 1: Carve the webhook path out of the JSON parser**

In `backend/src/server.js`, replace the global `app.use(express.json());` line with:

```js
const jsonParser = express.json();
app.use((req, res, next) => {
  if (req.path === '/api/webhooks/resend') return next();
  return jsonParser(req, res, next);
});
```

- [ ] **Step 2: Add the import**

Below the existing `import { campaignRunAts, ... } from './scheduling.js';` line, add:

```js
import { parseResendEvent, summarizeEvents, verifySvixSignature } from './analytics-events.js';
```

- [ ] **Step 3: Add the endpoints**

In `backend/src/server.js`, inside the `// ========== AUTOMATED CAMPAIGNS ==========` section (after the `/api/scheduler/run` route), add:

```js
app.post('/api/webhooks/resend', express.raw({ type: '*/*' }), asyncHandler(async (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : (typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}));
  const secret = process.env.RESEND_WEBHOOK_SECRET || '';
  if (secret) {
    const ok = verifySvixSignature({
      secret,
      id: req.get('svix-id'),
      timestamp: req.get('svix-timestamp'),
      signature: req.get('svix-signature'),
      body: raw,
    });
    if (!ok) return res.status(401).json({ success: false, error: 'Invalid signature' });
  }
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({ success: false, error: 'Invalid JSON' });
  }
  const evt = parseResendEvent(payload);
  if (evt) {
    await dbRun(
      'INSERT INTO email_events (id, email_id, type, recipient, created_at, received_at) VALUES (?, ?, ?, ?, ?, ?)',
      [uuid(), evt.email_id, evt.type, evt.recipient, evt.created_at, new Date().toISOString()],
    );
  }
  res.json({ success: true });
}));

app.get('/api/campaigns/:id/stats', asyncHandler(async (req, res) => {
  const rows = await dbAll(
    "SELECT email_id FROM activities WHERE campaign_id = ? AND status = 'sent' AND email_id != ''",
    [req.params.id],
  );
  const events = await dbAll('SELECT email_id, type FROM email_events');
  res.json(summarizeEvents(rows.map((r) => r.email_id), events));
}));
```

- [ ] **Step 4: Write the failing integration test**

Create `backend/src/analytics.routes.test.js`:

```js
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import app from './server.js';
import { db } from './db.js';

after(() => new Promise((resolve) => db.close(() => resolve())));

test('POST /api/webhooks/resend stores a valid event (no secret configured)', async () => {
  delete process.env.RESEND_WEBHOOK_SECRET;
  const res = await request(app)
    .post('/api/webhooks/resend')
    .set('Content-Type', 'application/json')
    .send(JSON.stringify({ type: 'email.delivered', created_at: '2026-06-20T00:00:00.000Z', data: { email_id: 'evt_1', to: ['a@b.com'] } }));
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
});

test('POST /api/webhooks/resend rejects invalid JSON with 400', async () => {
  delete process.env.RESEND_WEBHOOK_SECRET;
  const res = await request(app)
    .post('/api/webhooks/resend')
    .set('Content-Type', 'application/json')
    .send('not json{');
  assert.equal(res.status, 400);
});

test('POST /api/webhooks/resend enforces the Svix signature when a secret is set', async () => {
  process.env.RESEND_WEBHOOK_SECRET = 'whsec_' + Buffer.from('testkey').toString('base64');
  const body = JSON.stringify({ type: 'email.opened', data: { email_id: 'evt_2' } });
  const id = 'msg_1';
  const timestamp = '1718841600';
  const key = Buffer.from(process.env.RESEND_WEBHOOK_SECRET.replace(/^whsec_/, ''), 'base64');
  const sig = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');

  const bad = await request(app).post('/api/webhooks/resend').set('Content-Type', 'application/json').send(body);
  assert.equal(bad.status, 401);

  const good = await request(app)
    .post('/api/webhooks/resend')
    .set('Content-Type', 'application/json')
    .set('svix-id', id).set('svix-timestamp', timestamp).set('svix-signature', `v1,${sig}`)
    .send(body);
  assert.equal(good.status, 200);
  delete process.env.RESEND_WEBHOOK_SECRET;
});

test('GET /api/campaigns/:id/stats returns the documented shape', async () => {
  const deal = await request(app).post('/api/deals').send({
    name: 'Stats Deal', city: 'Atlanta', state: 'GA',
    purchase_price: 100000, repair_budget: 0, arv: 200000, selling_costs: 0, holding_costs: 0, wholesale_fee: 0,
  });
  const campaign = await request(app).post(`/api/deals/${deal.body.id}/campaigns`).send({ offsets_days: [0] });
  const res = await request(app).get(`/api/campaigns/${campaign.body.id}/stats`);
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body).sort(), ['bounced', 'clicked', 'delivered', 'opened', 'sent']);
  assert.equal(res.body.sent, 0);
  await request(app).delete(`/api/deals/${deal.body.id}`);
});
```

- [ ] **Step 5: Run the tests**

Run: `cd backend && node --test src/analytics.routes.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 6: Run the full backend suite (twice)**

Run: `cd backend && npm test`
Expected: all pass (83 + 4 = 87). Run again to confirm stability.

- [ ] **Step 7: Commit**

```bash
git add backend/src/server.js backend/src/analytics.routes.test.js
git commit -m "feat(analytics): Svix-verified Resend webhook + campaign stats endpoint"
```

---

### Task 4: Frontend stats type, client, and Campaigns UI

**Files:**
- Modify: `src/api/types.ts`
- Modify: `src/api/client.ts`
- Modify: `src/pages/Campaigns.tsx`

**Interfaces:**
- Consumes: `getCampaignStats` from the client; existing `act`/`useAsync` patterns in `Campaigns.tsx`.
- Produces: `CampaignStats` type; `getCampaignStats(id): Promise<CampaignStats>`; a per-campaign "Stats" button + display.

- [ ] **Step 1: Add the type**

Append to `src/api/types.ts`:

```ts
export interface CampaignStats {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
}
```

- [ ] **Step 2: Add the client function**

In `src/api/client.ts`, extend the type import to include `CampaignStats`, then append:

```ts
export const getCampaignStats = (id: string) => apiFetch<CampaignStats>(`/api/campaigns/${id}/stats`);
```

- [ ] **Step 3: Add the Stats button + display to `Campaigns.tsx`**

In `src/pages/Campaigns.tsx`, extend the client import to include `getCampaignStats`:

```tsx
import { getCampaigns, pauseCampaign, resumeCampaign, cancelCampaign, runScheduler, getCampaignStats } from '../api/client';
```

Add the type import:

```tsx
import type { Campaign, CampaignStats } from '../api/types';
```

Add state and a loader inside the component (next to `msg`/`error`):

```tsx
  const [stats, setStats] = useState<Record<string, CampaignStats>>({});

  const loadStats = async (id: string) => {
    setError(null);
    try {
      setStats((s) => ({ ...s, [id]: await getCampaignStats(id) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
```

In the per-campaign controls row, add a Stats button (after the Cancel button block):

```tsx
                  <button className="ghost-button" onClick={() => loadStats(c.id)}>Stats</button>
```

Immediately after the controls `<div>` (inside the campaign card), add the stats display:

```tsx
                {stats[c.id] && (
                  <div className="kpi-grid" style={{ marginTop: 8 }}>
                    <div className="kpi"><p className="kpi-label">Sent</p><p className="kpi-value">{stats[c.id].sent}</p></div>
                    <div className="kpi"><p className="kpi-label">Delivered</p><p className="kpi-value">{stats[c.id].delivered}</p></div>
                    <div className="kpi"><p className="kpi-label">Opened</p><p className="kpi-value">{stats[c.id].opened}</p></div>
                    <div className="kpi"><p className="kpi-label">Clicked</p><p className="kpi-value">{stats[c.id].clicked}</p></div>
                    <div className="kpi"><p className="kpi-label">Bounced</p><p className="kpi-value">{stats[c.id].bounced}</p></div>
                  </div>
                )}
```

Update the existing note paragraph to mention the webhook (replace the current `<p className="text-muted">Automated sends use Resend…</p>` line):

```tsx
          <p className="text-muted">Automated sends use Resend. To collect delivery stats, add a Resend webhook (delivered/opened/clicked/bounced) pointing to <code>&lt;your-server&gt;/api/webhooks/resend</code>. With the test sender <code>onboarding@resend.dev</code>, only your own account email receives mail until you verify a domain.</p>
```

- [ ] **Step 4: Typecheck and build**

Run: `npm run build`
Expected: `tsc` + Vite build succeed.

- [ ] **Step 5: Manual click-through**

Start both servers. On **Campaigns**, click **Stats** on a campaign → the five counters render (all zero until a webhook is configured and events arrive). Optionally `POST` a sample event to `/api/webhooks/resend` and confirm the endpoint returns 200.

- [ ] **Step 6: Commit**

```bash
git add src/api/types.ts src/api/client.ts src/pages/Campaigns.tsx
git commit -m "feat(analytics): Campaigns Stats button + per-campaign delivery counts"
```

---

### Task 5: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Backend suite (twice)**

Run: `cd backend && npm test`
Expected: all pass (87). Run again to confirm stability; confirm no test makes a real network call (email blanked by `test-setup.js`).

- [ ] **Step 2: Frontend suite**

Run: `npm test`
Expected: vitest 18 passing (unchanged; this phase's logic is backend-side).

- [ ] **Step 3: Frontend build**

Run: `npm run build`
Expected: `tsc` + Vite build succeed.

- [ ] **Step 4: End-to-end smoke (manual)**

With both servers running: `POST` a sample `email.delivered`/`email.opened` event for a known `email_id` to `/api/webhooks/resend` (200); open **Campaigns**, click **Stats**, and confirm the shape renders. (Real attribution requires a real send + a configured Resend webhook; the join logic is unit-tested.)

---

## Self-Review

**1. Spec coverage**

| Spec item | Task |
| --- | --- |
| `parseResendEvent`, `summarizeEvents`, `verifySvixSignature` (pure) | Task 1 |
| `email_events` table; `activities.email_id`/`campaign_id` migrations | Task 2 |
| Send records `email_id` + `campaign_id` | Task 2 (`emailMatchedBuyers`, `recordActivities`, campaign processing) |
| `POST /api/webhooks/resend` (raw body, Svix verify, 401/400/200) | Task 3 |
| `GET /api/campaigns/:id/stats` (join by email_id) | Task 3 |
| Webhook secret read live from env; `.env.example` documented | Tasks 2 (env), 3 (live read) |
| Frontend `CampaignStats` + `getCampaignStats` + Stats UI + webhook note | Task 4 |
| Tests: pure (parse/summary/verify) + integration (webhook ingest, token gate, stats shape) | Tasks 1, 3, 5 |

All spec sections map to tasks.

**2. Placeholder scan:** No `TBD`/`TODO`/"add appropriate…". Every code step has full code; every test step has assertions. The note that attribution-through-HTTP isn't integration-tested (because tests never send real email) is a stated, deliberate test-design choice, with the join covered by the `summarizeEvents` unit test.

**3. Type consistency:** `parseResendEvent`/`summarizeEvents`/`verifySvixSignature` signatures (Task 1) match their uses in Task 3. The `email_events` columns (Task 2) match the webhook INSERT and the stats `SELECT` (Task 3). `recordActivities(dealId, activities, campaignId)` (Task 2) is called with `campaign.id` in `processDueCampaigns` and with the default `null` elsewhere — consistent with the nullable `campaign_id` column. The activity objects' `email_id` field (Task 2, `outreach.js`) is read by `recordActivities` (Task 2) and stored in the column the stats endpoint reads (Task 3). `CampaignStats` (Task 4) mirrors `summarizeEvents`'s return shape (Task 1). `getCampaignStats(id)` (Task 4) matches `GET /api/campaigns/:id/stats` (Task 3).
