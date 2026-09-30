"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { type Report, type SymbolCost } from "@/lib/types";
import { ruleTierOf } from "@/lib/metrics";
import { CLUSTER_COLORS, money, price, tierColor } from "./ui";

const AXIS = { stroke: "#3a4a6b", fontSize: 11 } as const;

/* ---------------- هیستوگرام توزیع اسپرد ---------------- */
export function SpreadHistogram({ report }: { report: Report }) {
  const data = report.histogram.map((b) => ({
    name: b.binEndBps === null ? "" : b.binEndBps > 1e5 ? `${b.binStartBps}+` : `${b.binStartBps}–${b.binEndBps}`,
    count: b.count,
    logCount: Number((b.logCount * 100).toFixed(1)),
    mid: (b.binStartBps + Math.min(b.binEndBps, 1e5)) / 2,
    tier: ruleTierOf(b.binStartBps),
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 6 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" {...AXIS} interval={0} angle={-30} textAnchor="end" height={60} />
        <YAxis {...AXIS} label={{ value: "تعداد نماد (مقیاس لگاریتمی)", angle: -90, position: "insideLeft", fill: "#6b7c9b", fontSize: 11 }} />
        <Tooltip
          formatter={(v: number, _n, p) => [`${p.payload.count} نماد`, ""]}
          labelFormatter={(l) => `اسپرد ${l} bps`}
          contentStyle={{ background: "#0f1523", border: "1px solid #2e3d5c", borderRadius: 10, fontSize: 12 }}
        />
        <Bar dataKey="logCount" radius={[5, 5, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={tierColor(d.tier)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ---------------- اثر عوامل ---------------- */
export function FactorImpact({ report }: { report: Report }) {
  const data = [...report.factorImportance].reverse().map((f) => ({
    name: f.driver,
    impact: Number(f.impactBps.toFixed(2)),
    w: Number((f.weight * 100).toFixed(0)),
  }));
  return (
    <ResponsiveContainer width="100%" height={230}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 30, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" {...AXIS} label={{ value: "دامنه میانه اسپرد بین سطل‌ها (bps)", position: "insideBottom", offset: -2, fill: "#6b7c9b", fontSize: 11 }} />
        <YAxis type="category" dataKey="name" width={150} {...AXIS} />
        <Tooltip
          formatter={(v: number) => [`${v} bps`, "دامنه اثر"]}
          contentStyle={{ background: "#0f1523", border: "1px solid #2e3d5c", borderRadius: 10, fontSize: 12 }}
        />
        <Bar dataKey="impact" radius={[0, 6, 6, 0]} fill="#4c8dff" />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ---------------- میانه اسپرد بر حسب هر عامل ---------------- */
export function FactorBuckets({ report, factor }: { report: Report; factor: string }) {
  const buckets = report.factors[factor] ?? [];
  const data = buckets.map((b) => ({
    name: b.bucket,
    spread: Number(b.medianSpreadBps.toFixed(2)),
    tick: Number(b.medianTickFloorBps.toFixed(2)),
    cost: Number(b.medianRoundTripBps.toFixed(2)),
    n: b.count,
    volShare: Number(b.volumeSharePct.toFixed(2)),
    ratio: Number((b.ratioVsMarket || 0).toFixed(2)),
  }));
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" {...AXIS} interval={0} angle={-18} textAnchor="end" height={70} />
        <YAxis {...AXIS} label={{ value: "bps", angle: -90, position: "insideLeft", fill: "#6b7c9b", fontSize: 11 }} />
        <Tooltip
          formatter={(v: number, name) => [`${v} bps`, name === "spread" ? "میانه اسپرد" : name === "tick" ? "میانه کف تیک" : "میانه هزینه رفت‌وبرگشت"]}
          contentStyle={{ background: "#0f1523", border: "1px solid #2e3d5c", borderRadius: 10, fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="spread" fill="#4c8dff" radius={[5, 5, 0, 0]} />
        <Bar dataKey="tick" fill="#f59e0b" radius={[5, 5, 0, 0]} />
        <Line type="monotone" dataKey="cost" stroke="#22d3ee" strokeWidth={2} dot={{ r: 3 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/* ---------------- پراکندگی اسپرد در برابر حجم (لگاریتمی) ---------------- */
export function SpreadVsVolume({ costs, elasticity, intercept }: { costs: SymbolCost[]; elasticity: number; intercept: number }) {
  const pts = costs.map((c) => ({
    x: Math.max(c.quoteVolume24h, 1e4),
    y: Math.max(c.spreadBps, 0.05),
    z: c.tierRule,
    name: c.symbol,
    sym: c.symbol,
  }));
  const trend = Number.isFinite(elasticity)
    ? [1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10].map((v) => ({ x: v, y: Math.pow(10, intercept + elasticity * Math.log10(v)) }))
    : [];

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          type="number"
          dataKey="x"
          scale="log"
          domain={["auto", "auto"]}
          {...AXIS}
          tickFormatter={(v) => money(v)}
          label={{ value: "حجم ۲۴ساعته (USDT، لگاریتمی)", position: "insideBottom", offset: -2, fill: "#6b7c9b", fontSize: 11 }}
        />
        <YAxis
          type="number"
          dataKey="y"
          scale="log"
          domain={["auto", "auto"]}
          {...AXIS}
          tickFormatter={(v) => v.toFixed(v < 10 ? 1 : 0)}
          label={{ value: "اسپرد (bps، لگاریتمی)", angle: -90, position: "insideLeft", fill: "#6b7c9b", fontSize: 11 }}
        />
        <Tooltip
          formatter={(v: number, _n, p) => [`${Number(v).toFixed(2)} bps — ${p.payload.sym}`, "اسپرد"]}
          labelFormatter={(l) => `حجم ${money(Number(l))} $`}
          contentStyle={{ background: "#0f1523", border: "1px solid #2e3d5c", borderRadius: 10, fontSize: 12 }}
        />
        <Scatter data={trend} fill="none" line={{ stroke: "#f59e0b", strokeWidth: 2, strokeDasharray: "6 4" }} shape={() => <g />} isAnimationActive={false} />
        <Scatter data={pts} isAnimationActive={false}>
          {pts.map((p, i) => (
            <Cell key={i} fill={tierColor(p.z)} fillOpacity={0.72} />
          ))}
        </Scatter>
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/* ---------------- پراکندگی اسپرد در برابر قیمت + منحنی کف تیک ---------------- */
export function SpreadVsPrice({ costs }: { costs: SymbolCost[] }) {
  const pts = costs.map((c) => ({
    x: c.lastPrice,
    y: Math.max(c.spreadBps, 0.02),
    tick: c.tickFloorBps,
    name: c.symbol,
    sym: c.symbol,
  }));
  // منحنی کف تیک برای pricePrecisionهای رایج بایننس
  const tickOf = (p: number) => {
    if (p >= 1000) return 0.1;
    if (p >= 100) return 0.01;
    if (p >= 10) return 0.001;
    if (p >= 1) return 0.0001;
    if (p >= 0.1) return 0.00001;
    if (p >= 0.01) return 0.000001;
    if (p >= 0.001) return 0.0000001;
    return 0.00000001;
  };
  const floor = Array.from({ length: 60 }, (_, i) => {
    const p = Math.pow(10, -6 + (i * 9) / 59);
    return { x: p, y: Math.max((tickOf(p) / p) * 1e4, 0.001) };
  });

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          type="number"
          dataKey="x"
          scale="log"
          domain={["auto", "auto"]}
          {...AXIS}
          tickFormatter={(v) => price(v)}
          label={{ value: "قیمت آخرین معامله (لگاریتمی)", position: "insideBottom", offset: -2, fill: "#6b7c9b", fontSize: 11 }}
        />
        <YAxis
          type="number"
          dataKey="y"
          scale="log"
          domain={["auto", "auto"]}
          {...AXIS}
          tickFormatter={(v) => v.toFixed(v < 10 ? 1 : 0)}
          label={{ value: "اسپرد (bps، لگاریتمی)", angle: -90, position: "insideLeft", fill: "#6b7c9b", fontSize: 11 }}
        />
        <Tooltip
          formatter={(v: number, name, p) => [
            name === "floor" ? `کف تیک: ${(p.payload.tick ?? v).toFixed?.(2) ?? v} bps` : `${Number(v).toFixed(2)} bps — ${p.payload.sym}`,
            name === "floor" ? "کف ساختاری" : "اسپرد",
          ]}
          labelFormatter={(l) => `قیمت ≈ ${price(Number(l))} $`}
          contentStyle={{ background: "#0f1523", border: "1px solid #2e3d5c", borderRadius: 10, fontSize: 12 }}
        />
        <Line data={floor} stroke="#f59e0b" strokeWidth={2.2} dot={false} name="floor" isAnimationActive={false} />
        <Scatter data={pts} isAnimationActive={false}>
          {pts.map((p, i) => (
            <Cell key={i} fill="#4c8dff" fillOpacity={0.65} />
          ))}
        </Scatter>
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/* ---------------- توزیع حجم در برابر هزینه (سهم هر تیکر) ---------------- */
export function TierVolumeDonut({ report }: { report: Report }) {
  const data = report.ruleTiers
    .filter((t) => t.count > 0)
    .map((t) => ({ name: t.label, value: Number(t.volumeSharePct.toFixed(2)), count: t.count, fill: tierColor(t.id) }));
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <ResponsiveContainer width="100%" height={230}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 10, left: 10, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" {...AXIS} unit="%" />
          <YAxis type="category" dataKey="name" width={130} {...AXIS} />
          <Tooltip
            formatter={(v: number, _n, p) => [`${v}٪ از حجم بازار (${p.payload.count} نماد)`, "سهم حجم"]}
            contentStyle={{ background: "#0f1523", border: "1px solid #2e3d5c", borderRadius: 10, fontSize: 12 }}
          />
          <Bar dataKey="value" radius={[0, 6, 6, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------------- نقشه حرارتی: قیمت × حجم → اسپرد ---------------- */
export function HeatGrid({ costs }: { costs: SymbolCost[] }) {
  const priceBins = [
    { label: "≥ 100$", f: (p: number) => p >= 100 },
    { label: "10–100$", f: (p: number) => p >= 10 && p < 100 },
    { label: "1–10$", f: (p: number) => p >= 1 && p < 10 },
    { label: "0.1–1$", f: (p: number) => p >= 0.1 && p < 1 },
    { label: "0.01–0.1$", f: (p: number) => p >= 0.01 && p < 0.1 },
    { label: "< 0.01$", f: (p: number) => p < 0.01 },
  ];
  const volBins = [
    { label: "≥ 100M$", f: (v: number) => v >= 1e8 },
    { label: "10–100M$", f: (v: number) => v >= 1e7 && v < 1e8 },
    { label: "1–10M$", f: (v: number) => v >= 1e6 && v < 1e7 },
    { label: "100K–1M$", f: (v: number) => v >= 1e5 && v < 1e6 },
    { label: "< 100K$", f: (v: number) => v < 1e5 },
  ];

  const cells = priceBins.flatMap((pb, pi) =>
    volBins.map((vb, vi) => {
      const g = costs.filter((c) => pb.f(c.lastPrice) && vb.f(c.quoteVolume24h));
      const spreads = g.map((c) => c.spreadBps).sort((a, b) => a - b);
      const med = spreads.length ? spreads[Math.floor(spreads.length / 2)] : NaN;
      return { pi, vi, n: g.length, med, vol: g.reduce((a, c) => a + c.quoteVolume24h, 0) };
    }),
  );
  const finite = cells.filter((c) => Number.isFinite(c.med)).map((c) => c.med);
  const min = Math.min(...finite);
  const max = Math.max(...finite);

  const color = (v: number) => {
    if (!Number.isFinite(v)) return "rgba(36,48,73,0.35)";
    const t = (Math.log10(Math.max(v, 0.01)) - Math.log10(Math.max(min, 0.01))) / (Math.log10(Math.max(max, 0.02)) - Math.log10(Math.max(min, 0.01)) || 1);
    const hue = 150 - t * 150;
    return `hsl(${hue} 70% ${45 - t * 12}%)`;
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ minWidth: 620 }}>
        <thead>
          <tr>
            <th style={{ cursor: "default" }}>قیمت ↓ / حجم →</th>
            {volBins.map((v) => (
              <th key={v.label} style={{ cursor: "default", textAlign: "center" }}>{v.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {priceBins.map((pb, pi) => (
            <tr key={pb.label}>
              <td className="txt" style={{ fontWeight: 700 }}>{pb.label}</td>
              {volBins.map((vb, vi) => {
                const cell = cells.find((c) => c.pi === pi && c.vi === vi)!;
                return (
                  <td
                    key={vb.label}
                    style={{
                      background: color(cell.med),
                      textAlign: "center",
                      color: "#fff",
                      fontWeight: 700,
                      textShadow: "0 1px 3px rgba(0,0,0,0.6)",
                    }}
                    title={`${cell.n} نماد — میانه اسپرد ${Number.isFinite(cell.med) ? cell.med.toFixed(2) : "—"} bps — حجم ${money(cell.vol)}$`}
                  >
                    {Number.isFinite(cell.med) ? cell.med.toFixed(1) : "—"}
                    <div style={{ fontSize: 10, opacity: 0.75, fontWeight: 400 }}>{cell.n} نماد</div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export { CLUSTER_COLORS };
