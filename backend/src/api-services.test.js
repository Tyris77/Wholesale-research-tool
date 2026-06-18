import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getMarketTrends } from './api-services.js';

function okFetch(captured, body) {
  return async (url, opts) => {
    captured.url = url;
    captured.opts = opts;
    return { ok: true, status: 200, json: async () => body };
  };
}

test('getMarketTrends calls the observations endpoint with a valid series', async () => {
  const captured = {};
  const body = { observations: [{ date: '2024-01-01', value: '1.2' }] };
  const result = await getMarketTrends('Atlanta', { apiKey: 'test', fetchFn: okFetch(captured, body) });

  assert.equal(result.success, true);
  assert.equal(result.metro, 'Atlanta');
  assert.match(captured.url, /\/fred\/series\/observations/);
  assert.match(captured.url, /series_id=ATNHPIUS12060Q/);
  assert.match(captured.url, /api_key=test/);
  assert.equal(result.observations.length, 1);
});

test('getMarketTrends falls back to national series for unknown metro', async () => {
  const captured = {};
  const result = await getMarketTrends('Nowhere', { apiKey: 'test', fetchFn: okFetch(captured, { observations: [] }) });
  assert.match(captured.url, /series_id=USSTHPI/);
  assert.equal(result.success, true);
});

test('getMarketTrends returns error when no api key', async () => {
  const result = await getMarketTrends('Atlanta', { apiKey: undefined, fetchFn: async () => { throw new Error('should not be called'); } });
  assert.equal(result.error, 'FRED API key not configured');
});
