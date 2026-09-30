import { type FeeTier, type RawSymbolData, type SymbolCost, BPS_IN_PCT } from "./types";
import { median, safeLog10 } from "./stats";

/** آستانه‌های دسته‌بندی قاعده‌محور (bps) — بر پایه هزینه واقعی رفت‌وبرگشت */
export const RULE_TIER_BOUNDS = [0, 1.5, 4, 10, 30, 100, Infinity] as const;

export const RULE_TIER_META: { id: string; label: string; range: string; advice: string }[] = [
  { id: "T1", label: "T1 — درجه‌یک", range: "< 1.5 bps", advice: "برای اسکالپ و بازارکردن بی‌هزینه مناسب" },
  { id: "T2", label: "T2 — خوب", range: "1.5 تا 4 bps", advice: "مناسب اکثر استراتژی‌های سوئینگ/اسکالپ" },
  { id: "T3", label: "T3 — متوسط", range: "4 تا 10 bps", advice: "هزینه معنادار؛ نیاز به لبه‌ی معاملاتی بزرگ‌تر" },
  { id: "T4", label: "T4 — گران", range: "10 تا 30 bps", advice: "فقط برای موقعیت‌های بزرگ یا میان‌مدت" },
  { id: "T5", label: "T5 — بسیار گران", range: "30 تا 100 bps", advice: "اجرای سفارش بازار پرهزینه؛ ترجیح لیمیت" },
  { id: "T6", label: "T6 — سمّی", range: "> 100 bps", advice: "عمق ناکافی؛ عملاً غیرقابل معامله" },
];

export function ruleTierOf(spreadBps: number): string {
  for (let i = RULE_TIER_BOUNDS.length - 1; i >= 0; i--) {
    if (spreadBps >= RULE_TIER_BOUNDS[i]) return RULE_TIER_META[Math.min(i, RULE_TIER_META.length - 1)].id;
  }
  return "T1";
}

/**
 * تخمین‌گر Corwin–Schultz (2012) برای اسپرد مؤثر از سقف/کف دو روز متوالی.
 * S = 2*(e^α − 1)/(1 + e^α) ،  α = (√(2β) − √β)/(3 − 2√2) − √γ/(3 − 2√2)
 * β = ln(H/L)² ، γ = ln(H₀/L₀)²
 * خروجی: درصد (٪) — منفی یعنی تخمین بی‌معنا (بازار یک‌طرفه) => 0
 */
export function corwinSchultzSpreadPct(h1: number, l1: number, h0: number, l0: number): number {
  if (!(h1 > l1 && h0 > l0 && h1 > 0 && l1 > 0 && h0 > 0 && l0 > 0)) return NaN;
  const beta = Math.log(h1 / l1) ** 2;
  const gamma = Math.log(h0 / l0) ** 2;
  const k = 3 - 2 * Math.sqrt(2);
  const alpha = (Math.sqrt(2 * beta) - Math.sqrt(beta)) / k - Math.sqrt(gamma) / k;
  const s = (2 * (Math.exp(alpha) - 1)) / (1 + Math.exp(alpha));
  return s > 0 ? s * 100 : 0;
}

