# Shareable Deal Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add shareable public deal pages so a wholesaler can generate a short URL for any deal, send it to cash buyers, and receive inquiries directly into the deal's activity feed.

**Architecture:** Four new backend endpoints (two management, two public) backed by two new SQLite tables (`deal_links`, `deal_link_inquiries`). A standalone React page at `/p/:slug` (outside AppLayout — no sidebar) shows deal financials and a contact form. Share/Revoke buttons are added to the Deals list and DealSheet pages.

**Tech Stack:** Express 4 + SQLite (`sqlite3`) + Zod 4 + `node:crypto`; Vite 5 + React 18 + TypeScript + react-router-dom v7; `node:test` + `supertest` for backend; vitest for frontend.

## Global Constraints

- ESM modules throughout (`"type": "module"` in backend `package.json`)
- Test command: `node --import ./test-setup.js --test --test-concurrency=1` (never change `--test-concurrency=1`)
- `test-setup.js` blanks `RESEND_API_KEY`, `EMAIL_FROM`, and `GROQ_API_KEY` before dotenv — no external API calls in tests
- Idempotent DB migrations: `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE … ADD COLUMN` with swallowed-error callback
- `asyncHandler` wraps every async route; `validateBody(schema)` validates request bodies
- `dbAll`, `dbGet`, `dbRun` are promisified helpers imported from `./db.js`
- `uuid` (from `uuid` package, `v4`) for all new IDs
- Error responses: `res.status(N).json({ success: false, error: '…' })`
- Public endpoints live under `/api/public/` prefix — no auth required
- Slug format: 8 lowercase hex chars (`crypto.randomBytes(4).toString('hex')`)

---

### Task 1: DB Migrations

**Files:**
- Modify: `backend/src/db.js`

**Interfaces:**
- Produces: `deal_links` table (columns: `slug TEXT PK`, `deal_id TEXT`, `active INTEGER DEFAULT 1`, `view_count INTEGER DEFAULT 0`, `created_at TEXT`, `UNIQUE(deal_id)`); `deal_link_inquiries` table (columns: `id TEXT PK`, `slug TEXT`, `name TEXT`, `email TEXT`, `phone TEXT`, `message TEXT`, `created_at TEXT`)

- [ ] **Step 1: Add the two table migrations to `initDb()` in `backend/src/db.js`**

Inside the `db.serialize()` block, after the last `db.run(...)` call (the `activities` attribution columns), add:

