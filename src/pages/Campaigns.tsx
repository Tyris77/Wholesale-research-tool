import { useState } from 'react';
import { getCampaigns, pauseCampaign, resumeCampaign, cancelCampaign, runScheduler } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorBanner, Empty } from '../components/states';
import type { Campaign } from '../api/types';

export function Campaigns() {
  const list = useAsync<Campaign[]>(getCampaigns, true);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const campaigns = list.data ?? [];

  const act = async (fn: () => Promise<unknown>, after: string) => {
    setError(null); setMsg(null);
    try {
      await fn();
      await list.run();
      setMsg(after);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <header className="hero-panel">
        <p className="eyebrow">Automation</p>
        <h1>Campaigns</h1>
        <p>Scheduled email outreach to matched buyers. Steps fire automatically; use “Run due now” to process immediately.</p>
      </header>

      <div className="layout-single">
        <section className="panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h2>All campaigns ({campaigns.length})</h2>
            <button onClick={() => act(() => runScheduler(), 'Scheduler run complete.')}>Run due now</button>
          </div>
          <p className="text-muted">Automated sends use Resend. With the test sender <code>onboarding@resend.dev</code>, only your own account email receives mail until you verify a domain.</p>
          {msg && <p className="good-deal">{msg}</p>}
          {error && <ErrorBanner message={error} />}
          {list.loading && <Loading label="Loading campaigns…" />}
          {list.error && <ErrorBanner message={list.error} onRetry={() => list.run()} />}
          {!list.loading && !list.error && campaigns.length === 0 && <Empty message="No campaigns yet. Use Automate on a deal to create one." />}

          <div className="seller-list">
            {campaigns.map((c) => (
              <div key={c.id} className="seller-card">
                <div className="seller-header">
                  <strong>{c.name}</strong>
                  <span className={`pill pill-${c.status}`}>{c.status}</span>
                </div>
                <div className="match-list">
                  {c.steps.map((s) => (
                    <div key={s.id} className="match-row">
                      <span>Step {s.step_no}</span>
                      <span className="text-muted">{new Date(s.run_at).toLocaleString()}</span>
                      <span>{s.status}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  {c.status === 'active' && <button className="ghost-button" onClick={() => act(() => pauseCampaign(c.id), 'Paused.')}>Pause</button>}
                  {c.status === 'paused' && <button className="ghost-button" onClick={() => act(() => resumeCampaign(c.id), 'Resumed.')}>Resume</button>}
                  {(c.status === 'active' || c.status === 'paused') && <button className="ghost-button" onClick={() => act(() => cancelCampaign(c.id), 'Cancelled.')}>Cancel</button>}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
