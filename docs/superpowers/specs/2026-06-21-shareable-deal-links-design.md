# Phase 10 — Shareable Deal Links

**Date:** 2026-06-21  
**Status:** Approved

## Summary

Allow a wholesaler to generate a short public URL for any deal. The URL opens a clean, no-login buyer-facing page that shows deal financials and a contact inquiry form. Submissions land in the deal's existing activity feed. The link can be revoked at any time; regenerating it invalidates the old slug.

---

## Data Model

### `deal_links`

```sql
CREATE TABLE IF NOT EXISTS deal_links (
  slug       TEXT PRIMARY KEY,
  deal_id    TEXT NOT NULL,
  active     INTEGER NOT NULL DEFAULT 1,
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE(deal_id)
);
```

One row per deal. UNIQUE on `deal_id` ensures at most one active slug per deal. Regenerating deletes the old row and inserts a new one.

### `deal_link_inquiries`

```sql
CREATE TABLE IF NOT EXISTS deal_link_inquiries (
  id         TEXT PRIMARY KEY,
  slug       TEXT NOT NULL,
  name       TEXT NOT NULL,
  email      TEXT,
  phone      TEXT,
  message    TEXT,
  created_at TEXT NOT NULL
);
```

Inquiries link to `slug` (not `deal_id`) so history persists across regenerations.

### `activities` (existing — extended)

Inquiry submission writes one row to `activities` with `type = 'inquiry'` and `note = "Inquiry from {name} ({email or phone})"`. No schema change needed.

---

## Backend API

### Management endpoints (existing auth pattern)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/deals/:id/link` | Generate (or regenerate) an 8-char hex slug. Deletes any existing `deal_links` row for this deal, inserts a new one with `active = 1`. Returns `{ slug, url }`. |
| `DELETE` | `/api/deals/:id/link` | Deactivates the link — sets `active = 0`. Row is retained to preserve inquiry history. |

### Public endpoints (no auth, `/api/public/` prefix)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/public/deals/:slug` | Returns deal fields safe for public display. Increments `view_count`. Returns 404 if slug not found or `active = 0`. |
| `POST` | `/api/public/deals/:slug/inquire` | Validated with Zod. Looks up `deal_id` from the slug (404 if inactive), inserts into `deal_link_inquiries`, and writes an activity row with that `deal_id`. Returns `{ success: true }`. |

### Public deal fields (whitelist — no sensitive data)

`name`, `city`, `state`, `deal_type`, `purchase_price`, `arv`, `profit`, `roi`

Excluded: internal `id`, seller info, notes, buyer matches, campaign data.

### Zod schema for inquiry

```js
z.object({
  name:    z.string().min(1).max(100),
  email:   z.string().email().optional(),
  phone:   z.string().min(7).max(20).optional(),
  message: z.string().max(500).optional(),
}).refine(d => d.email || d.phone, { message: 'email or phone required' })
```

### Slug generation

`crypto.randomBytes(4).toString('hex')` → 8 lowercase hex chars (e.g. `a3f8b2c1`). Collision probability is negligible for a single-user tool (~4 billion space for a few dozen deals).

---

## Frontend

### New route: `/p/:slug` (outside AppLayout)

- No sidebar, no nav. Standalone clean page.
- Layout: two-column on desktop (deal summary left, inquiry form right), single-column on mobile.
- **Deal summary panel:** property name, city/state, deal type badge, KPI cards for purchase price / ARV / profit / ROI.
- **Inquiry form:** name (required), email, phone (one of email/phone required), message (optional), Submit button.
- **Post-submit state:** form replaced by "Thanks — we'll be in touch." confirmation message.
- **Inactive/missing slug:** shows "This deal is no longer available."
- **Loading/error:** uses existing `Loading` and `ErrorBanner` components.

### Share controls (Deals list + DealSheet)

- Ghost "Share" button next to each deal row / in the DealSheet header.
- On click: calls `POST /api/deals/:id/link`, copies `window.location.origin + '/p/' + slug` to clipboard, shows inline "Link copied!" for 2 seconds.
- While a link is active, a small "Revoke" link appears beside the Share button. Clicking it calls `DELETE /api/deals/:id/link`.
- State is local to the component (no global store needed).

### New API client functions (`src/api/client.ts`)

```ts
createDealLink(id: string): Promise<{ slug: string; url: string }>
revokeDealLink(id: string): Promise<{ success: boolean }>
getPublicDeal(slug: string): Promise<PublicDeal>
submitInquiry(slug: string, body: InquiryBody): Promise<{ success: boolean }>
```

### New types (`src/api/types.ts`)

```ts
interface PublicDeal {
  name: string; city: string; state: string; deal_type: string;
  purchase_price: number; arv: number; profit: number; roi: number;
}
interface InquiryBody {
  name: string; email?: string; phone?: string; message?: string;
}
interface DealLink {
  slug: string; deal_id: string; active: number; view_count: number; created_at: string;
}
```

---

## App Router

`/p/:slug` is added as a top-level route in `App.tsx`, **sibling to** (not nested inside) the `AppLayout` route. This ensures the public page renders with no sidebar.

```tsx
<Routes>
  <Route path="p/:slug" element={<PublicDeal />} />   {/* new — no layout */}
  <Route element={<AppLayout />}>
    {/* existing routes */}
  </Route>
</Routes>
```

---

## Files Changed

| File | Change |
|------|--------|
| `backend/src/db.js` | Add `deal_links` and `deal_link_inquiries` migrations |
| `backend/src/schemas.js` | Add `inquirySchema` |
| `backend/src/server.js` | Add 4 new endpoints |
| `backend/test/deal-links.routes.test.js` | New test file |
| `src/api/types.ts` | Add `PublicDeal`, `InquiryBody`, `DealLink` |
| `src/api/client.ts` | Add 4 new client functions |
| `src/pages/PublicDeal.tsx` | New public page component |
| `src/pages/Deals.tsx` | Add Share/Revoke controls |
| `src/pages/DealSheet.tsx` | Add Share/Revoke controls |
| `src/styles.css` | Add `.public-deal-*` styles |
| `src/App.tsx` | Add `/p/:slug` top-level route |

---

## Testing

### Backend (`backend/test/deal-links.routes.test.js`)

- `POST /api/deals/:id/link` creates a slug and returns url
- `POST /api/deals/:id/link` regenerates (old slug 404s after)
- `DELETE /api/deals/:id/link` deactivates (slug 404s after)
- `GET /api/public/deals/:slug` returns deal fields and increments view_count
- `GET /api/public/deals/:slug` returns 404 for inactive slug
- `GET /api/public/deals/:slug` returns 404 for unknown slug
- `POST /api/public/deals/:slug/inquire` stores inquiry and creates activity
- `POST /api/public/deals/:slug/inquire` returns 400 with no email or phone
- `POST /api/public/deals/:slug/inquire` returns 404 on inactive slug

### Frontend (vitest)

- `PublicDeal` renders deal summary from mock data
- `PublicDeal` shows confirmation after successful form submit
- `PublicDeal` shows "no longer available" on 404 response

---

## Out of Scope

- Email notification when an inquiry arrives (can be added in a later phase using the existing Resend integration)
- Per-link view analytics / UTM tracking (Approach B — deferred)
- Password-protected links
- Link expiry dates
