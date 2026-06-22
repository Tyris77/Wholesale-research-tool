import { test } from 'node:test';
import assert from 'node:assert/strict';
import { integrationStatus, isConfigured } from './config.js';

test('isConfigured treats empty and placeholder values as not configured', () => {
  assert.equal(isConfigured(''), false);
  assert.equal(isConfigured(undefined), false);
  assert.equal(isConfigured('your_groq_api_key_here'), false);
  assert.equal(isConfigured('gsk_realkey123'), true);
});

test('integrationStatus reports a boolean per integration', () => {
  const status = integrationStatus({
    groq: 'gsk_real',
    fred: '',
    census: 'your_census_key_here',
    rentcast: 'rc_real',
    resend: 're_real',
    batchdata: '',
  });
  assert.deepEqual(status, { groq: true, fred: false, census: false, rentcast: true, resend: true, batchdata: false });
});
