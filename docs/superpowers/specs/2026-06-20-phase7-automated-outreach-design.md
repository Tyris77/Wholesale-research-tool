# Wholesale Research Tool — Phase 7: Automated Outreach (Design)

**Date:** 2026-06-20
**Status:** Approved — ready for implementation planning

## Context

Phase 6B added on-demand, confirmed email outreach to matched buyers (Resend) and a
seller follow-up tracker. Everything is manual: the user clicks "Email buyers" each
time and checks the Follow-ups page themselves. Phase 7 automates both: timed **drip
campaigns** to a deal's matched buyers, and a **daily digest** email of sellers due
for follow-up — driven by an in-process scheduler.

## Goal

Let the user create a multi-step email campaign for a deal (a cadence of offsets like
"now, +3 days, +7 days") that an in-process scheduler sends to the deal's matched
buyers automatically, fully logged and pausable; and have the scheduler email the user
a once-daily digest of due seller follow-ups.

## Decisions

- **In-process scheduler, no external infra.** A `setInterval` tick (every 60s)
  processes due work. It starts **only when the server runs as the main module** (the
  `isMain` block) — never on import — so the test suite never fires it.
- **Activation is consent.** Creating-and-activating a campaign is the user's explicit
  authorization for the automated sends it will make (mirrors 6B's confirm-before-send).
  The "Automate" UI shows the schedule and a confirmation before creating.
- **Reuse Phase 6B.** Each campaign step send goes through `emailMatchedBuyers` +
  `sendEmail`; every send is written to the existing `activities` table.
- **Disabled-until-configured, safely.** If email isn't configured, processing records
  sends as failed instead of crashing. Tests run with email blanked (Phase 6B's
  `test-setup.js`), so automation never sends real email under test.
- **Pure, time-injectable logic.** Scheduling and due-detection are pure functions that
  take an explicit `now`, so they are deterministic to test; the scheduler and endpoints
  pass the real clock.
- **UTC dates, no timezone handling** (YAGNI). Offsets are whole days.

## Architecture

### Backend

**Config** (`backend/src/config.js`): add `notifyEmail: process.env.NOTIFY_EMAIL || ''`.
The digest recipient is `config.notifyEmail || config.emailFrom`.

**Database** (`backend/src/db.js`, all idempotent):
- `campaigns` (id TEXT PK, deal_id TEXT, name TEXT, status TEXT `active|paused|done|cancelled`, created_at TEXT).
- `campaign_steps` (id TEXT PK, campaign_id TEXT, step_no INTEGER, run_at TEXT, status TEXT `pending|sent`, created_at TEXT).
- `app_state` (key TEXT PK, value TEXT) — stores `last_digest_date`.

**Schema** (`backend/src/schemas.js`):
`campaignCreateSchema = z.object({ name: z.string().optional(), offsets_days:
z.array(z.number().int().nonnegative()).min(1).max(10) })`.

**Pure logic** (`backend/src/scheduling.js`):
- `campaignRunAts(startISO, offsetsDays) → string[]` — for each offset, the ISO time
  `start + offset*86400000 ms`.
- `dueSteps(steps, nowISO) → step[]` — steps with `status==='pending'` and `run_at <= nowISO`.
- `buildFollowUpDigest(dueList) → { subject, html } | null` — `null` when `dueList` is
  empty; otherwise a digest listing each seller's name and `next_follow_up`.
- `shouldSendDigest(lastDigestDate, today) → boolean` — `today !== lastDigestDate`.

(`dueSellers` from Phase 6B's `outreach.js` is reused to compute the digest's `dueList`.)

**Orchestration** (in `backend/src/server.js`, touches the DB; `send` injected so it is
testable through the manual-run endpoint):
- `processDueCampaigns(nowISO, send) → { stepsProcessed }` — for each `active` campaign,
  for each due step: load the deal, `matchBuyers`, `emailMatchedBuyers(deal, matches,
  send)`, persist the returned activities, mark the step `sent`. When all of a
  campaign's steps are `sent`, set the campaign `done`. (A step is `sent` once processed,
  regardless of per-buyer delivery outcome.)
- `maybeSendDigest(today, send, notifyTo) → boolean` — read `last_digest_date` from
  `app_state`; if `shouldSendDigest` is false, return false; compute due sellers; if none,
  return false; otherwise `send` the digest to `notifyTo`, log a `digest` activity, set
  `last_digest_date = today`, return true.
