import { v4 as uuid } from 'uuid';
import { dbRun } from './db.js';
import { discoverItspeQueryUrl, fetchAllPages, parseState } from './property-intel.js';

// Cash buyers = active investors who recently bought wholesale-range residential
// they don't live in. We pull those purchases from the ITSPE tax roll, group by
// owner, and keep repeat buyers (the people who'll take an assignment).
const WHERE =
  "PROPTYPE LIKE 'Residential%' AND SALEPRICE BETWEEN 50000 AND 1500000 " +
  "AND SALEDATE > timestamp '2024-06-01 00:00:00' " +
  "AND (HSTDCODE IS NULL OR HSTDCODE IN ('N',''))";
const OUT_FIELDS = 'OWNERNAME,ADDRESS1,CITYSTZIP,SALEPRICE,SALEDATE,PREMISEADD';

// Minimum recent purchases to count as an active cash buyer.
const MIN_PURCHASES = 2;

// Names that are lenders/government/foreclosure holders, not wholesale buyers.
const INSTITUTIONAL = /\b(BANK|SAVINGS FUND|FEDERAL NATIONAL|FANNIE|FREDDIE|SECRETARY OF HOUSING|UNITED STATES|DISTRICT OF COLUMBIA|HOUSING FINANCE AGENCY|FHA|FHLMC|FNMA|MORTGAGE CORP|DEPARTMENT OF)\b/;

export function normalizeOwner(name) {
  return String(name ?? '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,]+$/, '')
    .trim();
}

export function isLikelyInstitutional(name) {
  return INSTITUTIONAL.test(String(name ?? '').toUpperCase());
}

// Pull the 5-digit ZIP out of an ITSPE PREMISEADD ("... WASHINGTON DC 20011").
export function parseZip(premiseAddr) {
  const m = String(premiseAddr ?? '').match(/\b(\d{5})\b(?!.*\b\d{5}\b)/);
  return m ? m[1] : '';
}

// Group raw purchase rows into buyer records. Keeps non-institutional owners
// with >= MIN_PURCHASES, sorted by purchase count then total spend.
export function aggregateBuyers(rows, minPurchases = MIN_PURCHASES) {
  const map = new Map();
  for (const r of rows) {
    const name = normalizeOwner(r.OWNERNAME);
    if (!name || isLikelyInstitutional(name)) continue;
    const price = Number(r.SALEPRICE) || 0;
    const saleDate = Number(r.SALEDATE) || 0;
    let b = map.get(name);
    if (!b) {
      b = {
        name,
        mailingAddress: [String(r.ADDRESS1 ?? '').trim(), String(r.CITYSTZIP ?? '').trim()]
          .filter(Boolean).join(', '),
        buyerState: parseState(r.CITYSTZIP),
        purchaseCount: 0,
        totalSpend: 0,
        zips: new Set(),
        lastPurchaseMs: 0,
      };
      map.set(name, b);
    }
    b.purchaseCount += 1;
    b.totalSpend += price;
    const zip = parseZip(r.PREMISEADD);
    if (zip) b.zips.add(zip);
    if (saleDate > b.lastPurchaseMs) b.lastPurchaseMs = saleDate;
  }
  return [...map.values()]
    .filter((b) => b.purchaseCount >= minPurchases)
    .map((b) => ({
      name: b.name,
      mailingAddress: b.mailingAddress,
      buyerState: b.buyerState,
      purchaseCount: b.purchaseCount,
      totalSpend: b.totalSpend,
      avgPrice: Math.round(b.totalSpend / b.purchaseCount),
      zips: [...b.zips].sort(),
      lastPurchaseDate: b.lastPurchaseMs ? new Date(b.lastPurchaseMs).toISOString().slice(0, 10) : null,
    }))
    .sort((a, b) => b.purchaseCount - a.purchaseCount || b.totalSpend - a.totalSpend);
}

async function upsertBuyer(buyer, now) {
  // Keyed by name so re-runs update stats and preserve the saved flag.
  await dbRun(
    `INSERT INTO cash_buyers (id, name, mailing_address, buyer_state, purchase_count, total_spend, avg_price, zips, last_purchase_date, saved, last_seen_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
     ON CONFLICT(name) DO UPDATE SET
       mailing_address = excluded.mailing_address,
       buyer_state = excluded.buyer_state,
       purchase_count = excluded.purchase_count,
       total_spend = excluded.total_spend,
       avg_price = excluded.avg_price,
       zips = excluded.zips,
       last_purchase_date = excluded.last_purchase_date,
       last_seen_at = excluded.last_seen_at`,
    [
      uuid(), buyer.name, buyer.mailingAddress, buyer.buyerState,
      buyer.purchaseCount, buyer.totalSpend, buyer.avgPrice,
      JSON.stringify(buyer.zips), buyer.lastPurchaseDate, now, now,
    ],
  );
}

export async function findCashBuyers() {
  const now = new Date().toISOString();
  const result = { purchases: 0, buyers: 0, errors: [] };
  let rows;
  try {
    const queryUrl = await discoverItspeQueryUrl();
    rows = await fetchAllPages(queryUrl, WHERE, OUT_FIELDS);
  } catch (err) {
    result.errors.push(`buyer fetch failed: ${err.message}`);
    console.error('cash-buyers: fetch failed', err);
    return result;
  }
  result.purchases = rows.length;
  const buyers = aggregateBuyers(rows);
  result.buyers = buyers.length;
  for (const buyer of buyers) {
    try {
      await upsertBuyer(buyer, now);
    } catch (err) {
      result.errors.push(`upsert ${buyer.name}: ${err.message}`);
    }
  }
  console.log(`cash-buyers find complete: ${JSON.stringify({ purchases: result.purchases, buyers: result.buyers, errors: result.errors.length })}`);
  return result;
}