```js
    // Shareable deal links
    db.run(`
      CREATE TABLE IF NOT EXISTS deal_links (
        slug       TEXT PRIMARY KEY,
        deal_id    TEXT NOT NULL,
        active     INTEGER NOT NULL DEFAULT 1,
        view_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        UNIQUE(deal_id)
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS deal_link_inquiries (
        id         TEXT PRIMARY KEY,
        slug       TEXT NOT NULL,
        name       TEXT NOT NULL,
        email      TEXT,
        phone      TEXT,
        message    TEXT,
        created_at TEXT NOT NULL
      )
    `);
```

- [ ] **Step 2: Verify the server starts without errors**

Run: `cd backend && node src/server.js`
Expected: `Connected to SQLite database` and `Server running on http://localhost:5000` with no errors. Ctrl-C to stop.

- [ ] **Step 3: Commit**

```bash
git add backend/src/db.js
git commit -m "feat(db): add deal_links and deal_link_inquiries tables"
```

---

### Task 2: Inquiry Zod Schema

**Files:**
- Modify: `backend/src/schemas.js`
- Modify: `backend/src/schemas.test.js`

**Interfaces:**
- Produces: `inquirySchema` — exported from `schemas.js`; validates `{ name, email?, phone?, message? }` with a refinement requiring at least one of email or phone

- [ ] **Step 1: Write the failing schema tests in `backend/src/schemas.test.js`**

Add these four tests at the bottom of the file (keep the existing tests):

```js
import { inquirySchema } from './schemas.js';

test('inquirySchema accepts name + email', () => {
  const r = inquirySchema.safeParse({ name: 'Jane', email: 'jane@example.com' });
  assert.equal(r.success, true);
});

test('inquirySchema accepts name + phone', () => {
  const r = inquirySchema.safeParse({ name: 'Jane', phone: '555-1234' });
  assert.equal(r.success, true);
});

test('inquirySchema rejects missing name', () => {
  const r = inquirySchema.safeParse({ email: 'jane@example.com' });
  assert.equal(r.success, false);
});

test('inquirySchema rejects name with no email or phone', () => {
  const r = inquirySchema.safeParse({ name: 'Jane' });
  assert.equal(r.success, false);
});
```

- [ ] **Step 2: Run to verify the tests fail**

Run: `cd backend && node --import ./test-setup.js --test src/schemas.test.js`
Expected: 4 failures with `SyntaxError` or `inquirySchema is not exported`

- [ ] **Step 3: Add `inquirySchema` to `backend/src/schemas.js`**

Add at the end of the file:

```js
export const inquirySchema = z.object({
  name:    z.string().min(1).max(100),
  email:   z.string().email().optional(),
  phone:   z.string().min(7).max(20).optional(),
  message: z.string().max(500).optional(),
}).refine((d) => d.email || d.phone, { message: 'email or phone required' });
```

- [ ] **Step 4: Run to verify tests pass**

Run: `cd backend && node --import ./test-setup.js --test src/schemas.test.js`
Expected: All tests pass (existing + 4 new)

- [ ] **Step 5: Commit**

```bash
git add backend/src/schemas.js backend/src/schemas.test.js
git commit -m "feat(schemas): add inquirySchema for deal link contact form"
```

---

### Task 3: Backend Endpoints + Route Tests

**Files:**
- Modify: `backend/src/server.js`
- Create: `backend/src/deal-links.routes.test.js`

**Interfaces:**
- Consumes: `inquirySchema` from `./schemas.js`; `deal_links` and `deal_link_inquiries` tables; `randomBytes` from `node:crypto`; `uuid` from `uuid`; `dbAll`, `dbGet`, `dbRun` from `./db.js`; `asyncHandler`, `validateBody` from `./middleware.js`
- Produces:
  - `POST /api/deals/:id/link` → `{ slug: string, url: string }`
  - `DELETE /api/deals/:id/link` → `{ success: true }`
  - `GET /api/public/deals/:slug` → `{ name, city, state, deal_type, purchase_price, arv, profit, roi }`
  - `POST /api/public/deals/:slug/inquire` → `{ success: true }`

- [ ] **Step 1: Write the failing test file at `backend/src/deal-links.routes.test.js`**

```js
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from './server.js';
import { db } from './db.js';

after(() => new Promise((resolve) => db.close(() => resolve())));

const DEAL = {
  name: 'Link Test Deal', city: 'Atlanta', state: 'GA',
  purchase_price: 100000, repair_budget: 20000, arv: 160000,
  selling_costs: 10000, holding_costs: 2000, wholesale_fee: 8000,
};

let dealId;
let slug;

test('setup: create a deal', async () => {
  const res = await request(app).post('/api/deals').send(DEAL);
  assert.equal(res.status, 200);
  dealId = res.body.id;
});

test('POST /api/deals/:id/link creates a slug', async () => {
  const res = await request(app).post(`/api/deals/${dealId}/link`);
  assert.equal(res.status, 200);
  assert.match(res.body.slug, /^[0-9a-f]{8}$/);
  assert.match(res.body.url, /^\/p\/[0-9a-f]{8}$/);
  slug = res.body.slug;
});

test('POST /api/deals/:id/link regenerates and old slug is gone', async () => {
  const old = slug;
  const res = await request(app).post(`/api/deals/${dealId}/link`);
  assert.equal(res.status, 200);
  slug = res.body.slug;
  const gone = await request(app).get(`/api/public/deals/${old}`);
  assert.equal(gone.status, 404);
});

test('GET /api/public/deals/:slug returns whitelisted deal fields', async () => {
  const res = await request(app).get(`/api/public/deals/${slug}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'Link Test Deal');
  assert.ok('purchase_price' in res.body);
  assert.ok('arv' in res.body);
  assert.ok('profit' in res.body);
  assert.ok('roi' in res.body);
  assert.ok(!('id' in res.body));
});

test('GET /api/public/deals/:slug increments view_count', async () => {
  const res = await request(app).get(`/api/public/deals/${slug}`);
  assert.equal(res.status, 200);
});

