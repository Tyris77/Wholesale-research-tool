import { useState } from 'react';
import { getFollowUps, getActivities, logContact } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorBanner, Empty } from '../components/states';
import type { Seller, Activity } from '../api/types';

export function FollowUps() {
  const due = useAsync<Seller[]>(getFollowUps, true);
  const feed = useAsync<Activity[]>(getActivities, true);
  const [drafts, setDrafts] = useState<Record<string, { note: string; next: string }>>({});
  const [error, setError] = useState<string | null>(null);

  const sellers = due.data ?? [];
  const setDraft = (id: string, patch: Partial<{ note: string; next: string }>) =>
    setDrafts((d) => ({ ...d, [id]: { note: '', next: '', ...d[id], ...patch } }));

  const handleLog = async (id: string) => {
    setError(null);
    const draft = drafts[id] ?? { note: '', next: '' };
    try {
      await logContact(id, { note: draft.note, next_follow_up: draft.next || undefined });
      await due.run();
      await feed.run();
      setDrafts((d) => { const n = { ...d }; delete n[id]; return n; });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <header className="hero-panel">
        <p className="eyebrow">Pipeline</p>
        <h1>Follow-ups</h1>
        <p>Sellers due for a touch, and your recent outreach.</p>
      </header>

      <div className="layout-grid">
        <section className="panel">
          <h2>Due now ({sellers.length})</h2>
          {due.loading && <Loading label="Loading follow-ups…" />}
          {due.error && <ErrorBanner message={due.error} onRetry={() => due.run()} />}
          {error && <ErrorBanner message={error} />}
          {!due.loading && !due.error && sellers.length === 0 && <Empty message="Nobody is due for follow-up. Nice." />}
          <div className="seller-list">
            {sellers.map((s) => {
              const draft = drafts[s.id] ?? { note: '', next: '' };
              return (
                <div key={s.id} className="seller-card">
                  <strong>{s.name}</strong>
                  <p className="text-muted">Due {s.next_follow_up} · last contacted {s.last_contacted ? new Date(s.last_contacted).toLocaleDateString() : '—'}</p>
                  <div className="form-grid">
                    <input placeholder="Note (e.g. left voicemail)" value={draft.note} onChange={(e) => setDraft(s.id, { note: e.target.value })} />
                    <label><span>Next follow-up</span><input type="date" value={draft.next} onChange={(e) => setDraft(s.id, { next: e.target.value })} /></label>
                    <button onClick={() => handleLog(s.id)}>Log contact</button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel">
          <h2>Recent activity</h2>
          {feed.loading && <Loading label="Loading activity…" />}
          {feed.error && <ErrorBanner message={feed.error} onRetry={() => feed.run()} />}
          {feed.data && feed.data.length === 0 && <Empty message="No activity yet." />}
          <div className="market-list">
            {(feed.data ?? []).map((a) => (
              <div key={a.id} className="market-card">
                <strong>{a.contact_name}</strong> <span className="text-muted">· {a.channel} · {a.status}</span>
                <p className="text-muted">{new Date(a.created_at).toLocaleString()}{a.detail ? ` · ${a.detail}` : ''}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
