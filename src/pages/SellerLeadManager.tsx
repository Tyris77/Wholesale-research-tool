import { useState } from 'react';
import { getSellers, createSeller, updateSeller } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorBanner, Empty } from '../components/states';
import type { Seller, NewSeller } from '../api/types';

const EMPTY: NewSeller = {
  name: '', phone: '', email: '', property_address: '', property_city: '', property_state: '', motivation: '',
};

export function SellerLeadManager() {
  const list = useAsync<Seller[]>(getSellers, true);
  const [form, setForm] = useState<NewSeller>(EMPTY);
  const [saveError, setSaveError] = useState<string | null>(null);

  const sellers = list.data ?? [];

  const handleAdd = async () => {
    if (!form.name) return;
    setSaveError(null);
    try {
      const created = await createSeller(form);
      list.setData([created, ...sellers]);
      setForm(EMPTY);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleStatus = async (id: string, status: string) => {
    const seller = sellers.find((s) => s.id === id);
    if (!seller) return;
    list.setData(sellers.map((s) => (s.id === id ? { ...s, status } : s)));
    try {
      await updateSeller(id, { ...seller, status });
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <header className="hero-panel">
        <h1>Seller Lead Manager</h1>
        <p>Track and manage off-market seller leads and opportunities.</p>
      </header>

      <div className="layout-single">
        <section className="panel">
          <h2>Add new seller</h2>
          <div className="form-grid">
            <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input type="tel" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <input placeholder="Property address" value={form.property_address} onChange={(e) => setForm({ ...form, property_address: e.target.value })} />
            <input placeholder="City" value={form.property_city} onChange={(e) => setForm({ ...form, property_city: e.target.value })} />
            <input placeholder="State" value={form.property_state} onChange={(e) => setForm({ ...form, property_state: e.target.value })} />
            <textarea placeholder="Motivation (pre-foreclosure, relocation, etc.)" value={form.motivation} onChange={(e) => setForm({ ...form, motivation: e.target.value })} />
            <button onClick={handleAdd} disabled={!form.name}>Add seller</button>
          </div>
          {saveError && <ErrorBanner message={saveError} />}
        </section>

        <section className="panel">
          <h2>Active leads ({sellers.length})</h2>
          {list.loading && <Loading label="Loading leads…" />}
          {list.error && <ErrorBanner message={list.error} onRetry={() => list.run()} />}
          {!list.loading && !list.error && sellers.length === 0 && <Empty message="No seller leads yet. Add one above." />}
          <div className="seller-list">
            {sellers.map((seller) => (
              <div key={seller.id} className="seller-card">
                <div className="seller-header">
                  <strong>{seller.name}</strong>
                  <select value={seller.status} onChange={(e) => handleStatus(seller.id, e.target.value)} className={`status-badge ${seller.status}`}>
                    <option value="new">New</option>
                    <option value="contacted">Contacted</option>
                    <option value="negotiating">Negotiating</option>
                    <option value="deal">Deal Made</option>
                    <option value="lost">Lost</option>
                  </select>
                </div>
                {seller.email && <p>{seller.email}</p>}
                {seller.phone && <p>{seller.phone}</p>}
                <p>📍 {seller.property_address}, {seller.property_city}, {seller.property_state}</p>
                {seller.motivation && <p>Motivation: {seller.motivation}</p>}
                <p className="text-muted">Added: {new Date(seller.created_at).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