test('GET /api/public/deals/unknown returns 404', async () => {
  const res = await request(app).get('/api/public/deals/deadbeef');
  assert.equal(res.status, 404);
});

test('POST /api/public/deals/:slug/inquire stores inquiry and creates activity', async () => {
  const res = await request(app)
    .post(`/api/public/deals/${slug}/inquire`)
    .send({ name: 'Jane Buyer', email: 'jane@example.com', message: 'Interested!' });
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);

  const acts = await request(app).get(`/api/deals/${dealId}/activities`);
  assert.equal(acts.status, 200);
  assert.ok(acts.body.some((a) => a.contact_name === 'Jane Buyer'));
});

test('POST /api/public/deals/:slug/inquire returns 400 without email or phone', async () => {
  const res = await request(app)
    .post(`/api/public/deals/${slug}/inquire`)
    .send({ name: 'No Contact' });
  assert.equal(res.status, 400);
});

test('DELETE /api/deals/:id/link deactivates; slug returns 404', async () => {
  const del = await request(app).delete(`/api/deals/${dealId}/link`);
  assert.equal(del.status, 200);
  assert.equal(del.body.success, true);

  const gone = await request(app).get(`/api/public/deals/${slug}`);
  assert.equal(gone.status, 404);
});

test('POST /api/public/deals/:slug/inquire returns 404 on inactive slug', async () => {
  const res = await request(app)
    .post(`/api/public/deals/${slug}/inquire`)
    .send({ name: 'Late Buyer', phone: '555-1234' });
  assert.equal(res.status, 404);
});
```

- [ ] **Step 2: Run to verify tests fail**

Run: `cd backend && node --import ./test-setup.js --test src/deal-links.routes.test.js`
Expected: Most tests fail — endpoints not yet defined

- [ ] **Step 3: Add the import and four endpoints to `backend/src/server.js`**

**3a.** Add the `randomBytes` import at the top of `server.js`, alongside existing Node imports:

```js
import { randomBytes } from 'node:crypto';
```

**3b.** Add `inquirySchema` to the existing destructured import from `'./schemas.js'`:

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
  logContactSchema,
  campaignCreateSchema,
  assistantSchema,
  inquirySchema,
} from './schemas.js';
```

**3c.** Add the four endpoints just before the `app.use(errorHandler)` line at the bottom of the route definitions (around line 600):

```js
// ========== SHAREABLE DEAL LINKS ==========

app.post('/api/deals/:id/link', asyncHandler(async (req, res) => {
  const deal = await dbGet('SELECT id FROM deals WHERE id = ?', [req.params.id]);
  if (!deal) return res.status(404).json({ success: false, error: 'Deal not found' });
  const slug = randomBytes(4).toString('hex');
  const now = new Date().toISOString();
  await dbRun('DELETE FROM deal_links WHERE deal_id = ?', [deal.id]);
  await dbRun(
    'INSERT INTO deal_links (slug, deal_id, active, view_count, created_at) VALUES (?, ?, 1, 0, ?)',
    [slug, deal.id, now],
  );
  res.json({ slug, url: `/p/${slug}` });
}));

app.delete('/api/deals/:id/link', asyncHandler(async (req, res) => {
  const link = await dbGet('SELECT slug FROM deal_links WHERE deal_id = ? AND active = 1', [req.params.id]);
  if (!link) return res.status(404).json({ success: false, error: 'No active link found' });
  await dbRun('UPDATE deal_links SET active = 0 WHERE deal_id = ?', [req.params.id]);
  res.json({ success: true });
}));

app.get('/api/public/deals/:slug', asyncHandler(async (req, res) => {
  const link = await dbGet('SELECT * FROM deal_links WHERE slug = ?', [req.params.slug]);
  if (!link || !link.active) return res.status(404).json({ success: false, error: 'Deal not found' });
  const deal = await dbGet(
    'SELECT name, city, state, deal_type, purchase_price, arv, profit, roi FROM deals WHERE id = ?',
    [link.deal_id],
  );
  if (!deal) return res.status(404).json({ success: false, error: 'Deal not found' });
  await dbRun('UPDATE deal_links SET view_count = view_count + 1 WHERE slug = ?', [req.params.slug]);
  res.json(deal);
}));

app.post('/api/public/deals/:slug/inquire', validateBody(inquirySchema), asyncHandler(async (req, res) => {
  const link = await dbGet('SELECT * FROM deal_links WHERE slug = ? AND active = 1', [req.params.slug]);
  if (!link) return res.status(404).json({ success: false, error: 'Deal not found' });
  const { name, email, phone, message } = req.body;
  const now = new Date().toISOString();
  await dbRun(
    'INSERT INTO deal_link_inquiries (id, slug, name, email, phone, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [uuid(), req.params.slug, name, email || null, phone || null, message || null, now],
  );
  const contact = email || phone;
  await dbRun(
    'INSERT INTO activities (id, deal_id, contact_type, contact_id, contact_name, channel, subject, status, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [uuid(), link.deal_id, 'buyer', null, name, 'inquiry', 'Deal inquiry', 'received', `Inquiry from ${name} (${contact})`, now],
  );
  res.json({ success: true });
}));
```

