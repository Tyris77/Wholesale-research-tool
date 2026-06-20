import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { parseResendEvent, summarizeEvents, verifySvixSignature } from './analytics-events.js';

test('parseResendEvent extracts id, type, recipient, and time', () => {
  const evt = parseResendEvent({
    type: 'email.opened',
    created_at: '2026-06-20T00:00:00.000Z',
    data: { email_id: 'e1', to: ['a@b.com'] },
  });
  assert.deepEqual(evt, { email_id: 'e1', type: 'email.opened', recipient: 'a@b.com', created_at: '2026-06-20T00:00:00.000Z' });
});

test('parseResendEvent returns null without a type or email id', () => {
  assert.equal(parseResendEvent({ data: { email_id: 'e1' } }), null);
  assert.equal(parseResendEvent({ type: 'email.opened', data: {} }), null);
  assert.equal(parseResendEvent(null), null);
});

test('summarizeEvents counts distinct emails per event type', () => {
  const sent = ['e1', 'e2', 'e3'];
  const events = [
    { email_id: 'e1', type: 'email.delivered' },
    { email_id: 'e1', type: 'email.opened' },
    { email_id: 'e1', type: 'email.opened' }, // duplicate open, still one
    { email_id: 'e2', type: 'email.delivered' },
    { email_id: 'e9', type: 'email.opened' },  // not in sent set, ignored
  ];
  assert.deepEqual(summarizeEvents(sent, events), { sent: 3, delivered: 2, opened: 1, clicked: 0, bounced: 0 });
});

test('verifySvixSignature accepts a correctly signed body and rejects tampering', () => {
  const secret = 'whsec_' + Buffer.from('supersecretkey').toString('base64');
  const id = 'msg_1';
  const timestamp = '1718841600';
  const body = JSON.stringify({ type: 'email.opened', data: { email_id: 'e1' } });
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const sig = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
  const signature = `v1,${sig}`;

  assert.equal(verifySvixSignature({ secret, id, timestamp, signature, body }), true);
  assert.equal(verifySvixSignature({ secret, id, timestamp, signature, body: body + 'x' }), false);
  assert.equal(verifySvixSignature({ secret, id, timestamp, signature: 'v1,bad', body }), false);
  assert.equal(verifySvixSignature({ secret, id: '', timestamp, signature, body }), false);
});
