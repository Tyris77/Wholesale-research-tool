import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { calculateWholesaleDeal, formatCurrency, type DealInputs } from '../lib/deal';
import { getMarkets } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorBanner } from '../components/states';
import type { Market } from '../api/types';

const QUICK_FIELDS: { label: string; key: keyof DealInputs }[] = [
  { label: 'Purchase price', key: 'purchasePrice' },
  { label: 'Repair budget', key: 'repairBudget' },
  { label: 'ARV', key: 'arv' },
  { label: 'Selling costs', key: 'sellingCosts' },
];

export function Dashboard() {
  const [inputs, setInputs] = useState<DealInputs>({
    purchasePrice: 120000, repairBudget: 22000, arv: 185000,
    sellingCosts: 12000, holdingCosts: 3000, wholesaleFee: 10000,
  });
  const results = useMemo(() => calculateWholesaleDeal(inputs), [inputs]);
  const markets = useAsync<Market[]>(getMarkets, true);

  return (
    <>
      <header className="hero-panel">
        <p className="eyebrow">Wholesale research and deal analyzer</p>
        <h1>Wholesale Intelligence Lab</h1>
        <p>Input your numbers, compare comps, and evaluate deals across hot U.S. markets.</p>
      </header>

      <div className="layout-grid">
        <section className="panel">
          <h2>Quick calculator</h2>
          <div className="form-grid">
            {QUICK_FIELDS.map((field) => (
              <label key={field.key}>
                <span>{field.label}</span>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={inputs[field.key]}
                  onChange={(e) => setInputs((cur) => ({ ...cur, [field.key]: Number(e.target.value) }))}
                />
              </label>
            ))}
          </div>
          <div className="results-card">
            <p><strong>Profit:</strong> {formatCurrency(results.profit)}</p>
            <p className={results.profit >= 0 ? 'good-deal' : 'bad-deal'}>
              {results.profit >= 0 ? '✓ Good deal' : '✗ Review'}
            </p>
          </div>
          <Link to="/calculator"><button style={{ marginTop: 16, width: '100%' }}>Full calculator</button></Link>
        </section>

        <section className="panel">
          <h2>Hot markets</h2>
          {markets.loading && <Loading label="Loading markets…" />}
          {markets.error && <ErrorBanner message={markets.error} onRetry={() => markets.run()} />}
          {markets.data && (
            <div className="market-list">
              {markets.data.slice(0, 3).map((m) => (
                <div key={m.id} className="market-card">
                  <strong>{m.city}, {m.state}</strong>
                  <p>Heat: {m.heat_score}</p>
                  <p>{m.trend}</p>
                </div>
              ))}
            </div>
          )}
          <Link to="/markets"><button style={{ marginTop: 16, width: '100%' }}>View all markets</button></Link>
        </section>

        <section className="panel">
          <h2>Team</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            <Link to="/sellers"><button style={{ width: '100%' }}>Manage sellers</button></Link>
            <Link to="/buyers"><button style={{ width: '100%' }}>Buyer directory</button></Link>
          </div>
        </section>

        <section className="panel">
          <h2>AI &amp; Research</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            <Link to="/ai"><button style={{ width: '100%' }}>AI deal analyzer</button></Link>
            <Link to="/research"><button style={{ width: '100%' }}>Advanced research</button></Link>
          </div>
        </section>
      </div>
    </>
  );
}
