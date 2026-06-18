import { useState } from 'react';

interface Seller {
  id: string;
  name: string;
  phone: string;
  email: string;
  property_address: string;
  property_city: string;
  property_state: string;
  motivation: string;
  status: string;
  created_at: string;
  last_contacted?: string;
}

export function SellerLeadManager() {
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [newSeller, setNewSeller] = useState({
    name: '',
    phone: '',
    email: '',
    property_address: '',
    property_city: '',
    property_state: '',
    motivation: '',
  });

  const handleAddSeller = async () => {
    if (!newSeller.name || !newSeller.email) return;

    const response = await fetch('http://localhost:5000/api/sellers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSeller),
    });

    const seller = await response.json();
    setSellers([seller, ...sellers]);
    setNewSeller({
      name: '',
      phone: '',
      email: '',
      property_address: '',
      property_city: '',
      property_state: '',
      motivation: '',
    });
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    const seller = sellers.find(s => s.id === id);
    if (!seller) return;

    await fetch(`http://localhost:5000/api/sellers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...seller, status: newStatus }),
    });

    setSellers(sellers.map(s => s.id === id ? { ...s, status: newStatus } : s));
  };

  return (
    <div className="page-shell">
      <header className="hero-panel">
        <h1>Seller Lead Manager</h1>
        <p>Track and manage off-market seller leads and opportunities.</p>
      </header>

      <main className="layout-single">
        <section className="panel">
          <h2>Add new seller</h2>
          <div className="form-grid">
            <input
              type="text"
              placeholder="Name"
              value={newSeller.name}
              onChange={(e) => setNewSeller({ ...newSeller, name: e.target.value })}
            />
            <input
              type="email"
              placeholder="Email"
              value={newSeller.email}
              onChange={(e) => setNewSeller({ ...newSeller, email: e.target.value })}
            />
            <input
              type="tel"
              placeholder="Phone"
              value={newSeller.phone}
              onChange={(e) => setNewSeller({ ...newSeller, phone: e.target.value })}
            />
            <input
              type="text"
              placeholder="Property address"
              value={newSeller.property_address}
              onChange={(e) => setNewSeller({ ...newSeller, property_address: e.target.value })}
            />
            <input
              type="text"
              placeholder="City"
              value={newSeller.property_city}
              onChange={(e) => setNewSeller({ ...newSeller, property_city: e.target.value })}
            />
            <input
              type="text"
              placeholder="State"
              value={newSeller.property_state}
              onChange={(e) => setNewSeller({ ...newSeller, property_state: e.target.value })}
            />
            <textarea
              placeholder="Motivation (pre-foreclosure, relocation, etc.)"
              value={newSeller.motivation}
              onChange={(e) => setNewSeller({ ...newSeller, motivation: e.target.value })}
            />
            <button onClick={handleAddSeller}>Add seller</button>
          </div>
        </section>

        <section className="panel">
          <h2>Active leads ({sellers.length})</h2>
          <div className="seller-list">
            {sellers.map((seller) => (
              <div key={seller.id} className="seller-card">
                <div className="seller-header">
                  <strong>{seller.name}</strong>
                  <select
                    value={seller.status}
                    onChange={(e) => handleStatusChange(seller.id, e.target.value)}
                    className={`status-badge ${seller.status}`}
                  >
                    <option value="new">New</option>
                    <option value="contacted">Contacted</option>
                    <option value="negotiating">Negotiating</option>
                    <option value="deal">Deal Made</option>
                    <option value="lost">Lost</option>
                  </select>
                </div>
                <p>{seller.email}</p>
                <p>{seller.phone}</p>
                <p>📍 {seller.property_address}, {seller.property_city}, {seller.property_state}</p>
                <p>Motivation: {seller.motivation}</p>
                <p className="text-muted">Added: {new Date(seller.created_at).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
