import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getMarketTrends, getLiveComps, geocodeAddress } from './api-services.js';

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

test('getMarketTrends sorts descending so last_update is the most recent observation', async () => {
  const captured = {};
  const body = { observations: [{ date: '2024-04-01', value: '1.0' }, { date: '2024-01-01', value: '0.8' }] };
  const result = await getMarketTrends('Atlanta', { apiKey: 'test', fetchFn: okFetch(captured, body) });
  assert.match(captured.url, /sort_order=desc/);
  assert.equal(result.last_update, '2024-04-01');
});

test('getMarketTrends returns error with success:false when no api key', async () => {
  const result = await getMarketTrends('Atlanta', { apiKey: undefined, fetchFn: async () => { throw new Error('should not be called'); } });
  assert.equal(result.success, false);
  assert.equal(result.error, 'FRED API key not configured');
});

test('getLiveComps queries RentCast AVM and maps comps', async () => {
  const captured = {};
  const body = {
    price: 312000,
    priceRangeLow: 300000,
    priceRangeHigh: 325000,
    comparables: [{ formattedAddress: '5 Oak St', price: 305000 }],
  };
  const fetchFn = async (url, opts) => {
    captured.url = url;
    captured.opts = opts;
    return { ok: true, status: 200, json: async () => body };
  };
  const result = await getLiveComps('4812 Maple St', 'Atlanta', 'GA', { apiKey: 'k', fetchFn });

  assert.equal(result.success, true);
  assert.equal(result.estimatedValue, 312000);
  assert.equal(result.count, 1);
  assert.match(captured.url, /api\.rentcast\.io\/v1\/avm\/value/);
  assert.equal(captured.opts.headers['X-Api-Key'], 'k');
});

test('getLiveComps returns error when no api key', async () => {
  const result = await getLiveComps('a', 'b', 'c', { apiKey: undefined, fetchFn: async () => { throw new Error('nope'); } });
  assert.equal(result.success, false);
  assert.match(result.error, /RENTCAST_API_KEY/);
});

test('geocodeAddress sends a User-Agent and returns coordinates', async () => {
  const captured = {};
  const body = [{ display_name: '4812 Maple St, Atlanta, GA', lat: '33.7', lon: '-84.4', boundingbox: ['1','2','3','4'] }];
  const fetchFn = async (url, opts) => {
    captured.opts = opts;
    return { ok: true, status: 200, json: async () => body };
  };
  const result = await geocodeAddress('4812 Maple St, Atlanta, GA', { fetchFn });

  assert.equal(result.success, true);
  assert.equal(result.latitude, '33.7');
  assert.ok(captured.opts.headers['User-Agent'], 'User-Agent header must be set');
});

test('geocodeAddress returns an error when no match is found', async () => {
  const fetchFn = async () => ({ ok: true, status: 200, json: async () => [] });
  const result = await geocodeAddress('nowhere at all', { fetchFn });
  assert.equal(result.error, 'Address not found');
  assert.notEqual(result.success, true);
});
