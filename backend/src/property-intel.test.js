import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from './db.js';
import { scoreProperty, classifyLead, isAbsentee, isOutOfState } from './property-intel.js';

after(() => new Promise((resolve) => db.close(() => resolve())));

test('scoreProperty: tax delinquent only = 40', () => {
  assert.equal(scoreProperty(['tax_delinquent']), 40);
});

test('scoreProperty: absentee only = 20', () => {
  assert.equal(scoreProperty(['absentee_owner']), 20);
});

test('scoreProperty: out_of_state stacks with absentee = 35', () => {
  assert.equal(scoreProperty(['absentee_owner', 'out_of_state']), 35);
});

test('scoreProperty: vacant only = 25', () => {
  assert.equal(scoreProperty(['vacant']), 25);
});

test('scoreProperty: code_violation only = 15', () => {
  assert.equal(scoreProperty(['code_violation']), 15);
});

test('scoreProperty: all signals = 100 (capped)', () => {
  const s = scoreProperty(['tax_delinquent', 'absentee_owner', 'out_of_state', 'vacant', 'code_violation']);
  assert.equal(s, 100);
});

test('scoreProperty: unknown signal ignored', () => {
  assert.equal(scoreProperty(['unknown_signal']), 0);
});

test('classifyLead: 75 = hot', () => {
  assert.equal(classifyLead(75), 'hot');
});

test('classifyLead: 100 = hot', () => {
  assert.equal(classifyLead(100), 'hot');
});

test('classifyLead: 74 = warm', () => {
  assert.equal(classifyLead(74), 'warm');
});

test('classifyLead: 50 = warm', () => {
  assert.equal(classifyLead(50), 'warm');
});

test('classifyLead: 49 = cold', () => {
  assert.equal(classifyLead(49), 'cold');
});

test('isAbsentee: different addresses = true', () => {
  assert.equal(isAbsentee('5678 SUBURBAN DR, BETHESDA MD', '1234 MAIN ST NW'), true);
});

test('isAbsentee: same street number in address = false', () => {
  assert.equal(isAbsentee('1234 MAIN ST NW', '1234 MAIN ST NW'), false);
});

test('isOutOfState: MD owner = false', () => {
  assert.equal(isOutOfState('MD'), false);
});

test('isOutOfState: VA owner = false', () => {
  assert.equal(isOutOfState('VA'), false);
});

test('isOutOfState: DC owner = false', () => {
  assert.equal(isOutOfState('DC'), false);
});

test('isOutOfState: FL owner = true', () => {
  assert.equal(isOutOfState('FL'), true);
});

import { buildSignals, deduplicateByParcelId, runPropertyIntelScan, buildDigestEmail } from './property-intel.js';

test('buildSignals: tax delinquent + absentee + out_of_state + vacant + code_violation', () => {
  const property = {
    parcelId: 'A1',
    address: '100 MAIN ST NW',
    ownerAddress: '999 FLORIDA AVE',
    ownerState: 'FL',
    taxDelinquent: true,
  };
  const vacantSet = new Set(['A1']);
  const violationsSet = new Set(['A1']);
  const signals = buildSignals(property, vacantSet, violationsSet);
  assert.ok(signals.includes('tax_delinquent'));
  assert.ok(signals.includes('absentee_owner'));
  assert.ok(signals.includes('out_of_state'));
  assert.ok(signals.includes('vacant'));
  assert.ok(signals.includes('code_violation'));
  assert.equal(signals.length, 5);
});

test('buildSignals: same-address owner, in-state, no delinquency', () => {
  const property = {
    parcelId: 'B2',
    address: '200 ELM ST NW',
    ownerAddress: '200 ELM ST NW',
    ownerState: 'DC',
    taxDelinquent: false,
  };
  const signals = buildSignals(property, new Set(), new Set());
  assert.equal(signals.length, 0);
});

test('deduplicateByParcelId: keeps last occurrence per parcel', () => {
  const records = [
    { parcelId: 'X1', address: 'first' },
    { parcelId: 'X2', address: 'other' },
    { parcelId: 'X1', address: 'second' },
  ];
  const map = deduplicateByParcelId(records);
  assert.equal(map.size, 2);
  assert.equal(map.get('X1').address, 'second');
});

test('buildDigestEmail: returns null when no hot leads', () => {
  assert.equal(buildDigestEmail([]), null);
});

test('buildDigestEmail: returns subject + html for hot leads', () => {
  const leads = [
    { address: '100 MAIN ST NW', ward: 'Ward 1', score: 95, signals: ['tax_delinquent', 'vacant'] },
    { address: '200 ELM ST SE', ward: 'Ward 8', score: 80, signals: ['absentee_owner'] },
  ];
  const result = buildDigestEmail(leads);
  assert.ok(result.subject.includes('2'));
  assert.ok(result.html.includes('100 MAIN ST NW'));
  assert.ok(result.html.includes('Ward 1'));
  assert.ok(result.html.includes('95'));
});
