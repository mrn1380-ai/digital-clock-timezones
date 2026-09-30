import {
  type ConnectionStatus,
  type FactorBucket,
  type Report,
  type SymbolCost,
  type TreeNode,
  FEE_TIERS,
  BPS_IN_PCT,
} from "./types";
import { RULE_TIER_META, RULE_TIER_BOUNDS, clusterFeatures, ruleTierOf } from "./metrics";
import { kmeans, kmeans1d, logLogFit, mean, median, quantile, safeLog10, spearman } from "./stats";

/* ------------------------------------------------------------------ */
/* هیستوگرام                                                           */
/* ------------------------------------------------------------------ */

const HIST_EDGES = [0, 0.5, 1, 2, 3, 5, 8, 12, 20, 35, 60, 100, 200, 400, 1000, Infinity];

export function buildHistogram(rows: SymbolCost[]) {
  const bins = HIST_EDGES.slice(0, -1).map((start, i) => ({
    binStartBps: start,
    binEndBps: HIST_EDGES[i + 1],
    count: 0,
    logCount: 0,
  }));
  for (const r of rows) {
    const idx = bins.findIndex((b) => r.spreadBps >= b.binStartBps && r.spreadBps < b.binEndBps);
    const b = bins[idx === -1 ? bins.length - 1 : idx];
    b.count++;
  }
  const max = Math.max(...bins.map((b) => b.count), 1);
  for (const b of bins) b.logCount = Math.log10(b.count + 1) / Math.log10(max + 1);
  return bins;
}

/* ------------------------------------------------------------------ */
/* دسته‌بندی قاعده‌محور                                                */
/* ------------------------------------------------------------------ */

function buildRuleTiers(rows: SymbolCost[], totalVol: number) {
  return RULE_TIER_META.map((meta) => {
    const g = rows.filter((r) => r.tierRule === meta.id);
    const vol = g.reduce((a, r) => a + r.quoteVolume24h, 0);
    const volSorted = [...g].sort((a, b) => b.spreadBps - a.spreadBps);
    return {
      ...meta,
      count: g.length,
      volumeSharePct: totalVol > 0 ? (vol / totalVol) * 100 : 0,
      medianSpreadBps: median(g.map((r) => r.spreadBps)),
      medianRoundTripBps: median(g.map((r) => r.roundTripBps)),
      medianTickFloorBps: median(g.map((r) => r.tickFloorBps)),
      medianRangePct: median(g.map((r) => r.rangePct24h)),
      medianQuoteVolume: median(g.map((r) => r.quoteVolume24h)),
      spreadVsFee: median(g.map((r) => r.spreadOverFee)),
      examples: volSorted.slice(0, 6).map((r) => r.symbol),
    };
  });
}

/* ------------------------------------------------------------------ */
/* خوشه‌بندی داده‌محور (k-means چندبعدی + شکست‌های طبیعی ۱بعدی)          */
/* ------------------------------------------------------------------ */

function buildDataTiers(rows: SymbolCost[], totalVol: number) {
  const pts = rows.map(clusterFeatures);
  const km = kmeans(pts, 5, 42, 150);
  rows.forEach((r, i) => {
    r.tierData = String(km.labels[i]);
  });

  // شکست‌های طبیعی روی لگاریتم اسپرد: مرزهایی که خود داده تعیین می‌کند
  const { boundaries } = kmeans1d(rows.map((r) => Math.log10(Math.max(r.spreadBps, 0.01))), 5);
  const logBounds = [-Infinity, ...boundaries, Infinity];
  const labelOf = (spreadBps: number) => {
    const l = Math.log10(Math.max(spreadBps, 0.01));
    const i = logBounds.findIndex((b, idx) => idx > 0 && l <= b);
    return i === -1 ? logBounds.length - 2 : i - 1;
  };

  const tierIdFor = (i: number) => `C${i + 1}`;
  const groups = new Map<string, SymbolCost[]>();
  for (const r of rows) {
    const id = tierIdFor(labelOf(r.spreadBps));
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id)!.push(r);
  }

  return [...groups.entries()]
    .map(([id, g]) => {
      const vol = g.reduce((a, r) => a + r.quoteVolume24h, 0);
      return {
        id,
        label: `خوشه ${id}`,
        count: g.length,
        volumeSharePct: totalVol > 0 ? (vol / totalVol) * 100 : 0,
        medianSpreadBps: median(g.map((r) => r.spreadBps)),
        medianTickFloorBps: median(g.map((r) => r.tickFloorBps)),
        examples: [...g].sort((a, b) => b.quoteVolume24h - a.quoteVolume24h).slice(0, 6).map((r) => r.symbol),
      };
    })
    .sort((a, b) => a.medianSpreadBps - b.medianSpreadBps);
}

