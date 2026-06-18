import { useState } from 'react';

interface MarketTrendData {
  metro?: string;
  series_id?: string;
  observations?: Array<{ date: string; value: string }>;
  error?: string;
  success?: boolean;
}

interface NeighborhoodData {
  zipCode?: string;
  population?: number;
  medianIncome?: number;
  povertyRate?: number;
  error?: string;
  success?: boolean;
}

interface GeocodeResult {
  address?: string;
  latitude?: string;
  longitude?: string;
  error?: string;
  success?: boolean;
}

export function AdvancedResearch() {
  const [marketTrends, setMarketTrends] = useState<MarketTrendData | null>(null);
  const [selectedMetro, setSelectedMetro] = useState('Atlanta');
  const [loadingTrends, setLoadingTrends] = useState(false);

  const [neighborhood, setNeighborhood] = useState<NeighborhoodData | null>(null);
  const [zipCode, setZipCode] = useState('30303');
  const [loadingNeighborhood, setLoadingNeighborhood] = useState(false);

  const [geocodeResult, setGeocodeResult] = useState<GeocodeResult | null>(null);
  const [geocodeAddress, setGeocodeAddress] = useState('');
  const [geocodeCity, setGeocodeCity] = useState('');
  const [geocodeState, setGeocodeState] = useState('');
  const [loadingGeocode, setLoadingGeocode] = useState(false);

  const metros = ['Atlanta', 'Phoenix', 'Dallas', 'Denver', 'Tampa', 'Charlotte', 'Austin', 'Nashville'];

  const handleGetMarketTrends = async () => {
    setLoadingTrends(true);
    try {
      const response = await fetch(`http://localhost:5000/api/market-trends/${selectedMetro}`);
      const result = await response.json();
      setMarketTrends(result);
    } catch (error) {
      console.error('Error fetching market trends:', error);
    }
    setLoadingTrends(false);
  };

  const handleGetNeighborhood = async () => {
    setLoadingNeighborhood(true);
    try {
      const response = await fetch(`http://localhost:5000/api/neighborhood/${zipCode}`);
      const result = await response.json();
      setNeighborhood(result);
    } catch (error) {
      console.error('Error fetching neighborhood data:', error);
    }
    setLoadingNeighborhood(false);
  };

  const handleGeocode = async () => {
    setLoadingGeocode(true);
    try {
      const params = new URLSearchParams({
        address: geocodeAddress,
        city: geocodeCity,
        state: geocodeState,
      });
      const response = await fetch(`http://localhost:5000/api/geocode?${params}`);
      const result = await response.json();
      setGeocodeResult(result);
    } catch (error) {
      console.error('Error geocoding address:', error);
    }
    setLoadingGeocode(false);
  };

  return (
    <div className="page-shell">
      <header className="hero-panel">
        <h1>Advanced Market Research</h1>
        <p>Dive deep into market trends, neighborhood data, and property locations using live government APIs.</p>
      </header>

      <main className="layout-single">
        {/* Market Trends */}
        <section className="panel">
          <h2>Market Trends (FRED Data)</h2>
          <p style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '16px' }}>
            Quarterly price trends powered by Federal Reserve Economic Data
          </p>
          <div className="form-grid">
            <label>
              <span>Select Metro Area</span>
              <select value={selectedMetro} onChange={(e) => setSelectedMetro(e.target.value)}>
                {metros.map((metro) => (
                  <option key={metro} value={metro}>
                    {metro}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={handleGetMarketTrends}
              disabled={loadingTrends}
              style={{ gridColumn: '1 / -1' }}
            >
              {loadingTrends ? 'Loading...' : 'Get Market Trends'}
            </button>
          </div>

          {marketTrends && (
            <div className="results-card" style={{ marginTop: '24px' }}>
              {marketTrends.error ? (
                <p style={{ color: '#b91c1c' }}>Error: {marketTrends.error}</p>
              ) : (
                <div>
                  <p>
                    <strong>{marketTrends.metro} Market Trends</strong>
                  </p>
                  <p style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '12px' }}>
                    Series ID: {marketTrends.series_id}
                  </p>
                  {marketTrends.observations && marketTrends.observations.length > 0 ? (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                            <th style={{ textAlign: 'left', padding: '8px' }}>Date</th>
                            <th style={{ textAlign: 'right', padding: '8px' }}>% Change</th>
                          </tr>
                        </thead>
                        <tbody>
                          {marketTrends.observations.slice(0, 10).map((obs, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                              <td style={{ padding: '8px' }}>{obs.date}</td>
                              <td style={{ textAlign: 'right', padding: '8px', color: parseFloat(obs.value) > 0 ? '#047857' : '#b91c1c' }}>
                                {obs.value}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p style={{ color: '#6b7280' }}>No data available</p>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Neighborhood Demographics */}
        <section className="panel">
          <h2>Neighborhood Demographics (Census API)</h2>
          <p style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '16px' }}>
            Population, income, and poverty data by zip code
          </p>
          <div className="form-grid">
            <label>
              <span>ZIP Code</span>
              <input
                type="text"
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value)}
                placeholder="e.g., 30303"
              />
            </label>
            <button onClick={handleGetNeighborhood} disabled={loadingNeighborhood}>
              {loadingNeighborhood ? 'Loading...' : 'Get Demographics'}
            </button>
          </div>

          {neighborhood && (
            <div className="results-card" style={{ marginTop: '24px' }}>
              {neighborhood.error ? (
                <p style={{ color: '#b91c1c' }}>Error: {neighborhood.error}</p>
              ) : (
                <div>
                  <p>
                    <strong>ZIP Code {neighborhood.zipCode}</strong>
                  </p>
                  <p>Population: {neighborhood.population?.toLocaleString() || 'N/A'}</p>
                  <p>Median Income: ${neighborhood.medianIncome?.toLocaleString() || 'N/A'}</p>
                  <p>Poverty Rate: {neighborhood.povertyRate || 'N/A'}%</p>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Geocoding */}
        <section className="panel">
          <h2>Geocode Address</h2>
          <p style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '16px' }}>
            Convert addresses to coordinates (powered by OpenStreetMap)
          </p>
          <div className="form-grid">
            <input
              type="text"
              placeholder="Address"
              value={geocodeAddress}
              onChange={(e) => setGeocodeAddress(e.target.value)}
            />
            <input
              type="text"
              placeholder="City"
              value={geocodeCity}
              onChange={(e) => setGeocodeCity(e.target.value)}
            />
            <input
              type="text"
              placeholder="State"
              value={geocodeState}
              onChange={(e) => setGeocodeState(e.target.value)}
            />
            <button
              onClick={handleGeocode}
              disabled={loadingGeocode || !geocodeAddress}
              style={{ gridColumn: '1 / -1' }}
            >
              {loadingGeocode ? 'Geocoding...' : 'Geocode Address'}
            </button>
          </div>

          {geocodeResult && (
            <div className="results-card" style={{ marginTop: '24px' }}>
              {geocodeResult.error ? (
                <p style={{ color: '#b91c1c' }}>Error: {geocodeResult.error}</p>
              ) : (
                <div>
                  <p>
                    <strong>Address:</strong> {geocodeResult.address}
                  </p>
                  <p>
                    <strong>Latitude:</strong> {geocodeResult.latitude}
                  </p>
                  <p>
                    <strong>Longitude:</strong> {geocodeResult.longitude}
                  </p>
                  <p style={{ fontSize: '0.9rem', color: '#6b7280', marginTop: '12px' }}>
                    Copy these coordinates to Google Maps or use in your app
                  </p>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="panel">
          <h2>💡 API Guide</h2>
          <div style={{ fontSize: '0.9rem', lineHeight: '1.8', color: '#374151' }}>
            <p>
              <strong>Market Trends (FRED):</strong> Quarterly home price % changes from Federal Reserve
            </p>
            <p>
              <strong>Demographics (Census):</strong> Population, income, poverty data by ZIP
            </p>
            <p>
              <strong>Geocoding (OpenStreetMap):</strong> Free, unlimited address to coordinates
            </p>
            <p style={{ color: '#6b7280', marginTop: '12px' }}>
              ℹ️ All APIs are free or include generous free tiers
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
