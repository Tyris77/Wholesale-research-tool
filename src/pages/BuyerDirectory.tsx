import { useState } from 'react';
import { getBuyers, createBuyer } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorBanner, Empty } from '../components/states';
import { formatCurrency } from '../lib/deal';
import type { Buyer, NewBuyer } from '../api/types';

const EMPTY: NewBuyer = {
  name: '', phone: '', email: '', cash_available: 0, deal_types: '', preferred_areas: '', avg_deal_size: 0,
};

export function BuyerDirectory() {
  const list = useAsync<Buyer[]>(getBuyers, true);
  const [form, setForm] = useState<NewBuyer>(EMPTY);
  const [saveError, setSaveError] = useState<string | null>(null);

  const buyers = list.data ?? [];

  const handleAdd = async () => {
    if (!form.name) return;
    setSaveError(null);
    try {
      const created = await createBuyer(form);
      list.setData([created, ...buyers]);
      setForm(EMPTY);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <header className="hero-panel">
        <h1>Buyer Directory</h1>
        <p>Connect with cash buyers and investors for assignment opportunities.</p>
      </header>

      <div className="layout-single">
        <section className="panel">
          <h2>Add buyer</h2>
          <div className="form-grid">
            <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input type="tel" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <input type="number" placeholder="Cash available" value={form.cash_available} onChange={(e) => setForm({ ...form, cash_available: Number(e.target.value) })} />
            <input placeholder="Deal types (flip, rental, etc.)" value={form.deal_types} onChange={(e) => setForm({ ...form, deal_types: e.target.value })} />
            <input placeholder="Preferred areas" value={form.preferred_areas} onChange={(e) => setForm({ ...form, preferred_areas: e.target.value })} />
            <input type="number" placeholder="Average deal size" value={form.avg_deal_size} onChange={(e) => setForm({ ...form, avg_deal_size: Number(e.target.value) })} />
            <button onClick={handleAdd} disabled={!form.name}>Add buyer</button>
          </div>
          {saveError && <ErrorBanner message={saveError} />}
        </section>

        <section className="panel">
          <h2>Active buyers ({buyers.length})</h2>
          {list.loading && <Loading label="Loading buyers…" />}
          {list.error && <ErrorBanner message={list.error} onRetry={() => list.run()} />}
          {!list.loading && !list.error && buyers.length === 0 && <Empty message="No buyers yet. Add one above." />}
          <div className="buyer-list">
            {buyers.map((buyer) => (
              <div key={buyer.id} className="buyer-card">
                <strong>{buyer.name}</strong>
                <p>{buyer.email} · {buyer.phone}</p>
                <p>💰 {formatCurrency(buyer.cash_available)}</p>
                <p>Deal types: {buyer.deal_types}</p>
                <p>Areas: {buyer.preferred_areas}</p>
                <p>Avg deal: {formatCurrency(buyer.avg_deal_size)}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
