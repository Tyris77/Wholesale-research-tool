# Phase 6B — Outreach & Follow-up: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Email matched buyers about a deal via Resend, record all outreach in an activity log, and track seller follow-ups — all user-initiated, confirmed, and disabled until the email key is configured.

**Architecture:** A Resend email integration (`email-service.js`) and pure orchestration (`outreach.js`) sit behind injectable seams so tests never send real email. A new `activities` table logs every buyer email and seller contact; a `next_follow_up` column drives a "due" follow-up view. New endpoints compose these; the frontend adds an "Email matched buyers" action with a confirm step and a Follow-ups page.

**Tech Stack:** Backend — Node.js (ESM), Express 4, sqlite3, zod 4, uuid, `node:test` + supertest, Resend HTTP API. Frontend — React 18, Vite 5, TypeScript, react-router-dom v7, vitest.

## Global Constraints

- Email provider is **Resend**; the integration is **disabled until `RESEND_API_KEY` (and `EMAIL_FROM`) are configured**, following the existing FRED/RentCast pattern (`isConfigured` in `backend/src/config.js`), and is reported by `/api/health`. (Spec: Decisions.)
- Email is **never sent automatically**; it is user-initiated and **confirmed before sending** (recipient count shown). With no key, the action sends nothing. (Spec: Decisions.)
- The Resend call is behind `sendEmail(...)` with an injectable `fetchFn`; the match-and-send orchestration takes an injected `send`. **Tests never send real email.** (Spec: Decisions / Testing.)
- One shared `activities` table logs buyer emails and seller contacts. (Spec: Decisions.)
- "Due" follow-up = `next_follow_up <= today`, where today is `new Date().toISOString().slice(0,10)`. (Spec: Architecture.)
- Soft failures (email not configured) return `200 { success:false, error }`; 404 for a missing deal. The typed client throws `ApiError` only on non-2xx. (Established pattern.)
- Idempotent schema migration for the new sellers column, matching Phase 4's `deal_type` approach (`ALTER TABLE … ADD COLUMN`, error callback swallows duplicate). (Spec: Architecture.)
- Follow existing patterns: promisified `dbAll/dbGet/dbRun`; `validateBody` + zod; typed client; `useAsync` + `Loading`/`ErrorBanner`/`Empty`.

---

### Task 1: Resend email integration (`email-service.js`) + config

The email sender with the disabled-until-configured behavior, plus config/health/env wiring.

**Files:**
- Create: `backend/src/email-service.js`
- Create: `backend/src/email-service.test.js`
- Modify: `backend/src/config.js`
- Modify: `backend/src/server.js` (health integrations include `resend` automatically via `integrationStatus` — no change needed beyond verifying)
- Modify: `backend/.env.example`

**Interfaces:**
- Consumes: `isConfigured` from `./config.js`.
- Produces: `sendEmail({ to, subject, html }, { apiKey, from, fetchFn }) → Promise<{ success:true, id } | { success:false, error }>`. Defaults: `apiKey = process.env.RESEND_API_KEY`, `from = process.env.EMAIL_FROM`, `fetchFn = fetch`.
- Produces (config): `config.keys.resend`, `config.emailFrom`, and `integrationStatus()` includes `resend`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/email-service.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendEmail } from './email-service.js';

test('sendEmail reports not-configured when no api key', async () => {
  const r = await sendEmail({ to: 'a@b.com', subject: 's', html: '<p>h</p>' }, { apiKey: '', from: 'me@x.com', fetchFn: async () => { throw new Error('should not call'); } });
  assert.equal(r.success, false);
  assert.match(r.error, /RESEND_API_KEY/);
});

test('sendEmail reports not-configured when no from address', async () => {
  const r = await sendEmail({ to: 'a@b.com', subject: 's', html: '<p>h</p>' }, { apiKey: 'k', from: '', fetchFn: async () => { throw new Error('should not call'); } });
  assert.equal(r.success, false);
  assert.match(r.error, /EMAIL_FROM/);
});

test('sendEmail posts to Resend with a Bearer token and returns the id', async () => {
  const captured = {};
  const fetchFn = async (url, opts) => {
    captured.url = url; captured.opts = opts;
    return { ok: true, status: 200, json: async () => ({ id: 'email_123' }) };
  };
  const r = await sendEmail({ to: 'a@b.com', subject: 'Hi', html: '<p>h</p>' }, { apiKey: 'k', from: 'me@x.com', fetchFn });
  assert.equal(r.success, true);
  assert.equal(r.id, 'email_123');
  assert.match(captured.url, /api\.resend\.com\/emails/);
  assert.equal(captured.opts.headers.Authorization, 'Bearer k');
  assert.match(captured.opts.body, /a@b\.com/);
});

