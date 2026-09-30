export const TIER_COLORS: Record<string, string> = {
  T1: "#22c55e",
  T2: "#84cc16",
  T3: "#eab308",
  T4: "#f97316",
  T5: "#ef4444",
  T6: "#b91c1c",
};

export const CLUSTER_COLORS = ["#22c55e", "#84cc16", "#eab308", "#f97316", "#ef4444", "#b91c1c"];

export function tierColor(tier: string): string {
  return TIER_COLORS[tier] ?? "#4c8dff";
}

export function bps(x: number, digits = 2): string {
  if (!Number.isFinite(x)) return "—";
  if (x >= 1000) return x.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return x.toFixed(digits);
}

export function pct(x: number, digits = 3): string {
  return Number.isFinite(x) ? `${x.toFixed(digits)}%` : "—";
}

export function money(x: number): string {
  if (!Number.isFinite(x)) return "—";
  const a = Math.abs(x);
  if (a >= 1e12) return `${(x / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${(x / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(x / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(x / 1e3).toFixed(1)}K`;
  return x.toFixed(2);
}

export function faNum(x: number, digits = 1): string {
  return Number.isFinite(x) ? x.toLocaleString("en-US", { maximumFractionDigits: digits }) : "—";
}

export function price(x: number): string {
  if (!Number.isFinite(x)) return "—";
  if (x >= 1000) return x.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (x >= 1) return x.toFixed(4);
  if (x >= 0.001) return x.toFixed(6);
  return x.toExponential(2);
}

export function timeAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s} ثانیه پیش`;
  if (s < 3600) return `${Math.round(s / 60)} دقیقه پیش`;
  return `${Math.round(s / 3600)} ساعت پیش`;
}

export function Card({ title, hint, children, right }: { title?: string; hint?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="card">
      {(title || right) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div>
            {title && <h3>{title}</h3>}
            {hint && <p className="hint">{hint}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function Kpi({ label, value, unit, note, color }: { label: string; value: string; unit?: string; note?: string; color?: string }) {
  return (
    <div className="card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={color ? { color } : undefined}>
        {value} {unit && <span className="kpi-unit">{unit}</span>}
      </div>
      {note && <div className="kpi-note">{note}</div>}
    </div>
  );
}

export function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <>
      <h2 className="section-title">{title}</h2>
      {sub && <p className="section-sub">{sub}</p>}
    </>
  );
}

export function TierPill({ tier }: { tier: string }) {
  return <span className={`pill ${tier}`}>{tier}</span>;
}
