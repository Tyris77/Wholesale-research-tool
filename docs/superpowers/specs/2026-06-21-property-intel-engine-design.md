# DC Property Intel Engine — Design Spec
**Date:** 2026-06-21  
**Phase:** 11 (Agent Automation — Phase 1 of 5)  
**Status:** Approved

---

## Overview

The Property Intel Engine is a fully autonomous scheduled agent that scrapes DC public property records daily, scores every residential parcel against 5 motivation signals, and auto-creates Seller records for high-scoring properties. It replaces what BatchLeads/PropStream charge $100-200/month for, using only free DC Open Data APIs.

Target market: Washington, DC (Ward 1-8). ~110,000 residential parcels.

---

## Data Sources

All sources are free, public, no API key required.

| Source | API | Data |
|---|---|---|
| DC Real Property Tax Database | DC Open Data ArcGIS REST | Owner name, mailing address, tax status, assessed value |
| DC OTR Tax Delinquency | DC Open Data ArcGIS REST | Properties with outstanding tax debt |
| DCRA Vacant & Blighted Registry | DC Open Data ArcGIS REST | Officially registered vacant/blighted properties |
| DCRA Code Violations | DC Open Data ArcGIS REST | Open code violations by address |

Base URL pattern: `https://maps2.dcgis.dc.gov/dcgis/rest/services/` and `https://opendata.dc.gov/`

---

## Motivation Scoring Model

Each property receives a score from 0–100 based on stacked signals:

| Signal | Condition | Points |
|---|---|---|
| Tax delinquent | Property has outstanding tax debt | +40 |
| Absentee owner | Owner mailing address ≠ property address | +20 |
| Out-of-state owner | Owner mailing address outside DC/MD/VA | +15 (bonus, stacks with absentee) |
| Vacant/blighted | On DCRA vacant registry | +25 |
| Code violations | One or more open violations | +15 |

**Tier classification:**
- **75–100** → Hot lead: auto-promoted to `sellers` table, flagged urgent
- **50–74** → Warm lead: stored in `property_leads`, visible in Lead Finder, not auto-promoted
- **0–49** → Cold: stored in `property_leads` only for reference

**Example:**
A Ward 8 property that is tax delinquent (+40) + absentee (+20) + out-of-state owner (+15) + vacant (+25) = **100/100** — auto-promoted immediately.

Expected first-run output: 2,000–5,000 leads above 50, 200–500 hot leads above 75.

---

## Architecture

```
Daily scheduler (3am ET)
    └── PropertyIntelAgent.run()
            ├── fetchTaxDelinquent()        ─┐
            ├── fetchPropertyOwnership()     ├─ parallel DC API queries
            ├── fetchVacantBlighted()        │
            └── fetchCodeViolations()       ─┘
                    ↓
            deduplicateByParcelId()
                    ↓
            scoreEachProperty()
                    ↓
            upsertPropertyLeads()           → property_leads table
                    ↓
            promoteHotLeads()               → sellers table (score ≥ 75)
                    ↓
            sendDigestEmail()               → Resend email to user
```

The agent is registered in the existing `scheduling.js` scheduler. No new scheduling infrastructure required.

---

## Database Schema

