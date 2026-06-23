import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from './server.js';
import { db, dbRun, dbGet, dbAll } from './db.js';

after(() => new Promise((resolve) => db.close(() => resolve())));

const SELLER_ID = 'OUTREACH_TEST_SELLER';

before(async () => {
  await dbRun('DELETE FROM outreach_touches WHERE seller_id = ?', [SELLER_ID]);
  await dbRun('DELETE FROM sellers WHERE id = ?', [SELLER_ID]);
  await dbRun(
    `INSERT INTO sellers (id, name, phone, email, property_address, property_city, property_state, motivation, status, created_at)
     VALUES (?, 'MURPHY, ANGELA T', '2025550100', 'angela@example.com', '4556 TEXAS AVE SE WASHINGTON DC 20019', 'Washington', 'DC', 'Score 100', 'new', ?)`,
    [SELLER_ID, new Date().toISOString()],
  );
});

test('POST /api/outreach/run enrolls the seller into the sequence', async () => {
  const res = await request(app).post('/api/outreach/run');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  const touches = await dbAll('SELECT * FROM outreach_touches WHERE seller_id = ?', [SELLER_ID]);
  assert.equal(touches.length, 6); // matches OUTREACH_SEQUENCE
  assert.ok(touches.some((t) => t.channel === 'call'));
});

test('a due call touch becomes queued and shows in the action queue', async () => {
  // Backdate every touch so the agent processes them on the next run.
  await dbRun("UPDATE outreach_touches SET scheduled_at = '2020-01-01T00:00:00.000Z' WHERE seller_id = ?", [SELLER_ID]);
  const run = await request(app).post('/api/outreach/run');
  assert.equal(run.status, 200);

  const queue = await request(app).get('/api/outreach/queue');
  assert.equal(queue.status, 200);
  const mine = queue.body.filter((q) => q.seller_id === SELLER_ID);
  assert.ok(mine.length >= 1);
  const call = mine.find((q) => q.channel === 'call');
  assert.ok(call, 'expected a queued call');
  assert.equal(call.phone, '2025550100');
  assert.match(call.body, /am I speaking with Angela/);

  // Email with no Resend key configured is skipped, never sent.
  const emailTouch = await dbGet("SELECT status FROM outreach_touches WHERE seller_id = ? AND channel = 'email' AND kind = 'intro'", [SELLER_ID]);
  assert.equal(emailTouch.status, 'skipped');
});

test('POST /complete marks a queued touch done', async () => {
  const call = await dbGet("SELECT id FROM outreach_touches WHERE seller_id = ? AND status = 'queued' LIMIT 1", [SELLER_ID]);
  const res = await request(app).post(`/api/outreach/touches/${call.id}/complete`);
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  const after = await dbGet('SELECT status FROM outreach_touches WHERE id = ?', [call.id]);
  assert.equal(after.status, 'done');
});

test('POST /reply flags the seller hot and pauses the rest of the sequence', async () => {
  const t = await dbGet("SELECT id FROM outreach_touches WHERE seller_id = ? AND status = 'queued' LIMIT 1", [SELLER_ID]);
  const res = await request(app).post(`/api/outreach/touches/${t.id}/reply`);
  assert.equal(res.status, 200);
  const seller = await dbGet('SELECT status FROM sellers WHERE id = ?', [SELLER_ID]);
  assert.equal(seller.status, 'responded');
  const remaining = await dbAll("SELECT status FROM outreach_touches WHERE seller_id = ? AND status IN ('scheduled','queued')", [SELLER_ID]);
  assert.equal(remaining.length, 0);
});

test('POST /complete 404s for an unknown touch', async () => {
  const res = await request(app).post('/api/outreach/touches/NOPE/complete');
  assert.equal(res.status, 404);
});
