import { isConfigured } from './config.js';

// Sends one email via Resend. Disabled (returns success:false) until both
// RESEND_API_KEY and EMAIL_FROM are configured. fetchFn is injectable for tests.
export async function sendEmail(
  { to, subject, html },
  { apiKey = process.env.RESEND_API_KEY, from = process.env.EMAIL_FROM, fetchFn = fetch } = {},
) {
  if (!isConfigured(apiKey)) return { success: false, error: 'RESEND_API_KEY not configured' };
  if (!from) return { success: false, error: 'EMAIL_FROM not configured' };
  try {
    const res = await fetchFn('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Resend error: ${res.status} ${detail}`.trim());
    }
    const data = await res.json();
    return { success: true, id: data.id };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