/* ------------------------------------------------------------------ */
/* عوامل مؤثر                                                          */
/* ------------------------------------------------------------------ */

interface FactorDef {
  key: string;
  driver: string;
  description: string;
  bucketOf: (c: SymbolCost) => string | null;
}

const priceBuckets = (c: SymbolCost) => {
  const p = c.lastPrice;
  if (p >= 100) return "≥ 100$";
  if (p >= 10) return "10 تا 100$";
  if (p >= 1) return "1 تا 10$";
  if (p >= 0.1) return "0.1 تا 1$";
  if (p >= 0.01) return "0.01 تا 0.1$";
  if (p >= 0.001) return "0.001 تا 0.01$";
  return "< 0.001$";
};

const volBuckets = (c: SymbolCost) => {
  const v = c.quoteVolume24h;
  if (v >= 1e9) return "≥ ۱ میلیارد $";
  if (v >= 1e8) return "۱۰۰ میلیون تا ۱ میلیارد $";
  if (v >= 1e7) return "۱۰ تا ۱۰۰ میلیون $";
  if (v >= 1e6) return "۱ تا ۱۰ میلیون $";
  if (v >= 1e5) return "۱۰۰هزار تا ۱ میلیون $";
  return "< ۱۰۰ هزار $";
};

const volaBuckets = (c: SymbolCost) => {
  const v = c.rangePct24h;
  if (v >= 15) return "نوسان ≥ ۱۵٪";
  if (v >= 8) return "۸ تا ۱۵٪";
  if (v >= 4) return "۴ تا ۸٪";
  if (v >= 2) return "۲ تا ۴٪";
  return "نوسان < ۲٪";
};

const tickBuckets = (c: SymbolCost) => {
  const f = c.tickFloorBps;
  if (f >= 100) return "کف تیک ≥ ۱۰۰ bps";
  if (f >= 30) return "۳۰ تا ۱۰۰ bps";
  if (f >= 10) return "۱۰ تا ۳۰ bps";
  if (f >= 3) return "۳ تا ۱۰ bps";
  if (f >= 0.5) return "۰.۵ تا ۳ bps";
  return "کف تیک < ۰.۵ bps";
};

const ageBuckets = (c: SymbolCost) => {
  if (c.ageDays == null) return null;
  const d = c.ageDays;
  if (d < 30) return "جدید (< ۱ ماه)";
  if (d < 90) return "۱ تا ۳ ماه";
  if (d < 180) return "۳ تا ۶ ماه";
  if (d < 365) return "۶ تا ۱۲ ماه";
  if (d < 730) return "۱ تا ۲ سال";
  return "بالای ۲ سال";
};

const quoteBuckets = (c: SymbolCost) => c.quote;

const FACTORS: FactorDef[] = [
  { key: "volume", driver: "نقدینگی (حجم ۲۴ساعته)", description: "هرچه حجم بالاتر، عمق بیشتر و اسپرد پایین‌تر", bucketOf: volBuckets },
  { key: "price", driver: "سطح قیمت", description: "قیمت پایین ⇒ نسبت اندازه‌گام (tick) به قیمت بزرگ ⇒ کف اسپرد بالا", bucketOf: priceBuckets },
  { key: "tick", driver: "کف ساختاری اسپرد (tick/mid)", description: "مستقیماً تعیین می‌کند کمترین اسپرد ممکن چقدر است", bucketOf: tickBuckets },
  { key: "volatility", driver: "نوسان ۲۴ساعته", description: "بازار پرنوسان ⇒ نوسان‌ساز (market maker) اسپرد را باز می‌کند", bucketOf: volaBuckets },
  { key: "age", driver: "قدمت قرارداد", description: "قراردادهای تازه‌لیست معمولاً عمق کمتری دارند", bucketOf: ageBuckets },
  { key: "quote", driver: "دارایی تسویه", description: "USDT در برابر USDC — تفاوت عمق بازار", bucketOf: quoteBuckets },
];

