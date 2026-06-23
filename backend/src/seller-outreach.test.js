import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from './db.js';
import {
  OUTREACH_SEQUENCE, firstNameOf, streetOf, draftTouch, buildTouches, dueTouches,
} from './seller-outreach.js';

after(() => new Promise((resolve) => db.close(() => resolve())));

const SENDER = { name: 'Tyris Walker', phone: '(202) 555-0123', mailingAddress: '1 K St NE, Washington, DC' };

test('firstNameOf: handles "LAST, FIRST", single token, and empty', () => {
  assert.equal(firstNameOf('MURPHY, ANGELA T'), 'Angela');
  assert.equal(firstNameOf('SMITH JOHN'), 'Smith');
  assert.equal(firstNameOf(''), 'there');
  assert.equal(firstNameOf(null), 'there');
});

test('streetOf: strips the city/state/zip tail', () => {
  assert.equal(streetOf('3403 WHEELER RD SE WASHINGTON DC 20032'), '3403 WHEELER RD SE');
  assert.equal(streetOf('200 34TH ST SE'), '200 34TH ST SE');
});

test('draftTouch: intro email is personalized and CAN-SPAM compliant', () => {
  const ctx = { firstName: 'Angela', street: '4556 TEXAS AVE SE', propertyAddress: '4556 TEXAS AVE SE WASHINGTON DC 20019', phone: '2025550100' };
  const { subject, body } = draftTouch('email', 'intro', ctx, SENDER);
  assert.match(subject, /4556 TEXAS AVE SE/);
  assert.match(body, /Hi Angela,/);
  assert.match(body, /4556 TEXAS AVE SE WASHINGTON DC 20019/);
  assert.match(body, /1 K St NE, Washington, DC/); // physical address
  assert.match(body, /Reply STOP/); // opt-out
});

test('draftTouch: call script carries the number and a spoken opener', () => {
  const ctx = { firstName: 'Jamal', street: '4827 B ST SE', propertyAddress: '4827 B ST SE WASHINGTON DC 20019', phone: '2404272645' };
  const { body } = draftTouch('call', 'intro', ctx, SENDER);
  assert.match(body, /^CALL/);
  assert.match(body, /2404272645/);
  assert.match(body, /am I speaking with Jamal/);
});

test('draftTouch: text is short and includes an opt-out', () => {
  const ctx = { firstName: 'Sylvia', street: '3403 WHEELER RD SE', propertyAddress: '3403 WHEELER RD SE WASHINGTON DC 20032', phone: '2022973480' };
  const { body } = draftTouch('text', 'nudge', ctx, SENDER);
  assert.match(body, /Sylvia/);
  assert.match(body, /Reply STOP/);
  assert.ok(body.length < 320);
});

test('buildTouches: one per sequence step, scheduled at the right offsets', () => {
  const seller = { name: 'MURPHY, ANGELA T', property_address: '4556 TEXAS AVE SE WASHINGTON DC 20019', phone: '2025550100' };
  const start = '2026-06-22T12:00:00.000Z';
  const touches = buildTouches(seller, start, SENDER);
  assert.equal(touches.length, OUTREACH_SEQUENCE.length);
  assert.equal(touches[0].channel, 'email');
  assert.equal(touches[0].kind, 'intro');
  assert.ok(touches.every((t) => t.status === 'scheduled'));
  // day-0 touch is at start; day-1 touch is exactly 24h later.
  assert.equal(touches[0].scheduled_at, start);
  assert.equal(new Date(touches[1].scheduled_at).getTime() - new Date(start).getTime(), 86400000);
});

test('dueTouches: only scheduled touches at or before now', () => {
  const touches = [
    { status: 'scheduled', scheduled_at: '2026-06-20T00:00:00.000Z' },
    { status: 'scheduled', scheduled_at: '2026-06-30T00:00:00.000Z' },
    { status: 'sent', scheduled_at: '2026-06-19T00:00:00.000Z' },
  ];
  const due = dueTouches(touches, '2026-06-22T00:00:00.000Z');
  assert.equal(due.length, 1);
  assert.equal(due[0].scheduled_at, '2026-06-20T00:00:00.000Z');
});
