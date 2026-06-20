# Wholesale Research Tool — Phase 6B: Outreach & Follow-up (Design)

**Date:** 2026-06-19
**Status:** Approved — ready for implementation planning

## Context

Phase 6 was split into 6A (document generation, shipped) and 6B (this spec). The
platform matches deals to buyers and tracks seller leads but has no way to *act* on
either — you can see who matches a deal but can't reach them, and there is no record
of who was contacted or who is due for follow-up.

## Goal

Let the user email matched buyers about a deal (via Resend), keep an activity log of
that outreach, and track seller follow-ups so leads don't go cold.

## Decisions

- **Email provider: Resend.** A single `RESEND_API_KEY` plus an `EMAIL_FROM` sender,
  integrated with the existing "disabled until the key is configured" pattern (like
  FRED/RentCast/Groq) and reported by `/api/health`.
- **Outward-facing, so user-initiated and confirmed.** Email is never sent
  automatically (e.g. on deal save). The user clicks "Email matched buyers", sees the
  recipient count, and confirms before anything is sent. With no key configured, the
  action is disabled and sends nothing.
- **Server-side logic, injectable for tests.** The Resend call lives behind
  `sendEmail(...)` with an injectable `fetchFn`; the match-and-send orchestration is a
  pure function taking an injected `send`. Tests never send real email.
- **One shared activity log.** A new `activities` table records both buyer emails and
  seller contacts.