function buildFactors(rows: SymbolCost[], totalVol: number): Record<string, FactorBucket[]> {
  const marketMedian = median(rows.map((r) => r.spreadBps));
  const out: Record<string, FactorBucket[]> = {};
  for (const f of FACTORS) {
    const groups = new Map<string, SymbolCost[]>();
    for (const r of rows) {
      const b = f.bucketOf(r);
      if (!b) continue;
      if (!groups.has(b)) groups.set(b, []);
      groups.get(b)!.push(r);
    }
    out[f.key] = [...groups.entries()]
      .map(([bucket, g]) => {
        const vol = g.reduce((a, r) => a + r.quoteVolume24h, 0);
        const med = median(g.map((r) => r.spreadBps));
        return {
          factor: f.key,
          bucket,
          count: g.length,
          medianSpreadBps: med,
          medianRoundTripBps: median(g.map((r) => r.roundTripBps)),
          medianTickFloorBps: median(g.map((r) => r.tickFloorBps)),
          medianQuoteVolume: median(g.map((r) => r.quoteVolume24h)),
          volumeSharePct: totalVol > 0 ? (vol / totalVol) * 100 : 0,
          deltaVsMarketBps: med - marketMedian,
          ratioVsMarket: marketMedian > 0 ? med / marketMedian : NaN,
        };
      })
      .sort((a, b) => a.medianSpreadBps - b.medianSpreadBps);
  }
  return out;
}

function buildFactorImportance(rows: SymbolCost[]): Report["factorImportance"] {
  const marketMedian = median(rows.map((r) => r.spreadBps));
  const res: Report["factorImportance"] = [];
  for (const f of FACTORS) {
    const buckets = [...new Set(rows.map((r) => f.bucketOf(r)).filter(Boolean) as string[])];
    if (buckets.length < 2) continue;
    const meds = buckets.map((b) => {
      const g = rows.filter((r) => f.bucketOf(r) === b);
      return median(g.map((r) => r.spreadBps));
    });
    const spread = Math.max(...meds) - Math.min(...meds);
    res.push({ factor: f.key, driver: f.driver, description: f.description, impactBps: spread, weight: spread / marketMedian });
  }
  return res.sort((a, b) => b.impactBps - a.impactBps);
}

/* ------------------------------------------------------------------ */
/* درخت تصمیم برای استخراج عوامل (CART سبک روی لگاریتم اسپرد)            */
/* ------------------------------------------------------------------ */

interface TreeFeature {
  key: string;
  label: string;
  value: (c: SymbolCost) => number;
  fmt: (v: number) => string;
}

export const TREE_FEATURES: TreeFeature[] = [
  { key: "logVol", label: "حجم ۲۴ساعته ($)", value: (c) => safeLog10(Math.max(c.quoteVolume24h, 1)), fmt: (v) => money(Math.pow(10, v)) },
  { key: "logTickFloor", label: "کف تیک (bps)", value: (c) => safeLog10(Math.max(c.tickFloorBps, 0.001)), fmt: (v) => `${Math.pow(10, v).toFixed(2)} bps` },
  { key: "logRange", label: "دامنه ۲۴ساعته (٪)", value: (c) => safeLog10(Math.max(c.rangePct24h, 0.01)), fmt: (v) => `${Math.pow(10, v).toFixed(1)}٪` },
  { key: "logPrice", label: "قیمت ($)", value: (c) => safeLog10(Math.max(c.lastPrice, 1e-8)), fmt: (v) => `$${Math.pow(10, v).toPrecision(3)}` },
  { key: "logAge", label: "قدمت (روز)", value: (c) => safeLog10(Math.max(c.ageDays ?? 30, 1)), fmt: (v) => `${Math.round(Math.pow(10, v))} روز` },
  { key: "logDepth", label: "عمق بهترینBid/Ask ($)", value: (c) => safeLog10(Math.max(c.topDepthUsd ?? 1, 1)), fmt: (v) => money(Math.pow(10, v)) },
];

