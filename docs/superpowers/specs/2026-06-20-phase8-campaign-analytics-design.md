# Wholesale Research Tool — Phase 8: Campaign Analytics (Design)

**Date:** 2026-06-20
**Status:** Approved — ready for implementation planning

## Context

Phase 7 sends automated drip campaigns to matched buyers via Resend and logs each send
to the `activities` table. But once an email leaves, the platform is blind: there is no
record of whether it was delivered, opened, clicked, or bounced. Phase 8 closes that loop
by ingesting Resend's webhook events and surfacing per-campaign stats.

## Goal

Capture Resend delivery events (delivered/opened/clicked/bounced), attribute them to the
campaign that sent each email, and show per-campaign stats on the Campaigns page.

## Decisions

- **Attribute via the Resend `email_id`.** Each send already gets a Resend message id;
  Phase 8 stores it (and the `campaign_id`) on the send's `activities` row, so later
  events join back to the campaign by `email_id`.
- **Verify webhooks with Svix signatures** (Resend's scheme), implemented with Node's
  built-in `crypto` — no new dependency. The webhook is rejected when a secret is
  configured and the signature is absent or invalid.
- **Self-contained.** No new external services; a new `email_events` table stores events;
  pure functions do parsing/aggregation/verification and are unit-tested.
- **Read the webhook secret live** from `process.env.RESEND_WEBHOOK_SECRET` in the
  endpoint (not frozen config) so verification is exercisable in tests; when unset,
  the webhook accepts (local/dev).

## Architecture

### Backend

**Database** (`backend/src/db.js`, all idempotent):
- `email_events` table: `id` TEXT PK, `email_id` TEXT, `type` TEXT, `recipient` TEXT,
  `created_at` TEXT (event time), `received_at` TEXT.
- Migrations on `activities`: `ALTER TABLE activities ADD COLUMN email_id TEXT` and
  `ADD COLUMN campaign_id TEXT` (error callback swallows duplicate-column).

**Pure logic** (`backend/src/analytics-events.js`):
- `parseResendEvent(body) → { email_id, type, recipient, created_at } | null` — returns
  null when `body.type` or `body.data.email_id` is missing; `recipient` is `data.to[0]`
  (or `data.to`); `created_at` defaults to now.
- `summarizeEvents(sentEmailIds, events) → { sent, delivered, opened, clicked, bounced }`
  — `sent` is the count of distinct sent email ids; each other metric is the number of
  those ids that have at least one event of the matching Resend type (`email.delivered`,
  `email.opened`, `email.clicked`, `email.bounced`), de-duped by `email_id`.
- `verifySvixSignature({ secret, id, timestamp, signature, body }) → boolean` — strips the
  `whsec_` prefix, base64-decodes the secret, computes `HMAC-SHA256` over
  `` `${id}.${timestamp}.${body}` `` (base64), and constant-time-compares it against each
  space-delimited `v1,<sig>` entry in the `svix-signature` header. Returns false when any
  required field is missing.

**Send attribution** (extend Phase 6B/7):
- `emailMatchedBuyers` (`outreach.js`): each activity object gains `email_id` (`r.id` on a
  successful send, `''` otherwise) alongside the existing `detail`.
- `recordActivities(dealId, activities, campaignId = null)` (`server.js`): the INSERT now
  includes `email_id` (from `a.email_id || ''`) and `campaign_id`.
- `processDueCampaigns` calls `recordActivities(deal.id, outcome.activities, campaign.id)`
  so campaign sends carry their `campaign_id`. The manual `email-buyers` endpoint and the
  digest pass `campaignId = null` (unchanged behavior).

**Endpoints** (`backend/src/server.js`):
- `POST /api/webhooks/resend` — **public**, parses the raw body. The global JSON parser
  skips this path; the route uses `express.raw({ type: '*/*' })` so the exact bytes are
  available for signature verification. If `process.env.RESEND_WEBHOOK_SECRET` is set,
  `verifySvixSignature(...)` must pass (else `401`); invalid JSON → `400`. A parsed event
  is inserted into `email_events`. Always returns `200 { success:true }` on success.
- `GET /api/campaigns/:id/stats` — collects the `email_id`s of that campaign's `sent`
  activities, loads `email_events`, and returns `summarizeEvents(...)`.

**Config / env:** add `RESEND_WEBHOOK_SECRET` to `backend/.env.example` (with a note to
copy the signing secret Resend shows when you add the webhook).

### Frontend

**Types** (`src/api/types.ts`): `CampaignStats { sent: number; delivered: number;
opened: number; clicked: number; bounced: number }`.

**Client** (`src/api/client.ts`): `getCampaignStats(id) → Promise<CampaignStats>`.

**Campaigns page** (`src/pages/Campaigns.tsx`): a per-campaign **"Stats"** button that
loads and displays `Sent / Delivered / Opened / Clicked / Bounced`, plus a one-line note:
"To collect stats, add a Resend webhook for delivered/opened/clicked/bounced pointing to
`<your-server>/api/webhooks/resend`."

## Data flow

Campaign step sends → activity stores `email_id` + `campaign_id`. Resend later POSTs an
event → webhook verifies the signature → stores it in `email_events`. The Campaigns page
"Stats" → `GET /api/campaigns/:id/stats` → join that campaign's sent `email_id`s to
events → counts shown.

## Error handling

- Webhook: missing/invalid signature (when a secret is set) → `401`; invalid JSON → `400`;
  an unparseable-but-valid-JSON body (no email id) is accepted and simply stored nothing,
  returning `200` (webhooks must not be retried for our parsing quirks).
- Stats endpoint: a campaign with no sent emails returns all-zero counts (not an error).
- DB errors flow through `asyncHandler` + the error middleware; the typed client throws
  `ApiError` on non-2xx; `useAsync`/local handlers surface it.

## Testing

- **Pure unit** (`backend/src/analytics-events.test.js`): `parseResendEvent` (valid →
  fields; missing type/email_id → null); `summarizeEvents` (counts; de-dup of repeated
  events for one `email_id`; ignores ids not in the sent set); `verifySvixSignature`
  (a signature computed with a known secret passes; a tampered body/sig fails; missing
  headers → false).
- **Integration** (supertest, email blanked by `test-setup.js`): `POST
  /api/webhooks/resend` with no secret set stores a valid event and returns `200`, and an
  invalid-JSON body returns `400`; with `process.env.RESEND_WEBHOOK_SECRET` set, a request
  without a valid signature returns `401` and one with a correctly computed signature
  returns `200` (the test computes the signature the same way `verifySvixSignature` does);
  `GET /api/campaigns/:id/stats` returns the documented shape (zeros for a fresh campaign).
  Attribution correctness across the join is covered by the `summarizeEvents` unit test
  (real `email_id`s require a real send, which tests never perform).
- **Frontend build + click-through:** `npm run build`; open Campaigns, click **Stats** on a
  campaign, and confirm the counts render (zeros until a webhook is configured and events
  arrive).

## Out of scope (YAGNI)

Real-time push to the UI, click heatmaps, reply/inbound tracking, per-recipient event
timelines, analytics export, and a Resend webhook auto-provisioning flow (the user adds
the webhook in the Resend dashboard).
