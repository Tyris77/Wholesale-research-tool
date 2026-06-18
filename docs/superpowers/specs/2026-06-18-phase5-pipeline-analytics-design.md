# Wholesale Research Tool — Phase 5: Pipeline Analytics & Insights (Design)

**Date:** 2026-06-18
**Status:** Approved — ready for implementation planning

## Problem

Phases 1–4 made the platform work and added the core capabilities (deals, comps-driven
ARV, buyer matching, printable sheets). But the data those features produce —
saved deals, lead counts, profit/ROI, buyer-match coverage — is scattered across
separate pages. There is no single view that answers "how is my pipeline doing?"

## Goal

A single **Insights** page that turns the data already in the database into an
at-a-glance command center: pipeline value, projected profit, ROI, a deal-status
funnel, profit-by-month, buyer-match coverage, and top deals/markets. All metrics
are computed server-side from existing tables. No new external services, API keys,
or database tables.

## Decisions

- **No new external dependencies.** Charts are hand-rolled inline SVG (small bar and
  sparkline). This matches the project's established "no heavy dependency" ethos
  (e.g. Phase 4 used browser print-to-PDF instead of a PDF library).
- **No new tables.** Everything is aggregated on read from `deals`, `sellers`,
  `buyers`, and `markets`.
- **Server-side aggregation.** Pure functions in a new `backend/src/insights.js`
  module do the math; one endpoint composes them. Frontend stays thin.
- **Additive, not disruptive.** A new `/insights` page is added; the existing
  Dashboard keeps its quick calculator and gains a compact KPI strip that links to
  Insights.
- **Reuse existing logic.** Buyer-match coverage reuses Phase 4's `matchBuyers`
  (`backend/src/analytics.js`).

## Architecture

### Backend

New module `backend/src/insights.js` — pure functions, no DB/HTTP, unit-testable:

- `summarizeDeals(deals) → { total, active, byStatus, pipelineValue, projectedProfit, avgRoi, topByProfit }`
  - `active` = deals whose `status` is not `closed` or `dead`.
  - `byStatus` = counts, zero-filled for the four known statuses
    (`analyzing`, `under_contract`, `closed`, `dead`); any unknown status is also included.
  - `pipelineValue` = sum of `arv` over **active** deals.
  - `projectedProfit` = sum of `profit` over **active** deals.
  - `avgRoi` = mean `roi` over **active** deals, rounded to 2 decimals (`0` if none).
  - `topByProfit` = up to 5 deals sorted by `profit` desc, each `{ id, name, profit, roi, status }`.
- `profitByMonth(deals) → [{ month: 'YYYY-MM', profit, count }]` — bucketed by the
  `YYYY-MM` prefix of `created_at`, sorted ascending by month.
- `leadFunnel(sellers, buyers) → { sellers, buyers, sellersByStatus }` — `sellers`/`buyers`
  are totals; `sellersByStatus` is a count keyed by each seller `status` actually present
  (sellers have no fixed status enum, so it is not zero-filled).
- `matchedDealCount(deals, buyers) → number` — count of deals with ≥1 result from
  `matchBuyers(deal, buyers)`.
- `topMarkets(markets, n = 5) → Market[]` — sorted by `heat_score` desc, first `n`.

New endpoint `GET /api/insights` (uses promisified `dbAll`):

```json
{
  "deals": {
    "total": 0,
    "active": 0,
    "byStatus": { "analyzing": 0, "under_contract": 0, "closed": 0, "dead": 0 },
    "pipelineValue": 0,
    "projectedProfit": 0,
    "avgRoi": 0,
    "matchedCount": 0,
    "profitByMonth": [{ "month": "2026-06", "profit": 0, "count": 0 }],
    "topByProfit": [{ "id": "…", "name": "…", "profit": 0, "roi": 0, "status": "analyzing" }]
  },
  "leads": { "sellers": 0, "buyers": 0, "sellersByStatus": { "new": 0 } },
  "markets": { "top": [{ "id": "…", "city": "…", "state": "…", "heat_score": 0, "trend": "…" }] }
}
```

The endpoint queries `deals`, `sellers`, `buyers`, `markets`, runs the pure functions,
and assembles the response (returns 200 with the object; this is a read-only summary).

### Frontend

New page `src/pages/Insights.tsx` at route `/insights`, nav entry "Insights":

- **KPI cards:** Pipeline value, Projected profit, Avg ROI, Active deals, Total leads
  (sellers + buyers), Matched deals (`matchedCount` of `total`).
- **Deal status funnel:** one horizontal bar per status (count + proportional width),
  rendered with inline SVG/CSS.
- **Profit by month:** small inline-SVG bar chart from `deals.profitByMonth`.
- **Top deals:** `topByProfit` list, each linking to its deal sheet (`/deals/:id/sheet`).
- **Top markets:** `markets.top` list, linking to `/markets`.
- Uses the typed client (`getInsights()`), `useAsync` + `Loading`/`ErrorBanner`/`Empty`,
  and `formatCurrency`. Empty state when there are no deals yet.

Supporting pieces:
- `src/api/types.ts` — `Insights` type matching the contract above.
- `src/api/client.ts` — `getInsights() → Promise<Insights>`.
- `src/lib/insights.ts` — a pure presentational helper `barHeights(values, maxPx) → number[]`
  (scales values to pixel heights for the SVG chart; returns zeros when all values are 0),
  unit-tested with vitest.
- `src/components/charts.tsx` — small presentational `MiniBars` (and a `StatusBar`) SVG
  components consuming `barHeights`.
- `src/pages/Dashboard.tsx` — a compact KPI strip (Pipeline value, Projected profit,
  Active deals) sourced from `getInsights()`, with a "View insights" link. The existing
  quick calculator and hot-markets panels stay.

## Data flow

`Insights` page mounts → `getInsights()` → `GET /api/insights` → backend queries the four
tables → pure aggregation functions → JSON → page renders KPIs + charts. The Dashboard
strip uses the same `getInsights()` call.

## Error handling

- Endpoint: DB errors flow through the existing `asyncHandler` + error middleware
  (`{ success:false, error }`, non-2xx). The typed client throws `ApiError` on non-2xx.
- Page: `useAsync` surfaces loading/error; a retry re-runs the fetch. Empty pipeline
  shows an `Empty` state guiding the user to save a deal.
- Dashboard strip: if the call fails, the strip is simply hidden (the rest of the
  Dashboard is unaffected).

## Testing

- **Backend unit tests** (`backend/src/insights.test.js`, `node:test`): `summarizeDeals`
  (active filter, byStatus zero-fill, pipeline sums, avgRoi rounding, top-5 ordering),
  `profitByMonth` (bucketing + ascending sort), `leadFunnel`, `matchedDealCount`
  (reusing `matchBuyers`), `topMarkets` (ordering + limit).
- **Backend integration test** (`backend/src/insights.routes.test.js`, supertest):
  `GET /api/insights` returns the documented shape; after saving a deal, `deals.total`
  and `pipelineValue` reflect it.
- **Frontend unit test** (`src/lib/insights.test.ts`, vitest): `barHeights` scaling,
  including the all-zero case.
- **Build + click-through:** `npm run build`; load `/insights`, confirm KPIs/charts and
  the Dashboard strip render; confirm nav works.

## Out of scope (YAGNI)

Date-range filtering, CSV/PDF export of analytics, real-time auto-refresh, configurable
or draggable widgets, per-user data (no auth — consistent with the original spec's
out-of-scope list), and any charting library.
