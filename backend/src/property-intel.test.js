import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreProperty, classifyLead, isAbsentee, isOutOfState } from './property-intel.js';

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
