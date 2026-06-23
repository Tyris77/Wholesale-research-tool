import { v4 as uuid } from 'uuid';
import { dbRun, dbGet, dbAll } from './db.js';
import { sendEmail } from './email-service.js';
import { config } from './config.js';

// The Seller Outreach Agent runs each enrolled seller through a fixed multi-touch
// cadence. Email touches are sent automatically (when Resend is configured);
// call/text/mail touches are QUEUED with a ready-to-use script for the user to
// send by hand — automated calls/texts to non-consenting cell numbers would
// violate the TCPA, so those stay human-initiated by design.
export const OUTREACH_SEQUENCE = [
  { offsetDays: 0, channel: 'email', kind: 'intro' },
  { offsetDays: 1, channel: 'call', kind: 'intro' },
  { offsetDays: 3, channel: 'text', kind: 'nudge' },
  { offsetDays: 5, channel: 'call', kind: 'followup' },
  { offsetDays: 7, channel: 'email', kind: 'value' },
  { offsetDays: 14, channel: 'call', kind: 'final' },
];

// Sellers in these states are done — don't enroll or keep touching them.
const TERMINAL_STATUSES = new Set(['contracted', 'won', 'dead', 'closed', 'not_interested']);

const DAY_MS = 86400000;

export function senderInfo() {
  return {
    name: config.outreach.name,
    phone: config.outreach.phone,
    mailingAddress: config.outreach.mailingAddress,
  };
}

// Best-effort first name. DC owner names are often "LAST, FIRST" (reliable) or
// "LAST FIRST" (ambiguous); fall back to a friendly neutral greeting.
export function firstNameOf(name) {
  const s = String(name ?? '').trim();
  if (!s) return 'there';
  const titled = (t) => (t ? t[0].toUpperCase() + t.slice(1).toLowerCase() : 'there');
  if (s.includes(',')) return titled(s.split(',')[1].trim().split(/\s+/)[0]);
  return titled(s.split(/\s+/)[0]);
}

// Street portion of a DC property address, before the city.
export function streetOf(propertyAddress) {
  const s = String(propertyAddress ?? '').trim();
  const m = s.match(/^(.*?)\s+WASHINGTON\s+DC\b/i);
  return (m ? m[1] : s).trim();
}

// Draft one personalized touch. Pure: same inputs => same text. Email bodies
// include a physical mailing address and an opt-out line (CAN-SPAM).
export function draftTouch(channel, kind, ctx, sender) {
  const first = ctx.firstName;
  const street = ctx.street;
  const property = ctx.propertyAddress;
  const sig = `${sender.name}\n${sender.phone}`;
  const optOut = `\n\n---\n${sender.mailingAddress}\nNot interested? Reply STOP and I won't contact you again.`;

  if (channel === 'email') {
    if (kind === 'value') {
      return {
        subject: `Following up on ${street}`,
        body:
          `Hi ${first},\n\n` +
          `Just circling back about your property at ${property}. If you've thought about selling, I can pay all cash, buy it exactly as-is, and even help sort out any back taxes at closing — no repairs, no agent commissions, no fees on your end.\n\n` +
          `If the timing's right, reply here or call me at ${sender.phone} and I'll put together a fair cash offer.\n\n` +
          `Best,\n${sig}` + optOut,
      };
    }
    return {
      subject: `Interested in buying ${street}`,
      body:
        `Hi ${first},\n\n` +
        `My name is ${sender.name} and I'm a local real estate investor here in Washington, DC. I'm reaching out because I'd like to buy your property at ${property}.\n\n` +
        `I purchase homes as-is for cash — no repairs, no agent fees — and I can close on your timeline. If you'd ever consider selling, I'd be glad to make you a fair, no-obligation cash offer.\n\n` +
        `You can reach me at ${sender.phone}, or just reply to this email.\n\n` +
        `Best,\n${sig}` + optOut,
    };
  }

  if (channel === 'text') {
    return {
      subject: '',
      body:
        `Hi ${first}, it's ${sender.name} — a local investor. I'd like to buy your property at ${street} as-is for cash, ` +
        `no repairs or fees. Open to a quick cash offer? Reply STOP to opt out.`,
    };
  }

  // call
  const opener = `"Hi, am I speaking with ${first}? My name's ${sender.name}, I'm a local investor here in DC. ` +
    `I came across your property at ${property} — I buy houses in that area as-is for cash, and I wondered if you'd ever consider selling it?"`;
  if (kind === 'final') {
    return {
      subject: '',
      body:
        `CALL (final attempt) — ${first} · ${ctx.phone || 'no number'}\n` +
        `${opener}\n` +
        `If no answer: leave a short voicemail — "Hi ${first}, it's ${sender.name}, ${sender.phone}. ` +
        `I'd love to make you a cash offer on ${street} whenever you're ready. No pressure — call me anytime."`,
    };
  }
  if (kind === 'followup') {
    return {
      subject: '',
      body:
        `CALL (follow-up) — ${first} · ${ctx.phone || 'no number'}\n` +
        `"Hi ${first}, ${sender.name} again about ${street}. Just wanted to follow up — have you given any more thought to selling? ` +
        `I can still make you a cash, as-is offer and close fast."`,
    };
  }
  return {
    subject: '',
    body:
      `CALL — ${first} · ${ctx.phone || 'no number'}\n` +
      `${opener}\n` +
      `[If open:] "What kind of condition is it in? ... If the number made sense, how soon would you want to close?"\n` +
      `[Close:] "Let me run my numbers and I'll get you a cash offer — no repairs or fees. Can I follow up in a couple days?"`,
  };
}