function buildTree(rows: SymbolCost[], depth = 0, maxDepth = 3, minLeaf = 12): TreeNode {
  const n = rows.length;
  const med = median(rows.map((r) => r.spreadBps));
  if (depth >= maxDepth || n < minLeaf * 2) {
    return { n, medianSpreadBps: med, label: `میانه ${med.toFixed(2)} bps (${n} نماد)` };
  }

  let best: { f: TreeFeature; thr: number; gain: number; left: SymbolCost[]; right: SymbolCost[] } | null = null;
  const yVar = (g: SymbolCost[]) => {
    if (g.length < 2) return 0;
    const ys = g.map((r) => Math.log10(Math.max(r.spreadBps, 0.01)));
    return ys.reduce((a, v) => a + (v - mean(ys)) ** 2, 0);
  };
  const parentVar = yVar(rows);

  for (const f of TREE_FEATURES) {
    const vals = rows.map((r) => f.value(r)).filter(Number.isFinite).sort((a, b) => a - b);
    if (vals.length < minLeaf * 2) continue;
    const cands = [quantile(vals, 0.25), quantile(vals, 0.5), quantile(vals, 0.75)].filter(Number.isFinite);
    for (const thr of cands) {
      const left = rows.filter((r) => f.value(r) <= thr);
      const right = rows.filter((r) => f.value(r) > thr);
      if (left.length < minLeaf || right.length < minLeaf) continue;
      const gain = parentVar - (yVar(left) * left.length + yVar(right) * right.length) / n;
      if (gain > 0 && (!best || gain > best.gain)) best = { f, thr, gain, left, right };
    }
  }

  if (!best) return { n, medianSpreadBps: med, label: `میانه ${med.toFixed(2)} bps (${n} نماد)` };

  return {
    feature: best.f.key,
    featureLabel: best.f.label,
    threshold: best.thr,
    thresholdLabel: best.f.fmt(best.thr),
    n,
    medianSpreadBps: med,
    leaves: [buildTree(best.left, depth + 1, maxDepth, minLeaf), buildTree(best.right, depth + 1, maxDepth, minLeaf)],
  };
}

/* ------------------------------------------------------------------ */
/* همبستگی‌ها                                                           */
/* ------------------------------------------------------------------ */

function buildCorrelations(rows: SymbolCost[]): Report["correlations"] {
  const targets = ["spreadBps", "tickFloorBps", "roundTripBps"] as const;
  const targetLabels: Record<(typeof targets)[number], string> = {
    spreadBps: "اسپرد",
    tickFloorBps: "کف تیک",
    roundTripBps: "هزینه رفت‌وبرگشت",
  };
  const drivers: { name: string; xs: number[] }[] = [
    { name: "log(حجم ۲۴ساعته)", xs: rows.map((r) => safeLog10(Math.max(r.quoteVolume24h, 1))) },
    { name: "log(قیمت)", xs: rows.map((r) => safeLog10(Math.max(r.lastPrice, 1e-8))) },
    { name: "log(کف تیک)", xs: rows.map((r) => safeLog10(Math.max(r.tickFloorBps, 0.001))) },
    { name: "log(دامنه ۲۴ساعته)", xs: rows.map((r) => safeLog10(Math.max(r.rangePct24h, 0.01))) },
    { name: "log(قدمت)", xs: rows.map((r) => safeLog10(Math.max(r.ageDays ?? 30, 1))) },
    { name: "log(عمق دفترچه)", xs: rows.map((r) => safeLog10(Math.max(r.topDepthUsd ?? 1, 1))) },
    { name: "log(تعداد معاملات)", xs: rows.map((r) => safeLog10(Math.max(r.trades24h, 1))) },
  ];
  const out: Report["correlations"] = [];
  for (const t of targets) {
    const ys = rows.map((r) => r[t]);
    for (const d of drivers) {
      if (d.name.replace(/^log\(|\)$/g, "") === targetLabels[t]) continue; // حذف همبستگی با خودِ متغیر
      const rho = spearman(d.xs, ys);
      if (Number.isFinite(rho)) out.push({ a: d.name, b: targetLabels[t], rho });
    }
  }
  return out.sort((a, b) => Math.abs(b.rho) - Math.abs(a.rho)).slice(0, 18);
}

