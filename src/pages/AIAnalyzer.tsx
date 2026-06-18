import { useState } from 'react';

interface DealAnalysisResult {
  success?: boolean;
  analysis?: string;
  model?: string;
  error?: string;
}

interface SellerData {
  name?: string;
  property_address?: string;
  property_city?: string;
  property_state?: string;
  motivation?: string;
  status?: string;
}

interface SellerScoreResult {
  success?: boolean;
  scoring?: string;
  error?: string;
}

export function AIAnalyzer() {
  const [dealInputs, setDealInputs] = useState({
    purchasePrice: 120000,
    repairBudget: 22000,
    arv: 185000,
    sellingCosts: 12000,
    holdingCosts: 3000,
    wholesaleFee: 10000,
  });

  const [analysis, setAnalysis] = useState<DealAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [sellerData, setSellerData] = useState<SellerData>({});
  const [sellerScore, setSellerScore] = useState<SellerScoreResult | null>(null);
  const [scoringLoading, setScoringScoringLoading] = useState(false);

  const handleAnalyzeDeal = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:5000/api/analyze-deal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dealInputs),
      });
      const result = await response.json();
      setAnalysis(result);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      setAnalysis({ error: errorMsg });
    }
    setLoading(false);
  };

  const handleScoreSeller = async () => {
    if (!sellerData.name) return;
    setScoringScoringLoading(true);
    try {
      const response = await fetch('http://localhost:5000/api/score-seller', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sellerData),
      });
      const result = await response.json();
      setSellerScore(result);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      setSellerScore({ error: errorMsg });
    }
    setScoringScoringLoading(false);
  };

  return (
    <div className="page-shell">
      <header className="hero-panel">
        <h1>AI Deal Analyzer</h1>
        <p>Get instant AI-powered insights on deals and seller leads using Groq's fastest AI.</p>
      </header>

      <main className="layout-single">
        <section className="panel">
          <h2>Deal Analysis (AI-Powered)</h2>
          <div className="form-grid">
            <label>
              <span>Purchase price</span>
              <input
                type="number"
                value={dealInputs.purchasePrice}
                onChange={(e) =>
                  setDealInputs({ ...dealInputs, purchasePrice: Number(e.target.value) })
                }
              />
            </label>
            <label>
              <span>Repair budget</span>
              <input
                type="number"
                value={dealInputs.repairBudget}
                onChange={(e) =>
                  setDealInputs({ ...dealInputs, repairBudget: Number(e.target.value) })
                }
              />
            </label>
            <label>
              <span>ARV</span>
              <input
                type="number"
                value={dealInputs.arv}
                onChange={(e) => setDealInputs({ ...dealInputs, arv: Number(e.target.value) })}
              />
            </label>
            <label>
              <span>Selling costs</span>
              <input
                type="number"
                value={dealInputs.sellingCosts}
                onChange={(e) =>
                  setDealInputs({ ...dealInputs, sellingCosts: Number(e.target.value) })
                }
              />
            </label>
            <label>
              <span>Holding costs</span>
              <input
                type="number"
                value={dealInputs.holdingCosts}
                onChange={(e) =>
                  setDealInputs({ ...dealInputs, holdingCosts: Number(e.target.value) })
                }
              />
            </label>
            <label>
              <span>Wholesale fee</span>
              <input
                type="number"
                value={dealInputs.wholesaleFee}
                onChange={(e) =>
                  setDealInputs({ ...dealInputs, wholesaleFee: Number(e.target.value) })
                }
              />
            </label>
          </div>

          <button
            onClick={handleAnalyzeDeal}
            disabled={loading}
            style={{ marginTop: '16px', width: '100%' }}
          >
            {loading ? 'Analyzing with AI...' : 'Analyze Deal with AI'}
          </button>

          {analysis && (
            <div className="results-card" style={{ marginTop: '24px' }}>
              {analysis.success ? (
                <div>
                  <p style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '12px' }}>
                    Model: {analysis.model}
                  </p>
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.95rem', lineHeight: '1.6' }}>
                    {analysis.analysis}
                  </div>
                </div>
              ) : (
                <p style={{ color: '#b91c1c' }}>Error: {analysis.error}</p>
              )}
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Seller Lead Scoring</h2>
          <p style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '16px' }}>
            Use this to score prospects from your seller leads database
          </p>

          <div className="form-grid">
            <input
              type="text"
              placeholder="Seller name"
              onChange={(e) =>
                setSellerData((prev) => ({
                  ...prev,
                  name: e.target.value,
                }))
              }
            />
            <input
              type="text"
              placeholder="Property address"
              onChange={(e) =>
                setSellerData((prev) => ({
                  ...prev,
                  property_address: e.target.value,
                }))
              }
            />
            <input
              type="text"
              placeholder="City"
              onChange={(e) =>
                setSellerData((prev) => ({
                  ...prev,
                  property_city: e.target.value,
                }))
              }
            />
            <input
              type="text"
              placeholder="State"
              onChange={(e) =>
                setSellerData((prev) => ({
                  ...prev,
                  property_state: e.target.value,
                }))
              }
            />
            <textarea
              placeholder="Motivation (pre-foreclosure, relocation, divorce, etc.)"
              onChange={(e) =>
                setSellerData((prev) => ({
                  ...prev,
                  motivation: e.target.value,
                }))
              }
              style={{ gridColumn: '1 / -1' }}
            />
            <select
              onChange={(e) =>
                setSellerData((prev) => ({
                  ...prev,
                  status: e.target.value,
                }))
              }
              style={{ gridColumn: '1 / -1' }}
            >
              <option value="new">Status: New</option>
              <option value="contacted">Status: Contacted</option>
              <option value="negotiating">Status: Negotiating</option>
            </select>
          </div>

          <button
            onClick={handleScoreSeller}
            disabled={scoringLoading || !sellerData.name}
            style={{ marginTop: '16px', width: '100%' }}
          >
            {scoringLoading ? 'Scoring...' : 'Score This Lead'}
          </button>

          {sellerScore && (
            <div className="results-card" style={{ marginTop: '24px' }}>
              {sellerScore.success ? (
                <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.95rem', lineHeight: '1.6' }}>
                  {sellerScore.scoring}
                </div>
              ) : (
                <p style={{ color: '#b91c1c' }}>Error: {sellerScore.error}</p>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