/** نوسان تحقق‌یافته سالانه‌شده‌ی روزانه از کندل‌های روزانه (درصد) */
export function realizedVolPct(dailyCloses: number[]): number | null {
  if (dailyCloses.length < 3) return null;
  const rets: number[] = [];
  for (let i = 1; i < dailyCloses.length; i++) {
    if (dailyCloses[i - 1] > 0) rets.push(Math.log(dailyCloses[i] / dailyCloses[i - 1]));
  }
  if (rets.length < 2) return null;
  const m = rets.reduce((a, b) => a + b, 0) / rets.length;
  const varr = rets.reduce((a, r) => a + (r - m) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(varr) * 100;
}

export interface BuildOptions {
  fee: FeeTier;
  now?: number;
}

/** تبدیل داده خام به ردیف هزینه‌محاسبه‌شده */
export function buildSymbolCost(raw: RawSymbolData, opts: BuildOptions): SymbolCost | null {
  const { fee } = opts;
  const now = opts.now ?? Date.now();
  const { meta, t24, book, dailyKlines } = raw;

  const last = t24.lastPrice;
  if (!(last > 0)) return null;

  // اگر دفترچه سفارش نبود، از high/low و قیمت آخر تخمین بزن (بدترین حالت)
  const bid = book && book.bidPrice > 0 ? book.bidPrice : last;
  const ask = book && book.askPrice > 0 ? book.askPrice : last;
  if (!(ask >= bid)) return null;

  const mid = (bid + ask) / 2 || last;
  const spreadAbs = ask - bid;
  const spreadBps = (spreadAbs / mid) * 10_000;
  const tickSize = meta.tickSize > 0 ? meta.tickSize : 0;
  const tickFloorBps = tickSize > 0 ? (tickSize / mid) * 10_000 : 0;
  const tickFillRatio = tickFloorBps > 0 ? spreadBps / tickFloorBps : NaN;
  const atTickFloor = tickFloorBps > 0 && spreadBps <= tickFloorBps * 1.05;

  const topDepthUsd = book ? (book.bidPrice * book.bidQty + book.askPrice * book.askQty) : NaN;

  const hi = t24.highPrice || last;
  const lo = t24.lowPrice || last;
  const rangePct = hi > lo ? ((hi - lo) / mid) * 100 : 0;
  // نوسان پارکینسون: σ = (1/(2√ln2))·ln(H/L) → درصد روزانه
  const parkinsonVolPct = hi > lo ? (Math.log(hi / lo) / (2 * Math.sqrt(Math.LN2))) * 100 : 0;
  const retAbs = t24.openPrice > 0 ? Math.abs(last / t24.openPrice - 1) : 0;
  const amihud = t24.quoteVolume > 0 ? (retAbs * 1e6) / t24.quoteVolume : NaN; // ×1e6 برای خوانایی

  // --- حالت عمیق: کندل روزانه ---
  let csSpreadBps24h: number | null = null;
  let realizedVol7dPct: number | null = null;
  if (dailyKlines && dailyKlines.length >= 2) {
    const closes = dailyKlines.map((k) => Number(k[4]));
    realizedVol7dPct = realizedVolPct(closes);
    const cur = dailyKlines[dailyKlines.length - 1];
    const prev = dailyKlines[dailyKlines.length - 2];
    const csPct = corwinSchultzSpreadPct(Number(cur[2]), Number(cur[3]), Number(prev[2]), Number(prev[3]));
    if (Number.isFinite(csPct)) csSpreadBps24h = csPct * BPS_IN_PCT;
  }

  const ageDays = meta.onboardDate ? (now - meta.onboardDate) / 86_400_000 : null;

  const oneWayCostBps = fee.takerBps + spreadBps / 2;
  const roundTripBps = 2 * fee.takerBps + spreadBps;
  const spreadOverFee = fee.takerBps > 0 ? spreadBps / (2 * fee.takerBps) : NaN;

  return {
    symbol: meta.symbol,
    base: meta.base,
    quote: meta.quote,
    lastPrice: last,
    mid,
    bid,
    ask,
    spreadAbs,
    spreadBps,
    spreadPct: spreadBps / BPS_IN_PCT,
    tickFloorBps,
    atTickFloor,
    tickFillRatio,
    topDepthUsd,
    quoteVolume24h: t24.quoteVolume,
    trades24h: t24.trades,
    rangePct24h: rangePct,
    parkinsonVolPct,
    amihud,
    csSpreadBps24h,
    realizedVol7dPct,
    ageDays,
    oneWayCostBps,
    roundTripBps,
    roundTripPct: roundTripBps / BPS_IN_PCT,
    spreadOverFee,
    breakevenMovePct: roundTripBps / BPS_IN_PCT,
    tierRule: ruleTierOf(spreadBps),
    tierData: "",
  };
}

/** ساخت نسخه به‌روزشده هزینه‌ها وقتی رده کارمزد عوض می‌شود (اسپرد ثابت می‌ماند) */
export function reprice(c: SymbolCost, fee: FeeTier): SymbolCost {
  const roundTripBps = 2 * fee.takerBps + c.spreadBps;
  return {
    ...c,
    oneWayCostBps: fee.takerBps + c.spreadBps / 2,
    roundTripBps,
    roundTripPct: roundTripBps / BPS_IN_PCT,
    spreadOverFee: fee.takerBps > 0 ? c.spreadBps / (2 * fee.takerBps) : NaN,
    breakevenMovePct: roundTripBps / BPS_IN_PCT,
  };
}

/** ویژگی‌های عددی برای خوشه‌بندی چندبعدی */
export function clusterFeatures(c: SymbolCost): number[] {
  return [
    safeLog10(Math.max(c.spreadBps, 0.01)),
    safeLog10(Math.max(c.quoteVolume24h, 1)),
    safeLog10(Math.max(c.tickFloorBps, 0.001)),
    safeLog10(Math.max(c.rangePct24h, 0.01)),
  ];
}

/** میانه امن (NaN-safe) */
export function safeMedian(xs: (number | null | undefined)[]): number {
  return median(xs.filter((x): x is number => typeof x === "number" && Number.isFinite(x)));
}
