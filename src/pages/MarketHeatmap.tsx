import { useState } from 'react';

interface Market {
  id: string;
  city: string;
  state: string;
  heat_score: number;
  trend: string;
  avg_rent: number;
  avg_home_price: number;
  days_on_market: number;
  inventory_level: string;
}

export function MarketHeatmap() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(false);

  const loadMarkets = async () => {
    setLoading(true);
    const response = await fetch('http://localhost:5000/api/markets');
    const data = await response.json();
    setMarkets(data);
    setLoading(false);
  };

  const getHeatColor = (score: number) => {
    if (score >= 80) return '#dc2626';
    if (score >= 70) return '#f97316';
    if (score >= 60) return '#eab308';
    return '#22c55e';
  };

  return (
    <div className="page-shell">
      <header className="hero-panel">
        <h1>Market Heatmap</h1>
        <p>Discover the hottest real estate markets in the USA ranked by investment potential.</p>
        <button onClick={loadMarkets} style={{ marginTop: '16px' }} disabled={loading}>
          {loading ? 'Loading...' : 'Load markets'}
        </button>
      </header>

      <main className="layout-single">
        <section className="panel">
          <div className="market-grid">
            {markets.map((market) => (
              <div
                key={market.id}
                className="market-heat-card"
                style={{ borderLeftColor: getHeatColor(market.heat_score) }}
              >
                <div className="heat-header">
                  <h3>{market.city}, {market.state}</h3>
                  <div className="heat-score" style={{ backgroundColor: getHeatColor(market.heat_score) }}>
                    {market.heat_score}
                  </div>
                </div>
                <p><strong>Trend:</strong> {market.trend}</p>
                <p><strong>Avg rent:</strong> ${market.avg_rent.toLocaleString()}</p>
                <p><strong>Avg home price:</strong> ${(market.avg_home_price / 1000).toFixed(0)}k</p>
                <p><strong>Days on market:</strong> {market.days_on_market}</p>
                <p><strong>Inventory:</strong> {market.inventory_level}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
