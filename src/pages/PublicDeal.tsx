import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { getPublicDeal, submitInquiry } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorBanner } from '../components/states';
import { formatCurrency } from '../lib/deal';
import type { InquiryBody } from '../api/types';

export function PublicDeal() {
  const { slug } = useParams<{ slug: string }>();
  const deal = useAsync(() => getPublicDeal(slug!), true);

  const [form, setForm] = useState<InquiryBody>({ name: '', email: '', phone: '', message: '' });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      await submitInquiry(slug!, {
        name: form.name,
        email: form.email || undefined,
        phone: form.phone || undefined,
        message: form.message || undefined,
      });
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (deal.loading) {
    return (
      <div className="public-deal-page">
        <div className="public-deal-center"><Loading label="Loading deal…" /></div>
      </div>
    );
  }

  if (deal.error) {
    return (
      <div className="public-deal-page">
        <div className="public-deal-center">
          <h2>Deal unavailable</h2>
          <p>This deal is no longer available.</p>
        </div>
      </div>
    );
  }

  const d = deal.data!;

  return (
    <div className="public-deal-page">
      <header className="public-deal-header">
        <p className="eyebrow">Wholesale Deal</p>
        <h1>{d.name}</h1>
        {(d.city || d.state) && <p>{[d.city, d.state].filter(Boolean).join(', ')}</p>}
        {d.deal_type && <p className="text-muted">{d.deal_type.replace('_', ' ')}</p>}
      </header>

      <div className="public-deal-grid">
        <section className="panel">
          <h2>Deal Summary</h2>
          <div className="kpi-grid">
            <div className="kpi">
              <p className="kpi-label">Purchase Price</p>
              <p className="kpi-value">{formatCurrency(d.purchase_price)}</p>
            </div>
            <div className="kpi">
              <p className="kpi-label">ARV</p>
              <p className="kpi-value">{formatCurrency(d.arv)}</p>
            </div>
            <div className="kpi">
              <p className="kpi-label">Profit</p>
              <p className="kpi-value">{formatCurrency(d.profit)}</p>
            </div>
            <div className="kpi">
              <p className="kpi-label">ROI</p>
              <p className="kpi-value">{d.roi.toFixed(1)}%</p>
            </div>
          </div>
        </section>

        <section className="panel">
          <h2>Express Interest</h2>
          {submitted ? (
            <p className="public-deal-thanks">Thanks — we'll be in touch!</p>
          ) : (
            <form className="form-grid" onSubmit={handleSubmit}>
              <label>
                Name *
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </label>
              <label>
                Phone
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </label>
              <label>
                Message
                <textarea
                  value={form.message}
                  onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                />
              </label>
              {submitError && <ErrorBanner message={submitError} />}
              <button
                type="submit"
                disabled={submitting || !form.name.trim() || (!form.email!.trim() && !form.phone!.trim())}
              >
                {submitting ? 'Sending…' : 'Send inquiry'}
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
