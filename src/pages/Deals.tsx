import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getDeals, updateDeal, deleteDeal, getDealMatches, emailMatchedBuyers, getDealActivities, createCampaign, createDealLink, revokeDealLink, getDealLink } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorBanner, Empty } from '../components/states';
import { formatCurrency } from '../lib/deal';
import type { Deal, BuyerMatch, Activity } from '../api/types';

const STATUSES = ['analyzing', 'under_contract', 'closed', 'dead'];

const CADENCES: { label: string; offsets: number[] }[] = [
  { label: 'Single blast (now)', offsets: [0] },
  { label: 'Two-touch (now, +3d)', offsets: [0, 3] },
  { label: 'Three-touch (now, +3d, +7d)', offsets: [0, 3, 7] },
];

export function Deals() {
  const list = useAsync<Deal[]>(getDeals, true);
  const deals = list.data ?? [];
  const [matches, setMatches] = useState<Record<string, BuyerMatch[]>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [emailMsg, setEmailMsg] = useState<Record<string, string>>({});
  const [activities, setActivities] = useState<Record<string, Activity[]>>({});
  const [automateFor, setAutomateFor] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, string | null>>({});
  const [copied, setCopied] = useState<Record<string, boolean>>({});

  const handleStatus = async (deal: Deal, status: string) => {
    list.setData(deals.map((d) => (d.id === deal.id ? { ...d, status } : d)));
    try {
      await updateDeal(deal.id, { ...deal, status });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDeal(id);
      list.setData(deals.filter((d) => d.id !== id));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleMatches = async (id: string) => {
    try {
      const res = await getDealMatches(id);
      setMatches((m) => ({ ...m, [id]: res.matches }));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleEmail = async (deal: Deal) => {
    setActionError(null);
    try {
      const res = await getDealMatches(deal.id);
      const n = res.matches.length;
      if (n === 0) { setEmailMsg((m) => ({ ...m, [deal.id]: 'No matched buyers to email.' })); return; }
      if (!window.confirm(`Send this deal to ${n} matched buyer${n === 1 ? '' : 's'}?`)) return;
      const out = await emailMatchedBuyers(deal.id);
      if (!out.success) { setEmailMsg((m) => ({ ...m, [deal.id]: out.error || 'Email failed.' })); return; }
      setEmailMsg((m) => ({ ...m, [deal.id]: `Sent ${out.sent} · skipped ${out.skipped} · failed ${out.failed}` }));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleActivities = async (id: string) => {
    try {
      const rows = await getDealActivities(id);
      setActivities((a) => ({ ...a, [id]: rows }));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleAutomate = async (deal: Deal, offsets: number[]) => {
    setActionError(null);
    if (!window.confirm('Create an automated campaign that emails matched buyers on this schedule? Sends fire automatically.')) return;
    try {
      await createCampaign(deal.id, { offsets_days: offsets });
      setAutomateFor(null);
      setEmailMsg((m) => ({ ...m, [deal.id]: 'Campaign created — see the Campaigns page.' }));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleShare = async (deal: Deal) => {
    setActionError(null);
    try {
      const res = await createDealLink(deal.id);
      setLinks((l) => ({ ...l, [deal.id]: res.slug }));
      await navigator.clipboard.writeText(`${window.location.origin}/p/${res.slug}`);
      setCopied((c) => ({ ...c, [deal.id]: true }));
      setTimeout(() => setCopied((c) => ({ ...c, [deal.id]: false })), 2000);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleRevoke = async (dealId: string) => {
    setActionError(null);
    try {
      await revokeDealLink(dealId);
      setLinks((l) => ({ ...l, [dealId]: null }));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  // Hydrate existing active link slugs on mount
  useEffect(() => {
    if (!list.data) return;
    list.data.forEach((deal) => {
      getDealLink(deal.id)
        .then((l) => {
          if (l) setLinks((prev) => ({ ...prev, [deal.id]: l.slug }));
        })
        .catch(() => {});
    });
  }, [list.data]);

  return (
    <>
      <header className="hero-panel">
        <p className="eyebrow">Deal pipeline</p>
        <h1>Saved Deals</h1>
        <p>Track analyzed deals, match them to cash buyers, and print deal sheets.</p>
      </header>

      <div className="layout-single">
        {actionError && <ErrorBanner message={actionError} />}
        <section className="panel">
          <h2>Deals ({deals.length})</h2>
          {list.loading && <Loading label="Loading deals…" />}
          {list.error && <ErrorBanner message={list.error} onRetry={() => list.run()} />}
          {!list.loading && !list.error && deals.length === 0 && (
            <Empty message="No saved deals yet. Use the Calculator to analyze and save a deal." />
          )}
          <div className="seller-list">
            {deals.map((deal) => (
              <div key={deal.id} className="seller-card">
                <div className="seller-header">
                  <strong>{deal.name}</strong>
                  <select className="status-badge" value={deal.status} onChange={(e) => handleStatus(deal, e.target.value)}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </select>
                </div>
                {(deal.city || deal.property_address) && (
                  <p className="text-muted">📍 {[deal.property_address, deal.city, deal.state].filter(Boolean).join(', ')}</p>
                )}
                {deal.deal_type && <p className="text-muted">🏷️ {deal.deal_type.replace('_', ' ')}</p>}
                <div className="kpi-grid">
                  <div className="kpi"><p className="kpi-label">Profit</p><p className="kpi-value">{formatCurrency(deal.profit)}</p></div>
                  <div className="kpi"><p className="kpi-label">ROI</p><p className="kpi-value">{deal.roi.toFixed(1)}%</p></div>
                  <div className="kpi"><p className="kpi-label">ARV</p><p className="kpi-value">{formatCurrency(deal.arv)}</p></div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <button className="ghost-button" onClick={() => handleMatches(deal.id)}>Find buyers</button>
                  <button className="ghost-button" onClick={() => handleEmail(deal)}>Email buyers</button>
                  <button className="ghost-button" onClick={() => handleActivities(deal.id)}>Activity</button>
                  <button className="ghost-button" onClick={() => setAutomateFor(automateFor === deal.id ? null : deal.id)}>Automate</button>
                  <Link to={`/deals/${deal.id}/sheet`}><button className="ghost-button">Print sheet</button></Link>
                  <Link to={`/deals/${deal.id}/documents`}><button className="ghost-button">Documents</button></Link>
                  <button className="ghost-button" onClick={() => handleDelete(deal.id)}>Delete</button>
                  <button className="ghost-button" onClick={() => handleShare(deal)}>Share</button>
                  {links[deal.id] && (
                    <button className="ghost-button" onClick={() => handleRevoke(deal.id)}>Revoke link</button>
                  )}
                  {copied[deal.id] && <span className="text-muted" style={{ fontSize: '0.85rem' }}>Link copied!</span>}
                </div>
                {automateFor === deal.id && (
                  <div className="results-card">
                    <h3>Automate outreach</h3>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {CADENCES.map((c) => (
                        <button key={c.label} className="ghost-button" onClick={() => handleAutomate(deal, c.offsets)}>{c.label}</button>
                      ))}
                    </div>
                  </div>
                )}
                {matches[deal.id] && (
                  <div className="results-card">
                    <h3>Buyer matches ({matches[deal.id].length})</h3>
                    {matches[deal.id].length === 0 ? (
                      <p className="text-muted">No matching buyers found.</p>
                    ) : (
                      matches[deal.id].map((m) => (
                        <div key={m.buyer.id} className="market-card">
                          <strong>{m.buyer.name}</strong> <span className="text-muted">· score {m.score}</span>
                          <p className="text-muted">{m.reasons.join(' · ')}</p>
                        </div>
                      ))
                    )}
                  </div>
                )}
                {emailMsg[deal.id] && <p className="text-muted">✉️ {emailMsg[deal.id]}</p>}
                {activities[deal.id] && (
                  <div className="results-card">
                    <h3>Activity ({activities[deal.id].length})</h3>
                    {activities[deal.id].length === 0 ? (
                      <p className="text-muted">No activity yet.</p>
                    ) : (
                      activities[deal.id].map((a) => (
                        <p key={a.id} className="text-muted">
                          {new Date(a.created_at).toLocaleDateString()} · {a.contact_name} · {a.channel} · {a.status}
                        </p>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