- **Seller follow-ups via a date field.** Add `next_follow_up` to sellers (idempotent
  migration, like Phase 4's `deal_type`); "due" = `next_follow_up <= today`.

## Architecture

### Backend

**Config** (`backend/src/config.js`): add `resend: process.env.RESEND_API_KEY` and
`emailFrom: process.env.EMAIL_FROM` to `config.keys`/`config`; add `resend` to
`integrationStatus`. Update `.env.example` and the `/api/health` integrations object.

**Email integration** (`backend/src/email-service.js`):

```
sendEmail({ to, subject, html }, { apiKey, from, fetchFn }) → { success, id } | { success:false, error }
```

Returns `{ success:false, error:'RESEND_API_KEY not configured' }` when the key is
absent (via `isConfigured`), and `{ success:false, error:'EMAIL_FROM not configured' }`
when no sender is set. Otherwise POSTs to `https://api.resend.com/emails` with a Bearer
token; non-2xx → `{ success:false, error }`. `apiKey`/`from`/`fetchFn` default to env +
`fetch` and are injectable for tests.

**Outreach logic** (`backend/src/outreach.js`, pure + injectable):

- `buildDealEmail(deal) → { subject, html }` — a clean deal summary (name, property,
  purchase price, ARV, repairs, projected profit, deal type) with a short call to
  action. Pure.
- `async emailMatchedBuyers(deal, matches, send) → { sent, failed, skipped, activities, results }`
  — for each match: if the buyer has an email, call `send({to,subject,html})` and record
  the outcome (`sent`/`failed`); otherwise `skipped`. Builds one activity record per
  buyer and a `results` row `{ buyer_id, name, status, error? }`. `send` is injected so
  this is unit-tested without HTTP.

**Database** (`backend/src/db.js`):

- New `activities` table: `id` TEXT PK, `deal_id` TEXT, `contact_type` TEXT
  (`buyer|seller`), `contact_id` TEXT, `contact_name` TEXT, `channel` TEXT
  (`email|note`), `subject` TEXT, `status` TEXT (`sent|failed|skipped|logged`),
  `detail` TEXT, `created_at` TEXT.
- Idempotent migration: `ALTER TABLE sellers ADD COLUMN next_follow_up TEXT` (error
  callback swallows "duplicate column").

**Schema** (`backend/src/schemas.js`): add `next_follow_up: z.string().optional()` to
`sellerUpdateSchema`; add `logContactSchema = z.object({ note: z.string().optional(),
next_follow_up: z.string().optional() })`.

**Endpoints** (`backend/src/server.js`):

- `POST /api/deals/:id/email-buyers` — 404 if the deal is missing; if email isn't
  configured, returns `200 { success:false, error:'Email is not configured …' }` (the
  project's soft-failure convention). Otherwise loads buyers, runs `matchBuyers`, calls
  `emailMatchedBuyers(deal, matches, (m) => sendEmail(m))`, persists each returned
  activity, and responds `{ success:true, sent, failed, skipped, results }`.
- `GET /api/deals/:id/activities` — activities for a deal, `created_at` desc.
- `GET /api/activities` — recent activities (limit 50), `created_at` desc.
- `GET /api/follow-ups` — sellers due for follow-up (`next_follow_up` non-null and
  `<= today`), sorted by `next_follow_up` asc. "Today" is `new Date().toISOString()
  .slice(0,10)`, computed server-side; the pure filter `dueSellers(sellers, today)`
  lives in `outreach.js` and is unit-tested.
- `POST /api/sellers/:id/log-contact` (body `logContactSchema`) — writes a seller
  activity (`channel:'note'`, `status:'logged'`, `detail:note`), sets the seller's
  `last_contacted = now` and `next_follow_up = body.next_follow_up || null`; returns
  `{ success:true }`.
- Extend `PUT /api/sellers/:id` to also persist `next_follow_up` (schema already
  allows it).

### Frontend

**Types** (`src/api/types.ts`): `Activity`; `OutreachResult { success; sent; failed;
skipped; results: { buyer_id; name; status; error? }[]; error? }`; add `next_follow_up?:
string` to `Seller`; add `resend: boolean` to `Health.integrations`.

**Client** (`src/api/client.ts`): `emailMatchedBuyers(dealId) → OutreachResult`;
`getDealActivities(dealId) → Activity[]`; `getActivities() → Activity[]`;
`getFollowUps() → Seller[]`; `logContact(sellerId, body) → {success:boolean}`.

**Deals page** (`src/pages/Deals.tsx`): per deal, an **"Email matched buyers"** action
that first fetches matches (reusing `getDealMatches`), shows a native confirm
(`Send this deal to N matched buyers?`), then calls `emailMatchedBuyers` and renders a
result line (`Sent 3 · skipped 1 · failed 0`, or the not-configured error). A toggle
shows that deal's **activity history** (`getDealActivities`).

**Follow-ups page** (`src/pages/FollowUps.tsx`, route `/follow-ups`, nav entry): lists
sellers due for follow-up (`getFollowUps`) with name/last-contacted, a date input to set
the next follow-up, and a **"Log contact"** button (`logContact`); below it, a recent
**activity feed** (`getActivities`). Uses `useAsync` + Loading/Error/Empty.

## Data flow

Email: Deals page → `getDealMatches` (count) → confirm → `POST email-buyers` → backend
matches, `sendEmail` per buyer via Resend, writes activities → `{sent,failed,skipped}` →
result shown. Follow-ups: page → `getFollowUps` / `getActivities` → render; "Log contact"
→ `POST log-contact` → activity written, seller rescheduled → list refreshes.

## Error handling

- Not configured → `email-buyers` returns `success:false` with a clear message; the UI
  shows it and sends nothing. No key is ever required to load any page.
- Per-buyer send failure is captured in that buyer's `results` row and activity
  (`status:'failed'`, `detail:error`); one failure does not abort the batch.
- Buyers without an email are `skipped` (recorded as such), not errors.
- DB/network errors flow through `asyncHandler` + the error middleware; the typed
  client throws `ApiError` on non-2xx and `useAsync` surfaces it.

## Testing

- **Backend unit** (`node:test`): `buildDealEmail` (subject + html contain the deal's
  name, property, and prices); `emailMatchedBuyers` with a fake `send` (counts for
  sent/failed/skipped, one activity per buyer, skip when no email); `sendEmail`
  not-configured (no key / no from) and a mocked-`fetchFn` success and failure;
  `dueSellers` (date filter + sort).
- **Backend integration** (supertest, email mocked via the no-key path): `POST
  /api/deals/:id/email-buyers` 404 for a missing deal and `success:false` when email is
  unconfigured; `POST /api/sellers/:id/log-contact` writes an activity and sets
  `next_follow_up`; `GET /api/deals/:id/activities`, `GET /api/activities`, and `GET
  /api/follow-ups` return arrays of the documented shape.
- **Frontend build + click-through:** `npm run build`; on Deals, trigger "Email matched
  buyers" with no key and confirm the disabled/not-configured message; open Follow-ups,
  set a date, log a contact, and confirm it appears in the activity feed.

## Out of scope (YAGNI)

Scheduled or automated sends, open/click tracking, an email-template editor, SMS,
inbound reply handling, bulk seller emailing, and per-recipient unsubscribe management.
