import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from './db.js';
import {
  normalizeOwner, isLikelyInstitutional, parseZip, aggregateBuyers,
} from './cash-buyers.js';

after(() => new Promise((resolve) => db.close(() => resolve())));

test('normalizeOwner: uppercases, collapses spaces, trims trailing punctuation', () => {
  assert.equal(normalizeOwner('  Dogwood   Restoration llc.  '), 'DOGWOOD RESTORATION LLC');
});

test('isLikelyInstitutional: flags banks and government', () => {
  assert.equal(isLikelyInstitutional('WILMINGTON SAVINGS FUND SOCIETY FSB'), true);
  assert.equal(isLikelyInstitutional('UNITED STATES SECRETARY OF HOUSING'), true);
  assert.equal(isLikelyInstitutional('SOUTH EAST DC HOLDINGS LLC'), false);
});

test('parseZip: extracts the last 5-digit zip from a premise address', () => {
  assert.equal(parseZip('732 51ST ST NE WASHINGTON DC 20019'), '20019');
  assert.equal(parseZip('no zip here'), '');
});

test('aggregateBuyers: groups by owner, keeps repeat buyers, computes stats', () => {
  const rows = [
    { OWNERNAME: 'Acme Homes LLC', ADDRESS1: '1 A ST', CITYSTZIP: 'WASHINGTON DC 20001', SALEPRICE: 300000, SALEDATE: Date.UTC(2025, 0, 1), PREMISEADD: '10 X ST NW WASHINGTON DC 20010' },
    { OWNERNAME: 'ACME HOMES LLC', ADDRESS1: '1 A ST', CITYSTZIP: 'WASHINGTON DC 20001', SALEPRICE: 500000, SALEDATE: Date.UTC(2025, 5, 1), PREMISEADD: '20 Y ST SE WASHINGTON DC 20020' },
    { OWNERNAME: 'One Time Buyer', ADDRESS1: '9 Z ST', CITYSTZIP: 'WASHINGTON DC 20002', SALEPRICE: 400000, SALEDATE: Date.UTC(2025, 1, 1), PREMISEADD: '30 W ST NW WASHINGTON DC 20011' },
  ];
  const buyers = aggregateBuyers(rows);
  assert.equal(buyers.length, 1); // only the 2x buyer kept
  const b = buyers[0];
  assert.equal(b.name, 'ACME HOMES LLC');
  assert.equal(b.purchaseCount, 2);
  assert.equal(b.totalSpend, 800000);
  assert.equal(b.avgPrice, 400000);
  assert.deepEqual(b.zips, ['20010', '20020']);
  assert.equal(b.lastPurchaseDate, '2025-06-01');
});

test('aggregateBuyers: excludes institutional owners even with repeat buys', () => {
  const rows = [
    { OWNERNAME: 'BIG BANK NA', SALEPRICE: 100000, SALEDATE: 1, PREMISEADD: 'x 20001' },
    { OWNERNAME: 'BIG BANK NA', SALEPRICE: 100000, SALEDATE: 1, PREMISEADD: 'x 20001' },
  ];
  assert.equal(aggregateBuyers(rows).length, 0);
});
