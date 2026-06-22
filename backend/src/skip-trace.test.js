import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from './db.js';
import { parseDcAddress, extractContacts, bestPhone, skipTraceAddress } from './skip-trace.js';

after(() => new Promise((resolve) => db.close(() => resolve())));

test('parseDcAddress: splits a DC premise address', () => {
  assert.deepEqual(
    parseDcAddress('732 51ST ST NE WASHINGTON DC 20019'),
    { street: '732 51ST ST NE', city: 'Washington', state: 'DC', zip: '20019' },
  );
});

test('parseDcAddress: handles zip+4 and unit', () => {
  assert.deepEqual(
    parseDcAddress('2500 Q ST NW # 228 WASHINGTON DC 20007-3025'),
    { street: '2500 Q ST NW # 228', city: 'Washington', state: 'DC', zip: '20007' },
  );
});

test('extractContacts: pulls phones (deduped, last-10) and emails from nested response', () => {
  const resp = {
    results: {
      persons: [{
        name: { full: 'JANE DOE' },
        phoneNumbers: [
          { number: '+1 (202) 555-0100', type: 'Mobile' },
          { number: '202-555-0100', type: 'Mobile' }, // duplicate
          { number: '2025550101', type: 'Landline' },
        ],
        emails: [{ email: 'JANE@EXAMPLE.COM' }],
      }],
    },
  };
  const { phones, emails } = extractContacts(resp);
  assert.equal(phones.length, 2);
  assert.deepEqual(phones.map((p) => p.number), ['2025550100', '2025550101']);
  assert.deepEqual(emails, ['jane@example.com']);
});

test('extractContacts: empty/odd input yields empty arrays', () => {
  assert.deepEqual(extractContacts({}), { phones: [], emails: [] });
  assert.deepEqual(extractContacts(null), { phones: [], emails: [] });
});

test('bestPhone: prefers mobile over landline', () => {
  assert.equal(bestPhone([{ number: '2025550101', type: 'Landline' }, { number: '2025550100', type: 'Mobile' }]), '2025550100');
  assert.equal(bestPhone([{ number: '2025550109', type: '' }]), '2025550109');
  assert.equal(bestPhone([]), null);
});

test('skipTraceAddress: throws a clear error when no key configured', async () => {
  // BATCHDATA_API_KEY is blanked by test-setup.js, so this must not hit the network.
  await assert.rejects(
    () => skipTraceAddress({ street: '1 A ST', city: 'Washington', state: 'DC', zip: '20001' }),
    /not set up|BATCHDATA_API_KEY/,
  );
});
