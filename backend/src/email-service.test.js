import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendEmail } from './email-service.js';

test('sendEmail reports not-configured when no api key', async () => {
  const r = await sendEmail({ to: 'a@b.com', subject: 's', html: '<p>h</p>' }, { apiKey: '', from: 'me@x.com', fetchFn: async () => { throw new Error('should not call'); } });
  assert.equal(r.success, false);
  assert.match(r.error, /RESEND_API_KEY/);
});

test('sendEmail reports not-configured when no from address', async () => {
  const r = await sendEmail({ to: 'a@b.com', subject: 's', html: '<p>h</p>' }, { apiKey: 'k', from: '', fetchFn: async () => { throw new Error('should not call'); } });
  assert.equal(r.success, false);
  assert.match(r.error, /EMAIL_FROM/);
});

test('sendEmail posts to Resend with a Bearer token and returns the id', async () => {
  const captured = {};
  const fetchFn = async (url, opts) => {
    captured.url = url; captured.opts = opts;
    return { ok: true, status: 200, json: async () => ({ id: 'email_123' }) };
  };
  const r = await sendEmail({ to: 'a@b.com', subject: 'Hi', html: '<p>h</p>' }, { apiKey: 'k', from: 'me@x.com', fetchFn });
  assert.equal(r.success, true);
  assert.equal(r.id, 'email_123');
  assert.match(captured.url, /api\.resend\.com\/emails/);
  assert.equal(captured.opts.headers.Authorization, 'Bearer k');
  assert.match(captured.opts.body, /a@b\.com/);
});

test('sendEmail returns success:false on a non-ok response', async () => {
  const fetchFn = async () => ({ ok: false, status: 422, text: async () => 'bad', json: async () => ({}) });
  const r = await sendEmail({ to: 'a@b.com', subject: 's', html: 'h' }, { apiKey: 'k', from: 'me@x.com', fetchFn });
  assert.equal(r.success, false);
  assert.match(r.error, /422/);
});
