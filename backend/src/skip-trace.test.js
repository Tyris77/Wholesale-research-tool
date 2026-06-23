import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from './db.js';
import { parseDcAddress, parseMailingAddress, extractContacts, bestPhone, skipTraceAddress } from './skip-trace.js';

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

test('parseMailingAddress: splits an out-of-state owner mailing address', () => {
  assert.deepEqual(
    parseMailingAddress('999 FLORIDA AVE, MIAMI FL 33101'),
    { street: '999 FLORIDA AVE', city: 'MIAMI', state: 'FL', zip: '33101' },
  );
});

test('parseMailingAddress: handles a DC owner-occupant and zip+4', () => {
  assert.deepEqual(
    parseMailingAddress('25 BUCHANAN ST NE, WASHINGTON DC 20011-1234'),
    { street: '25 BUCHANAN ST NE', city: 'WASHINGTON', state: 'DC', zip: '20011' },
  );
});

test('extractContacts: pulls phones (deduped, last-10, with dnc flag) and emails from a Tracerfy response', () => {
  const resp = {
    hit: true,
    persons: [{
      full_name: 'JANE DOE',
      phones: [
        { number: '+1 (202) 555-0100', type: 'Mobile', dnc: false, rank: 1 },
        { number: '202-555-0100', type: 'Mobile', dnc: false, rank: 2 }, // duplicate
        { number: '2025550101', type: 'Landline', dnc: true, rank: 3 },
      ],
      emails: [{ email: 'JANE@EXAMPLE.COM', rank: 1 }],
    }],
  };
  const { phones, emails } = extractContacts(resp);
  assert.equal(phones.length, 2);
  assert.deepEqual(phones.map((p) => p.number), ['2025550100', '2025550101']);
  assert.deepEqual(phones.map((p) => p.dnc), [false, true]);
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

test('bestPhone: avoids a DNC-flagged number when a callable one exists', () => {
  // A clean landline beats a DNC-flagged mobile (calling DNC risks a TCPA fine).
  assert.equal(
    bestPhone([
      { number: '2025550100', type: 'Mobile', dnc: true },
      { number: '2025550101', type: 'Landline', dnc: false },
    ]),
    '2025550101',
  );
  // If every number is flagged, fall back to the best of the bad lot (mobile).
  assert.equal(
    bestPhone([
      { number: '2025550101', type: 'Landline', dnc: true },
      { number: '2025550100', type: 'Mobile', dnc: true },
    ]),
    '2025550100',
  );
});

test('skipTraceAddress: throws a clear error when no key configured', async () => {
  // TRACERFY_API_KEY is blanked by test-setup.js, so this must not hit the network.
  await assert.rejects(
    () => skipTraceAddress({ street: '1 A ST', city: 'Washington', state: 'DC', zip: '20001' }),
    /not set up|TRACERFY_API_KEY/,
  );
});