// Build (but don't persist) the full touch list for one seller.
export function buildTouches(seller, startISO, sender = senderInfo()) {
  const start = new Date(startISO).getTime();
  const ctx = {
    firstName: firstNameOf(seller.name),
    propertyAddress: seller.property_address || '',
    street: streetOf(seller.property_address),
    phone: seller.phone || '',
  };
  return OUTREACH_SEQUENCE.map((step) => {
    const { subject, body } = draftTouch(step.channel, step.kind, ctx, sender);
    return {
      channel: step.channel,
      kind: step.kind,
      scheduled_at: new Date(start + step.offsetDays * DAY_MS).toISOString(),
      subject,
      body,
      status: 'scheduled',
    };
  });
}

export function dueTouches(touches, nowISO) {
  return touches.filter((t) => t.status === 'scheduled' && t.scheduled_at <= nowISO);
}

async function enrollNewSellers(now) {
  const sellers = await dbAll('SELECT * FROM sellers');
  let enrolled = 0;
  for (const seller of sellers) {
    if (TERMINAL_STATUSES.has(String(seller.status || '').toLowerCase())) continue;
    const existing = await dbGet('SELECT id FROM outreach_touches WHERE seller_id = ? LIMIT 1', [seller.id]);
    if (existing) continue;
    for (const t of buildTouches(seller, now)) {
      await dbRun(
        `INSERT INTO outreach_touches (id, seller_id, contact_name, channel, kind, scheduled_at, status, subject, body, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuid(), seller.id, seller.name, t.channel, t.kind, t.scheduled_at, t.status, t.subject, t.body, now],
      );
    }
    enrolled += 1;
  }
  return enrolled;
}

async function logActivity(seller, touch, status, detail, emailId, now) {
  await dbRun(
    `INSERT INTO activities (id, deal_id, contact_type, contact_id, contact_name, channel, subject, status, detail, created_at)
     VALUES (?, NULL, 'owner', ?, ?, ?, ?, ?, ?, ?)`,
    [uuid(), seller.id, seller.name, touch.channel, touch.subject || `${touch.channel} ${touch.kind}`, status, detail || '', now],
  );
}

// Process every due touch: auto-send emails, queue manual (call/text/mail)
// touches with their script. Returns a per-run summary.
export async function runSellerOutreach(now = new Date().toISOString(), send = sendEmail) {
  const summary = { enrolled: 0, emailsSent: 0, queued: 0, skipped: 0, errors: [] };
  try {
    summary.enrolled = await enrollNewSellers(now);
    const due = await dbAll(
      "SELECT * FROM outreach_touches WHERE status = 'scheduled' AND scheduled_at <= ? ORDER BY scheduled_at ASC",
      [now],
    );
    for (const touch of due) {
      const seller = await dbGet('SELECT * FROM sellers WHERE id = ?', [touch.seller_id]);
      if (!seller) { await dbRun("UPDATE outreach_touches SET status = 'skipped' WHERE id = ?", [touch.id]); continue; }
      if (TERMINAL_STATUSES.has(String(seller.status || '').toLowerCase())) {
        await dbRun("UPDATE outreach_touches SET status = 'skipped' WHERE id = ?", [touch.id]);
        continue;
      }

      if (touch.channel === 'email') {
        if (!seller.email) {
          await dbRun("UPDATE outreach_touches SET status = 'skipped' WHERE id = ?", [touch.id]);
          summary.skipped += 1;
          continue;
        }
        const r = await send({ to: seller.email, subject: touch.subject, html: touch.body.replace(/\n/g, '<br>') });
        if (r.success) {
          await dbRun("UPDATE outreach_touches SET status = 'sent' WHERE id = ?", [touch.id]);
          await dbRun('UPDATE sellers SET last_contacted = ? WHERE id = ?', [now, seller.id]);
          await logActivity(seller, touch, 'sent', r.id || '', r.id || '', now);
          summary.emailsSent += 1;
        } else {
          // Not configured or transient failure: leave it for a later run.
          await dbRun("UPDATE outreach_touches SET status = 'skipped' WHERE id = ?", [touch.id]);
          await logActivity(seller, touch, 'skipped', r.error || '', '', now);
          summary.skipped += 1;
        }
      } else {
        // Manual channel — make it actionable in the user's queue.
        await dbRun("UPDATE outreach_touches SET status = 'queued' WHERE id = ?", [touch.id]);
        summary.queued += 1;
      }
    }
  } catch (err) {
    summary.errors.push(err.message);
    console.error('seller-outreach run error', err);
  }
  return summary;
}
