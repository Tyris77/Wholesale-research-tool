import { useState } from 'react';
import { useAsync } from '../hooks/useAsync';
import { getOutreachQueue, runOutreach, completeOutreachTouch, replyOutreachTouch } from '../api/client';
import type { OutreachTouch } from '../api/types';

const fmtPhone = (p: string | null) => {
  const d = String(p ?? '').replace(/\D/g, '');
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : (p ?? '');
};

const CHANNEL_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  call: { bg: '#dbeafe', fg: '#1e40af', label: '📞 Call' },
  text: { bg: '#dcfce7', fg: '#166534', label: '💬 Text' },
  mail: { bg: '#fef3c7', fg: '#92400e', label: '✉️ Mail' },
  email: { bg: '#ede9fe', fg: '#5b21b6', label: '@ Email' },
};

export default function Outreach() {
  const queue = useAsync(getOutreachQueue, true);
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState('');
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  async function handleRun() {
    setRunning(true);
    setRunMsg('');
    try {
      const r = await runOutreach();
      setRunMsg(`Agent ran: ${r.enrolled} sellers enrolled, ${r.emailsSent} emails sent, ${r.queued} calls/texts queued.`);
      queue.run();
    } catch {
      setRunMsg('Run failed — check server logs.');
    } finally {
      setRunning(false);
    }
  }

  async function act(id: string, fn: (id: string) => Promise<unknown>) {
    setBusy((p) => ({ ...p, [id]: true }));
    try {
      await fn(id);
      queue.run();
    } finally {
      setBusy((p) => ({ ...p, [id]: false }));
    }
  }

  const items = queue.data ?? [];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Outreach Agent</h1>
        <button
          onClick={handleRun}
          disabled={running}
          style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontWeight: 600 }}
        >
          {running ? 'Running...' : 'Run Agent Now'}
        </button>
      </div>

      <p style={{ color: '#6b7280', marginTop: 0, marginBottom: 12, fontSize: 14 }}>
        The agent enrolls every seller into a multi-touch sequence, sends the emails automatically, and queues each
        call and text below with the script written for you. Tap the number to dial, read the script, then mark it done —
        or hit <strong>They Replied</strong> the moment a seller responds (that pauses their sequence so you can talk live).
      </p>
      {runMsg && <p style={{ color: '#374151', marginBottom: 12, fontSize: 14 }}>{runMsg}</p>}

      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 20px', display: 'inline-block', marginBottom: 20 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: '#7c3aed' }}>{items.length}</div>
        <div style={{ fontSize: 12, color: '#6b7280' }}>Actions waiting for you</div>
      </div>

      {queue.loading && <p>Loading your action queue...</p>}
      {queue.error && <p style={{ color: '#dc2626' }}>Error: {queue.error}</p>}
      {queue.data && items.length === 0 && (
        <p style={{ color: '#6b7280' }}>
          Nothing queued right now. Click <strong>Run Agent Now</strong> — it enrolls your sellers and tees up the first
          calls. (New touches also appear automatically as each seller's schedule comes due.)
        </p>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {items.map((t: OutreachTouch) => {
          const cs = CHANNEL_STYLE[t.channel] ?? CHANNEL_STYLE.call;
          const working = busy[t.id];
          return (
            <div key={t.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ background: cs.bg, color: cs.fg, borderRadius: 4, padding: '2px 10px', fontWeight: 700, fontSize: 12 }}>
                    {cs.label}
                  </span>
                  <strong>{t.contact_name}</strong>
                  <span style={{ color: '#6b7280', fontSize: 13 }}>{t.property_address}</span>
                </div>
                {t.channel === 'call' && t.phone && (
                  <a href={`tel:${t.phone}`} style={{ background: '#16a34a', color: '#fff', borderRadius: 6, padding: '6px 14px', textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>
                    Call {fmtPhone(t.phone)}
                  </a>
                )}
                {t.channel === 'text' && t.phone && (
                  <a href={`sms:${t.phone}`} style={{ background: '#16a34a', color: '#fff', borderRadius: 6, padding: '6px 14px', textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>
                    Text {fmtPhone(t.phone)}
                  </a>
                )}
              </div>
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, color: '#374151', background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: 6, padding: 12, margin: '12px 0' }}>
                {t.body}
              </pre>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  disabled={working}
                  onClick={() => act(t.id, completeOutreachTouch)}
                  style={{ background: '#e2e8f0', color: '#374151', border: 'none', borderRadius: 4, padding: '6px 14px', cursor: 'pointer', fontSize: 13 }}
                >
                  Mark Done
                </button>
                <button
                  disabled={working}
                  onClick={() => act(t.id, replyOutreachTouch)}
                  style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                >
                  They Replied 🔥
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
