import { useState } from 'react';

interface Property {
  id: string;
  address: string;
  city: string;
  state: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  sold_date: string;
  price_per_sqft: number;
  days_on_market: number;
}

export function PropertySearch() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [filters, setFilters] = useState({
    city: '',
    state: '',
    maxPrice: 500000,
    minBeds: 0,
  });
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    const params = new URLSearchParams();
    if (filters.city) params.append('city', filters.city);
    if (filters.state) params.append('state', filters.state);
    if (filters.maxPrice) params.append('maxPrice', String(filters.maxPrice));
    if (filters.minBeds) params.append('minBeds', String(filters.minBeds));

    const response = await fetch(`http://localhost:5000/api/comps?${params}`);
    const data = await response.json();
    setProperties(data);
    setSearched(true);
  };

  return (
    <div className="page-shell">
      <header className="hero-panel">
        <h1>Property Search</h1>
        <p>Find comps, analyze neighborhoods, and identify investment opportunities.</p>
      </header>

      <main className="layout-single">
        <section className="panel">
          <h2>Search properties</h2>
          <div className="form-grid">
            <input
              type="text"
              placeholder="City"
              value={filters.city}
              onChange={(e) => setFilters({ ...filters, city: e.target.value })}
            />
            <input
              type="text"
              placeholder="State"
              value={filters.state}
              onChange={(e) => setFilters({ ...filters, state: e.target.value })}
            />
            <label>
              <span>Max price</span>
              <input
                type="range"
                min={50000}
                max={1000000}
                step={10000}
                value={filters.maxPrice}
                onChange={(e) => setFilters({ ...filters, maxPrice: Number(e.target.value) })}
              />
              <p>${(filters.maxPrice / 1000).toFixed(0)}k</p>
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
            <button onClick={handleSearch} style={{ gridColumn: '1 / -1' }}>
              Search
            </button>
          </div>
        </section>

        {searched && (
          <section className="panel">
            <h2>Results ({properties.length})</h2>
            <div className="property-list">
              {properties.length === 0 ? (
                <p>No properties found</p>
              ) : (
                properties.map((prop) => (
                  <div key={prop.id} className="property-card">
                    <h4>{prop.address}</h4>
                    <p>{prop.city}, {prop.state}</p>
                    <p className="property-price">${prop.price.toLocaleString()}</p>
                    <p>{prop.beds} bed · {prop.baths} bath · {prop.sqft.toLocaleString()} sqft</p>
                    <p>${prop.price_per_sqft}/sqft</p>
                    <p className="text-muted">Sold {prop.sold_date}</p>
                  </div>
                ))
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
