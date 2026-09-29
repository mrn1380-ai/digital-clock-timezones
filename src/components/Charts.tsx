import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  ZAxis,
} from 'recharts';
import { MarketRow, QUALITY_LABEL, SPREAD_TIER_LABEL } from '../lib/analytics';
import { histogram, quantiles } from '../lib/stats';
import { pct, num } from '../lib/format';

const AXIS = { fill: '#8b9ab4', fontSize: 11 };
const TIP = {
  contentStyle: {
    background: '#141c2b',
    border: '1px solid #24304a',
    borderRadius: 10,
    fontSize: 12,
    direction: 'rtl' as const,
  },
  labelStyle: { color: '#e6edf7' },
};

/** ۱) توزیع اسپرد — چون دنباله راست دارد، هیستوگرام روی مقیاس لگاریتمی */
export function SpreadHistogram({ rows }: { rows: MarketRow[] }) {
  const live = rows.filter((r) => r.hasBook);
  const data = histogram(live.map((r) => r.logSpread).map(Math.exp), 26);
  const q = quantiles(live.map((r) => r.spreadPct));
  const colorFor = (x0: number) =>
    x0 < q.p25 ? '#22c55e' : x0 < q.p75 ? '#38bdf8' : x0 < q.p95 ? '#eab308' : '#ef4444';
  return (
    <ResponsiveContainer width="100%" height={230}>
      <BarChart data={data} margin={{ top: 6, right: 8, bottom: 4, left: -18 }}>
        <CartesianGrid stroke="#1d2739" vertical={false} />
        <XAxis dataKey="label" tick={AXIS} interval={3} angle={-18} textAnchor="end" height={46} />
        <YAxis tick={AXIS} allowDecimals={false} />
        <Tooltip {...TIP} formatter={(v: any, _n: any, p: any) => [`${v} نماد`, `اسپرد ${p?.payload?.label ?? ''}٪`]} />
        <Bar dataKey="count" radius={[3, 3, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={colorFor(d.x0)} fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** ۲) توزیع کارمزد — گسسته و چندمقداری */
export function FeeHistogram({ rows }: { rows: MarketRow[] }) {
  const map = new Map<number, number>();
  rows.filter((r) => r.hasBook).forEach((r) => map.set(r.takerPct, (map.get(r.takerPct) ?? 0) + 1));
  const data = [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([fee, count]) => ({ fee, count, label: `${fee.toFixed(2)}٪` }));
  const colors = ['#a78bfa', '#f59e0b', '#38bdf8', '#22c55e'];
  return (
    <ResponsiveContainer width="100%" height={230}>
      <BarChart data={data} margin={{ top: 6, right: 8, bottom: 4, left: -18 }}>
        <CartesianGrid stroke="#1d2739" vertical={false} />
        <XAxis dataKey="label" tick={AXIS} />
        <YAxis tick={AXIS} allowDecimals={false} />
        <Tooltip {...TIP} formatter={(v: any) => [`${v} نماد`, 'تعداد بازار']} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={colors[i % colors.length]} fillOpacity={0.9} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** ۳) رابطه عمق و اسپرد — مهم‌ترین نمودار برای تشخیص «عامل تغییر» */
export function DepthSpreadScatter({ rows }: { rows: MarketRow[] }) {
  const data = rows
    .filter((r) => r.hasBook && r.depthUsd > 0)
    .map((r) => ({
      x: Math.log10(r.depthUsd),
      y: r.spreadPct,
      z: Math.sqrt(r.depthUsd),
      symbol: r.symbol,
      kind: r.fee.short,
      fill: r.kind === 'IRT' ? '#f59e0b' : r.kind === 'USDT' ? '#38bdf8' : '#a78bfa',
      entry: r.entryCostPct,
    }));
  return (
    <ResponsiveContainer width="100%" height={270}>
      <ScatterChart margin={{ top: 8, right: 12, bottom: 16, left: -6 }}>
        <CartesianGrid stroke="#1d2739" />
        <XAxis
          type="number"
          dataKey="x"
          name="عمق"
          tick={AXIS}
          tickFormatter={(v) => `$${num(Math.pow(10, v) / 1000, 0)}K`}
          label={{ value: 'عمق سفارش (لگاریتم، دلار)', position: 'insideBottom', offset: -12, fill: '#8b9ab4', fontSize: 11 }}
        />
        <YAxis
          type="number"
          dataKey="y"
          name="اسپرد"
          tick={AXIS}
          tickFormatter={(v) => `${v.toFixed(1)}٪`}
          label={{ value: 'اسپرد', angle: -90, position: 'insideLeft', fill: '#8b9ab4', fontSize: 11 }}
        />
        <ZAxis dataKey="z" range={[40, 320]} />
        <Tooltip
          {...TIP}
          formatter={(v: any) => [`${num(v as number, 3)}٪`, 'اسپرد']}
          labelFormatter={(_l: any, p: any) => p?.[0]?.payload?.symbol ?? ''}
        />
        <Scatter data={data} fill="#4f8cff" fillOpacity={0.55}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.fill} />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}

/** ۴) میانه هزینه ورود به تفکیک دسته کیفیت */
export function ClassBar({ classes }: { classes: { title: string; count: number; medianEntryCost: number; color: string }[] }) {
  const data = classes.map((c) => ({ name: c.title, هزینه: c.medianEntryCost, count: c.count, color: c.color }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(170, data.length * 46)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 26 }}>
        <CartesianGrid stroke="#1d2739" horizontal={false} />
        <XAxis type="number" tick={AXIS} tickFormatter={(v) => `${v.toFixed(2)}٪`} />
        <YAxis type="category" dataKey="name" tick={{ ...AXIS, fontSize: 11.5 }} width={128} />
        <Tooltip {...TIP} formatter={(v: any, _n: any, p: any) => [pct(v as number), `میانه هزینه ورود (${p?.payload?.count} بازار)`]} />
        <Bar dataKey="هزینه" radius={[0, 4, 4, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** ۵) جعبه‌ای (کوارتیل) اسپرد به تفکیک سطح اسپرد */
export function SpreadTierBox({ rows }: { rows: MarketRow[] }) {
  const tiers = ['TIGHT', 'NORMAL', 'WIDE', 'VERY_WIDE'] as const;
  const data = tiers
    .map((t) => {
      const g = rows.filter((r) => r.hasBook && r.spreadTier === t).map((r) => r.spreadPct);
      const q = quantiles(g);
      return { tier: t, label: SPREAD_TIER_LABEL[t], ...q, color: QUALITY_LABEL[t === 'TIGHT' ? 'DEEP_CHEAP' : t === 'WIDE' ? 'DEEP_EXPENSIVE' : t === 'VERY_WIDE' ? 'WIDE_THIN' : 'BALANCED'].color };
    })
    .filter((d) => d.n > 0);
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -10 }}>
        <CartesianGrid stroke="#1d2739" vertical={false} />
        <XAxis dataKey="label" tick={AXIS} />
        <YAxis tick={AXIS} tickFormatter={(v) => `${v.toFixed(2)}٪`} />
        <Tooltip {...TIP} formatter={(v: any, n: any) => [pct(v as number), String(n)]} />
        <Bar dataKey="p95" fill="#24304a" radius={[3, 3, 0, 0]} name=" صدک ۹۵" />
        <Bar dataKey="p75" fill="#4f8cff" radius={[3, 3, 0, 0]} name=" صدک ۷۵" />
        <Bar dataKey="median" fill="#38bdf8" radius={[3, 3, 0, 0]} name=" میانه" />
        <ReferenceLine y={0} stroke="#24304a" />
      </BarChart>
    </ResponsiveContainer>
  );
}
