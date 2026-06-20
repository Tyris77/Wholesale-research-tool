import crypto from 'node:crypto';

export function parseResendEvent(body) {
  if (!body || !body.type || !body.data || !body.data.email_id) return null;
  const to = body.data.to;
  return {
    email_id: body.data.email_id,
    type: body.type,
    recipient: Array.isArray(to) ? (to[0] || '') : (to || ''),
    created_at: body.created_at || new Date().toISOString(),
  };
}

export function summarizeEvents(sentEmailIds, events) {
  const ids = new Set(sentEmailIds);
  const distinct = (type) =>
    new Set(events.filter((e) => e.type === type && ids.has(e.email_id)).map((e) => e.email_id)).size;
  return {
    sent: ids.size,
    delivered: distinct('email.delivered'),
    opened: distinct('email.opened'),
    clicked: distinct('email.clicked'),
    bounced: distinct('email.bounced'),
  };
}

function timingSafeEqualStr(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function verifySvixSignature({ secret, id, timestamp, signature, body }) {
  if (!secret || !id || !timestamp || !signature) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
  return signature.split(' ').some((part) => {
    const comma = part.indexOf(',');
    const sig = comma >= 0 ? part.slice(comma + 1) : part;
    return sig.length > 0 && timingSafeEqualStr(sig, expected);
  });
}
