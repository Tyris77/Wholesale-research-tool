# Wholesale Research Tool — Platform Overhaul (Design)

**Date:** 2026-06-17
**Status:** Approved — ready for implementation planning

## Problem

The platform was reported "fully operational" but several headline features were
never tested against real APIs and are broken:

- **AI Analyzer** ([backend/src/ai-service.js](../../../backend/src/ai-service.js)) calls the Groq SDK using
  Anthropic's API shape (`groqClient.messages.create(...)`, reading `message.content[0]`).
  Groq uses `groq.chat.completions.create(...)` → `choices[0].message.content`. It throws on
  every call. The model `mixtral-8x7b-32768` is also retired on Groq.
- **Market trends** ([backend/src/api-services.js](../../../backend/src/api-services.js)) hits
  `/fred/series/data`; the real FRED endpoint is `/fred/series/observations`. Several series IDs
  (`PHXHPI`, `DENHPI`, `DALSXR`) are likely invalid.
- **Live comps** uses RealtyMole, which has been shut down (replaced by RentCast).
- **Geocoding** calls Nominatim without the required `User-Agent` header → requests get blocked.
- **Navigation bug**: [src/App.tsx](../../../src/App.tsx) renders sub-pages (Sellers, Buyers, Markets,
  Properties, AI, Research) *without* the nav bar, so the user cannot navigate back once they leave
  the dashboard.
- Dashboard/Calculator render hardcoded arrays instead of the data the backend already serves.

## Goal

Turn the prototype into a working, hardened, polished product with the requested new
capabilities. Delivered in phases, each leaving the app in a working, testable state.

## Decisions

- **Property/comps data:** RentCast (`api.rentcast.io/v1`), the modern free-tier replacement for
  RealtyMole. Clean "API key not configured" state when no key is present.
- **AI provider:** Keep Groq (free tier). Fix the SDK usage and move to a current model
  (`llama-3.3-70b-versatile`).
- **New features:** all four — save/track deals, comps-driven ARV, buyer–deal matching, export/reports.
- **Export format:** browser print-to-PDF via a print stylesheet (no heavy PDF dependency).
- **Execution:** phased & incremental, in dependency order.

## Phase 1 — Make it work

- Rewrite `ai-service.js` to use `groq.chat.completions.create` with `llama-3.3-70b-versatile`,
  reading `choices[0].message.content`. Applies to both `analyzeDealWithAI` and `scoreSeller`.
- Fix FRED to `/fred/series/observations`; use a vetted map of valid per-metro House Price Index
  series IDs (verify each ID resolves before shipping).
- Replace RealtyMole with RentCast in `getLiveComps` (AVM value + comparable listings,
  `X-Api-Key` header). Clean error when key absent.
- Add a descriptive `User-Agent` header to the Nominatim geocoding request.

## Phase 2 — Harden it

- Central async error-handling middleware; consistent JSON response shape `{ success, data | error }`.
- Input validation on all POST/PUT endpoints using **zod** schemas.
- Config module that validates env keys on boot and reports which integrations are live vs. disabled.
- Update [backend/.env.example](../../../backend/.env.example); add `GET /api/health` reporting configured integrations.

## Phase 3 — Polish the UX

- Add **react-router** + a shared `AppLayout` with persistent nav (fixes the navigation bug).
- Add a typed **API client module** — single place for base URL, fetch, and error handling.
- Real loading / error / empty states on every data view; restyle [src/styles.css](../../../src/styles.css)
  for a product-grade look.
- Wire dashboard/calculator widgets to live backend data instead of hardcoded arrays.

## Phase 4 — Add capabilities

- **Save & track deals:** new `deals` table + CRUD endpoints; calculator can save a deal; a Deals
  page lists history with profit/ROI and supports edit.
- **Comps-driven ARV:** estimate ARV from comparable sales (median $/sqft × subject sqft);
  auto-fill the calculator. Computed server-side.
- **Buyer–deal matching:** match a saved deal to buyers by area, price range, and deal type;
  return a ranked list. Computed server-side.
- **Export / reports:** a printable deal-sheet view (clean print stylesheet → "Save as PDF").

## Data model additions

`deals` table:

| column | type | notes |
| --- | --- | --- |
| id | TEXT PK | uuid |
| name | TEXT | optional label |
| property_address | TEXT | optional |
| city / state | TEXT | for buyer matching |
| purchase_price | REAL | |
| repair_budget | REAL | |
| arv | REAL | |
| selling_costs | REAL | |
| holding_costs | REAL | |
| wholesale_fee | REAL | |
| profit | REAL | computed, stored |
| roi | REAL | computed, stored |
| status | TEXT | e.g. analyzing / under_contract / closed / dead |
| created_at | TEXT | ISO |
| updated_at | TEXT | ISO |

Comps math and buyer-matching logic live server-side so the frontend stays thin.

## Testing

- Backend unit tests: deal math, comps/ARV calculation, buyer-matching logic.
- Integration tests for endpoints with external APIs (Groq, FRED, RentCast, Nominatim) mocked.
- Each phase verified working before the next begins.

## Out of scope (YAGNI)

Auth / multi-user accounts, payments, skip tracing, real-time heatmap data feeds.
