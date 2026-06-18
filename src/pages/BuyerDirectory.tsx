import { useState } from 'react';

interface Buyer {
  id: string;
  name: string;
  phone: string;
  email: string;
  cash_available: number;
  deal_types: string;
  preferred_areas: string;
  avg_deal_size: number;
  status: string;
  created_at: string;
}

export function BuyerDirectory() {
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [newBuyer, setNewBuyer] = useState({
    name: '',
    phone: '',
    email: '',
    cash_available: 0,
    deal_types: '',
    preferred_areas: '',
    avg_deal_size: 0,
  });

  const handleAddBuyer = async () => {
    if (!newBuyer.name || !newBuyer.email) return;

    const response = await fetch('http://localhost:5000/api/buyers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newBuyer),
    });

    const buyer = await response.json();
    setBuyers([buyer, ...buyers]);
    setNewBuyer({
      name: '',
      phone: '',
      email: '',
      cash_available: 0,
      deal_types: '',
      preferred_areas: '',
      avg_deal_size: 0,
    });
  };

  return (
    <div className="page-shell">
      <header className="hero-panel">
        <h1>Buyer Directory</h1>
        <p>Connect with cash buyers and investors for assignment opportunities.</p>
      </header>

      <main className="layout-single">
        <section className="panel">
          <h2>Add buyer</h2>
          <div className="form-grid">
            <input
              type="text"
              placeholder="Name"
              value={newBuyer.name}
              onChange={(e) => setNewBuyer({ ...newBuyer, name: e.target.value })}
            />
            <input
              type="email"
              placeholder="Email"
              value={newBuyer.email}
              onChange={(e) => setNewBuyer({ ...newBuyer, email: e.target.value })}
            />
            <input
              type="tel"
              placeholder="Phone"
              value={newBuyer.phone}
              onChange={(e) => setNewBuyer({ ...newBuyer, phone: e.target.value })}
            />
            <input
              type="number"
              placeholder="Cash available"
              value={newBuyer.cash_available}
              onChange={(e) => setNewBuyer({ ...newBuyer, cash_available: Number(e.target.value) })}
            />
            <input
              type="text"
              placeholder="Deal types (flip, rental, etc.)"
              value={newBuyer.deal_types}
              onChange={(e) => setNewBuyer({ ...newBuyer, deal_types: e.target.value })}
            />
            <input
              type="text"
              placeholder="Preferred areas"
              value={newBuyer.preferred_areas}
              onChange={(e) => setNewBuyer({ ...newBuyer, preferred_areas: e.target.value })}
            />
            <input
              type="number"
              placeholder="Average deal size"
              value={newBuyer.avg_deal_size}
              onChange={(e) => setNewBuyer({ ...newBuyer, avg_deal_size: Number(e.target.value) })}
            />
            <button onClick={handleAddBuyer}>Add buyer</button>
          </div>
        </section>

        <section className="panel">
          <h2>Active buyers ({buyers.length})</h2>
          <div className="buyer-list">
            {buyers.map((buyer) => (
              <div key={buyer.id} className="buyer-card">
                <strong>{buyer.name}</strong>
                <p>{buyer.email} · {buyer.phone}</p>
                <p>💰 {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(buyer.cash_available)}</p>
                <p>Deal types: {buyer.deal_types}</p>
                <p>Areas: {buyer.preferred_areas}</p>
                <p>Avg deal: {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(buyer.avg_deal_size)}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
