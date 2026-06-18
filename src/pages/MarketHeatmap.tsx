import { getMarkets } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorBanner, Empty } from '../components/states';
import type { Market } from '../api/types';

function heatColor(score: number) {
  if (score >= 80) return '#dc2626';
  if (score >= 70) return '#f97316';
  if (score >= 60) return '#eab308';
  return '#22c55e';
}

export function MarketHeatmap() {
  const markets = useAsync<Market[]>(getMarkets, true);
  const data = markets.data ?? [];

  return (
    <>
      <header className="hero-panel">
        <h1>Market Heatmap</h1>
        <p>Discover the hottest real estate markets in the USA ranked by investment potential.</p>
      </header>

      <div className="layout-single">
        <section className="panel">
          {markets.loading && <Loading label="Loading markets…" />}
          {markets.error && <ErrorBanner message={markets.error} onRetry={() => markets.run()} />}
          {!markets.loading && !markets.error && data.length === 0 && <Empty message="No market data available." />}
          <div className="market-grid">
            {data.map((market) => (
              <div key={market.id} className="market-heat-card" style={{ borderLeftColor: heatColor(market.heat_score) }}>
                <div className="heat-header">
                  <h3>{market.city}, {market.state}</h3>
                  <div className="heat-score" style={{ backgroundColor: heatColor(market.heat_score) }}>{market.heat_score}</div>
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
      </div>
    </>
  );
}
