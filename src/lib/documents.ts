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
