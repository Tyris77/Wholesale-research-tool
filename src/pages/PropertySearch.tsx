import { useState } from 'react';
import { getComps } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorBanner, Empty } from '../components/states';
import type { Comp } from '../api/types';

export function PropertySearch() {
  const search = useAsync<Comp[], [string | undefined, string | undefined]>(getComps);
  const [filters, setFilters] = useState({ city: '', state: '', maxPrice: 500000, minBeds: 0 });
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    setSearched(true);
    await search.run(filters.city || undefined, filters.state || undefined);
  };

  const results = (search.data ?? []).filter(
    (p) => p.price <= filters.maxPrice && p.beds >= filters.minBeds,
  );

  return (
    <>
      <header className="hero-panel">
        <h1>Property Search</h1>
        <p>Find comps, analyze neighborhoods, and identify investment opportunities.</p>
      </header>

      <div className="layout-single">
        <section className="panel">
          <h2>Search comps</h2>
          <div className="form-grid">
            <input placeholder="City" value={filters.city} onChange={(e) => setFilters({ ...filters, city: e.target.value })} />
            <input placeholder="State" value={filters.state} onChange={(e) => setFilters({ ...filters, state: e.target.value })} />
            <label>
              <span>Max price: ${(filters.maxPrice / 1000).toFixed(0)}k</span>
              <input type="range" min={50000} max={1000000} step={10000} value={filters.maxPrice} onChange={(e) => setFilters({ ...filters, maxPrice: Number(e.target.value) })} />
            </label>
            <label>
              <span>Min beds</span>
              <select value={filters.minBeds} onChange={(e) => setFilters({ ...filters, minBeds: Number(e.target.value) })}>
                <option value={0}>Any</option>
                <option value={2}>2+</option>
                <option value={3}>3+</option>
                <option value={4}>4+</option>
              </select>
            </label>
            <button onClick={handleSearch} style={{ gridColumn: '1 / -1' }}>Search</button>
          </div>
        </section>

        {searched && (
          <section className="panel">
            <h2>Results ({results.length})</h2>
            {search.loading && <Loading label="Searching…" />}
            {search.error && <ErrorBanner message={search.error} onRetry={handleSearch} />}
            {!search.loading && !search.error && results.length === 0 && <Empty message="No properties match your filters." />}
            <div className="property-list">
              {results.map((prop) => (
                <div key={prop.id} className="property-card">
                  <h4>{prop.address}</h4>
                  <p>{prop.city}, {prop.state}</p>
                  <p className="property-price">${prop.price.toLocaleString()}</p>
                  <p>{prop.beds} bed · {prop.baths} bath · {prop.sqft.toLocaleString()} sqft</p>
                  <p>${prop.price_per_sqft}/sqft</p>
                  <p className="text-muted">Sold {prop.sold_date}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
