import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getDeal, getBuyers } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorBanner } from '../components/states';
import { DOC_TYPES, defaultOverrides, buildDocument, type DocType, type DocOverrides } from '../lib/documents';
import type { Deal, Buyer } from '../api/types';

export function DocumentGenerator() {
  const { id } = useParams<{ id: string }>();
  const fetchDeal = useCallback(() => getDeal(id as string), [id]);
  const deal = useAsync<Deal>(fetchDeal, true);
  const buyers = useAsync<Buyer[]>(getBuyers, true);

  const [type, setType] = useState<DocType>('letter_of_intent');
  const [assigneeId, setAssigneeId] = useState('');
  const [overrides, setOverrides] = useState<DocOverrides | null>(null);

  // Seed the editable fields once the deal loads.
  useEffect(() => {
    if (deal.data && !overrides) setOverrides(defaultOverrides(deal.data));
  }, [deal.data, overrides]);

  if (deal.loading || !overrides) return <Loading label="Loading deal…" />;
  if (deal.error || !deal.data) return <ErrorBanner message={deal.error || 'Deal not found'} onRetry={() => deal.run()} />;

  const buyerList = buyers.data ?? [];
  const assignee = buyerList.find((b) => b.id === assigneeId) ?? null;
  const needsAssignee = type === 'assignment_agreement' && !assignee;
  const doc = needsAssignee ? null : buildDocument(type, { deal: deal.data, assignee, overrides });

  const setField = (key: keyof DocOverrides, value: string | number) =>
    setOverrides((o) => (o ? { ...o, [key]: value } : o));

  return (
    <>
      <div className="no-print">
        <header className="hero-panel">
          <p className="eyebrow">Documents</p>
          <h1>{deal.data.name}</h1>
          <p>Generate a printable document from this deal.</p>
        </header>

        <section className="panel">
          <div className="doc-tabs">
            {DOC_TYPES.map((d) => (
              <button key={d.type} className={`ghost-button ${type === d.type ? 'active' : ''}`} onClick={() => setType(d.type)}>
                {d.label}
              </button>
            ))}
          </div>

          <div className="form-grid" style={{ marginTop: 16 }}>
            <input placeholder="Your name / company (assignor)" value={overrides.assignorName} onChange={(e) => setField('assignorName', e.target.value)} />
            <input placeholder="Seller name" value={overrides.sellerName} onChange={(e) => setField('sellerName', e.target.value)} />
            <label><span>Effective date</span><input type="date" value={overrides.effectiveDate} onChange={(e) => setField('effectiveDate', e.target.value)} /></label>
            <label><span>Closing date</span><input type="date" value={overrides.closingDate} onChange={(e) => setField('closingDate', e.target.value)} /></label>
            <label><span>Offer / purchase price</span><input type="number" min={0} step={1000} value={overrides.offerPrice} onChange={(e) => setField('offerPrice', Number(e.target.value))} /></label>
            <label><span>Earnest money</span><input type="number" min={0} step={500} value={overrides.earnestMoney} onChange={(e) => setField('earnestMoney', Number(e.target.value))} /></label>
            <label><span>Assignment fee</span><input type="number" min={0} step={500} value={overrides.assignmentFee} onChange={(e) => setField('assignmentFee', Number(e.target.value))} /></label>
            <label>
              <span>Assignee (buyer)</span>
              <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                <option value="">— select buyer —</option>
                {buyerList.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
          </div>

          <div className="doc-toolbar">
            <button onClick={() => window.print()} disabled={needsAssignee}>Print / Save as PDF</button>
            <Link to="/deals"><button className="ghost-button">Back to deals</button></Link>
          </div>
          {needsAssignee && <p className="text-muted">Select an assignee (buyer) to generate the assignment agreement.</p>}
        </section>
      </div>

      {doc && (
        <article className="legal-doc">
          <h1>{doc.title}</h1>
          <div className="legal-parties">
            {doc.parties.map((p) => <p key={p.role}><strong>{p.role}:</strong> {p.name}</p>)}
          </div>
          <table className="legal-meta">
            <tbody>
              {doc.meta.map((m) => <tr key={m.label}><th>{m.label}</th><td>{m.value}</td></tr>)}
            </tbody>
          </table>
          {doc.sections.map((s, i) => (
            <section key={i} className="legal-section">
              {s.heading && <h2>{s.heading}</h2>}
              {s.paragraphs.map((p, j) => <p key={j}>{p}</p>)}
            </section>
          ))}
          <div className="legal-signatures">
            {doc.signatures.map((s) => (
              <div key={s.role} className="legal-sign">
                <span className="sign-line" />
                <span>{s.role}{s.name && s.name !== '__________' ? ` — ${s.name}` : ''}</span>
              </div>
            ))}
          </div>
          <p className="legal-disclaimer">{doc.disclaimer}</p>
        </article>
      )}
    </>
  );
}
