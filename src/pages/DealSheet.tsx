import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getDeal, getDealMatches, createDealLink, revokeDealLink, getDealLink } from '../api/client';
import { Loading, ErrorBanner } from '../components/states';
import { formatCurrency } from '../lib/deal';
import type { Deal, BuyerMatch } from '../api/types';

export function DealSheet() {
  const { id } = useParams();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [matches, setMatches] = useState<BuyerMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linkSlug, setLinkSlug] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoading(true);
    Promise.all([
      getDeal(id),
      getDealMatches(id).catch(() => ({ matches: [] })),
      getDealLink(id).catch(() => null),
    ])
      .then(([d, m, l]) => {
        if (active) {
          setDeal(d);
          setMatches(m.matches || []);
          if (l) setLinkSlug(l.slug);
        }
      })
      .catch((e) => active && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id]);

  const handleShare = async () => {
    if (!id) return;
    try {
      const res = await createDealLink(id);
      setLinkSlug(res.slug);
      await navigator.clipboard.writeText(`${window.location.origin}/p/${res.slug}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleRevoke = async () => {
    if (!id) return;
    try {
      await revokeDealLink(id);
      setLinkSlug(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (loading) return <Loading label="Loading deal sheet…" />;
  if (error) return <ErrorBanner message={error} />;
  if (!deal) return <ErrorBanner message="Deal not found." />;

  const rows: [string, string][] = [
    ['Purchase price', formatCurrency(deal.purchase_price)],
    ['Repair budget', formatCurrency(deal.repair_budget)],
    ['ARV', formatCurrency(deal.arv)],
    ['Selling costs', formatCurrency(deal.selling_costs)],
    ['Holding costs', formatCurrency(deal.holding_costs)],
    ['Wholesale fee', formatCurrency(deal.wholesale_fee)],
  ];

  return (
    <div className="deal-sheet">
      <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => window.print()}>Print / Save as PDF</button>
        <Link to={`/deals/${id}/documents`}><button className="ghost-button">Documents</button></Link>
        <Link to="/deals"><button className="ghost-button">Back to deals</button></Link>
        <button className="ghost-button" onClick={handleShare}>Share</button>
        {linkSlug && (
          <button className="ghost-button" onClick={handleRevoke}>Revoke link</button>
        )}
        {copied && <span style={{ fontSize: '0.85rem', color: 'var(--ink-soft)' }}>Link copied!</span>}
      </div>

      <header className="hero-panel">
        <p className="eyebrow">Deal sheet</p>
        <h1>{deal.name}</h1>
        {(deal.property_address || deal.city) && (
          <p>{[deal.property_address, deal.city, deal.state].filter(Boolean).join(', ')}</p>
        )}
        {deal.deal_type && <p className="text-muted">{deal.deal_type.replace('_', ' ')} · {deal.status}</p>}
      </header>

      <section className="panel">
        <h2>Numbers</h2>
        <table className="data-table">
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label}><td>{label}</td><td className="num">{value}</td></tr>
            ))}
            <tr><td><strong>Projected profit</strong></td><td className="num"><strong>{formatCurrency(deal.profit)}</strong></td></tr>
            <tr><td><strong>ROI</strong></td><td className="num"><strong>{deal.roi.toFixed(1)}%</strong></td></tr>
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>Matched buyers ({matches.length})</h2>
        {matches.length === 0 ? (
          <p className="text-muted">No matching buyers.</p>
        ) : (
          <div className="market-list">
            {matches.map((m) => (
              <div key={m.buyer.id} className="market-card">
                <strong>{m.buyer.name}</strong> <span className="text-muted">· score {m.score}</span>
                <p>{m.buyer.email} · {m.buyer.phone}</p>
                <p className="text-muted">{m.reasons.join(' · ')}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
