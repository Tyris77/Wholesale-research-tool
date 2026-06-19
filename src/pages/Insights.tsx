import { Link } from 'react-router-dom';
import { getInsights } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorBanner, Empty } from '../components/states';
import { MiniBars, StatusBars } from '../components/charts';
import { formatCurrency } from '../lib/deal';
import type { Insights as InsightsData } from '../api/types';

export function Insights() {
  const insights = useAsync<InsightsData>(getInsights, true);

  if (insights.loading) return <Loading label="Loading insights…" />;
  if (insights.error) return <ErrorBanner message={insights.error} onRetry={() => insights.run()} />;
  if (!insights.data) return <Empty message="No insights yet." />;

  const { deals, leads, markets } = insights.data;
  const totalLeads = leads.sellers + leads.buyers;

  const kpis = [
    { label: 'Pipeline value', value: formatCurrency(deals.pipelineValue) },
    { label: 'Projected profit', value: formatCurrency(deals.projectedProfit) },
    { label: 'Avg ROI', value: `${deals.avgRoi.toFixed(1)}%` },
    { label: 'Active deals', value: String(deals.active) },
    { label: 'Total leads', value: String(totalLeads) },
    { label: 'Matched deals', value: `${deals.matchedCount} / ${deals.total}` },
  ];

  return (
    <>
      <header className="hero-panel">
        <p className="eyebrow">Analytics</p>
        <h1>Pipeline Insights</h1>
        <p>Your deals, leads, and markets at a glance.</p>
      </header>

      {deals.total === 0 ? (
        <Empty message="No deals yet. Save a deal from the Calculator to see your pipeline come to life." />
      ) : (
        <div className="layout-single">
          <section className="panel">
            <div className="kpi-grid">
              {kpis.map((k) => (
                <div key={k.label} className="kpi">
                  <p className="kpi-label">{k.label}</p>
                  <p className="kpi-value">{k.value}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="layout-grid">
            <section className="panel">
              <h2>Deals by status</h2>
              <StatusBars counts={deals.byStatus} />
            </section>

            <section className="panel">
              <h2>Profit by month</h2>
              <MiniBars data={deals.profitByMonth.map((m) => ({ label: m.month.slice(5), value: m.profit }))} />
            </section>
          </div>

          <div className="layout-grid">
            <section className="panel">
              <h2>Top deals</h2>
              {deals.topByProfit.length === 0 ? (
                <Empty message="No deals to rank yet." />
              ) : (
                <div className="market-list">
                  {deals.topByProfit.map((d) => (
                    <Link key={d.id} to={`/deals/${d.id}/sheet`} className="market-card">
                      <strong>{d.name}</strong>
                      <p>{formatCurrency(d.profit)} · {d.roi.toFixed(1)}% ROI</p>
                      <p className="text-muted">{d.status.replace('_', ' ')}</p>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <section className="panel">
              <h2>Hot markets</h2>
              <div className="market-list">
                {markets.top.map((m) => (
                  <Link key={m.id} to="/markets" className="market-card">
                    <strong>{m.city}, {m.state}</strong>
                    <p>Heat {m.heat_score} · {m.trend}</p>
                  </Link>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}
    </>
  );
}
