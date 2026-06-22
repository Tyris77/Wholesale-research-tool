import { useState } from 'react';
import { useAsync } from '../hooks/useAsync';
import { getCashBuyers, findCashBuyers, saveCashBuyer } from '../api/client';
import type { CashBuyer } from '../api/types';

const fmtUSD = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function csvCell(v: string | number | null): string {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

function exportBuyers(rows: CashBuyer[]) {
  const headers = ['Buyer', 'Mailing Address', 'State', 'Properties Bought', 'Total Spend', 'Avg Price', 'Buys In (ZIPs)', 'Last Purchase'];
  const lines = rows.map((b) => [
    csvCell(b.name),
    csvCell(b.mailing_address),
    csvCell(b.buyer_state),
    csvCell(b.purchase_count),
    csvCell(b.total_spend ? fmtUSD(b.total_spend) : ''),
    csvCell(b.avg_price ? fmtUSD(b.avg_price) : ''),
    csvCell(JSON.parse(b.zips ?? '[]').join('; ')),
    csvCell(b.last_purchase_date),
  ].join(','));
  const csv = [headers.map(csvCell).join(','), ...lines].join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dc-cash-buyers-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CashBuyers() {
  const [minPurchases, setMinPurchases] = useState('2');
  const [searching, setSearching] = useState(false);
  const [searchMsg, setSearchMsg] = useState('');
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const buyers = useAsync(
    () => getCashBuyers({ minPurchases: minPurchases ? Number(minPurchases) : undefined }),
    true,
  );

  const total = buyers.data?.length ?? 0;
  const savedCount = buyers.data?.filter((b) => b.saved).length ?? 0;

  async function handleSearch() {
    setSearching(true);
    setSearchMsg('');
    try {
      const r = await findCashBuyers();
      setSearchMsg(r.message);
    } catch {
      setSearchMsg('Search failed — check server logs.');
    } finally {
      setSearching(false);
    }
  }

  async function handleSave(b: CashBuyer) {
    setSaving((p) => ({ ...p, [b.id]: true }));
    try {
      await saveCashBuyer(b.id);
      buyers.run();
    } finally {
      setSaving((p) => ({ ...p, [b.id]: false }));
    }
  }

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Cash Buyers</h1>
        <button
          onClick={handleSearch}
          disabled={searching}
          style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer' }}
        >
          {searching ? 'Searching...' : 'Find Cash Buyers'}
        </button>
      </div>

      <p style={{ color: '#6b7280', marginTop: 0, marginBottom: 12, fontSize: 14 }}>
        Active DC investors who've recently bought non-owner-occupied homes in the wholesale price range — the people who'll take your assignment. Built from public sale records, ranked by how many they've bought.
      </p>
      {searchMsg && <p style={{ color: '#6b7280', marginBottom: 12 }}>{searchMsg}</p>}

      <div style={{ display: 'flex', gap: 24, marginBottom: 20 }}>
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '12px 20px' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#15803d' }}>{total}</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Active Cash Buyers</div>
        </div>
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 20px' }}>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{savedCount}</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Saved to My Buyers</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, color: '#374151' }}>Min properties bought:</label>
        <input
          type="number"
          value={minPurchases}
          onChange={(e) => setMinPurchases(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #d1d5db', width: 80 }}
        />
        <button onClick={() => buyers.run()} style={{ padding: '6px 14px', borderRadius: 4, border: '1px solid #d1d5db', cursor: 'pointer' }}>
          Apply
        </button>
        <button
          onClick={() => buyers.data && exportBuyers(buyers.data)}
          disabled={!buyers.data || buyers.data.length === 0}
          style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontWeight: 600 }}
        >
          Export Buyer List ({total})
        </button>
      </div>

      {buyers.loading && <p>Loading buyers...</p>}
      {buyers.error && <p style={{ color: '#dc2626' }}>Error: {buyers.error}</p>}
      {buyers.data && buyers.data.length === 0 && (
        <p style={{ color: '#6b7280' }}>No cash buyers yet. Click "Find Cash Buyers" to scan DC sale records.</p>
      )}

      {buyers.data && buyers.data.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                <th style={{ padding: '8px 12px' }}>Buyer</th>
                <th style={{ padding: '8px 12px' }}>Bought</th>
                <th style={{ padding: '8px 12px' }}>Total Spend</th>
                <th style={{ padding: '8px 12px' }}>Avg Price</th>
                <th style={{ padding: '8px 12px' }}>Buys In</th>
                <th style={{ padding: '8px 12px' }}>Mailing Address</th>
                <th style={{ padding: '8px 12px' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {buyers.data.map((b) => {
                const zips: string[] = JSON.parse(b.zips ?? '[]');
                const busy = saving[b.id];
                return (
                  <tr key={b.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 500 }}>{b.name}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{ background: '#15803d', color: '#fff', borderRadius: 4, padding: '2px 8px', fontWeight: 700, fontSize: 12 }}>
                        {b.purchase_count}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px' }}>{b.total_spend ? fmtUSD(b.total_spend) : '—'}</td>
                    <td style={{ padding: '8px 12px' }}>{b.avg_price ? fmtUSD(b.avg_price) : '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#6b7280', fontSize: 12 }}>{zips.join(', ') || '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#6b7280', fontSize: 12 }}>{b.mailing_address ?? '—'}</td>
                    <td style={{ padding: '8px 12px' }}>
                      {b.saved ? (
                        <span style={{ fontSize: 12, color: '#15803d', fontWeight: 600 }}>✓ Saved</span>
                      ) : (
                        <button
                          disabled={busy}
                          onClick={() => handleSave(b)}
                          style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 12 }}
                        >
                          Save to Buyers
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