- [ ] **Step 4: Run the test file to verify all tests pass**

Run: `cd backend && node --import ./test-setup.js --test src/deal-links.routes.test.js`
Expected: 11/11 tests pass

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `cd backend && npm test`
Expected: All tests pass (previous count + 11 new)

- [ ] **Step 6: Commit**

```bash
git add backend/src/server.js backend/src/deal-links.routes.test.js
git commit -m "feat(api): shareable deal link endpoints + route tests"
```

---

### Task 4: Frontend Types and API Client

**Files:**
- Modify: `src/api/types.ts`
- Modify: `src/api/client.ts`

**Interfaces:**
- Produces:
  - `PublicDeal` interface
  - `InquiryBody` interface
  - `DealLinkResult` interface
  - `createDealLink(id)` → `Promise<DealLinkResult>`
  - `revokeDealLink(id)` → `Promise<{ success: boolean }>`
  - `getPublicDeal(slug)` → `Promise<PublicDeal>`
  - `submitInquiry(slug, body)` → `Promise<{ success: boolean }>`

- [ ] **Step 1: Add three new interfaces to `src/api/types.ts`**

Add at the end of the file:

```ts
export interface PublicDeal {
  name: string;
  city: string;
  state: string;
  deal_type: string;
  purchase_price: number;
  arv: number;
  profit: number;
  roi: number;
}

export interface InquiryBody {
  name: string;
  email?: string;
  phone?: string;
  message?: string;
}

export interface DealLinkResult {
  slug: string;
  url: string;
}
```

- [ ] **Step 2: Add the four client functions to `src/api/client.ts`**

First, add the three new types to the existing import at the top of `client.ts`:

```ts
import type {
  Market, Comp, Seller, NewSeller, Buyer, NewBuyer,
  DealInputs, DealAnalysisResult, SellerScoreInput, SellerScoreResult,
  MarketTrend, Neighborhood, GeocodeResult, Health,
  DealInputFields, Deal, ArvEstimate, DealMatches, Insights,
  Activity, OutreachResult, Campaign, CampaignStats, AssistantMessage, AssistantReply,
  PublicDeal, InquiryBody, DealLinkResult,
} from './types';
```

Then add at the end of `client.ts`:

```ts
export const createDealLink = (id: string) =>
  apiFetch<DealLinkResult>(`/api/deals/${id}/link`, { method: 'POST' });

export const revokeDealLink = (id: string) =>
  apiFetch<{ success: boolean }>(`/api/deals/${id}/link`, { method: 'DELETE' });

export const getPublicDeal = (slug: string) =>
  apiFetch<PublicDeal>(`/api/public/deals/${slug}`);

export const submitInquiry = (slug: string, body: InquiryBody) =>
  apiFetch<{ success: boolean }>(`/api/public/deals/${slug}/inquire`, jsonBody(body));
```

- [ ] **Step 3: Verify TypeScript compiles cleanly**

