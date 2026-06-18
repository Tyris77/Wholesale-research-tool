import { useMemo, useState } from 'react';
import { calculateWholesaleDeal, formatCurrency, type DealInputs } from '../lib/deal';
import { createDeal, estimateArv } from '../api/client';
import { ErrorBanner } from '../components/states';
import type { DealInputFields } from '../api/types';

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

  const [meta, setMeta] = useState({ name: '', address: '', city: '', state: '', sqft: 1800, dealType: 'wholesale' });
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [arvMsg, setArvMsg] = useState<string | null>(null);

  const handleSave = async () => {
    setSaveError(null); setSaveMsg(null);
    if (!meta.name) { setSaveError('Give the deal a name before saving.'); return; }
    const body: DealInputFields = {
      name: meta.name, property_address: meta.address, city: meta.city, state: meta.state,
      purchase_price: inputs.purchasePrice, repair_budget: inputs.repairBudget, arv: inputs.arv,
      selling_costs: inputs.sellingCosts, holding_costs: inputs.holdingCosts, wholesale_fee: inputs.wholesaleFee,
      deal_type: meta.dealType,
    };
    try {
      const deal = await createDeal(body);
      setSaveMsg(`Saved "${deal.name}" — profit ${formatCurrency(deal.profit)}, ROI ${deal.roi.toFixed(1)}%.`);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleEstimateArv = async () => {
    setArvMsg(null);
    try {
      const r = await estimateArv(meta.city, meta.state, meta.sqft);
      if (r.success && r.estimatedArv) {
        setInputs((cur) => ({ ...cur, arv: r.estimatedArv as number }));
        setArvMsg(`ARV set to ${formatCurrency(r.estimatedArv)} from ${r.compCount} comps (median $${r.medianPricePerSqft}/sqft).`);
      } else {
        setArvMsg(r.error || 'No comps found.');
      }
    } catch (e) {
      setArvMsg(e instanceof Error ? e.message : String(e));
    }
  };

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
          <h2>Estimate ARV from comps</h2>
          <p className="section-hint">Pull recent comps for an area and set ARV to median $/sqft × square footage.</p>
          <div className="form-grid">
            <input placeholder="City" value={meta.city} onChange={(e) => setMeta({ ...meta, city: e.target.value })} />
            <input placeholder="State" value={meta.state} onChange={(e) => setMeta({ ...meta, state: e.target.value })} />
            <label>
              <span>Subject sqft</span>
              <input type="number" min={0} step={50} value={meta.sqft} onChange={(e) => setMeta({ ...meta, sqft: Number(e.target.value) })} />
            </label>
            <button onClick={handleEstimateArv}>Estimate ARV</button>
          </div>
          {arvMsg && <p className="text-muted" style={{ marginTop: 12 }}>{arvMsg}</p>}

          <h2 style={{ marginTop: 24 }}>Save this deal</h2>
          <div className="form-grid">
            <input placeholder="Deal name" value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} />
            <input placeholder="Property address" value={meta.address} onChange={(e) => setMeta({ ...meta, address: e.target.value })} />
            <label>
              <span>Deal type</span>
              <select value={meta.dealType} onChange={(e) => setMeta({ ...meta, dealType: e.target.value })}>
                <option value="wholesale">Wholesale</option>
                <option value="flip">Flip</option>
                <option value="buy_hold">Buy &amp; hold</option>
              </select>
            </label>
            <button onClick={handleSave} disabled={!meta.name}>Save deal</button>
          </div>
          {saveMsg && <p className="good-deal" style={{ marginTop: 12 }}>{saveMsg}</p>}
          {saveError && <ErrorBanner message={saveError} />}

          <h3>Rehab estimator</h3>
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
