import { test } from 'node:test';
import assert from 'node:assert/strict';
import { campaignRunAts, dueSteps, buildFollowUpDigest, shouldSendDigest } from './scheduling.js';

test('campaignRunAts offsets days from the start time', () => {
  const runs = campaignRunAts('2026-06-20T00:00:00.000Z', [0, 3, 7]);
  assert.deepEqual(runs, [
    '2026-06-20T00:00:00.000Z',
    '2026-06-23T00:00:00.000Z',
    '2026-06-27T00:00:00.000Z',
  ]);
});

test('dueSteps returns pending steps at or before now', () => {
  const steps = [
    { id: 'a', status: 'pending', run_at: '2026-06-20T00:00:00.000Z' },
    { id: 'b', status: 'pending', run_at: '2026-06-25T00:00:00.000Z' },
    { id: 'c', status: 'sent', run_at: '2026-06-19T00:00:00.000Z' },
  ];
  const due = dueSteps(steps, '2026-06-21T00:00:00.000Z');
  assert.deepEqual(due.map((s) => s.id), ['a']);
});

test('buildFollowUpDigest returns null when nobody is due', () => {
  assert.equal(buildFollowUpDigest([]), null);
});

test('buildFollowUpDigest lists due sellers', () => {
  const d = buildFollowUpDigest([{ name: 'Jane', next_follow_up: '2026-06-20' }, { name: 'Bob', next_follow_up: '2026-06-19' }]);
  assert.match(d.subject, /2 seller/i);
  assert.match(d.html, /Jane/);
  assert.match(d.html, /Bob/);
});

test('shouldSendDigest is true only when the date changed', () => {
  assert.equal(shouldSendDigest('2026-06-19', '2026-06-20'), true);
  assert.equal(shouldSendDigest('2026-06-20', '2026-06-20'), false);
  assert.equal(shouldSendDigest('', '2026-06-20'), true);
});
