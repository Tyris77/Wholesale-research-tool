# Phase 6A — Document Generation: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate three pre-filled, printable wholesale documents (Letter of Intent, Purchase & Sale Agreement, Assignment of Contract) from a saved deal — choosing the counterparty and editing key fields — then Save-as-PDF via the existing print stylesheet.

**Architecture:** All document logic is a pure, vitest-tested frontend module (`src/lib/documents.ts`) that merges deal + buyer data into a normalized `DocumentModel`. A single page (`src/pages/DocumentGenerator.tsx` at `/deals/:id/documents`) renders any template from the registry, with a `.no-print` editor form and a printable `.legal-doc` body. No backend, no new tables, no external services.

**Tech Stack:** React 18, Vite 5, TypeScript, react-router-dom v7, vitest (node env, pure-logic tests).

## Global Constraints

- No backend changes, no new tables, no external services; documents are assembled and rendered entirely on the frontend from existing data (`getDeal`, `getBuyers`). (Spec: Decisions.)
- Generated documents are not stored. (Spec: Decisions / Out of scope.)
- Exactly three templates: `letter_of_intent`, `purchase_agreement`, `assignment_agreement`. No more. (Spec: Out of scope.)
- Edit-then-print split: the editor form is `.no-print`; the rendered `.legal-doc` shows every value as text and is the only thing that prints. (Spec: Decisions.)
- Reuse the existing Phase 4 `@media print` rules (they already hide `.sidebar` and `.no-print`). (Spec: Decisions.)
- Every document renders the disclaimer verbatim: "This document was generated from a template for convenience and is not legal advice. Consult a licensed attorney before signing or relying on it." (Spec: Decisions.)
- Blank dates render as the fill-in placeholder `__________`. (Spec: Architecture.)
- `buildDocument('assignment_agreement', …)` throws when `assignee` is null; the page guards by requiring a selected buyer first. (Spec: Architecture / Error handling.)
- Follow existing patterns: typed client in `src/api/client.ts`; `useAsync` + `Loading`/`ErrorBanner` from `src/components/states.tsx`; pure libs in `src/lib/` tested with vitest (like `src/lib/deal.ts`).

---

### Task 1: Document builder module (`src/lib/documents.ts`)

The normalized document model, the registry, default overrides, and `buildDocument` for all three templates — pure and fully unit-tested.

**Files:**
- Create: `src/lib/documents.ts`
- Test: `src/lib/documents.test.ts`

**Interfaces:**
- Consumes: `Deal`, `Buyer` from `src/api/types`.
- Produces:
  - Types `DocType = 'letter_of_intent' | 'purchase_agreement' | 'assignment_agreement'`, `DocParty`, `DocMeta`, `DocSection`, `DocumentModel`, `DocOverrides`, `DocContext`.
  - `DOC_TYPES: { type: DocType; label: string }[]` (registry, in lifecycle order).
  - `defaultOverrides(deal: Deal): DocOverrides` (`offerPrice = deal.purchase_price`, `assignmentFee = deal.wholesale_fee`, all other fields blank/0).
  - `buildDocument(type: DocType, ctx: DocContext): DocumentModel` (throws if `type === 'assignment_agreement'` and `ctx.assignee` is null).

- [ ] **Step 1: Write the failing test**

Create `src/lib/documents.test.ts`:

