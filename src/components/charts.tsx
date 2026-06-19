import { barHeights } from '../lib/insights';

interface MiniBarsProps {
  data: { label: string; value: number }[];
  height?: number;
}

// Inline-SVG bar chart. No external dependency.
export function MiniBars({ data, height = 120 }: MiniBarsProps) {
  if (data.length === 0) return <p className="text-muted">No data yet.</p>;
  const heights = barHeights(data.map((d) => d.value), height - 24);
  const barW = 36;
  const gap = 16;
  const width = data.length * (barW + gap);
  return (
    <svg className="mini-bars" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="bar chart">
      {data.map((d, i) => {
        const h = heights[i];
        const x = i * (barW + gap) + gap / 2;
        return (
          <g key={d.label}>
            <rect x={x} y={height - 18 - h} width={barW} height={h} rx={6} className="bar-rect" />
            <text x={x + barW / 2} y={height - 4} textAnchor="middle" className="bar-label">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

interface StatusBarsProps {
  counts: Record<string, number>;
}

// Horizontal proportional bars for the deal-status funnel.
export function StatusBars({ counts }: StatusBarsProps) {
  const entries = Object.entries(counts);
  const max = Math.max(1, ...entries.map(([, n]) => n));
  return (
    <div className="status-bars">
      {entries.map(([status, n]) => (
        <div key={status} className="status-bar-row">
          <span className="status-bar-label">{status.replace('_', ' ')}</span>
          <span className="status-bar-track">
            <span className="status-bar-fill" style={{ width: `${(n / max) * 100}%` }} />
          </span>
          <span className="status-bar-count">{n}</span>
        </div>
      ))}
    </div>
  );
}
