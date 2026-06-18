import { useState } from 'react';
import { analyzeDeal, scoreSeller } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorBanner } from '../components/states';
import type { DealInputs, DealAnalysisResult, SellerScoreInput, SellerScoreResult } from '../api/types';

export function AIAnalyzer() {
  const [deal, setDeal] = useState<DealInputs>({
    purchasePrice: 120000, repairBudget: 22000, arv: 185000,
    sellingCosts: 12000, holdingCosts: 3000, wholesaleFee: 10000,
  });
  const analysis = useAsync<DealAnalysisResult, [DealInputs]>(analyzeDeal);

  const [seller, setSeller] = useState<SellerScoreInput>({ name: '', status: 'new' });
  const scoring = useAsync<SellerScoreResult, [SellerScoreInput]>(scoreSeller);

  const dealFields: { label: string; key: keyof DealInputs }[] = [
    { label: 'Purchase price', key: 'purchasePrice' },
    { label: 'Repair budget', key: 'repairBudget' },
    { label: 'ARV', key: 'arv' },
    { label: 'Selling costs', key: 'sellingCosts' },
    { label: 'Holding costs', key: 'holdingCosts' },
    { label: 'Wholesale fee', key: 'wholesaleFee' },
  ];

  const analysisResult = analysis.data;
  const scoreResult = scoring.data;

  return (
    <>
      <header className="hero-panel">
        <h1>AI Deal Analyzer</h1>
        <p>Get instant AI-powered insights on deals and seller leads using Groq's fastest AI.</p>
      </header>

      <div className="layout-single">
        <section className="panel">
          <h2>Deal Analysis (AI-Powered)</h2>
          <div className="form-grid">
            {dealFields.map((f) => (
              <label key={f.key}>
                <span>{f.label}</span>
                <input type="number" value={deal[f.key]} onChange={(e) => setDeal({ ...deal, [f.key]: Number(e.target.value) })} />
              </label>
            ))}
          </div>
          <button onClick={() => analysis.run(deal)} disabled={analysis.loading} style={{ marginTop: 16, width: '100%' }}>
            {analysis.loading ? 'Analyzing with AI…' : 'Analyze Deal with AI'}
          </button>
          {analysis.loading && <Loading label="Asking the model…" />}
          {analysis.error && <ErrorBanner message={analysis.error} onRetry={() => analysis.run(deal)} />}
          {analysisResult && (
            <div className="results-card">
              {analysisResult.success ? (
                <>
                  <p className="text-muted">Model: {analysisResult.model}</p>
                  <div className="ai-output">{analysisResult.analysis}</div>
                </>
              ) : (
                <p className="bad-deal">Error: {analysisResult.error}</p>
              )}
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Seller Lead Scoring</h2>
          <p className="section-hint">Score a prospect from your seller leads.</p>
          <div className="form-grid">
            <input placeholder="Seller name" value={seller.name} onChange={(e) => setSeller({ ...seller, name: e.target.value })} />
            <input placeholder="Property address" onChange={(e) => setSeller({ ...seller, property_address: e.target.value })} />
            <input placeholder="City" onChange={(e) => setSeller({ ...seller, property_city: e.target.value })} />
            <input placeholder="State" onChange={(e) => setSeller({ ...seller, property_state: e.target.value })} />
            <textarea placeholder="Motivation (pre-foreclosure, relocation, divorce, etc.)" onChange={(e) => setSeller({ ...seller, motivation: e.target.value })} style={{ gridColumn: '1 / -1' }} />
            <select value={seller.status} onChange={(e) => setSeller({ ...seller, status: e.target.value })} style={{ gridColumn: '1 / -1' }}>
              <option value="new">Status: New</option>
              <option value="contacted">Status: Contacted</option>
              <option value="negotiating">Status: Negotiating</option>
            </select>
          </div>
          <button onClick={() => scoring.run(seller)} disabled={scoring.loading || !seller.name} style={{ marginTop: 16, width: '100%' }}>
            {scoring.loading ? 'Scoring…' : 'Score This Lead'}
          </button>
          {scoring.error && <ErrorBanner message={scoring.error} onRetry={() => scoring.run(seller)} />}
          {scoreResult && (
            <div className="results-card">
              {scoreResult.success ? (
                <div className="ai-output">{scoreResult.scoring}</div>
              ) : (
                <p className="bad-deal">Error: {scoreResult.error}</p>
              )}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
