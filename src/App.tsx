import { useMemo, useState } from 'react';
import { SellerLeadManager } from './pages/SellerLeadManager';
import { BuyerDirectory } from './pages/BuyerDirectory';
import { MarketHeatmap } from './pages/MarketHeatmap';
import { PropertySearch } from './pages/PropertySearch';
import { AIAnalyzer } from './pages/AIAnalyzer';
import { AdvancedResearch } from './pages/AdvancedResearch';

type Page = 'dashboard' | 'calculator' | 'markets' | 'properties' | 'sellers' | 'buyers' | 'ai' | 'research';

function formatCurrency(value: number) {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function calculateWholesaleDeal(inputs: {
  purchasePrice: number;
  repairBudget: number;
  arv: number;
  sellingCosts: number;
  holdingCosts: number;
  wholesaleFee: number;
}) {
  const { purchasePrice, repairBudget, arv, sellingCosts, holdingCosts, wholesaleFee } = inputs;
  const totalInvestment = purchasePrice + repairBudget + holdingCosts + sellingCosts;
  const exitNet = arv - sellingCosts - wholesaleFee;
  const profit = exitNet - totalInvestment;
  const roi = totalInvestment > 0 ? (profit / totalInvestment) * 100 : 0;
  return { totalInvestment, exitNet, profit, roi };
}

const marketData = [
  { city: 'Atlanta, GA', score: 86, trend: 'Rising', avgRent: 1800 },
  { city: 'Phoenix, AZ', score: 82, trend: 'Strong', avgRent: 1650 },
  { city: 'Charlotte, NC', score: 79, trend: 'Heating', avgRent: 1700 },
  { city: 'Tampa, FL', score: 77, trend: 'Growing', avgRent: 1750 },
  { city: 'Dallas, TX', score: 81, trend: 'Stable', avgRent: 1900 },
];

const sampleComps = [
  { address: '4812 Maple St', price: 285000, beds: 3, baths: 2, date: '30 days ago' },
  { address: '1528 Oak Ave', price: 299900, beds: 4, baths: 2, date: '24 days ago' },
  { address: '2371 Birch Rd', price: 275000, beds: 3, baths: 2, date: '18 days ago' },
];

const rehabEstimates = [
  { category: 'Kitchen', range: '$12k - $18k' },
  { category: 'Bathrooms', range: '$8k - $12k' },
  { category: 'Roof', range: '$6k - $10k' },
  { category: 'Paint + Flooring', range: '$5k - $8k' },
  { category: 'Systems / Misc', range: '$4k - $7k' },
];

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [inputs, setInputs] = useState({
    purchasePrice: 120000,
    repairBudget: 22000,
    arv: 185000,
    sellingCosts: 12000,
    holdingCosts: 3000,
    wholesaleFee: 10000,
  });

  const results = useMemo(() => calculateWholesaleDeal(inputs), [inputs]);

  const navItems: { label: string; page: Page }[] = [
    { label: 'Dashboard', page: 'dashboard' },
    { label: 'Calculator', page: 'calculator' },
    { label: 'Markets', page: 'markets' },
    { label: 'Properties', page: 'properties' },
    { label: 'Sellers', page: 'sellers' },
    { label: 'Buyers', page: 'buyers' },
    { label: 'AI Analyzer', page: 'ai' },
    { label: 'Advanced Research', page: 'research' },
  ];

  if (currentPage === 'sellers') return <SellerLeadManager />;
  if (currentPage === 'buyers') return <BuyerDirectory />;
  if (currentPage === 'markets') return <MarketHeatmap />;
  if (currentPage === 'properties') return <PropertySearch />;
  if (currentPage === 'ai') return <AIAnalyzer />;
  if (currentPage === 'research') return <AdvancedResearch />;

  return (
    <div className="page-shell">
      <nav className="top-nav">
        {navItems.map((item) => (
          <button
            key={item.page}
            className={`nav-button ${currentPage === item.page ? 'active' : ''}`}
            onClick={() => setCurrentPage(item.page)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {currentPage === 'calculator' && (
        <main className="layout-grid">
          <section className="panel">
            <h2>Deal calculator</h2>
            <div className="form-grid">
              {(
                [
                  { label: 'Purchase price', key: 'purchasePrice' },
                  { label: 'Repair budget', key: 'repairBudget' },
                  { label: 'ARV (after repair value)', key: 'arv' },
                  { label: 'Selling costs', key: 'sellingCosts' },
                  { label: 'Holding costs', key: 'holdingCosts' },
                  { label: 'Wholesale fee', key: 'wholesaleFee' },
                ] as const
              ).map((field) => (
                <label key={field.key}>
                  <span>{field.label}</span>
                  <input
                    type="number"
                    value={inputs[field.key]}
                    min={0}
                    step={1000}
                    onChange={(event) =>
                      setInputs((current) => ({
                        ...current,
                        [field.key]: Number(event.target.value),
                      }))
                    }
                  />
                </label>
              ))}
            </div>

            <div className="results-card">
              <p>
                <strong>Profit:</strong> {formatCurrency(results.profit)}
              </p>
              <p>
                <strong>ROI:</strong> {results.roi.toFixed(1)}%
              </p>
              <p>
                <strong>Offer spread:</strong> {formatCurrency(inputs.arv - inputs.repairBudget - inputs.sellingCosts - inputs.wholesaleFee)}
              </p>
              <p className={results.profit >= 0 ? 'good-deal' : 'bad-deal'}>
                {results.profit >= 0 ? 'Good deal signal' : 'Review assumptions'}
              </p>
            </div>
          </section>

          <section className="panel">
            <h2>Quick reference</h2>
            <div className="reference-section">
              <h3>Rehab estimator</h3>
              <div className="rehab-list">
                {rehabEstimates.map((item) => (
                  <div key={item.category} className="rehab-card">
                    <span>{item.category}</span>
                    <strong>{item.range}</strong>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </main>
      )}

      {currentPage === 'dashboard' && (
        <div>
          <header className="hero-panel">
            <div>
              <p className="eyebrow">Wholesale research and deal analyzer</p>
              <h1>Wholesale Intelligence Lab</h1>
              <p>Input your numbers, compare comps, and evaluate deals across hot U.S. markets.</p>
            </div>
          </header>

          <main className="layout-grid">
            <section className="panel">
              <h2>Quick calculator</h2>
              <div className="form-grid">
                {(
                  [
                    { label: 'Purchase price', key: 'purchasePrice' },
                    { label: 'Repair budget', key: 'repairBudget' },
                    { label: 'ARV', key: 'arv' },
                    { label: 'Selling costs', key: 'sellingCosts' },
                  ] as const
                ).map((field) => (
                  <label key={field.key}>
                    <span>{field.label}</span>
                    <input
                      type="number"
                      value={inputs[field.key]}
                      min={0}
                      step={1000}
                      onChange={(event) =>
                        setInputs((current) => ({
                          ...current,
                          [field.key]: Number(event.target.value),
                        }))
                      }
                    />
                  </label>
                ))}
              </div>

              <div className="results-card">
                <p>
                  <strong>Profit:</strong> {formatCurrency(results.profit)}
                </p>
                <p className={results.profit >= 0 ? 'good-deal' : 'bad-deal'}>
                  {results.profit >= 0 ? '✓ Good deal' : '✗ Review'}
                </p>
              </div>

              <button onClick={() => setCurrentPage('calculator')} style={{ marginTop: '16px', width: '100%' }}>
                Full calculator
              </button>
            </section>

            <section className="panel">
              <h2>Hot markets</h2>
              <div className="market-list">
                {marketData.slice(0, 3).map((market) => (
                  <div key={market.city} className="market-card">
                    <strong>{market.city}</strong>
                    <p>Heat: {market.score}</p>
                    <p>{market.trend}</p>
                  </div>
                ))}
              </div>
              <button onClick={() => setCurrentPage('markets')} style={{ marginTop: '16px', width: '100%' }}>
                View all markets
              </button>
            </section>

            <section className="panel">
              <h2>Comps</h2>
              <div className="comp-list">
                {sampleComps.slice(0, 2).map((item) => (
                  <div key={item.address} className="comp-card">
                    <p className="comp-address">{item.address}</p>
                    <p>{formatCurrency(item.price)}</p>
                  </div>
                ))}
              </div>
              <button onClick={() => setCurrentPage('properties')} style={{ marginTop: '16px', width: '100%' }}>
                Search properties
              </button>
            </section>

            <section className="panel">
              <h2>Team</h2>
              <div style={{ display: 'grid', gap: '12px' }}>
                <button onClick={() => setCurrentPage('sellers')}>Manage sellers</button>
                <button onClick={() => setCurrentPage('buyers')}>Buyer directory</button>
              </div>
            </section>

            <section className="panel">
              <h2>AI & Research</h2>
              <div style={{ display: 'grid', gap: '12px' }}>
                <button onClick={() => setCurrentPage('ai')}>AI deal analyzer</button>
                <button onClick={() => setCurrentPage('research')}>Advanced research</button>
              </div>
            </section>
          </main>
        </div>
      )}
    </div>
  );
}

export default App;