```ts
import { test, expect } from 'vitest';
import { DOC_TYPES, defaultOverrides, buildDocument } from './documents';
import type { Deal, Buyer } from '../api/types';

const deal: Deal = {
  id: 'd1', name: 'Maple Flip', property_address: '4812 Maple St', city: 'Atlanta', state: 'GA',
  purchase_price: 120000, repair_budget: 22000, arv: 185000, selling_costs: 12000,
  holding_costs: 3000, wholesale_fee: 10000, deal_type: 'wholesale', profit: 6000, roi: 3.82,
  status: 'analyzing', created_at: '2026-06-01', updated_at: '2026-06-01',
};
const buyer: Buyer = {
  id: 'b1', name: 'Acme Investments', phone: '', email: '', cash_available: 300000,
  deal_types: 'flip', preferred_areas: 'Atlanta', avg_deal_size: 150000, status: 'active', created_at: '2026-06-01',
};

test('DOC_TYPES lists all three templates in lifecycle order', () => {
  expect(DOC_TYPES.map((d) => d.type)).toEqual(['letter_of_intent', 'purchase_agreement', 'assignment_agreement']);
});

test('defaultOverrides seeds offer price and assignment fee from the deal', () => {
  const o = defaultOverrides(deal);
  expect(o.offerPrice).toBe(120000);
  expect(o.assignmentFee).toBe(10000);
  expect(o.effectiveDate).toBe('');
});

test('buildDocument letter_of_intent merges property and offer price', () => {
  const doc = buildDocument('letter_of_intent', {
    deal, assignee: null,
    overrides: { ...defaultOverrides(deal), sellerName: 'John Seller', assignorName: 'My Co' },
  });
  expect(doc.title).toMatch(/Letter of Intent/);
  expect(doc.meta.find((m) => m.label === 'Property')?.value).toBe('4812 Maple St, Atlanta, GA');
  expect(JSON.stringify(doc.sections)).toMatch(/\$120,000/);
});

test('buildDocument renders blank dates as a fill-in placeholder', () => {
  const doc = buildDocument('purchase_agreement', { deal, assignee: null, overrides: defaultOverrides(deal) });
  expect(doc.meta.find((m) => m.label === 'Closing date')?.value).toBe('__________');
});

test('buildDocument assignment_agreement computes total to assignee', () => {
  const doc = buildDocument('assignment_agreement', { deal, assignee: buyer, overrides: defaultOverrides(deal) });
  expect(doc.parties.find((p) => p.role === 'Assignee')?.name).toBe('Acme Investments');
  expect(doc.meta.find((m) => m.label === 'Total to assignee')?.value).toBe('$130,000');
});

test('buildDocument throws for an assignment agreement without an assignee', () => {
  expect(() => buildDocument('assignment_agreement', { deal, assignee: null, overrides: defaultOverrides(deal) })).toThrow();
});

test('every document carries the legal disclaimer', () => {
  for (const { type } of DOC_TYPES) {
    const doc = buildDocument(type, { deal, assignee: buyer, overrides: defaultOverrides(deal) });
    expect(doc.disclaimer).toMatch(/not legal advice/i);
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test` (project root)
Expected: FAIL — cannot resolve `./documents`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/documents.ts`:

```ts
import type { Deal, Buyer } from '../api/types';

export type DocType = 'letter_of_intent' | 'purchase_agreement' | 'assignment_agreement';

export interface DocParty { role: string; name: string }
export interface DocMeta { label: string; value: string }
export interface DocSection { heading?: string; paragraphs: string[] }

export interface DocumentModel {
  type: DocType;
  title: string;
  parties: DocParty[];
  meta: DocMeta[];
  sections: DocSection[];
  signatures: DocParty[];
  disclaimer: string;
}

export interface DocOverrides {
  assignorName: string;
  sellerName: string;
  effectiveDate: string;
  closingDate: string;
  earnestMoney: number;
  offerPrice: number;
  assignmentFee: number;
}

export interface DocContext {
  deal: Deal;
  assignee: Buyer | null;
  overrides: DocOverrides;
}

export const DOC_TYPES: { type: DocType; label: string }[] = [
  { type: 'letter_of_intent', label: 'Letter of Intent' },
  { type: 'purchase_agreement', label: 'Purchase & Sale Agreement' },
  { type: 'assignment_agreement', label: 'Assignment of Contract' },
];

const DISCLAIMER =
  'This document was generated from a template for convenience and is not legal advice. ' +
  'Consult a licensed attorney before signing or relying on it.';

