import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getDeals, updateDeal, deleteDeal, getDealMatches } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorBanner, Empty } from '../components/states';
import { formatCurrency } from '../lib/deal';
import type { Deal, BuyerMatch } from '../api/types';

const STATUSES = ['analyzing', 'under_contract', 'closed', 'dead'];

export function Deals() {
  const list = useAsync<Deal[]>(getDeals, true);
  const deals = list.data ?? [];
  const [matches, setMatches] = useState<Record<string, BuyerMatch[]>>({});
  const [actionError, setActionError] = useState<string | null>(null);

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
                  <Link to={`/deals/${deal.id}/sheet`}><button className="ghost-button">Print sheet</button></Link>
                  <button className="ghost-button" onClick={() => handleDelete(deal.id)}>Delete</button>
                </div>
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
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
