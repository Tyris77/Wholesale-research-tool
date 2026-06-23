import { config, isConfigured } from './config.js';

// Tracerfy synchronous "instant lookup": one address in, owner contacts out.
const SKIP_TRACE_URL = 'https://tracerfy.com/v1/api/trace/lookup/';

// Split a DC ITSPE property address ("732 51ST ST NE WASHINGTON DC 20019")
// into the parts a skip-trace API wants. All leads are in DC, so city/state are fixed.
export function parseDcAddress(premiseAddr) {
  const s = String(premiseAddr ?? '').trim();
  const zipMatch = s.match(/\b(\d{5})(?:-\d{4})?\s*$/);
  const zip = zipMatch ? zipMatch[1] : '';
  const beforeCity = s.match(/^(.*?)\s+WASHINGTON\s+DC\b/i);
  const street = beforeCity
    ? beforeCity[1].trim()
    : s.replace(/\s+\d{5}(-\d{4})?\s*$/, '').trim();
  return { street, city: 'Washington', state: 'DC', zip };
}

const digitsOf = (s) => String(s).replace(/\D/g, '');

// Defensively pull phones and emails out of a skip-trace response regardless of
// the exact nesting: collect from any object with a number-like field and any
// email-keyed value, de-duplicated. Preserves Tracerfy's `dnc` (do-not-call)
// flag so callers can avoid numbers that risk a TCPA violation. Logs nothing; pure.
export function extractContacts(data) {
  const phones = [];
  const emails = [];
  const seenP = new Set();
  const seenE = new Set();

  function walk(node) {
    if (node == null) return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (typeof node !== 'object') return;

    const numKey = Object.keys(node).find((k) => /^(number|phonenumber|phone)$/i.test(k));
    if (numKey && typeof node[numKey] === 'string' && digitsOf(node[numKey]).length >= 10) {
      const d = digitsOf(node[numKey]).slice(-10);
      if (!seenP.has(d)) {
        seenP.add(d);
        phones.push({
          number: d,
          type: String(node.type ?? node.phoneType ?? '').trim(),
          dnc: node.dnc === true,
        });
      }
    }
    for (const [k, v] of Object.entries(node)) {
      if (/email/i.test(k) && typeof v === 'string' && v.includes('@')) {
        const e = v.trim().toLowerCase();
        if (!seenE.has(e)) { seenE.add(e); emails.push(e); }
      } else {
        walk(v);
      }
    }
  }
  walk(data);
  return { phones, emails };
}

// Pick the best number to actually dial: prefer a callable (non-DNC) mobile,
// then any callable number, and only fall back to a DNC-flagged number if every
// number is flagged. Calling a DNC number without consent risks TCPA penalties.
export function bestPhone(phones) {
  if (!phones || phones.length === 0) return null;
  const isMobile = (p) => /mobile|cell|wireless/i.test(p.type);
  const callable = phones.filter((p) => !p.dnc);
  const pick = callable.find(isMobile) ?? callable[0] ?? phones.find(isMobile) ?? phones[0];
  return pick.number;
}

export async function skipTraceAddress(addr) {
  if (!isConfigured(config.keys.tracerfy)) {
    throw new Error('Skip tracing is not set up. Add your Tracerfy API key (TRACERFY_API_KEY) in Railway → Variables.');
  }
  const body = {
    address: addr.street,
    city: addr.city,
    state: addr.state,
    zip: addr.zip,
    find_owner: true,
  };
  const res = await fetch(SKIP_TRACE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.keys.tracerfy}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = {}; }
  if (!res.ok) {
    throw new Error(`Tracerfy error ${res.status}: ${text.slice(0, 200)}`);
  }
  // First-call breadcrumb so we can confirm the live response shape if needed.
  console.log('tracerfy skip-trace top-level keys:', JSON.stringify(Object.keys(data)));
  return extractContacts(data);
}
