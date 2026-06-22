import { useState } from 'react';
import { useAsync } from '../hooks/useAsync';
import {
  getPropertyLeads,
  promotePropertyLead,
  dismissPropertyLead,
  runPropertyIntelScan,
} from '../api/client';
import type { PropertyLead } from '../api/types';

const SIGNAL_LABELS: Record<string, string> = {
  tax_delinquent: 'Tax Delinquent',
  absentee_owner: 'Absentee',
  out_of_state: 'Out-of-State',
  vacant: 'Vacant',
  long_ownership: 'Long-Term Owner',
};

const SIGNAL_COLORS: Record<string, string> = {
  tax_delinquent: '#dc2626',
  absentee_owner: '#d97706',
  out_of_state: '#b45309',
  vacant: '#7c3aed',
  long_ownership: '#0369a1',
};

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 75 ? '#dc2626' : score >= 50 ? '#d97706' : '#6b7280';
  return (
    <span style={{
      background: color, color: '#fff', borderRadius: 4,
      padding: '2px 8px', fontWeight: 700, fontSize: 13,
    }}>
      {score}
    </span>
  );
}

function SignalChips({ signals }: { signals: string[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {signals.map((s) => (
        <span key={s} style={{
          background: SIGNAL_COLORS[s] ?? '#6b7280', color: '#fff',
          borderRadius: 4, padding: '1px 6px', fontSize: 11,
        }}>
          {SIGNAL_LABELS[s] ?? s}
        </span>
      ))}
    </div>
  );
}

export default function LeadFinder() {
  const [ward, setWard] = useState('');
  const [minScore, setMinScore] = useState('');
  const [status, setStatus] = useState('new');
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState('');
  const [actionState, setActionState] = useState<Record<string, boolean>>({});

  const leads = useAsync(
    () => getPropertyLeads({
      ward: ward || undefined,
      minScore: minScore ? Number(minScore) : undefined,
      status: status || undefined,
    }),
    true,
  );

  const hotCount = leads.data?.filter((l) => l.score >= 75).length ?? 0;
  const total = leads.data?.length ?? 0;

  async function handleScan() {
    setScanning(true);
    setScanMsg('');
    try {
      const r = await runPropertyIntelScan();
      setScanMsg(r.message);
    } catch {
      setScanMsg('Scan failed — check server logs.');
    } finally {
      setScanning(false);
    }
  }

  async function handlePromote(lead: PropertyLead) {
    setActionState((p) => ({ ...p, [lead.parcel_id]: true }));
    try {
      await promotePropertyLead(lead.parcel_id);
      leads.run();
    } finally {
      setActionState((p) => ({ ...p, [lead.parcel_id]: false }));
    }
  }

  async function handleDismiss(lead: PropertyLead) {
    setActionState((p) => ({ ...p, [lead.parcel_id]: true }));
    try {
      await dismissPropertyLead(lead.parcel_id);
      leads.run();
    } finally {
      setActionState((p) => ({ ...p, [lead.parcel_id]: false }));
    }
  }

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Lead Finder</h1>
        <button
          onClick={handleScan}
          disabled={scanning}
          style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer' }}
        >
          {scanning ? 'Scanning...' : 'Run Scan Now'}
        </button>
      </div>

      {scanMsg && <p style={{ color: '#6b7280', marginBottom: 12 }}>{scanMsg}</p>}

      <div style={{ display: 'flex', gap: 24, marginBottom: 20 }}>
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 20px' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#dc2626' }}>{hotCount}</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Hot Leads (≥75)</div>
        </div>
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 20px' }}>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{total}</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Total Leads Shown</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={ward} onChange={(e) => setWard(e.target.value)} style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #d1d5db' }}>
          <option value="">All Wards</option>
          {['Ward 1','Ward 2','Ward 3','Ward 4','Ward 5','Ward 6','Ward 7','Ward 8'].map((w) => (
            <option key={w} value={w}>{w}</option>
          ))}
        </select>
        <input
          type="number"
          placeholder="Min score"
          value={minScore}
          onChange={(e) => setMinScore(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #d1d5db', width: 100 }}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #d1d5db' }}>
          <option value="">All Statuses</option>
          <option value="new">New</option>
          <option value="promoted">Promoted</option>
          <option value="dismissed">Dismissed</option>
        </select>
        <button onClick={() => leads.run()} style={{ padding: '6px 14px', borderRadius: 4, border: '1px solid #d1d5db', cursor: 'pointer' }}>
          Apply
        </button>
      </div>

      {leads.loading && <p>Loading leads...</p>}
      {leads.error && <p style={{ color: '#dc2626' }}>Error: {leads.error}</p>}
      {leads.data && leads.data.length === 0 && (
        <p style={{ color: '#6b7280' }}>No leads yet. Click "Run Scan Now" to find motivated sellers in DC.</p>
      )}

      {leads.data && leads.data.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                <th style={{ padding: '8px 12px' }}>Address</th>
                <th style={{ padding: '8px 12px' }}>Ward</th>
                <th style={{ padding: '8px 12px' }}>Score</th>
                <th style={{ padding: '8px 12px' }}>Signals</th>
                <th style={{ padding: '8px 12px' }}>Owner</th>
                <th style={{ padding: '8px 12px' }}>Status</th>
                <th style={{ padding: '8px 12px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {leads.data.map((lead) => {
                const signals: string[] = JSON.parse(lead.signals ?? '[]');
                const busy = actionState[lead.parcel_id];
                return (
                  <tr key={lead.parcel_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 500 }}>{lead.address}</td>
                    <td style={{ padding: '8px 12px', color: '#6b7280' }}>{lead.ward ?? '—'}</td>
                    <td style={{ padding: '8px 12px' }}><ScoreBadge score={lead.score} /></td>
                    <td style={{ padding: '8px 12px' }}><SignalChips signals={signals} /></td>
                    <td style={{ padding: '8px 12px', color: '#6b7280' }}>{lead.owner_name ?? '—'}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{ fontSize: 11, textTransform: 'capitalize' }}>{lead.status}</span>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      {lead.status === 'new' && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            disabled={busy}
                            onClick={() => handlePromote(lead)}
                            style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 12 }}
                          >
                            Promote
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => handleDismiss(lead)}
                            style={{ background: '#6b7280', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 12 }}
                          >
                            Dismiss
                          </button>
                        </div>
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
