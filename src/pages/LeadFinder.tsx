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

const fmtUSD = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

// Conservative opening cash offer for a wholesale deal: ~65% of assessed value,
// rounded to the nearest $1k. This is your negotiation ceiling guide, not a
// number to put in the first letter.
function suggestedOffer(assessedValue: number | null): number {
  if (!assessedValue || assessedValue <= 0) return 0;
  return Math.round((assessedValue * 0.65) / 1000) * 1000;
}

function buildLetter(lead: PropertyLead, yourName: string, yourPhone: string): string {
  const name = lead.owner_name || 'Property Owner';
  const who = yourName.trim() || '[Your Name]';
  const phone = yourPhone.trim() || '[Your Phone]';
  return [
    `Dear ${name},`,
    '',
    `My name is ${who}, and I'm a local real estate investor here in Washington, DC. I'm reaching out because I'd like to buy your property at ${lead.address}.`,
    '',
    'I purchase homes directly from owners — as-is, with no repairs, no agent commissions, and no fees. I can pay cash and close on your timeline, whether that is two weeks or two months from now.',
    '',
    `If you have ever thought about selling — or are just curious what it's worth — call or text me at ${phone} for a no-obligation cash offer. No pressure, just a quick conversation.`,
    '',
    'Sincerely,',
    who,
    phone,
  ].join('\n');
}

function csvCell(v: string | number | null): string {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

function exportMailCampaign(rows: PropertyLead[], yourName: string, yourPhone: string) {
  const mailable = rows.filter((l) => l.owner_name && l.owner_address);
  const headers = ['Owner', 'Mailing Address', 'Property Address', 'Ward', 'Score', 'Signals', 'Assessed Value', 'Suggested Max Offer', 'Letter'];
  const lines = mailable.map((l) => {
    const signals: string[] = JSON.parse(l.signals ?? '[]');
    const labels = signals.map((s) => SIGNAL_LABELS[s] ?? s).join('; ');
    const offer = suggestedOffer(l.assessed_value);
    return [
      csvCell(l.owner_name),
      csvCell(l.owner_address),
      csvCell(l.address),
      csvCell(l.ward),
      csvCell(l.score),
      csvCell(labels),
      csvCell(l.assessed_value ? fmtUSD(l.assessed_value) : ''),
      csvCell(offer ? fmtUSD(offer) : ''),
      csvCell(buildLetter(l, yourName, yourPhone)),
    ].join(',');
  });
  const csv = [headers.map(csvCell).join(','), ...lines].join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dc-mail-campaign-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  return mailable.length;
}

export default function LeadFinder() {
  const [ward, setWard] = useState('');
  const [minScore, setMinScore] = useState('');
  const [status, setStatus] = useState('new');
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState('');
  const [actionState, setActionState] = useState<Record<string, boolean>>({});
  const [yourName, setYourName] = useState('');
  const [yourPhone, setYourPhone] = useState('');
  const [exportMsg, setExportMsg] = useState('');

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

  function handleExport() {
    if (!leads.data || leads.data.length === 0) return;
    const n = exportMailCampaign(leads.data, yourName, yourPhone);
    setExportMsg(
      n === 0
        ? 'No mailable leads (missing owner/address) in the current view.'
        : `Exported ${n} ready-to-mail letters. Open the CSV in Excel/Google Sheets, or hand it to a mail house. Each row has the owner, mailing address, your suggested max offer, and a personalized letter.`,
    );
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

      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '14px 18px', marginBottom: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>📬 Direct Mail Campaign</div>
        <div style={{ fontSize: 13, color: '#374151', marginBottom: 10 }}>
          Turn the leads below into ready-to-send letters. Every owner has a mailing address — this is your free way to start the conversation. Enter your contact info, then download the CSV (owner, mailing address, suggested max offer, and a personalized letter per lead).
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            placeholder="Your name"
            value={yourName}
            onChange={(e) => setYourName(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #d1d5db', width: 180 }}
          />
          <input
            placeholder="Your phone (call/text)"
            value={yourPhone}
            onChange={(e) => setYourPhone(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #d1d5db', width: 200 }}
          />
          <button
            onClick={handleExport}
            disabled={!leads.data || leads.data.length === 0}
            style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontWeight: 600 }}
          >
            Export Mail Campaign ({total})
          </button>
        </div>
        {exportMsg && <p style={{ fontSize: 12, color: '#15803d', marginTop: 8, marginBottom: 0 }}>{exportMsg}</p>}
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
                <th style={{ padding: '8px 12px' }}>Est. Offer</th>
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
                    <td style={{ padding: '8px 12px', color: '#15803d', fontWeight: 600 }}>
                      {suggestedOffer(lead.assessed_value) ? fmtUSD(suggestedOffer(lead.assessed_value)) : '—'}
                    </td>
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
