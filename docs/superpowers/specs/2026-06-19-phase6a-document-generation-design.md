# Wholesale Research Tool — Phase 6A: Document Generation (Design)

**Date:** 2026-06-19
**Status:** Approved — ready for implementation planning

## Context

Phase 6 was split into two independent sub-phases: **6A — document generation**
(this spec, no external dependencies) and **6B — outreach & follow-up** (separate
spec, needs an email service). 6A is built first.

Wholesalers run a paper trail across a deal's life: a **Letter of Intent** to the
seller, a **Purchase & Sale Agreement** to get under contract, and an **Assignment
of Contract Agreement** to assign the deal to an end buyer for a fee. The platform
already stores the deal, buyer, and property data those documents need, and already
prints clean pages (Phase 4 deal sheet). It has no way to produce the documents.

## Goal

From a saved deal, generate any of three pre-filled, printable legal documents —
Letter of Intent, Purchase & Sale Agreement, Assignment of Contract Agreement —
choosing the counterparty (buyer/seller) and editing a few fields, then Save-as-PDF
via the existing print approach.

## Decisions

- **No backend, no new tables, no external services.** Documents are assembled and
  rendered entirely on the frontend from existing data read through the typed client
  (`getDeal`, `getBuyers`). Generated documents are not stored. (Consistent with the
  project's friction-free, self-contained ethos.)
- **Template registry, one page.** A pure `buildDocument(type, context)` returns a
  normalized document model; a single page renders any template by key. Adding a
  fourth template later is a registry entry, not a new page.
- **Edit-then-print split.** An on-screen editor form (party names, dates, amounts)
  is `.no-print`; the rendered document shows every value as text and is the only
  thing that prints. This avoids relying on form-control print rendering.
- **Reuse the print stylesheet** from Phase 4 (`@media print` hides the sidebar and
  `.no-print` chrome).
- **Disclaimer required.** Every document renders a clear "template, not legal advice,
  consult a licensed attorney" notice.

## Architecture

### Pure logic — `src/lib/documents.ts` (vitest-tested)

A normalized document model and a builder:

```ts
export type DocType = 'letter_of_intent' | 'purchase_agreement' | 'assignment_agreement';

export interface DocParty { role: string; name: string }
export interface DocMeta { label: string; value: string }
export interface DocSection { heading?: string; paragraphs: string[] }

export interface DocumentModel {
  type: DocType;
  title: string;
  parties: DocParty[];
  meta: DocMeta[];              // property, dates, amounts shown in a header block
  sections: DocSection[];       // recitals / terms, fully merged to text
  signatures: DocParty[];       // signature blocks
  disclaimer: string;
}

export interface DocContext {
  deal: Deal;                   // from src/api/types
  assignee: Buyer | null;       // chosen end buyer (assignment agreement)
  overrides: DocOverrides;
}

export interface DocOverrides {
  assignorName: string;         // the wholesaler / your company
  sellerName: string;
  effectiveDate: string;        // ISO or '' → renders as a fill-in line
  closingDate: string;
  earnestMoney: number;
  offerPrice: number;           // defaults to deal.purchase_price
  assignmentFee: number;        // defaults to deal.wholesale_fee
}

export const DOC_TYPES: { type: DocType; label: string }[];   // registry for the UI
export function defaultOverrides(deal: Deal): DocOverrides;     // offerPrice=purchase_price, assignmentFee=wholesale_fee, others blank/0
export function buildDocument(type: DocType, ctx: DocContext): DocumentModel;
```

Shared helpers (private): `money(n)` formatting, `line(value)` → the value or a
fill-in placeholder (`'__________'`) when blank, `propertyLabel(deal)` →
`"address, city, state"`.

Per-template content (concise, realistic clauses):

- **letter_of_intent** — parties: Buyer (`assignorName`) → Seller (`sellerName`).
  meta: property, offer price, effective date, proposed closing date. sections:
  intent to purchase at `offerPrice`; non-binding; due-diligence/inspection period;
  financing/all-cash; expiration of the offer. signatures: Buyer, Seller.
- **purchase_agreement** — parties: Buyer (`assignorName`) ↔ Seller (`sellerName`).
  meta: property, purchase price (`offerPrice`), earnest money, closing date.
  sections: agreement to buy/sell; earnest-money deposit; **assignability** clause
  ("Buyer may assign this contract"); as-is condition; closing/possession. signatures:
  Buyer, Seller.
- **assignment_agreement** — parties: Assignor (`assignorName`) → Assignee
  (`assignee.name`). meta: property, original purchase price (`offerPrice`),
  assignment fee (`assignmentFee`), total to assignee (`offerPrice + assignmentFee`),
  effective date. sections: assignment of all rights/obligations under the purchase
  contract; assignment fee due at closing; assignee assumes obligations; non-binding
  on seller's underlying contract. signatures: Assignor, Assignee.

`buildDocument` throws if `type === 'assignment_agreement'` and `assignee` is null
(the page guards by requiring a selected buyer before showing that template).

### UI — `src/pages/DocumentGenerator.tsx` at `/deals/:id/documents`

- Loads the deal (`getDeal`) and buyers (`getBuyers`) via `useAsync` + Loading/Error
  states.
- A `.no-print` editor panel: document-type tabs (`DOC_TYPES`), an assignee
  `<select>` (from buyers; required for the assignment agreement), and inputs for the
  `DocOverrides` fields, seeded by `defaultOverrides(deal)`.
- A `.legal-doc` rendered panel: title, parties, meta table, sections, signature
  blocks, and the disclaimer — all from `buildDocument(activeType, ctx)`.
- A `.no-print` toolbar: "Print / Save as PDF" (`window.print()`) and a back link.

### Entry points

- Deals page (`src/pages/Deals.tsx`): a "Documents" action per deal linking to
  `/deals/:id/documents`.
- Deal sheet (`src/pages/DealSheet.tsx`): a `.no-print` "Documents" link.
- Route added in `src/App.tsx` inside `AppLayout` (print CSS hides the sidebar, as
  with the deal sheet).

### Styles — `src/styles.css`

A `.legal-doc` block (serif, max-width, generous line-height, section spacing,
signature lines) plus print rules folded into the existing `@media print` (the
shared rules already hide `.sidebar`/`.no-print`).

## Data flow

`/deals/:id/documents` mounts → `getDeal(id)` + `getBuyers()` → editor seeded by
`defaultOverrides(deal)` → on every edit/tab/assignee change, `buildDocument(type,
{ deal, assignee, overrides })` recomputes the `DocumentModel` → the `.legal-doc`
panel re-renders → Print outputs only the document.

## Error handling

- Deal not found / fetch error → `ErrorBanner` with retry (same pattern as the deal
  sheet).
- Assignment agreement selected with no assignee chosen → the page shows an inline
  prompt to pick a buyer instead of calling `buildDocument` (which would throw).
- Buyers fetch failure → the assignee dropdown is empty and the assignment tab shows
  the "pick a buyer" prompt; LOI and purchase agreement still work.

## Testing

- **Frontend unit tests** (`src/lib/documents.test.ts`, vitest): `defaultOverrides`
  (offerPrice = purchase_price, assignmentFee = wholesale_fee); `buildDocument` for
  each type — correct title, parties, computed amounts (assignment total =
  offerPrice + assignmentFee), property label, and that blank dates render as the
  fill-in placeholder; `buildDocument('assignment_agreement', …)` throws when
  `assignee` is null; `DOC_TYPES` lists all three.
- **Build + click-through:** `npm run build`; load `/deals/:id/documents`, switch
  tabs, pick a buyer, edit dates/amounts, and confirm the print preview shows a clean,
  filled document with the sidebar hidden.

## Out of scope (YAGNI)

Storing or versioning generated documents, e-signatures, server-side PDF rendering,
emailing documents (that overlaps Phase 6B), a standalone documents library page,
and any template beyond the three listed.
