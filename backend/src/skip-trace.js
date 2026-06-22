import { config, isConfigured } from './config.js';

const SKIP_TRACE_URL = 'https://api.batchdata.com/api/v1/property/skip-trace';

// Split a DC ITSPE property address ("732 51ST ST NE WASHINGTON DC 20019")
// into the parts BatchData wants. All leads are in DC, so city/state are fixed.
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

// Defensively pull phones and emails out of a BatchData response regardless of
// the exact nesting: collect from any object with a number-like field and any
// email-keyed value, de-duplicated. Logs nothing; pure.
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
        phones.push({ number: d, type: String(node.type ?? node.phoneType ?? '').trim() });
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

// Prefer a mobile/cell number (textable) over a landline.
export function bestPhone(phones) {
  if (!phones || phones.length === 0) return null;
  const mobile = phones.find((p) => /mobile|cell|wireless/i.test(p.type));
  return (mobile ?? phones[0]).number;
}

export async function skipTraceAddress(addr) {
  if (!isConfigured(config.keys.batchdata)) {
    throw new Error('Skip tracing is not set up. Add your BatchData API key (BATCHDATA_API_KEY) in Railway → Variables.');
  }
  const body = {
    requests: [{
      propertyAddress: {
        street: addr.street, city: addr.city, state: addr.state, zip: addr.zip,
      },
    }],
  };
  const res = await fetch(SKIP_TRACE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.keys.batchdata}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = {}; }
  if (!res.ok) {
    throw new Error(`BatchData error ${res.status}: ${text.slice(0, 200)}`);
  }
  // First-call breadcrumb so we can confirm the live response shape if needed.
  console.log('batchdata skip-trace top-level keys:', JSON.stringify(Object.keys(data)));
  return extractContacts(data);
}