test('sendEmail returns success:false on a non-ok response', async () => {
  const fetchFn = async () => ({ ok: false, status: 422, text: async () => 'bad', json: async () => ({}) });
  const r = await sendEmail({ to: 'a@b.com', subject: 's', html: 'h' }, { apiKey: 'k', from: 'me@x.com', fetchFn });
  assert.equal(r.success, false);
  assert.match(r.error, /422/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && node --test src/email-service.test.js`
Expected: FAIL — `Cannot find module './email-service.js'`.

- [ ] **Step 3: Write the implementation**

Create `backend/src/email-service.js`:

```js
import { isConfigured } from './config.js';

// Sends one email via Resend. Disabled (returns success:false) until both
// RESEND_API_KEY and EMAIL_FROM are configured. fetchFn is injectable for tests.
export async function sendEmail(
  { to, subject, html },
  { apiKey = process.env.RESEND_API_KEY, from = process.env.EMAIL_FROM, fetchFn = fetch } = {},
) {
  if (!isConfigured(apiKey)) return { success: false, error: 'RESEND_API_KEY not configured' };
  if (!from) return { success: false, error: 'EMAIL_FROM not configured' };
  try {
    const res = await fetchFn('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Resend error: ${res.status} ${detail}`.trim());
    }
    const data = await res.json();
    return { success: true, id: data.id };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && node --test src/email-service.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 5: Add config keys**

In `backend/src/config.js`, add `resend` to `keys`, `emailFrom` to `config`, and `resend` to `integrationStatus`:

```js
export const config = {
  port: Number(process.env.PORT) || 5000,
  corsOrigin: process.env.CORS_ORIGIN || '*',
  nodeEnv: process.env.NODE_ENV || 'development',
  emailFrom: process.env.EMAIL_FROM || '',
  keys: {
    groq: process.env.GROQ_API_KEY || '',
    fred: process.env.FRED_API_KEY || '',
    census: process.env.CENSUS_API_KEY || '',
    rentcast: process.env.RENTCAST_API_KEY || '',
    resend: process.env.RESEND_API_KEY || '',
  },
};

export function integrationStatus(keys = config.keys) {
  return {
    groq: isConfigured(keys.groq),
    fred: isConfigured(keys.fred),
    census: isConfigured(keys.census),
    rentcast: isConfigured(keys.rentcast),
    resend: isConfigured(keys.resend),
  };
}
```

- [ ] **Step 6: Update `.env.example`**

Append to `backend/.env.example`:

```
# Resend email (Phase 6B outreach). EMAIL_FROM must be a verified Resend sender.
RESEND_API_KEY=your_resend_api_key_here
EMAIL_FROM=deals@yourdomain.com
```

- [ ] **Step 7: Run the backend suite**

Run: `cd backend && npm test`
Expected: all pass (prior 54 + 4 here = 58). The existing `health.test.js` still passes because `integrationStatus` simply gained a `resend` boolean.

- [ ] **Step 8: Commit**

```bash
git add backend/src/email-service.js backend/src/email-service.test.js backend/src/config.js backend/.env.example
git commit -m "feat(email): Resend integration, disabled until configured"
```

---

### Task 2: Outreach logic (`outreach.js`) — email builder, batch sender, due filter

Pure functions: the deal-email template, the match-and-send orchestration (injected `send`), and the follow-up due filter.

**Files:**
- Create: `backend/src/outreach.js`
- Test: `backend/src/outreach.test.js`

**Interfaces:**
- Consumes: nothing external (pure). `send` is passed in.
- Produces:
  - `buildDealEmail(deal) → { subject, html }`.
  - `emailMatchedBuyers(deal, matches, send) → Promise<{ sent, failed, skipped, activities, results }>`, where `matches` is the array from `matchBuyers` (each item has `.buyer`), `send({to,subject,html}) → {success, id?, error?}`, `activities` is an array of records `{ contact_type:'buyer', contact_id, contact_name, channel:'email', subject, status, detail }`, and `results` is `{ buyer_id, name, status, error? }[]`. `status` is `sent | failed | skipped`.
  - `dueSellers(sellers, today) → Seller[]` — sellers with a non-empty `next_follow_up <= today`, sorted ascending by `next_follow_up`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/outreach.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDealEmail, emailMatchedBuyers, dueSellers } from './outreach.js';

const deal = {
  name: 'Maple Flip', property_address: '4812 Maple St', city: 'Atlanta', state: 'GA',
  purchase_price: 120000, repair_budget: 22000, arv: 185000, profit: 6000, deal_type: 'flip',
};

test('buildDealEmail includes the deal name, property, and prices', () => {
  const { subject, html } = buildDealEmail(deal);
  assert.match(subject, /Maple Flip/);
  assert.match(html, /4812 Maple St, Atlanta, GA/);
  assert.match(html, /\$120,000/);
  assert.match(html, /\$185,000/);
});

test('emailMatchedBuyers sends to buyers with email and skips those without', async () => {
  const matches = [
    { buyer: { id: 'b1', name: 'Anna', email: 'anna@x.com' } },
    { buyer: { id: 'b2', name: 'Bob', email: '' } },
  ];
  const sent = [];
  const send = async (msg) => { sent.push(msg.to); return { success: true, id: 'e1' }; };
  const r = await emailMatchedBuyers(deal, matches, send);
  assert.equal(r.sent, 1);
  assert.equal(r.skipped, 1);
  assert.equal(r.failed, 0);
  assert.deepEqual(sent, ['anna@x.com']);
  assert.equal(r.activities.length, 2);
  assert.equal(r.activities[0].status, 'sent');
  assert.equal(r.activities[1].status, 'skipped');
});

test('emailMatchedBuyers records a failed send', async () => {
  const matches = [{ buyer: { id: 'b1', name: 'Anna', email: 'anna@x.com' } }];
  const send = async () => ({ success: false, error: 'nope' });
  const r = await emailMatchedBuyers(deal, matches, send);
  assert.equal(r.failed, 1);
  assert.equal(r.results[0].status, 'failed');
  assert.equal(r.results[0].error, 'nope');
});

test('dueSellers returns sellers due on or before today, sorted ascending', () => {
  const sellers = [
    { id: '1', name: 'A', next_follow_up: '2026-06-20' },
    { id: '2', name: 'B', next_follow_up: '' },
    { id: '3', name: 'C', next_follow_up: '2026-06-10' },
    { id: '4', name: 'D', next_follow_up: '2026-07-01' },
  ];
  const due = dueSellers(sellers, '2026-06-20');
  assert.deepEqual(due.map((s) => s.id), ['3', '1']);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && node --test src/outreach.test.js`
Expected: FAIL — `Cannot find module './outreach.js'`.

- [ ] **Step 3: Write the implementation**

Create `backend/src/outreach.js`:

```js
function money(n) {
  return (Number.isFinite(n) ? n : 0).toLocaleString('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  });
}

function propertyLabel(deal) {
  return [deal.property_address, deal.city, deal.state].filter(Boolean).join(', ') || 'Off-market property';
}

export function buildDealEmail(deal) {
  const property = propertyLabel(deal);
  const subject = `New wholesale deal: ${deal.name || property}`;
  const html =
    `<h2>${deal.name || 'New Deal'}</h2>` +
    `<p><strong>Property:</strong> ${property}</p>` +
    `<ul>` +
    `<li>Purchase price: ${money(deal.purchase_price)}</li>` +
    `<li>ARV: ${money(deal.arv)}</li>` +
    `<li>Estimated repairs: ${money(deal.repair_budget)}</li>` +
    `<li>Projected profit: ${money(deal.profit)}</li>` +
    `<li>Deal type: ${(deal.deal_type || 'wholesale').replace('_', ' ')}</li>` +
    `</ul>` +
    `<p>Reply if you're interested and we'll send the full details.</p>`;
  return { subject, html };
}

export async function emailMatchedBuyers(deal, matches, send) {
  const { subject, html } = buildDealEmail(deal);
  const activities = [];
  const results = [];
  let sent = 0, failed = 0, skipped = 0;

  for (const { buyer } of matches) {
    const base = { contact_type: 'buyer', contact_id: buyer.id, contact_name: buyer.name, channel: 'email', subject };
    if (!buyer.email) {
      skipped += 1;
      activities.push({ ...base, status: 'skipped', detail: 'No email on file' });
      results.push({ buyer_id: buyer.id, name: buyer.name, status: 'skipped' });
      continue;
    }
    const r = await send({ to: buyer.email, subject, html });
    if (r.success) {
      sent += 1;
      activities.push({ ...base, status: 'sent', detail: r.id || '' });
      results.push({ buyer_id: buyer.id, name: buyer.name, status: 'sent' });
    } else {
      failed += 1;
      activities.push({ ...base, status: 'failed', detail: r.error || 'send failed' });
      results.push({ buyer_id: buyer.id, name: buyer.name, status: 'failed', error: r.error });
    }
  }

  return { sent, failed, skipped, activities, results };
}

export function dueSellers(sellers, today) {
  return sellers
    .filter((s) => s.next_follow_up && s.next_follow_up <= today)
    .sort((a, b) => a.next_follow_up.localeCompare(b.next_follow_up));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && node --test src/outreach.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/outreach.js backend/src/outreach.test.js
git commit -m "feat(outreach): deal-email builder, batch sender, due-seller filter"
```

---

### Task 3: `activities` table, sellers migration, and schemas

Persistence for the activity log and the follow-up column, plus the validation schema for logging a contact.

**Files:**
- Modify: `backend/src/db.js` (new `activities` table + `next_follow_up` migration)
- Modify: `backend/src/schemas.js` (`next_follow_up` on `sellerUpdateSchema`; new `logContactSchema`)

**Interfaces:**
- Produces: an `activities` table (columns per the spec); a `next_follow_up TEXT` column on `sellers`; `logContactSchema = z.object({ note: z.string().optional(), next_follow_up: z.string().optional() })`; `sellerUpdateSchema` gains `next_follow_up: z.string().optional()`.
- Consumed by: Task 4 endpoints.

- [ ] **Step 1: Add the `activities` table and sellers migration**

In `backend/src/db.js`, inside `initDb()`'s `db.serialize(...)`, after the `deals` table block (and its `ALTER TABLE deals …` line), add:

```js
    // Activities table (outreach + follow-up log)
    db.run(`
      CREATE TABLE IF NOT EXISTS activities (
        id TEXT PRIMARY KEY,
        deal_id TEXT,
        contact_type TEXT,
        contact_id TEXT,
        contact_name TEXT,
        channel TEXT,
        subject TEXT,
        status TEXT,
        detail TEXT,
        created_at TEXT
      )
    `);
    // Follow-up date for sellers (migration for pre-existing DBs).
    db.run('ALTER TABLE sellers ADD COLUMN next_follow_up TEXT', () => {});
```

- [ ] **Step 2: Add the schemas**

In `backend/src/schemas.js`, add `next_follow_up` to `sellerUpdateSchema` and append `logContactSchema`:

```js
export const sellerUpdateSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: optionalEmail,
  status: z.string().min(1),
  motivation: z.string().optional(),
  next_follow_up: z.string().optional(),
});

export const logContactSchema = z.object({
  note: z.string().optional(),
  next_follow_up: z.string().optional(),
});
```

(Replace the existing `sellerUpdateSchema` definition with the version above; append `logContactSchema` at the end of the file.)

- [ ] **Step 3: Verify the backend still boots and tests pass**

Run: `cd backend && npm test`
Expected: all prior pass (no behavior change yet; this adds a table, a column, and unused schemas). 58 passing.

- [ ] **Step 4: Commit**

```bash
git add backend/src/db.js backend/src/schemas.js
git commit -m "feat(outreach): activities table, seller follow-up column, schemas"
```

---

### Task 4: Outreach & follow-up endpoints

The HTTP surface: email matched buyers, list activities, list due follow-ups, log a seller contact, and persist `next_follow_up` on seller update.

**Files:**
- Modify: `backend/src/server.js` (imports + endpoints; `PUT /api/sellers/:id` gains `next_follow_up`)
- Test: `backend/src/outreach.routes.test.js`

**Interfaces:**
- Consumes: `sendEmail` (`./email-service.js`); `buildDealEmail`, `emailMatchedBuyers`, `dueSellers` (`./outreach.js`); `matchBuyers` (`./analytics.js`, already imported); `logContactSchema` (`./schemas.js`); `config`, `isConfigured` (`./config.js`); `dbAll/dbGet/dbRun`, `uuid`, `asyncHandler`, `validateBody`.
- Produces (HTTP):
  - `POST /api/deals/:id/email-buyers` → `{ success:true, sent, failed, skipped, results }` (or `404`, or `200 { success:false, error }` when email isn't configured).
  - `GET /api/deals/:id/activities` → `Activity[]`.
  - `GET /api/activities` → `Activity[]` (recent 50).
  - `GET /api/follow-ups` → `Seller[]` (due).
  - `POST /api/sellers/:id/log-contact` → `{ success:true }`.

- [ ] **Step 1: Add imports to `server.js`**

Below the existing `import { summarizeDeals, … } from './insights.js';` line, add:

```js
import { sendEmail } from './email-service.js';
import { buildDealEmail, emailMatchedBuyers, dueSellers } from './outreach.js';
import { isConfigured } from './config.js';
```

Add `logContactSchema` to the existing `from './schemas.js'` import list. Note: `config` is already imported at the top (`import { config, integrationStatus } from './config.js';`); add `isConfigured` to that same import instead of a separate line if you prefer — either works.

- [ ] **Step 2: Add the endpoints**

In `backend/src/server.js`, immediately before `app.use(errorHandler);`, add:

```js
// ========== OUTREACH & FOLLOW-UP ==========

function emailConfigured() {
  return isConfigured(config.keys.resend) && Boolean(config.emailFrom);
}

async function recordActivities(dealId, activities) {
  const now = new Date().toISOString();
  for (const a of activities) {
    await dbRun(
      `INSERT INTO activities (id, deal_id, contact_type, contact_id, contact_name, channel, subject, status, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuid(), dealId, a.contact_type, a.contact_id, a.contact_name, a.channel, a.subject, a.status, a.detail, now],
    );
  }
}

app.post('/api/deals/:id/email-buyers', asyncHandler(async (req, res) => {
  const deal = await dbGet('SELECT * FROM deals WHERE id = ?', [req.params.id]);
  if (!deal) return res.status(404).json({ success: false, error: 'Deal not found' });
  if (!emailConfigured()) {
    return res.json({ success: false, error: 'Email is not configured (set RESEND_API_KEY and EMAIL_FROM)' });
  }
  const buyers = await dbAll('SELECT * FROM buyers');
  const matches = matchBuyers(deal, buyers);
  const outcome = await emailMatchedBuyers(deal, matches, (msg) => sendEmail(msg));
  await recordActivities(deal.id, outcome.activities);
  res.json({ success: true, sent: outcome.sent, failed: outcome.failed, skipped: outcome.skipped, results: outcome.results });
}));

app.get('/api/deals/:id/activities', asyncHandler(async (req, res) => {
  const rows = await dbAll('SELECT * FROM activities WHERE deal_id = ? ORDER BY created_at DESC', [req.params.id]);
  res.json(rows);
}));

app.get('/api/activities', asyncHandler(async (req, res) => {
  const rows = await dbAll('SELECT * FROM activities ORDER BY created_at DESC LIMIT 50');
  res.json(rows);
}));

app.get('/api/follow-ups', asyncHandler(async (req, res) => {
  const sellers = await dbAll('SELECT * FROM sellers');
  const today = new Date().toISOString().slice(0, 10);
  res.json(dueSellers(sellers, today));
}));

app.post('/api/sellers/:id/log-contact', validateBody(logContactSchema), asyncHandler(async (req, res) => {
  const seller = await dbGet('SELECT * FROM sellers WHERE id = ?', [req.params.id]);
  if (!seller) return res.status(404).json({ success: false, error: 'Seller not found' });
  const now = new Date().toISOString();
  await dbRun(
    `INSERT INTO activities (id, deal_id, contact_type, contact_id, contact_name, channel, subject, status, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [uuid(), null, 'seller', seller.id, seller.name, 'note', 'Follow-up contact', 'logged', req.body.note || '', now],
  );
  await dbRun(
    'UPDATE sellers SET last_contacted = ?, next_follow_up = ? WHERE id = ?',
    [now, req.body.next_follow_up || null, seller.id],
  );
  res.json({ success: true });
}));
```

- [ ] **Step 3: Persist `next_follow_up` on seller update**

In `backend/src/server.js`, replace the existing `PUT /api/sellers/:id` handler body so it stores `next_follow_up`:

```js
app.put('/api/sellers/:id', validateBody(sellerUpdateSchema), (req, res) => {
  const { name, phone, email, status, motivation, next_follow_up } = req.body;
  const last_contacted = new Date().toISOString();

  db.run(
    `UPDATE sellers SET name = ?, phone = ?, email = ?, status = ?, motivation = ?, next_follow_up = ?, last_contacted = ? WHERE id = ?`,
    [name, phone, email, status, motivation, next_follow_up || null, last_contacted, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true });
    }
  );
});
```

- [ ] **Step 4: Write the failing integration test**

Create `backend/src/outreach.routes.test.js`:

```js
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from './server.js';
import { db } from './db.js';

after(() => new Promise((resolve) => db.close(() => resolve())));

test('POST /api/deals/:id/email-buyers 404s for a missing deal', async () => {
  const res = await request(app).post('/api/deals/nope/email-buyers');
  assert.equal(res.status, 404);
});

test('POST /api/deals/:id/email-buyers reports not-configured without a key', async () => {
  // RESEND_API_KEY is unset in the test environment, so this must not send.
  const created = await request(app).post('/api/deals').send({
    name: 'Outreach Deal', city: 'Atlanta', state: 'GA',
    purchase_price: 100000, repair_budget: 0, arv: 200000, selling_costs: 0, holding_costs: 0, wholesale_fee: 0,
  });
  const res = await request(app).post(`/api/deals/${created.body.id}/email-buyers`);
  assert.equal(res.status, 200);
  assert.equal(res.body.success, false);
  assert.match(res.body.error, /not configured/i);
  await request(app).delete(`/api/deals/${created.body.id}`);
});

test('POST /api/sellers/:id/log-contact writes an activity and sets next_follow_up', async () => {
  const seller = await request(app).post('/api/sellers').send({ name: 'Follow Seller', motivation: 'relocating' });
  const res = await request(app)
    .post(`/api/sellers/${seller.body.id}/log-contact`)
    .send({ note: 'Left a voicemail', next_follow_up: '2026-12-31' });
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);

  const acts = await request(app).get('/api/activities');
  assert.ok(acts.body.some((a) => a.contact_id === seller.body.id && a.channel === 'note'));
});

test('GET /api/follow-ups returns an array', async () => {
  const res = await request(app).get('/api/follow-ups');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
});

test('GET /api/deals/:id/activities returns an array', async () => {
  const created = await request(app).post('/api/deals').send({
    name: 'Acts Deal', city: 'Atlanta', state: 'GA',
    purchase_price: 100000, repair_budget: 0, arv: 200000, selling_costs: 0, holding_costs: 0, wholesale_fee: 0,
  });
  const res = await request(app).get(`/api/deals/${created.body.id}/activities`);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
  await request(app).delete(`/api/deals/${created.body.id}`);
});
```

- [ ] **Step 5: Run the tests**

Run: `cd backend && node --test src/outreach.routes.test.js`
Expected: PASS — 5 tests.

- [ ] **Step 6: Run the full backend suite**

Run: `cd backend && npm test`
Expected: all pass (58 + 5 = 63).

- [ ] **Step 7: Commit**

```bash
git add backend/src/server.js backend/src/outreach.routes.test.js
git commit -m "feat(outreach): email-buyers, activities, follow-ups, log-contact endpoints"
```

---

### Task 5: Frontend types and client functions

Types and typed client calls for outreach, activities, and follow-ups.

**Files:**
- Modify: `src/api/types.ts`
- Modify: `src/api/client.ts`

**Interfaces:**
- Produces:
  - `Activity` interface; `OutreachResult` interface; `next_follow_up?: string` on `Seller`; `resend: boolean` on `Health.integrations`.
  - `emailMatchedBuyers(dealId: string): Promise<OutreachResult>`; `getDealActivities(dealId: string): Promise<Activity[]>`; `getActivities(): Promise<Activity[]>`; `getFollowUps(): Promise<Seller[]>`; `logContact(sellerId: string, body: { note?: string; next_follow_up?: string }): Promise<{ success: boolean }>`.

- [ ] **Step 1: Add types**

In `src/api/types.ts`: add `next_follow_up?: string;` to the `Seller` interface; add `resend: boolean;` to `Health['integrations']`; and append:

```ts
export interface Activity {
  id: string;
  deal_id: string | null;
  contact_type: string;
  contact_id: string;
  contact_name: string;
  channel: string;
  subject: string;
  status: string;
  detail: string;
  created_at: string;
}

export interface OutreachResult {
  success: boolean;
  sent?: number;
  failed?: number;
  skipped?: number;
  results?: { buyer_id: string; name: string; status: string; error?: string }[];
  error?: string;
}
```

- [ ] **Step 2: Add client functions**

In `src/api/client.ts`, extend the type import to include `Activity` and `OutreachResult`, then append:

```ts
export const emailMatchedBuyers = (dealId: string) =>
  apiFetch<OutreachResult>(`/api/deals/${dealId}/email-buyers`, { method: 'POST' });
export const getDealActivities = (dealId: string) => apiFetch<Activity[]>(`/api/deals/${dealId}/activities`);
export const getActivities = () => apiFetch<Activity[]>('/api/activities');
export const getFollowUps = () => apiFetch<Seller[]>('/api/follow-ups');
export const logContact = (sellerId: string, body: { note?: string; next_follow_up?: string }) =>
  apiFetch<{ success: boolean }>(`/api/sellers/${sellerId}/log-contact`, jsonBody(body));
```

(`jsonBody` and `Seller` are already in scope in `client.ts`.)

- [ ] **Step 3: Typecheck and build**

Run: `npm run build`
Expected: `tsc` + Vite build succeed.

- [ ] **Step 4: Commit**

```bash
git add src/api/types.ts src/api/client.ts
git commit -m "feat(outreach): client types and calls for outreach and follow-ups"
```

---

### Task 6: Deals page — email matched buyers + activity history

Add the confirmed "Email matched buyers" action and a per-deal activity history toggle.

**Files:**
- Modify: `src/pages/Deals.tsx`

**Interfaces:**
- Consumes: `emailMatchedBuyers`, `getDealActivities`, `getDealMatches` from the client; types `Activity`.
- Produces: no new exports; the Deals page gains the email action + activity view.

- [ ] **Step 1: Add state, handlers, and UI to `Deals.tsx`**

Add to the client import in `src/pages/Deals.tsx`:

```tsx
import { getDeals, updateDeal, deleteDeal, getDealMatches, emailMatchedBuyers, getDealActivities } from '../api/client';
```

Add to the type import: `import type { Deal, BuyerMatch, Activity } from '../api/types';`

Inside the `Deals` component, add state next to the existing `matches`/`actionError` state:

```tsx
  const [emailMsg, setEmailMsg] = useState<Record<string, string>>({});
  const [activities, setActivities] = useState<Record<string, Activity[]>>({});
```

Add these handlers next to `handleMatches`:

```tsx
  const handleEmail = async (deal: Deal) => {
    setActionError(null);
    try {
      const res = await getDealMatches(deal.id);
      const n = res.matches.length;
      if (n === 0) { setEmailMsg((m) => ({ ...m, [deal.id]: 'No matched buyers to email.' })); return; }
      if (!window.confirm(`Send this deal to ${n} matched buyer${n === 1 ? '' : 's'}?`)) return;
      const out = await emailMatchedBuyers(deal.id);
      if (!out.success) { setEmailMsg((m) => ({ ...m, [deal.id]: out.error || 'Email failed.' })); return; }
      setEmailMsg((m) => ({ ...m, [deal.id]: `Sent ${out.sent} · skipped ${out.skipped} · failed ${out.failed}` }));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleActivities = async (id: string) => {
    try {
      const rows = await getDealActivities(id);
      setActivities((a) => ({ ...a, [id]: rows }));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };
```

In the per-deal actions row, add two buttons after the existing "Find buyers" button:

```tsx
                  <button className="ghost-button" onClick={() => handleEmail(deal)}>Email buyers</button>
                  <button className="ghost-button" onClick={() => handleActivities(deal.id)}>Activity</button>
```

After the existing `matches[deal.id]` block (inside the deal card), add:

```tsx
                {emailMsg[deal.id] && <p className="text-muted">✉️ {emailMsg[deal.id]}</p>}
                {activities[deal.id] && (
                  <div className="results-card">
                    <h3>Activity ({activities[deal.id].length})</h3>
                    {activities[deal.id].length === 0 ? (
                      <p className="text-muted">No activity yet.</p>
                    ) : (
                      activities[deal.id].map((a) => (
                        <p key={a.id} className="text-muted">
                          {new Date(a.created_at).toLocaleDateString()} · {a.contact_name} · {a.channel} · {a.status}
                        </p>
                      ))
                    )}
                  </div>
                )}
```

- [ ] **Step 2: Typecheck and build**

Run: `npm run build`
Expected: `tsc` + Vite build succeed.

- [ ] **Step 3: Manual click-through (no key)**

Start both servers. On **Deals**, click **Email buyers** on a deal with matched buyers → confirm dialog appears; accept → with no key configured, the result line shows the "Email is not configured" message and nothing is sent. Click **Activity** → the (empty) activity list renders.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Deals.tsx
git commit -m "feat(outreach): Deals page email action + activity history"
```

---

### Task 7: Follow-ups page + route + nav

A page listing sellers due for follow-up with a date editor and "Log contact", plus a recent activity feed.

**Files:**
- Create: `src/pages/FollowUps.tsx`
- Modify: `src/App.tsx` (route)
- Modify: `src/components/AppLayout.tsx` (nav link)

**Interfaces:**
- Consumes: `getFollowUps`, `logContact`, `getActivities` from the client; `useAsync`; `Loading`/`ErrorBanner`/`Empty`; types `Seller`, `Activity`.
- Produces: `export function FollowUps()`; a `/follow-ups` route inside `AppLayout`; a "Follow-ups" nav entry.

- [ ] **Step 1: Create the page**

Create `src/pages/FollowUps.tsx`:

```tsx
import { useState } from 'react';
import { getFollowUps, getActivities, logContact } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorBanner, Empty } from '../components/states';
import type { Seller, Activity } from '../api/types';

export function FollowUps() {
  const due = useAsync<Seller[]>(getFollowUps, true);
  const feed = useAsync<Activity[]>(getActivities, true);
  const [drafts, setDrafts] = useState<Record<string, { note: string; next: string }>>({});
  const [error, setError] = useState<string | null>(null);

  const sellers = due.data ?? [];
  const setDraft = (id: string, patch: Partial<{ note: string; next: string }>) =>
    setDrafts((d) => ({ ...d, [id]: { note: '', next: '', ...d[id], ...patch } }));

  const handleLog = async (id: string) => {
    setError(null);
    const draft = drafts[id] ?? { note: '', next: '' };
    try {
      await logContact(id, { note: draft.note, next_follow_up: draft.next || undefined });
      await due.run();
      await feed.run();
      setDrafts((d) => { const n = { ...d }; delete n[id]; return n; });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <header className="hero-panel">
        <p className="eyebrow">Pipeline</p>
        <h1>Follow-ups</h1>
        <p>Sellers due for a touch, and your recent outreach.</p>
      </header>

      <div className="layout-grid">
        <section className="panel">
          <h2>Due now ({sellers.length})</h2>
          {due.loading && <Loading label="Loading follow-ups…" />}
          {due.error && <ErrorBanner message={due.error} onRetry={() => due.run()} />}
          {error && <ErrorBanner message={error} />}
          {!due.loading && !due.error && sellers.length === 0 && <Empty message="Nobody is due for follow-up. Nice." />}
          <div className="seller-list">
            {sellers.map((s) => {
              const draft = drafts[s.id] ?? { note: '', next: '' };
              return (
                <div key={s.id} className="seller-card">
                  <strong>{s.name}</strong>
                  <p className="text-muted">Due {s.next_follow_up} · last contacted {s.last_contacted ? new Date(s.last_contacted).toLocaleDateString() : '—'}</p>
                  <div className="form-grid">
                    <input placeholder="Note (e.g. left voicemail)" value={draft.note} onChange={(e) => setDraft(s.id, { note: e.target.value })} />
                    <label><span>Next follow-up</span><input type="date" value={draft.next} onChange={(e) => setDraft(s.id, { next: e.target.value })} /></label>
                    <button onClick={() => handleLog(s.id)}>Log contact</button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel">
          <h2>Recent activity</h2>
          {feed.loading && <Loading label="Loading activity…" />}
          {feed.error && <ErrorBanner message={feed.error} onRetry={() => feed.run()} />}
          {feed.data && feed.data.length === 0 && <Empty message="No activity yet." />}
          <div className="market-list">
            {(feed.data ?? []).map((a) => (
              <div key={a.id} className="market-card">
                <strong>{a.contact_name}</strong> <span className="text-muted">· {a.channel} · {a.status}</span>
                <p className="text-muted">{new Date(a.created_at).toLocaleString()}{a.detail ? ` · ${a.detail}` : ''}</p>
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
import { FollowUps } from './pages/FollowUps';
```

Add this route inside the `<Route element={<AppLayout />}>` block (e.g. after the `insights` route):

```tsx
        <Route path="follow-ups" element={<FollowUps />} />
```

- [ ] **Step 3: Add the nav link in `AppLayout.tsx`**

In the `NAV` array in `src/components/AppLayout.tsx`, add an entry after the `Insights` entry:

```tsx
  { to: '/follow-ups', label: 'Follow-ups' },
```

- [ ] **Step 4: Typecheck and build**

Run: `npm run build`
Expected: `tsc` + Vite build succeed.

- [ ] **Step 5: Manual click-through**

With both servers running: open **Follow-ups**. With no sellers due, confirm the empty state. To exercise it, set a seller's follow-up date to today or earlier (via the Sellers page edit or `POST /api/sellers/:id/log-contact`), reload, then "Log contact" with a note and a future date → the seller leaves the due list and the contact appears in the recent activity feed.

- [ ] **Step 6: Commit**

```bash
git add src/pages/FollowUps.tsx src/App.tsx src/components/AppLayout.tsx
git commit -m "feat(outreach): Follow-ups page with due sellers and activity feed"
```

---

### Task 8: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Backend suite**

Run: `cd backend && npm test`
Expected: all pass (prior 54 + Task 1: 4 + Task 2: 4 + Task 4: 5 = 67). Run it twice to confirm no flakiness from the shared DB.

- [ ] **Step 2: Frontend suite**

Run: `npm test`
Expected: all vitest tests pass (18, unchanged — this phase adds no frontend unit tests; logic is backend-side).

- [ ] **Step 3: Frontend build**

Run: `npm run build`
Expected: `tsc` + Vite build succeed.

- [ ] **Step 4: End-to-end smoke (manual, no key)**

With both servers running: `GET /api/health` shows `resend: false`. On Deals, "Email buyers" → confirm → "Email is not configured" message (nothing sent). On Follow-ups, log a seller contact and confirm it appears in the activity feed. (A real send requires setting `RESEND_API_KEY` + `EMAIL_FROM`.)

---

## Self-Review

**1. Spec coverage**

| Spec item | Task |
| --- | --- |
| Resend integration, disabled until configured, in `/api/health` + `.env.example` | Task 1 |
| `sendEmail` injectable for tests | Task 1 |
| `buildDealEmail` deal summary | Task 2 |
| `emailMatchedBuyers` (injected send; sent/failed/skipped; one activity each) | Task 2 |
| `dueSellers` date filter + sort | Task 2 |
| `activities` table + `next_follow_up` migration | Task 3 |
| `logContactSchema` + `next_follow_up` on `sellerUpdateSchema` | Task 3 |
| `POST /api/deals/:id/email-buyers` (404, not-configured, match→send→log) | Task 4 |
| `GET /api/deals/:id/activities`, `GET /api/activities`, `GET /api/follow-ups` | Task 4 |
| `POST /api/sellers/:id/log-contact` + `next_follow_up` on seller PUT | Task 4 |
| Frontend types + client calls | Task 5 |
| Deals: confirmed email action + activity history | Task 6 |
| Follow-ups page (due sellers, log contact, activity feed) + nav/route | Task 7 |
| Confirm-before-send, never auto-send, disabled-state UI | Tasks 6, 8 (manual verification) |
| Tests: unit (email/outreach/due) + integration (endpoints, email mocked via no-key) | Tasks 1, 2, 4, 8 |

All spec sections map to tasks.

**2. Placeholder scan:** No `TBD`/`TODO`/"add appropriate…". Every code step has full code; every test step has assertions. The `email-buyers` "real send" path is intentionally exercised at the unit level (`emailMatchedBuyers` with a fake `send`, Task 2) rather than through HTTP, so the integration test never sends real email — this is a deliberate test-design choice, stated in the spec, not a gap.

**3. Type consistency:** `sendEmail({to,subject,html}, opts)` (Task 1) is called as `sendEmail(msg)` inside the endpoint (Task 4) and as the injected `send` shape in `emailMatchedBuyers` (Task 2) — same `{to,subject,html} → {success,id?,error?}` contract. Activity record fields produced by `emailMatchedBuyers` (Task 2) and the seller `log-contact` insert (Task 4) match the `activities` columns (Task 3) and the frontend `Activity` type (Task 5). `OutreachResult` (Task 5) mirrors the `email-buyers` response (Task 4). `dueSellers` (Task 2) is consumed by `GET /api/follow-ups` (Task 4) and its result typed as `Seller[]` (Task 5, with `next_follow_up` added). `logContact(sellerId, body)` (Task 5) matches `logContactSchema` (Task 3) and the endpoint (Task 4).
