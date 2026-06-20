import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDealEmail, emailMatchedBuyers, dueSellers } from './outreach.js';

const deal = {
  name: 'Maple Flip', property_address: '4812 Maple St', city: 'Atlanta', state: 'GA',
  purchase_price: 120000, repair_budget: 22000, arv: 185000, profit: 6000, deal_type: 'flip',
};

test('buildDealEmail includes the deal name, property, and prices', () => {
  const { subject, html } = buildDealEmail(deal);
  assert.match(subject, /Maple Flip/);
  assert.match(html, /4812 Maple St, Atlanta, GA/);
  assert.match(html, /\$120,000/);
  assert.match(html, /\$185,000/);
});

test('emailMatchedBuyers sends to buyers with email and skips those without', async () => {
  const matches = [
    { buyer: { id: 'b1', name: 'Anna', email: 'anna@x.com' } },
    { buyer: { id: 'b2', name: 'Bob', email: '' } },
  ];
  const sent = [];
  const send = async (msg) => { sent.push(msg.to); return { success: true, id: 'e1' }; };
  const r = await emailMatchedBuyers(deal, matches, send);
  assert.equal(r.sent, 1);
  assert.equal(r.skipped, 1);
  assert.equal(r.failed, 0);
  assert.deepEqual(sent, ['anna@x.com']);
  assert.equal(r.activities.length, 2);
  assert.equal(r.activities[0].status, 'sent');
  assert.equal(r.activities[1].status, 'skipped');
});

test('emailMatchedBuyers records a failed send', async () => {
  const matches = [{ buyer: { id: 'b1', name: 'Anna', email: 'anna@x.com' } }];
  const send = async () => ({ success: false, error: 'nope' });
  const r = await emailMatchedBuyers(deal, matches, send);
  assert.equal(r.failed, 1);
  assert.equal(r.results[0].status, 'failed');
  assert.equal(r.results[0].error, 'nope');
});

test('dueSellers returns sellers due on or before today, sorted ascending', () => {
  const sellers = [
    { id: '1', name: 'A', next_follow_up: '2026-06-20' },
    { id: '2', name: 'B', next_follow_up: '' },
    { id: '3', name: 'C', next_follow_up: '2026-06-10' },
    { id: '4', name: 'D', next_follow_up: '2026-07-01' },
  ];
  const due = dueSellers(sellers, '2026-06-20');
  assert.deepEqual(due.map((s) => s.id), ['3', '1']);
});
