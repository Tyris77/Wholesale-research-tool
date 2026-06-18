import { useMemo, useState } from 'react';
import { calculateWholesaleDeal, formatCurrency, type DealInputs } from '../lib/deal';

const FIELDS: { label: string; key: keyof DealInputs }[] = [
  { label: 'Purchase price', key: 'purchasePrice' },
  { label: 'Repair budget', key: 'repairBudget' },
  { label: 'ARV (after repair value)', key: 'arv' },
  { label: 'Selling costs', key: 'sellingCosts' },
  { label: 'Holding costs', key: 'holdingCosts' },
  { label: 'Wholesale fee', key: 'wholesaleFee' },
];

const REHAB = [
  { category: 'Kitchen', range: '$12k - $18k' },
  { category: 'Bathrooms', range: '$8k - $12k' },
  { category: 'Roof', range: '$6k - $10k' },
  { category: 'Paint + Flooring', range: '$5k - $8k' },
  { category: 'Systems / Misc', range: '$4k - $7k' },
];

export function Calculator() {
  const [inputs, setInputs] = useState<DealInputs>({
    purchasePrice: 120000, repairBudget: 22000, arv: 185000,
    sellingCosts: 12000, holdingCosts: 3000, wholesaleFee: 10000,
  });
  const results = useMemo(() => calculateWholesaleDeal(inputs), [inputs]);
  const spread = inputs.arv - inputs.repairBudget - inputs.sellingCosts - inputs.wholesaleFee;

  return (
    <>
      <header className="hero-panel">
        <p className="eyebrow">Deal analysis</p>
        <h1>Deal Calculator</h1>
        <p>Model purchase, rehab, and exit costs to see profit and ROI in real time.</p>
      </header>

      <div className="layout-grid">
        <section className="panel">
          <h2>Inputs</h2>
          <div className="form-grid">
            {FIELDS.map((field) => (
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
            <div className="kpi-grid">
              <div className="kpi"><p className="kpi-label">Profit</p><p className="kpi-value">{formatCurrency(results.profit)}</p></div>
              <div className="kpi"><p className="kpi-label">ROI</p><p className="kpi-value">{results.roi.toFixed(1)}%</p></div>
              <div className="kpi"><p className="kpi-label">Offer spread</p><p className="kpi-value">{formatCurrency(spread)}</p></div>
            </div>
            <p className={results.profit >= 0 ? 'good-deal' : 'bad-deal'}>
              {results.profit >= 0 ? '✓ Good deal signal' : '✗ Review assumptions'}
            </p>
          </div>
        </section>

        <section className="panel">
          <h2>Rehab estimator</h2>
          <div className="rehab-list">
            {REHAB.map((item) => (
              <div key={item.category} className="rehab-card">
                <span>{item.category}</span>
                <strong>{item.range}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