### `property_leads` table
```sql
CREATE TABLE IF NOT EXISTS property_leads (
  parcel_id TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  ward TEXT,
  owner_name TEXT,
  owner_address TEXT,
  assessed_value INTEGER,
  score INTEGER NOT NULL DEFAULT 0,
  signals TEXT NOT NULL DEFAULT '[]',  -- JSON array of signal names
  status TEXT NOT NULL DEFAULT 'new',  -- new | promoted | dismissed
  promoted_seller_id TEXT,             -- FK to sellers.id if promoted
  last_scanned_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

### `lead_signals` table
```sql
CREATE TABLE IF NOT EXISTS lead_signals (
  id TEXT PRIMARY KEY,
  parcel_id TEXT NOT NULL,
  signal_type TEXT NOT NULL,   -- tax_delinquent | absentee_owner | out_of_state | vacant | code_violation
  signal_value TEXT,           -- raw value from API (e.g. tax debt amount, violation type)
  points_awarded INTEGER NOT NULL,
  scanned_at TEXT NOT NULL
);
```

### Existing `sellers` table
Auto-promotion writes: name (owner name), address, notes (motivation score + signals), status = 'new'. ARV populated from DC assessed value × 1.2 (conservative multiplier).

---

## New Backend File: `backend/src/property-intel.js`

Responsibilities:
- DC API query functions (one per data source)
- Deduplication logic (parcel ID as key)
- Scoring engine
- DB upsert (idempotent — re-running doesn't create duplicates)
- Seller auto-promotion
- Email digest builder

Integration points:
- Uses existing `dbRun`, `dbGet`, `dbAll` from `db.js`
- Uses existing `sendEmail` from `email-service.js`
- Uses existing `uuid` for ID generation
- Registered in `scheduling.js` alongside existing scheduled jobs

---

## New Backend Routes: `GET /api/property-leads`

| Endpoint | Description |
|---|---|
| `GET /api/property-leads` | List all leads, supports `?ward=&minScore=&status=` filters |
| `GET /api/property-leads/:parcelId` | Single lead with full signal breakdown |
| `POST /api/property-leads/:parcelId/promote` | Manually promote a warm lead to Sellers |
| `POST /api/property-leads/:parcelId/dismiss` | Mark a lead as dismissed |
| `POST /api/property-intel/run` | Trigger a manual scan (fire-and-forget, responds immediately) |

---

## New Frontend Page: Lead Finder

**Route:** `/leads`  
**Nav label:** Lead Finder (added to sidebar between Sellers and Buyers)

**UI elements:**
- Summary bar: total leads, hot leads, new today
- Filter row: Ward (1-8), Min score, Signal type, Status
- Sortable table: Address | Ward | Score | Signals | Owner | Last scanned | Actions
- Score badge: red (75+), orange (50-74), gray (<50)
- Signal chips: color-coded pill for each fired signal
- Action buttons per row: Promote → Sellers, Dismiss, View details
- "Run Scan Now" button (triggers `POST /api/property-intel/run`)

---

## Email Digest

Sent daily after the scan completes via Resend to `NOTIFY_EMAIL` env var.

**Subject:** `🏠 [N] new hot leads found in DC — [date]`

**Body:** Top 5 hot leads with address, ward, score, signals fired, link to Lead Finder.

Only sent if at least 1 new hot lead was found. No email on days with no new leads.

---

## Scheduler Integration

In `scheduling.js`, add alongside existing `dueSteps` / `campaignRunAts` checks:

```js
// Run property intel scan at 3am ET daily
const hour = new Date().getUTCHours(); // 3am ET = 8am UTC
if (hour === 8 && minutesSinceLastPropertyScan() > 23 * 60) {
  runPropertyIntelScan().catch(e => console.error('property intel error', e));
}
```

---

## Error Handling

- Each DC API call has a 30-second timeout and 2 retries
- If one source fails, scoring continues with remaining sources (partial score, logged)
- Failed scans are logged but do not crash the scheduler
- Duplicate parcel IDs are handled via `INSERT OR REPLACE`
- Manual "Run Now" returns `{ success: true, message: "Scan started" }` immediately; results visible in Lead Finder when complete

---

## Testing

- Unit tests for scoring engine (known signal combos → expected scores)
- Unit tests for deduplication logic
- Integration test: mock DC API responses → verify correct leads created in DB
- Integration test: verify hot leads (≥75) auto-promote to sellers table
- Integration test: verify idempotency (running twice doesn't create duplicate sellers)

---

## Out of Scope (Phase 1)

- Skip tracing / contact info (Phase 2)
- Cash buyer discovery (Phase 3)
- Automated outreach to found leads (Phase 4)
- Properties outside DC
- Commercial/industrial properties
- Maryland or Virginia suburb data