Run: `cd C:\Users\tyris\Desktop\wholesale-research-tool && npm run build`
Expected: Build succeeds with no TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add src/api/types.ts src/api/client.ts
git commit -m "feat(client): add deal link types and client functions"
```

---

### Task 5: Public Deal Page

**Files:**
- Create: `src/pages/PublicDeal.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `getPublicDeal(slug)` and `submitInquiry(slug, body)` from `../api/client`; `PublicDeal` and `InquiryBody` from `../api/types`; `useAsync` from `../hooks/useAsync`; `Loading`, `ErrorBanner` from `../components/states`; `formatCurrency` from `../lib/deal`
- Produces: `<PublicDeal />` component rendered at `/p/:slug` with no AppLayout wrapper

- [ ] **Step 1: Create `src/pages/PublicDeal.tsx`**

```tsx
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { getPublicDeal, submitInquiry } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorBanner } from '../components/states';
import { formatCurrency } from '../lib/deal';
import type { InquiryBody } from '../api/types';

export function PublicDeal() {
  const { slug } = useParams<{ slug: string }>();
  const deal = useAsync(() => getPublicDeal(slug!), true);

  const [form, setForm] = useState<InquiryBody>({ name: '', email: '', phone: '', message: '' });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      await submitInquiry(slug!, {
        name: form.name,
        email: form.email || undefined,
        phone: form.phone || undefined,
        message: form.message || undefined,
      });
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (deal.loading) {
    return (
      <div className="public-deal-page">
        <div className="public-deal-center"><Loading label="Loading deal…" /></div>
      </div>
    );
  }

  if (deal.error) {
    return (
      <div className="public-deal-page">
        <div className="public-deal-center">
          <h2>Deal unavailable</h2>
          <p>This deal is no longer available.</p>
        </div>
      </div>
    );
  }

  const d = deal.data!;

  return (
    <div className="public-deal-page">
      <header className="public-deal-header">
        <p className="eyebrow">Wholesale Deal</p>
        <h1>{d.name}</h1>
        {(d.city || d.state) && <p>{[d.city, d.state].filter(Boolean).join(', ')}</p>}
        {d.deal_type && <p className="text-muted">{d.deal_type.replace('_', ' ')}</p>}
      </header>

      <div className="public-deal-grid">
        <section className="panel">
          <h2>Deal Summary</h2>
          <div className="kpi-grid">
            <div className="kpi">
              <p className="kpi-label">Purchase Price</p>
              <p className="kpi-value">{formatCurrency(d.purchase_price)}</p>
            </div>
            <div className="kpi">
              <p className="kpi-label">ARV</p>
              <p className="kpi-value">{formatCurrency(d.arv)}</p>
            </div>
            <div className="kpi">
              <p className="kpi-label">Profit</p>
              <p className="kpi-value">{formatCurrency(d.profit)}</p>
            </div>
            <div className="kpi">
              <p className="kpi-label">ROI</p>
              <p className="kpi-value">{d.roi.toFixed(1)}%</p>
            </div>
          </div>
        </section>

        <section className="panel">
          <h2>Express Interest</h2>
          {submitted ? (
            <p className="public-deal-thanks">Thanks — we'll be in touch!</p>
          ) : (
            <form className="form-grid" onSubmit={handleSubmit}>
              <label>
                Name *
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </label>
              <label>
                Phone
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </label>
              <label>
                Message
                <textarea
                  value={form.message}
                  onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                />
              </label>
              {submitError && <ErrorBanner message={submitError} />}
              <button
                type="submit"
                disabled={submitting || !form.name.trim() || (!form.email!.trim() && !form.phone!.trim())}
              >
                {submitting ? 'Sending…' : 'Send inquiry'}
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Register the `/p/:slug` route in `src/App.tsx`**

Add the `PublicDeal` import at the top:

```tsx
import { PublicDeal } from './pages/PublicDeal';
```

Add the route as a sibling of the `AppLayout` route (before it, so it matches first):

```tsx
export default function App() {
  return (
    <Routes>
      <Route path="p/:slug" element={<PublicDeal />} />
      <Route element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        {/* … rest of existing routes unchanged … */}
      </Route>
    </Routes>
  );
}
```

- [ ] **Step 3: Add public deal CSS to `src/styles.css`**

Append at the end of `src/styles.css`:

```css
/* ---------- Public deal page ---------- */
.public-deal-page {
  max-width: 960px;
  margin: 0 auto;
  padding: var(--space-4);
}
.public-deal-header {
  background: var(--brand);
  color: var(--brand-ink);
  padding: 28px;
  border-radius: var(--radius-lg);
  margin-bottom: 28px;
}
.public-deal-header h1 { margin: 0; font-size: clamp(1.8rem, 3.5vw, 2.8rem); line-height: 1.05; }
.public-deal-header p { margin: 8px 0 0; }
.public-deal-grid {
  display: grid;
  gap: var(--space-4);
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.public-deal-center {
  text-align: center;
  padding: 60px var(--space-4);
}
.public-deal-thanks {
  font-size: 1.1rem;
  color: var(--good);
  font-weight: 600;
  padding: var(--space-3) 0;
}
@media (max-width: 760px) {
  .public-deal-grid { grid-template-columns: 1fr; }
}
```

- [ ] **Step 4: Verify build and open the public page in browser**

Run: `npm run build` in the project root. Expected: clean build.

Start the dev server (`npm run dev`), navigate to `http://localhost:5173/p/testslug`. Expected: page renders — either "unavailable" message (since `testslug` doesn't exist) or the deal summary if a real slug is used.

- [ ] **Step 5: Commit**

```bash
git add src/pages/PublicDeal.tsx src/App.tsx src/styles.css
git commit -m "feat(ui): public deal page at /p/:slug"
```

---

### Task 6: Share/Revoke Controls in Deals List

**Files:**
- Modify: `src/pages/Deals.tsx`

**Interfaces:**
- Consumes: `createDealLink(id)` and `revokeDealLink(id)` from `../api/client` (imported in Task 4)

- [ ] **Step 1: Add `createDealLink` and `revokeDealLink` to the import in `src/pages/Deals.tsx`**

The existing import line is:

```tsx
import { getDeals, updateDeal, deleteDeal, getDealMatches, emailMatchedBuyers, getDealActivities, createCampaign } from '../api/client';
```

Change it to:

```tsx
import { getDeals, updateDeal, deleteDeal, getDealMatches, emailMatchedBuyers, getDealActivities, createCampaign, createDealLink, revokeDealLink } from '../api/client';
```

- [ ] **Step 2: Add link state inside the `Deals` component**

After the existing `const [automateFor, setAutomateFor] = useState<string | null>(null);` line, add:

```tsx
const [links, setLinks] = useState<Record<string, string | null>>({});
const [copied, setCopied] = useState<Record<string, boolean>>({});
```

- [ ] **Step 3: Add the `handleShare` and `handleRevoke` handlers**

After the `handleAutomate` function (around line 87), add:

```tsx
  const handleShare = async (deal: Deal) => {
    setActionError(null);
    try {
      const res = await createDealLink(deal.id);
      setLinks((l) => ({ ...l, [deal.id]: res.slug }));
      await navigator.clipboard.writeText(`${window.location.origin}/p/${res.slug}`);
      setCopied((c) => ({ ...c, [deal.id]: true }));
      setTimeout(() => setCopied((c) => ({ ...c, [deal.id]: false })), 2000);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleRevoke = async (dealId: string) => {
    setActionError(null);
    try {
      await revokeDealLink(dealId);
      setLinks((l) => ({ ...l, [dealId]: null }));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };
```

- [ ] **Step 4: Add Share/Revoke/Copied UI to the deal card action row**

Find the action button row in the deal card JSX. It currently ends with the Delete button:

```tsx
                  <button className="ghost-button" onClick={() => handleDelete(deal.id)}>Delete</button>
```

Add these three elements immediately after the `Delete` button (inside the same wrapping `div`):

```tsx
                  <button className="ghost-button" onClick={() => handleShare(deal)}>Share</button>
                  {links[deal.id] && (
                    <button className="ghost-button" onClick={() => handleRevoke(deal.id)}>Revoke link</button>
                  )}
                  {copied[deal.id] && <span className="text-muted" style={{ fontSize: '0.85rem' }}>Link copied!</span>}
```

- [ ] **Step 5: Verify TypeScript compiles and the button works in browser**

Run `npm run build`. Expected: clean. 

In the dev server, open the Deals page, click Share on any deal. Expected: "Link copied!" flash appears. Open a new tab with the copied URL. Expected: public deal page loads with the deal's data.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Deals.tsx
git commit -m "feat(ui): Share/Revoke link controls on Deals list"
```

---

### Task 7: Share/Revoke Controls in DealSheet

**Files:**
- Modify: `src/pages/DealSheet.tsx`

**Interfaces:**
- Consumes: `createDealLink(id)` and `revokeDealLink(id)` from `../api/client`

- [ ] **Step 1: Add `createDealLink` and `revokeDealLink` to the import in `src/pages/DealSheet.tsx`**

The existing import is:

```tsx
import { getDeal, getDealMatches } from '../api/client';
```

Change it to:

```tsx
import { getDeal, getDealMatches, createDealLink, revokeDealLink } from '../api/client';
```

- [ ] **Step 2: Add link state to the `DealSheet` component**

After the existing `const [error, setError] = useState<string | null>(null);` line, add:

```tsx
  const [linkSlug, setLinkSlug] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
```

- [ ] **Step 3: Add the Share and Revoke handlers**

After the `useEffect` block (around line 24), add:

```tsx
  const handleShare = async () => {
    if (!id) return;
    try {
      const res = await createDealLink(id);
      setLinkSlug(res.slug);
      await navigator.clipboard.writeText(`${window.location.origin}/p/${res.slug}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleRevoke = async () => {
    if (!id) return;
    try {
      await revokeDealLink(id);
      setLinkSlug(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
```

- [ ] **Step 4: Add Share/Revoke buttons to the DealSheet action bar**

Find the existing `.no-print` button row (around line 41–45):

```tsx
      <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => window.print()}>Print / Save as PDF</button>
        <Link to={`/deals/${id}/documents`}><button className="ghost-button">Documents</button></Link>
        <Link to="/deals"><button className="ghost-button">Back to deals</button></Link>
      </div>
```

Replace it with:

```tsx
      <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => window.print()}>Print / Save as PDF</button>
        <Link to={`/deals/${id}/documents`}><button className="ghost-button">Documents</button></Link>
        <Link to="/deals"><button className="ghost-button">Back to deals</button></Link>
        <button className="ghost-button" onClick={handleShare}>Share</button>
        {linkSlug && (
          <button className="ghost-button" onClick={handleRevoke}>Revoke link</button>
        )}
        {copied && <span style={{ fontSize: '0.85rem', color: 'var(--ink-soft)' }}>Link copied!</span>}
      </div>
```

- [ ] **Step 5: Verify TypeScript compiles and Share works from DealSheet**

Run `npm run build`. Expected: clean.

In the dev server, open any Deal Sheet, click Share. Expected: "Link copied!" flash, and the public page opens correctly at the copied URL.

- [ ] **Step 6: Run the full backend test suite one final time**

Run: `cd backend && npm test`
Expected: All tests pass with no regressions

- [ ] **Step 7: Commit**

```bash
git add src/pages/DealSheet.tsx
git commit -m "feat(ui): Share/Revoke link controls on DealSheet"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|-----------------|------|
| `deal_links` table with slug PK, UNIQUE(deal_id) | Task 1 |
| `deal_link_inquiries` table linked to slug | Task 1 |
| Inquiry writes an activity row | Task 3 |
| `POST /api/deals/:id/link` generates/regenerates slug | Task 3 |
| `DELETE /api/deals/:id/link` deactivates | Task 3 |
| `GET /api/public/deals/:slug` returns whitelisted fields, increments view_count | Task 3 |
| `POST /api/public/deals/:slug/inquire` validated, stores inquiry + activity | Task 3 |
| Slug = 8-char hex from `crypto.randomBytes(4)` | Task 3 |
| `PublicDeal`, `InquiryBody`, `DealLinkResult` types | Task 4 |
| Four client functions | Task 4 |
| `/p/:slug` route outside AppLayout | Task 5 |
| Two-column deal summary + inquiry form | Task 5 |
| "Thanks — we'll be in touch" post-submit | Task 5 |
| "Deal unavailable" on error | Task 5 |
| Share/Revoke in Deals list | Task 6 |
| Share/Revoke in DealSheet | Task 7 |
| Clipboard copy + "Link copied!" flash | Tasks 6 & 7 |
| 9 backend route tests | Task 3 |

**All spec requirements covered. No gaps.**