function money(x: number): string {
  if (!Number.isFinite(x)) return "—";
  if (x >= 1e9) return `${(x / 1e9).toFixed(1)}B`;
  if (x >= 1e6) return `${(x / 1e6).toFixed(1)}M`;
  if (x >= 1e3) return `${(x / 1e3).toFixed(1)}K`;
  return x.toFixed(0);
}

/* ------------------------------------------------------------------ */
/* گزارش نهایی                                                         */
/* ------------------------------------------------------------------ */

export interface BuildReportInput {
  costs: SymbolCost[];
  mode: Report["mode"];
  deep: boolean;
  host: string;
  feeTierId: string;
  generatedAt?: number;
  note?: string;
  connection: ConnectionStatus;
}

export function buildReport(input: BuildReportInput): Report {
  const rows = input.costs.filter((r) => Number.isFinite(r.spreadBps)).sort((a, b) => a.spreadBps - b.spreadBps);
  const totalVol = rows.reduce((a, r) => a + r.quoteVolume24h, 0);
  const spreads = rows.map((r) => r.spreadBps);

  const worst = rows[rows.length - 1];
  const best = rows[0];
  const top100 = [...rows].sort((a, b) => b.spreadBps - a.spreadBps).slice(0, 100);
  const bottom100 = [...rows].sort((a, b) => a.spreadBps - b.spreadBps).slice(0, 100);
  const topCostVolShare =
    totalVol > 0 ? (top100.reduce((a, r) => a + r.quoteVolume24h, 0) / totalVol) * 100 : 0;

  const volFit = logLogFit(
    rows.map((r) => r.quoteVolume24h),
    rows.map((r) => r.spreadBps),
  );

  return {
    generatedAt: input.generatedAt ?? Date.now(),
    mode: input.mode,
    deep: input.deep,
    source: {
      host: input.host,
      exchange: "Binance USDⓈ-M Futures (PERPETUAL)",
      endpoints: [
        "/fapi/v1/exchangeInfo",
        "/fapi/v1/ticker/bookTicker",
        "/fapi/v1/ticker/24hr",
        ...(input.deep ? ["/fapi/v1/klines?interval=1d"] : []),
      ],
      note: input.note,
    },
    connection: input.connection,
    feeTierId: FEE_TIERS.some((f) => f.id === input.feeTierId) ? input.feeTierId : FEE_TIERS[0].id,
    count: rows.length,
    totalQuoteVolume24h: totalVol,
    summary: {
      medianSpreadBps: median(spreads),
      meanSpreadBps: mean(spreads),
      p25SpreadBps: quantile(spreads, 0.25),
      p75SpreadBps: quantile(spreads, 0.75),
      p90SpreadBps: quantile(spreads, 0.9),
      p99SpreadBps: quantile(spreads, 0.99),
      maxSpreadBps: Math.max(...spreads, 0),
      medianRoundTripBps: median(rows.map((r) => r.roundTripBps)),
      medianTickFloorBps: median(rows.map((r) => r.tickFloorBps)),
      shareAtTickFloorPct: (rows.filter((r) => r.atTickFloor).length / Math.max(rows.length, 1)) * 100,
      volumeShareInTopCostPct: topCostVolShare,
      worst: worst?.symbol ?? "—",
      best: best?.symbol ?? "—",
      top100CostRatio: median(bottom100.map((r) => r.spreadBps)) > 0
        ? median(top100.map((r) => r.spreadBps)) / median(bottom100.map((r) => r.spreadBps))
        : NaN,
      liquidityElasticity: volFit.slope,
      liquidityFitR2: volFit.r2,
    },
    histogram: buildHistogram(rows),
    ruleTiers: buildRuleTiers(rows, totalVol),
    dataTiers: buildDataTiers(rows, totalVol),
    factors: buildFactors(rows, totalVol),
    factorImportance: buildFactorImportance(rows),
    correlations: buildCorrelations(rows),
    tree: buildTree(rows),
    symbols: rows.map((r) => ({
      ...r,
      tierRule: ruleTierOf(r.spreadBps),
    })),
  };
}

export { RULE_TIER_BOUNDS, RULE_TIER_META, BPS_IN_PCT };