- `runScheduler()` — calls `processDueCampaigns(now, sendEmail)` then
  `maybeSendDigest(today, sendEmail, notifyTo)`; errors are caught and logged.

**Endpoints**:
- `POST /api/deals/:id/campaigns` (body `campaignCreateSchema`) — 404 if the deal is
  missing; create an `active` campaign and its steps (`run_at` via `campaignRunAts(now,
  offsets_days)`, `status:'pending'`); return the campaign with its steps.
- `GET /api/deals/:id/campaigns` and `GET /api/campaigns` — campaigns (each with steps),
  newest first.
- `POST /api/campaigns/:id/pause` → `paused`; `/resume` → `active`; `/cancel` →
  `cancelled`. 404 if missing.
- `POST /api/scheduler/run` — `await runScheduler()`; returns `{ success:true,
  stepsProcessed, digestSent }`. Manual trigger (and the test entry point).

**Scheduler start** — inside the existing `isMain` block only:
`setInterval(() => runScheduler().catch((e) => console.error('scheduler error', e)),
60000)`.

### Frontend

**Types** (`src/api/types.ts`): `CampaignStep { id, campaign_id, step_no, run_at, status }`;
`Campaign { id, deal_id, name, status, created_at, steps: CampaignStep[] }`.

**Client** (`src/api/client.ts`): `createCampaign(dealId, body)`, `getCampaigns()`,
`getDealCampaigns(dealId)`, `pauseCampaign(id)`, `resumeCampaign(id)`,
`cancelCampaign(id)`, `runScheduler()`.

**Deals page** (`src/pages/Deals.tsx`): an **"Automate"** action per deal opening an
inline cadence picker with three presets — Single blast `[0]`, Two-touch `[0,3]`,
Three-touch `[0,3,7]` — and a confirmation ("This automatically emails matched buyers on
the chosen schedule"), then `createCampaign`. A short success line links to Campaigns.

**Campaigns page** (`src/pages/Campaigns.tsx`, route `/campaigns`, nav entry): lists all
campaigns with status and each step's `run_at`/status; per-campaign Pause/Resume/Cancel;
and a top **"Run due now"** button (`runScheduler`) for immediate processing. Uses
`useAsync` + Loading/Error/Empty.

A small note on the page: "Automated sends use Resend. With the test sender
`onboarding@resend.dev`, only your own account email receives mail until you verify a
domain."

## Data flow

Create: Deals "Automate" → pick cadence → confirm → `POST …/campaigns` → steps created
with `run_at`. Run (automatic): the 60s tick → `runScheduler` → `processDueCampaigns`
sends due steps to matched buyers (logging activities) and marks them sent →
`maybeSendDigest` emails the daily digest once/day. Run (manual): Campaigns "Run due
now" → `POST /api/scheduler/run` → same processing immediately.

## Error handling

- Email not configured → sends recorded as `failed`; steps still mark `sent` (processed);
  no crash. The digest simply isn't sent.
- A missing deal for a campaign step is skipped without aborting the batch; `runScheduler`
  catches and logs any error so the interval keeps running.
- Endpoint DB errors flow through `asyncHandler` + the error middleware; the typed client
  throws `ApiError` on non-2xx; `useAsync` surfaces it.

## Testing

- **Pure unit** (`backend/src/scheduling.test.js`): `campaignRunAts` (offsets → correct
  ISO from an injected start), `dueSteps` (status + time filter), `shouldSendDigest`,
  `buildFollowUpDigest` (null when empty; lists names when due).
- **Integration** (supertest, email blanked by `test-setup.js`): create a campaign →
  steps returned with `run_at`; pause/resume/cancel change status; with a buyer + a deal
  in a shared area and a campaign with offset `[0]`, `POST /api/scheduler/run` marks the
  step `sent` and writes an activity (recorded `failed`/`skipped` since email is disabled
  in tests — never a real send); `GET /api/campaigns` returns the documented shape.
- **No-auto-fire guarantee:** importing `app` does not start the interval (it lives in the
  `isMain` block), so the suite never sends. (`test-setup.js` blanks the key as a second
  safety net.)
- **Frontend build + click-through:** `npm run build`; create a campaign from a deal,
  open Campaigns, click "Run due now", and confirm step statuses update and activities
  appear — all with email disabled or the onboarding sender (no real blasts).

## Out of scope (YAGNI)

Reply/open tracking, per-step custom copy, audiences beyond "matched buyers", timezone
handling, retries/backoff, multiple digests per day, and persisting scheduler runs beyond
the activity log.
