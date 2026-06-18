import { useState } from 'react';
import { getMarketTrends, getNeighborhood, geocode } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorBanner } from '../components/states';
import type { MarketTrend, Neighborhood, GeocodeResult } from '../api/types';

const METROS = ['Atlanta', 'Phoenix', 'Dallas', 'Denver', 'Tampa', 'Charlotte', 'Austin', 'Nashville'];

export function AdvancedResearch() {
  const [metro, setMetro] = useState('Atlanta');
  const trends = useAsync<MarketTrend, [string]>(getMarketTrends);

  const [zip, setZip] = useState('30303');
  const demo = useAsync<Neighborhood, [string]>(getNeighborhood);

  const [addr, setAddr] = useState({ address: '', city: '', state: '' });
  const geo = useAsync<GeocodeResult, [string, string, string]>(geocode);

  const trend = trends.data;
  const neighborhood = demo.data;
  const geocoded = geo.data;

  return (
    <>
      <header className="hero-panel">
        <h1>Advanced Market Research</h1>
        <p>Dive deep into market trends, neighborhood data, and property locations using live government APIs.</p>
      </header>

      <div className="layout-single">
        <section className="panel">
          <h2>Market Trends (FRED Data)</h2>
          <p className="section-hint">Quarterly price trends powered by Federal Reserve Economic Data.</p>
          <div className="form-grid">
            <label>
              <span>Select Metro Area</span>
              <select value={metro} onChange={(e) => setMetro(e.target.value)}>
                {METROS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <button onClick={() => trends.run(metro)} disabled={trends.loading} style={{ gridColumn: '1 / -1' }}>
              {trends.loading ? 'Loading…' : 'Get Market Trends'}
            </button>
          </div>
          {trends.loading && <Loading />}
          {trends.error && <ErrorBanner message={trends.error} onRetry={() => trends.run(metro)} />}
          {trend && (
            <div className="results-card">
              {trend.success === false || trend.error ? (
                <p className="bad-deal">Error: {trend.error}</p>
              ) : (
                <>
                  <p><strong>{trend.metro} Market Trends</strong></p>
                  <p className="text-muted">Series ID: {trend.series_id}</p>
                  {trend.observations && trend.observations.length > 0 ? (
                    <table className="data-table">
                      <thead><tr><th>Date</th><th className="num">% Change</th></tr></thead>
                      <tbody>
                        {trend.observations.slice(0, 10).map((obs, i) => (
                          <tr key={i}>
                            <td>{obs.date}</td>
                            <td className="num" style={{ color: parseFloat(obs.value) > 0 ? '#047857' : '#b91c1c' }}>{obs.value}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-muted">No data available</p>
                  )}
                </>
              )}
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Neighborhood Demographics (Census API)</h2>
          <p className="section-hint">Population, income, and poverty data by zip code.</p>
          <div className="form-grid">
            <label>
              <span>ZIP Code</span>
              <input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="e.g., 30303" />
            </label>
            <button onClick={() => demo.run(zip)} disabled={demo.loading}>{demo.loading ? 'Loading…' : 'Get Demographics'}</button>
          </div>
          {demo.loading && <Loading />}
          {demo.error && <ErrorBanner message={demo.error} onRetry={() => demo.run(zip)} />}
          {neighborhood && (
            <div className="results-card">
              {neighborhood.success === false || neighborhood.error ? (
                <p className="bad-deal">Error: {neighborhood.error}</p>
              ) : (
                <>
                  <p><strong>ZIP Code {neighborhood.zipCode}</strong></p>
                  <p>Population: {neighborhood.population?.toLocaleString() ?? 'N/A'}</p>
                  <p>Median Income: ${neighborhood.medianIncome?.toLocaleString() ?? 'N/A'}</p>
                  <p>Poverty Rate: {neighborhood.povertyRate ?? 'N/A'}%</p>
                </>
              )}
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Geocode Address</h2>
          <p className="section-hint">Convert addresses to coordinates (powered by OpenStreetMap).</p>
          <div className="form-grid">
            <input placeholder="Address" value={addr.address} onChange={(e) => setAddr({ ...addr, address: e.target.value })} />
            <input placeholder="City" value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} />
            <input placeholder="State" value={addr.state} onChange={(e) => setAddr({ ...addr, state: e.target.value })} />
            <button onClick={() => geo.run(addr.address, addr.city, addr.state)} disabled={geo.loading || !addr.address} style={{ gridColumn: '1 / -1' }}>
              {geo.loading ? 'Geocoding…' : 'Geocode Address'}
            </button>
          </div>
          {geo.loading && <Loading />}
          {geo.error && <ErrorBanner message={geo.error} onRetry={() => geo.run(addr.address, addr.city, addr.state)} />}
          {geocoded && (
            <div className="results-card">
              {geocoded.success === false || geocoded.error ? (
                <p className="bad-deal">Error: {geocoded.error}</p>
              ) : (
                <>
                  <p><strong>Address:</strong> {geocoded.address}</p>
                  <p><strong>Latitude:</strong> {geocoded.latitude}</p>
                  <p><strong>Longitude:</strong> {geocoded.longitude}</p>
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