function money(n: number): string {
  return (Number.isFinite(n) ? n : 0).toLocaleString('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  });
}

function line(value: string): string {
  return value && value.trim() ? value : '__________';
}

function propertyLabel(deal: Deal): string {
  return [deal.property_address, deal.city, deal.state].filter(Boolean).join(', ') || '__________';
}

export function defaultOverrides(deal: Deal): DocOverrides {
  return {
    assignorName: '',
    sellerName: '',
    effectiveDate: '',
    closingDate: '',
    earnestMoney: 0,
    offerPrice: deal.purchase_price,
    assignmentFee: deal.wholesale_fee,
  };
}

export function buildDocument(type: DocType, ctx: DocContext): DocumentModel {
  const { deal, assignee, overrides: o } = ctx;
  const property = propertyLabel(deal);
  const buyerName = line(o.assignorName);
  const sellerName = line(o.sellerName);

  if (type === 'letter_of_intent') {
    return {
      type,
      title: 'Letter of Intent to Purchase Real Estate',
      parties: [
        { role: 'Prospective Buyer', name: buyerName },
        { role: 'Seller', name: sellerName },
      ],
      meta: [
        { label: 'Property', value: property },
        { label: 'Offer price', value: money(o.offerPrice) },
        { label: 'Effective date', value: line(o.effectiveDate) },
        { label: 'Proposed closing', value: line(o.closingDate) },
      ],
      sections: [
        { heading: '1. Intent', paragraphs: [
          `${buyerName} ("Buyer") submits this non-binding Letter of Intent to purchase the real property located at ${property} ("Property") from ${sellerName} ("Seller").`,
        ] },
        { heading: '2. Proposed price', paragraphs: [
          `Buyer proposes a purchase price of ${money(o.offerPrice)}, payable in cash at closing, subject to the terms of a definitive Purchase & Sale Agreement.`,
        ] },
        { heading: '3. Due diligence', paragraphs: [
          'Buyer shall have an inspection and due-diligence period to evaluate the Property and may terminate during that period for any reason.',
        ] },
        { heading: '4. Non-binding', paragraphs: [
          'This Letter of Intent is non-binding and creates no obligation on either party except to negotiate in good faith toward a definitive agreement.',
        ] },
      ],
      signatures: [
        { role: 'Buyer', name: buyerName },
        { role: 'Seller', name: sellerName },
      ],
      disclaimer: DISCLAIMER,
    };
  }

  if (type === 'purchase_agreement') {
    return {
      type,
      title: 'Purchase & Sale Agreement',
      parties: [
        { role: 'Buyer', name: buyerName },
        { role: 'Seller', name: sellerName },
      ],
      meta: [
        { label: 'Property', value: property },
        { label: 'Purchase price', value: money(o.offerPrice) },
        { label: 'Earnest money', value: money(o.earnestMoney) },
        { label: 'Closing date', value: line(o.closingDate) },
      ],
      sections: [
        { heading: '1. Sale', paragraphs: [
          `${sellerName} ("Seller") agrees to sell and ${buyerName} ("Buyer") agrees to buy the real property located at ${property} ("Property") for ${money(o.offerPrice)}.`,
        ] },
        { heading: '2. Earnest money', paragraphs: [
          `Buyer shall deposit earnest money of ${money(o.earnestMoney)}, to be credited toward the purchase price at closing.`,
        ] },
        { heading: '3. Assignment', paragraphs: [
          'Buyer may assign this Agreement and its rights and obligations to a third party without further consent of Seller.',
        ] },
        { heading: '4. Condition', paragraphs: [
          'The Property is sold in its present "as-is" condition. Buyer has the right to inspect prior to closing.',
        ] },
        { heading: '5. Closing', paragraphs: [
          `Closing shall occur on or before ${line(o.closingDate)}, at which time Seller shall convey marketable title by deed.`,
        ] },
      ],
      signatures: [
        { role: 'Buyer', name: buyerName },
        { role: 'Seller', name: sellerName },
      ],
      disclaimer: DISCLAIMER,
    };
  }

  // assignment_agreement
  if (!assignee) {
    throw new Error('An assignee (buyer) is required for an assignment agreement.');
  }
  const total = o.offerPrice + o.assignmentFee;
  return {
    type,
    title: 'Assignment of Real Estate Purchase Contract',
    parties: [
      { role: 'Assignor', name: buyerName },
      { role: 'Assignee', name: assignee.name },
    ],
    meta: [
      { label: 'Property', value: property },
      { label: 'Original purchase price', value: money(o.offerPrice) },
      { label: 'Assignment fee', value: money(o.assignmentFee) },
      { label: 'Total to assignee', value: money(total) },
      { label: 'Effective date', value: line(o.effectiveDate) },
    ],
    sections: [
      { heading: '1. Assignment', paragraphs: [
        `${buyerName} ("Assignor") assigns to ${assignee.name} ("Assignee") all of Assignor's rights and obligations under the purchase contract for the real property located at ${property} ("Property").`,
      ] },
      { heading: '2. Assignment fee', paragraphs: [
        `In consideration of this assignment, Assignee shall pay Assignor a non-refundable assignment fee of ${money(o.assignmentFee)} at closing. Assignee's total consideration, including the original purchase price of ${money(o.offerPrice)}, is ${money(total)}.`,
      ] },
      { heading: '3. Assumption', paragraphs: [
        'Assignee accepts the assignment and assumes all obligations of the buyer under the original purchase contract from the effective date forward.',
      ] },
      { heading: '4. No warranty', paragraphs: [
        'Assignor makes no representations or warranties regarding the Property beyond those in the original purchase contract.',
      ] },
    ],
    signatures: [
      { role: 'Assignor', name: buyerName },
      { role: 'Assignee', name: assignee.name },
    ],
    disclaimer: DISCLAIMER,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — the 7 `documents` tests green (plus all prior vitest tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/documents.ts src/lib/documents.test.ts
git commit -m "feat(docs): document builder for LOI, purchase, and assignment agreements"
```

---

### Task 2: Document generator page, route, entry points, and styles

The page that renders any template with an editor form and a printable body, wired into the router and reachable from the Deals page and deal sheet.

**Files:**
- Create: `src/pages/DocumentGenerator.tsx`
- Modify: `src/App.tsx` (route)
- Modify: `src/pages/Deals.tsx` (per-deal "Documents" link)
- Modify: `src/pages/DealSheet.tsx` (`.no-print` "Documents" link)
- Modify: `src/styles.css` (legal-doc + editor styles)

**Interfaces:**
- Consumes: `getDeal`, `getBuyers` from the client; `useAsync`; `Loading`/`ErrorBanner`; `DOC_TYPES`, `defaultOverrides`, `buildDocument`, `DocType`, `DocOverrides` from `src/lib/documents`; types `Deal`, `Buyer`.
- Produces: `export function DocumentGenerator()`; a `/deals/:id/documents` route inside `AppLayout`.

- [ ] **Step 1: Create the page**

Create `src/pages/DocumentGenerator.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getDeal, getBuyers } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorBanner } from '../components/states';
import { DOC_TYPES, defaultOverrides, buildDocument, type DocType, type DocOverrides } from '../lib/documents';
import type { Deal, Buyer } from '../api/types';

export function DocumentGenerator() {
  const { id } = useParams<{ id: string }>();
  const fetchDeal = useCallback(() => getDeal(id as string), [id]);
  const deal = useAsync<Deal>(fetchDeal, true);
  const buyers = useAsync<Buyer[]>(getBuyers, true);

  const [type, setType] = useState<DocType>('letter_of_intent');
  const [assigneeId, setAssigneeId] = useState('');
  const [overrides, setOverrides] = useState<DocOverrides | null>(null);

  // Seed the editable fields once the deal loads.
  useEffect(() => {
    if (deal.data && !overrides) setOverrides(defaultOverrides(deal.data));
  }, [deal.data, overrides]);

  if (deal.loading || !overrides) return <Loading label="Loading deal…" />;
  if (deal.error || !deal.data) return <ErrorBanner message={deal.error || 'Deal not found'} onRetry={() => deal.run()} />;

  const buyerList = buyers.data ?? [];
  const assignee = buyerList.find((b) => b.id === assigneeId) ?? null;
  const needsAssignee = type === 'assignment_agreement' && !assignee;
  const doc = needsAssignee ? null : buildDocument(type, { deal: deal.data, assignee, overrides });

  const setField = (key: keyof DocOverrides, value: string | number) =>
    setOverrides((o) => (o ? { ...o, [key]: value } : o));

  return (
    <>
      <div className="no-print">
        <header className="hero-panel">
          <p className="eyebrow">Documents</p>
          <h1>{deal.data.name}</h1>
          <p>Generate a printable document from this deal.</p>
        </header>

        <section className="panel">
          <div className="doc-tabs">
            {DOC_TYPES.map((d) => (
              <button key={d.type} className={`ghost-button ${type === d.type ? 'active' : ''}`} onClick={() => setType(d.type)}>
                {d.label}
              </button>
            ))}
          </div>

          <div className="form-grid" style={{ marginTop: 16 }}>
            <input placeholder="Your name / company (assignor)" value={overrides.assignorName} onChange={(e) => setField('assignorName', e.target.value)} />
            <input placeholder="Seller name" value={overrides.sellerName} onChange={(e) => setField('sellerName', e.target.value)} />
            <label><span>Effective date</span><input type="date" value={overrides.effectiveDate} onChange={(e) => setField('effectiveDate', e.target.value)} /></label>
            <label><span>Closing date</span><input type="date" value={overrides.closingDate} onChange={(e) => setField('closingDate', e.target.value)} /></label>
            <label><span>Offer / purchase price</span><input type="number" min={0} step={1000} value={overrides.offerPrice} onChange={(e) => setField('offerPrice', Number(e.target.value))} /></label>
            <label><span>Earnest money</span><input type="number" min={0} step={500} value={overrides.earnestMoney} onChange={(e) => setField('earnestMoney', Number(e.target.value))} /></label>
            <label><span>Assignment fee</span><input type="number" min={0} step={500} value={overrides.assignmentFee} onChange={(e) => setField('assignmentFee', Number(e.target.value))} /></label>
            <label>
              <span>Assignee (buyer)</span>
              <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                <option value="">— select buyer —</option>
                {buyerList.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
          </div>

          <div className="doc-toolbar">
            <button onClick={() => window.print()} disabled={needsAssignee}>Print / Save as PDF</button>
            <Link to="/deals"><button className="ghost-button">Back to deals</button></Link>
          </div>
          {needsAssignee && <p className="text-muted">Select an assignee (buyer) to generate the assignment agreement.</p>}
        </section>
      </div>

      {doc && (
        <article className="legal-doc">
          <h1>{doc.title}</h1>
          <div className="legal-parties">
            {doc.parties.map((p) => <p key={p.role}><strong>{p.role}:</strong> {p.name}</p>)}
          </div>
          <table className="legal-meta">
            <tbody>
              {doc.meta.map((m) => <tr key={m.label}><th>{m.label}</th><td>{m.value}</td></tr>)}
            </tbody>
          </table>
          {doc.sections.map((s, i) => (
            <section key={i} className="legal-section">
              {s.heading && <h2>{s.heading}</h2>}
              {s.paragraphs.map((p, j) => <p key={j}>{p}</p>)}
            </section>
          ))}
          <div className="legal-signatures">
            {doc.signatures.map((s) => (
              <div key={s.role} className="legal-sign">
                <span className="sign-line" />
                <span>{s.role}{s.name && s.name !== '__________' ? ` — ${s.name}` : ''}</span>
              </div>
            ))}
          </div>
          <p className="legal-disclaimer">{doc.disclaimer}</p>
        </article>
      )}
    </>
  );
}
```

- [ ] **Step 2: Add the route in `App.tsx`**

Add the import alongside the other page imports:

```tsx
import { DocumentGenerator } from './pages/DocumentGenerator';
```

Add this route inside the `<Route element={<AppLayout />}>` block, directly after the `deals/:id/sheet` route:

```tsx
        <Route path="deals/:id/documents" element={<DocumentGenerator />} />
```

- [ ] **Step 3: Add a "Documents" link on the Deals page**

In `src/pages/Deals.tsx`, in the per-deal actions row (the `<div>` that contains the "Find buyers", "Print sheet", and "Delete" buttons), add a Documents link after the "Print sheet" link:

```tsx
                  <Link to={`/deals/${deal.id}/documents`}><button className="ghost-button">Documents</button></Link>
```

- [ ] **Step 4: Add a "Documents" link on the deal sheet**

In `src/pages/DealSheet.tsx`, inside the existing `<div className="no-print" …>` toolbar (which holds the "Print / Save as PDF" button and the "Back to deals" link), add after the print button:

```tsx
        <Link to={`/deals/${d.id}/documents`}><button className="ghost-button">Documents</button></Link>
```

(`d` is the loaded deal in `DealSheet`; it is in scope where the toolbar renders.)

- [ ] **Step 5: Add styles to `styles.css`**

Append to the end of `src/styles.css`:

```css
/* ---------- Document generator ---------- */
.doc-tabs { display: flex; flex-wrap: wrap; gap: var(--space-1); }
.doc-tabs .ghost-button.active { background: var(--accent); color: #fff; }
.doc-toolbar { display: flex; gap: var(--space-1); margin-top: var(--space-3); }

.legal-doc {
  max-width: 800px;
  margin: var(--space-3) auto 0;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: var(--space-4);
  font-family: Georgia, 'Times New Roman', serif;
  line-height: 1.6;
}
.legal-doc h1 { font-size: 1.4rem; text-align: center; margin-bottom: var(--space-3); }
.legal-doc h2 { font-size: 1.05rem; margin: var(--space-3) 0 var(--space-1); }
.legal-parties { margin-bottom: var(--space-2); }
.legal-meta { width: 100%; border-collapse: collapse; margin: var(--space-2) 0 var(--space-3); }
.legal-meta th { text-align: left; width: 40%; padding: 6px 0; color: var(--ink-soft); font-weight: 600; }
.legal-meta td { text-align: right; padding: 6px 0; border-bottom: 1px solid var(--line); }
.legal-section p { margin: var(--space-1) 0; }
.legal-signatures { display: flex; gap: var(--space-4); margin-top: var(--space-4); flex-wrap: wrap; }
.legal-sign { flex: 1; min-width: 200px; }
.legal-sign .sign-line { display: block; border-top: 1px solid var(--ink); margin-bottom: 4px; height: 24px; }
.legal-disclaimer { margin-top: var(--space-4); font-size: 0.8rem; color: var(--ink-soft); font-style: italic; }
```

- [ ] **Step 6: Typecheck and build**

Run: `npm run build`
Expected: `tsc` + Vite build succeed.

- [ ] **Step 7: Manual click-through**

Start both servers (`cd backend && npm run dev`; `npm run dev` at root). From **Deals**, click **Documents** on a deal → `/deals/:id/documents`. Switch tabs (LOI / Purchase / Assignment); for the Assignment tab, confirm the "select an assignee" prompt appears and the Print button is disabled until a buyer is chosen. Fill names/dates/amounts and confirm the rendered document updates. Click **Print / Save as PDF** → preview shows a clean filled document with the sidebar and editor hidden.

- [ ] **Step 8: Commit**

```bash
git add src/pages/DocumentGenerator.tsx src/App.tsx src/pages/Deals.tsx src/pages/DealSheet.tsx src/styles.css
git commit -m "feat(docs): document generator page + route + entry points"
```

---

### Task 3: Full verification

Confirm the suites and build are green.

**Files:** none (verification only).

- [ ] **Step 1: Frontend unit tests**

Run: `npm test`
Expected: all vitest tests pass (prior 11 + 7 `documents` = 18).

- [ ] **Step 2: Frontend build**

Run: `npm run build`
Expected: `tsc` + Vite build succeed with no type errors.

- [ ] **Step 3: Backend suite (unchanged, confirm still green)**

Run: `cd backend && npm test`
Expected: 54 passing (no backend changes in this phase).

- [ ] **Step 4: End-to-end smoke (manual)**

With both servers running and a saved deal: generate each of the three documents, edit fields, and confirm the print preview is clean for each. Confirm nav still works across the app.

---

## Self-Review

**1. Spec coverage**

| Spec item | Task |
| --- | --- |
| Pure `buildDocument` + model + `defaultOverrides` + `DOC_TYPES` | Task 1 |
| Three templates (LOI, purchase, assignment) with merged data + computed amounts | Task 1 |
| Assignment throws without assignee | Task 1 (and guarded in Task 2) |
| Disclaimer on every document | Task 1 |
| Blank dates → `__________` placeholder | Task 1 |
| `/deals/:id/documents` page: editor form + printable body + tabs + assignee select | Task 2 |
| Edit-then-print split (`.no-print` editor, printable `.legal-doc`) | Task 2 (page + styles) |
| Entry points (Deals page, deal sheet) + route | Task 2 |
| Reuse existing `@media print` rules | Task 2 (no new print block needed; `.legal-doc` is not `.no-print`) |
| Tests: pure-lib unit + build + click-through | Tasks 1, 2, 3 |

All spec sections map to tasks. No backend changes (spec: no backend) — Task 3 only re-confirms the backend stays green.

**2. Placeholder scan:** No `TBD`/`TODO`/"add appropriate…" placeholders. The literal `__________` strings are intentional fill-in lines (spec requirement), not plan placeholders. Every code step has full code; every test step has assertions.

**3. Type consistency:** `DocType`, `DocOverrides`, `DocContext`, `DocumentModel` are defined in Task 1 and consumed with the same names/shapes in Task 2. `buildDocument(type, ctx)` and `defaultOverrides(deal)` signatures match between definition (Task 1) and use (Task 2). `DOC_TYPES` items are `{ type, label }` in both. The `Deal`/`Buyer` fields used (`purchase_price`, `wholesale_fee`, `property_address`, `city`, `state`, `name`, `id`) all exist on the current `src/api/types` interfaces.
