import { BooksMap } from './nobitex';
import { FeeTier, QuoteKind, feeFor, quoteKind, splitSymbol } from './fees';
import {
  describeEffect,
  quantile,
  quantiles,
  spearman,
  stdev,
  sum,
  welchT,
} from './stats';

export type SpreadTier = 'TIGHT' | 'NORMAL' | 'WIDE' | 'VERY_WIDE';
export type DepthTier = 'DEEP' | 'MID' | 'THIN';
export type QualityClass =
  | 'DEEP_CHEAP'      // پرعمق و کم‌هزینه → مناسب اسکالپ
  | 'BALANCED'        // متعادل
  | 'THIN_CHEAP'      // تنگ ولی کم‌عمق → ریسک اسلیپیج
  | 'DEEP_EXPENSIVE'  // پرعمق ولی اسپرد بالا
  | 'WIDE_THIN'       // گران و کم‌عمق → اجتناب
  | 'NEW_LISTING';    // دفتر سفارش نازک/خالی

export interface MarketRow {
  symbol: string;
  base: string;
  quote: string;
  kind: QuoteKind;
  fee: FeeTier;
  bid: number;
  ask: number;
  mid: number;
  last: number;
  spreadAbs: number;
  spreadPct: number;
  logSpread: number;
  makerPct: number;
  takerPct: number;
  entryCostPct: number;
  roundTripTakerPct: number;
  roundTripMakerPct: number;
  depthQuote: number;
  depthUsd: number;
  depthUnit: 'USD' | 'NATIVE';
  bidDepthPct: number;
  levels: number;
  staleSec: number;
  hasBook: boolean;
  deviationPct: number;
  spreadTier: SpreadTier;
  depthTier: DepthTier;
  quality: QualityClass;
  score: number;
}

export const SPREAD_TIER_LABEL: Record<SpreadTier, string> = {
  TIGHT: 'تنگ',
  NORMAL: 'متعارف',
  WIDE: 'باز',
  VERY_WIDE: 'بسیار باز',
};
export const DEPTH_TIER_LABEL: Record<DepthTier, string> = {
  DEEP: 'پرعمق',
  MID: 'متوسط',
  THIN: 'کم‌عمق',
};
export const QUALITY_LABEL: Record<QualityClass, { title: string; desc: string; color: string }> = {
  DEEP_CHEAP: { title: 'پرعمق و کم‌هزینه', desc: 'بهترین جای اجرای سفارش‌های بزرگ و اسکالپ', color: '#22c55e' },
  BALANCED: { title: 'متعادل', desc: 'هزینه و عمق در حد قابل قبول', color: '#0ea5e9' },
  THIN_CHEAP: { title: 'تنگ ولی کم‌عمق', desc: 'اسپرد کم اما حجم کم؛ مراقب اسلیپیج', color: '#eab308' },
  DEEP_EXPENSIVE: { title: 'عمیق ولی گران', desc: 'حجم زیاد با اسپرد بالا؛ صبر یا لیمیت بهتر است', color: '#f97316' },
  WIDE_THIN: { title: 'گران و کم‌عمق', desc: 'بدترین حالت اجرا؛ اجتناب شود', color: '#ef4444' },
  NEW_LISTING: { title: 'دفتر سفارش نازک/خالی', desc: 'بدون دو سر نقدینگی — قابل معامله نیست', color: '#64748b' },
};

const toNum = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

function notional(levels: [string, string][], depth = 10) {
  let total = 0;
  for (let i = 0; i < Math.min(depth, levels.length); i++) {
    total += toNum(levels[i][0]) * toNum(levels[i][1]);
  }
  return total;
}

/** ۱) تبدیل خام دفتر سفارش به متریک‌های قابل تحلیل */
export function buildRows(books: BooksMap, now = Date.now()): MarketRow[] {
  const rows: MarketRow[] = [];
  for (const [symbol, b] of Object.entries(books)) {
    const { base, quote } = splitSymbol(symbol);
    const kind = quoteKind(quote);
    const fee = feeFor(quote);
    const bids = (b.bids ?? b.bid ?? []) as [string, string][];
    const asks = (b.asks ?? b.ask ?? []) as [string, string][];
    const bestBid = bids.length ? toNum(bids[0][0]) : NaN;
    const bestAsk = asks.length ? toNum(asks[0][0]) : NaN;
    const last = toNum(b.lastTradePrice ?? b.lastTrade?.price) || (bestBid + bestAsk) / 2;
    const hasBook = Number.isFinite(bestBid) && Number.isFinite(bestAsk) && bestAsk >= bestBid && bestBid > 0;
    const mid = hasBook ? (bestBid + bestAsk) / 2 : last;
    const spreadAbs = hasBook ? bestAsk - bestBid : NaN;
    const spreadPct = hasBook ? (spreadAbs / mid) * 100 : NaN;
    const depthQuote = notional(bids) + notional(asks);
    const depthBid = notional(bids);
    rows.push({
      symbol,
      base,
      quote,
      kind,
      fee,
      bid: bestBid,
      ask: bestAsk,
      mid,
      last,
      spreadAbs,
      spreadPct,
      logSpread: hasBook ? Math.log(Math.max(spreadPct, 1e-9)) : NaN,
      makerPct: fee.makerPct,
      takerPct: fee.takerPct,
      entryCostPct: hasBook ? spreadPct / 2 + fee.takerPct : NaN,
      roundTripTakerPct: hasBook ? spreadPct + 2 * fee.takerPct : NaN,
      roundTripMakerPct: 2 * fee.makerPct,
      depthQuote,
      depthUsd: depthQuote, // در مرحله normalize به USDT تبدیل می‌شود
      depthUnit: 'NATIVE',
      bidDepthPct: depthQuote > 0 ? (depthBid / depthQuote) * 100 : 50,
      levels: Math.min(bids.length, asks.length),
      staleSec: b.lastUpdate ? Math.max(0, (now - b.lastUpdate) / 1000) : NaN,
      hasBook,
      deviationPct: mid > 0 ? ((last - mid) / mid) * 100 : 0,
      spreadTier: 'NORMAL',
      depthTier: 'MID',
      quality: 'BALANCED',
      score: 0,
    });
  }
  return rows;
}

/** ۲) یکسان‌سازی مقیاس عمق: بازار ریالی را با نرخ USDTIRT و بازار بیت‌کوینی را با BTCUSDT به دلار تبدیل می‌کنیم */
export function normalizeDepth(rows: MarketRow[]) {
  const usdtIrt = rows.find((r) => r.symbol === 'USDTIRT' && r.hasBook)?.mid
    ?? rows.find((r) => r.base === 'USDT' && r.quote === 'IRT' && r.hasBook)?.mid
    ?? NaN;
  const btcUsd = rows.find((r) => r.symbol === 'BTCUSDT' && r.hasBook)?.mid ?? NaN;
  const factor = (q: string) => {
    if (q === 'USDT') return 1;
    if (q === 'IRT') return Number.isFinite(usdtIrt) ? 1 / usdtIrt : NaN;
    if (q === 'BTC') return Number.isFinite(btcUsd) ? 1 / btcUsd : NaN;
    return NaN;
  };
  rows.forEach((r) => {
    const f = factor(r.quote);
    r.depthUsd = Number.isFinite(f) ? r.depthQuote * f : r.depthQuote;
    r.depthUnit = Number.isFinite(f) ? 'USD' : 'NATIVE';
  });
  return { usdtIrt, btcUsd };
}

/** ۳) آستانه‌های مبتنی بر چارک و دسته‌بندی قوانین‌محور */
export function classify(rows: MarketRow[]) {
  const live = rows.filter((r) => r.hasBook);
  const sp = live.map((r) => r.logSpread).sort((a, b) => a - b);
  const dp = live.map((r) => r.depthUsd).sort((a, b) => a - b);

  const spQ = (q: number) => quantile(sp, q);
  const dpQ = (q: number) => quantile(dp, q);
  const t1 = spQ(0.25);
  const t2 = spQ(0.5);
  const t3 = spQ(0.75);
  const t4 = spQ(0.92);
  const d1 = dpQ(0.33);
  const d2 = dpQ(0.66);

  const maxDepth = Math.max(...dp, 1);
  const minSpread = Math.min(...sp, 0);
  const spRange = Math.max(t4 - minSpread, 1e-9);

  for (const r of rows) {
    if (!r.hasBook) {
      r.spreadTier = 'VERY_WIDE';
      r.depthTier = 'THIN';
      r.quality = 'NEW_LISTING';
      r.score = 0;
      continue;
    }
    const ls = r.logSpread;
    r.spreadTier = ls < t1 ? 'TIGHT' : ls < t2 ? 'NORMAL' : ls < t3 ? 'WIDE' : ls < t4 ? 'VERY_WIDE' : 'VERY_WIDE';
    r.depthTier = r.depthUsd >= d2 ? 'DEEP' : r.depthUsd >= d1 ? 'MID' : 'THIN';

    // نرمال‌سازی هزینه: ۰ = ارزان‌ترین، ۱ = گران‌ترین اسپرد بازار
    const costNorm = (ls - minSpread) / spRange;
    const depthNorm = maxDepth > 0 ? Math.log10(Math.max(r.depthUsd, 1)) / Math.log10(maxDepth) : 0;
    const stalePenalty = Number.isFinite(r.staleSec) ? Math.min(0.25, (r.staleSec / 600) * 0.25) : 0.25;
    r.score = Math.round(
      100 * (0.6 * (1 - costNorm) + 0.4 * Math.min(1, depthNorm)) - 20 * stalePenalty
    );
    r.score = Math.max(0, Math.min(100, r.score));

    const wide = r.spreadTier === 'WIDE' || r.spreadTier === 'VERY_WIDE';
    const tight = r.spreadTier === 'TIGHT';
    if (r.depthTier === 'DEEP') r.quality = wide ? 'DEEP_EXPENSIVE' : 'DEEP_CHEAP';
    else if (r.depthTier === 'THIN') r.quality = wide ? 'WIDE_THIN' : 'THIN_CHEAP';
    else r.quality = wide ? 'WIDE_THIN' : 'BALANCED';
    if (!r.levels || r.levels < 3) r.quality = 'NEW_LISTING';
    if (tight && r.depthTier === 'MID') r.quality = 'BALANCED';
  }

  return {
    spreadCuts: { t1: Math.exp(t1), t2: Math.exp(t2), t3: Math.exp(t3), t4: Math.exp(t4) },
    depthCuts: { d1, d2 },
  };
}

/** ۴) آیا تفاوت بین گروه‌ها واقعاً معنی‌دار است؟ */
export interface GroupTest {
  id: string;
  label: string;
  groupA: string;
  groupB: string;
  nA: number;
  nB: number;
  geoA: number;
  geoB: number;
  ratio: number;
  p: number;
  d: number;
  effect: string;
  meaningful: boolean;
  note: string;
}

function geoMean(logs: number[]) {
  const v = logs.filter(Number.isFinite);
  return v.length ? Math.exp(sum(v) / v.length) : NaN;
}

export function runGroupTests(rows: MarketRow[]): GroupTest[] {
  const live = rows.filter((r) => r.hasBook);
  const out: GroupTest[] = [];
  const push = (id: string, label: string, A: MarketRow[], B: MarketRow[]) => {
    const t = welchT(A.map((r) => r.logSpread), B.map((r) => r.logSpread));
    if (!t) return;
    const geoA = geoMean(A.map((r) => r.logSpread));
    const geoB = geoMean(B.map((r) => r.logSpread));
    const ratio = geoA / geoB;
    const meaningful = t.p < 0.05 && Math.abs(t.d) >= 0.5;
    out.push({
      id,
      label,
      groupA: A[0]?.kind === undefined ? A[0]?.spreadTier || 'A' : labelA(id, A),
      groupB: labelB(id, B),
      nA: t.nA,
      nB: t.nB,
      geoA,
      geoB,
      ratio,
      p: t.p,
      d: t.d,
      effect: describeEffect(t.d),
      meaningful,
      note: meaningful
        ? `اسپرد هندسی گروه اول ${ratio.toFixed(2)}× گروه دوم؛ تفاوت از نظر آماری معنی‌دار است.`
        : `نسبت اسپرد ${ratio.toFixed(2)}×؛ تفاوت از نظر آماری معنی‌دار نیست (p=${t.p.toFixed(3)}).`,
    });
  };

  const byKind = (k: QuoteKind) => live.filter((r) => r.kind === k);
  push('kind-irt-usdt', 'نوع بازار: ریالی در برابر تتری', byKind('IRT'), byKind('USDT'));
  push('kind-usdt-other', 'نوع بازار: تتری در برابر سایر', byKind('USDT'), byKind('OTHER'));

  const deep = live.filter((r) => r.depthTier === 'DEEP');
  const thin = live.filter((r) => r.depthTier === 'THIN');
  push('depth-deep-thin', 'نقدینگی: پرعمق در برابر کم‌عمق', deep, thin);

  const fresh = live.filter((r) => r.staleSec <= 30);
  const stale = live.filter((r) => Number.isFinite(r.staleSec) && r.staleSec > 120);
  push('fresh-stale', 'تازگی داده: تازه در برابر کهنه', fresh, stale);

  return out;
}

function labelA(id: string, A: MarketRow[]) {
  if (id.startsWith('kind')) return A[0]?.fee.short ?? 'A';
  if (id.startsWith('depth')) return 'پرعمق';
  return 'تازه';
}
function labelB(id: string, B: MarketRow[]) {
  if (id === 'kind-irt-usdt') return 'تتری';
  if (id === 'kind-usdt-other') return 'سایر';
  if (id.startsWith('depth')) return 'کم‌عمق';
  return 'کهنه';
}

export interface Driver {
  factor: string;
  rho: number;
  p: number;
  n: number;
  strength: 'بسیار قوی' | 'قوی' | 'متوسط' | 'ضعیف' | 'بی‌ارتباط';
  direction: string;
}

/** ۵) عوامل تغییر اسپرد: چه چیزی واقعاً اسپرد را توضیح می‌دهد؟ */
export function findDrivers(rows: MarketRow[]): Driver[] {
  const live = rows.filter((r) => r.hasBook && r.depthUsd > 0);
  const s = live.map((r) => r.logSpread);
  const cands: { factor: string; x: number[]; pos: string; neg: string }[] = [
    { factor: 'عمق سفارش (لگاریتم)', x: live.map((r) => Math.log10(r.depthUsd)), pos: 'عمق بیشتر ⇒ اسپرد کمتر', neg: 'عمق بیشتر ⇒ اسپرد بیشتر' },
    { factor: 'اختلاف کارمزد ریالی و تتری', x: live.map((r) => r.takerPct), pos: 'بازار گران‌تر ⇒ اسپرد بیشتر', neg: 'بازار گران‌تر ⇒ اسپرد کمتر' },
    { factor: 'تعداد سطوح دفتر سفارش', x: live.map((r) => r.levels), pos: 'عمق بیشتر ⇒ اسپرد کمتر', neg: 'عمق بیشتر ⇒ اسپرد بیشتر' },
    { factor: 'تأخیر داده (ثانیه)', x: live.map((r) => r.staleSec), pos: 'داده کهنه ⇒ اسپرد بیشتر', neg: 'داده کهنه ⇒ اسپرد کمتر' },
    { factor: 'سطح قیمت (لگاریتم)', x: live.map((r) => Math.log10(Math.max(r.mid, 1e-9))), pos: 'قیمت بالاتر ⇒ اسپرد کمتر', neg: 'قیمت بالاتر ⇒ اسپرد بیشتر' },
    { factor: 'عدم توازن عرضه/تقاضا', x: live.map((r) => Math.abs(r.bidDepthPct - 50)), pos: 'کم‌عمقی یک‌طرفه ⇒ اسپرد بیشتر', neg: 'کم‌عمقی یک‌طرفه ⇒ اسپرد کمتر' },
  ];
  const drivers: Driver[] = cands.map((c) => {
    const { rho, p, n } = spearman(c.x, s);
    const a = Math.abs(rho);
    return {
      factor: c.factor,
      rho,
      p,
      n,
      strength: !Number.isFinite(a) || a < 0.1 ? 'بی‌ارتباط' : a < 0.3 ? 'ضعیف' : a < 0.5 ? 'متوسط' : a < 0.7 ? 'قوی' : 'بسیار قوی',
      direction: rho >= 0 ? c.pos : c.neg,
    };
  });
  return drivers.sort((a, b) => Math.abs(b.rho) - Math.abs(a.rho));
}

export interface Summary {
  total: number;
  live: number;
  empty: number;
  medianSpread: number;
  p95Spread: number;
  medianFee: number;
  medianRoundTrip: number;
  medianEntryCost: number;
  feeDistinct: { fee: number; count: number }[];
  feeMeaningful: string;
  spreadMeaningful: string;
  usdtIrt: number;
  spreadStats: ReturnType<typeof quantiles>;
  depthStats: ReturnType<typeof quantiles>;
}

export function summarize(rows: MarketRow[], usdtIrt: number): Summary {
  const live = rows.filter((r) => r.hasBook);
  const spreadStats = quantiles(live.map((r) => r.spreadPct));
  const depthStats = quantiles(live.map((r) => r.depthUsd));
  const feeMap = new Map<number, number>();
  live.forEach((r) => feeMap.set(r.takerPct, (feeMap.get(r.takerPct) ?? 0) + 1));
  const feeDistinct = [...feeMap.entries()].map(([fee, count]) => ({ fee, count })).sort((a, b) => a.fee - b.fee);

  const feeVals = feeDistinct.map((f) => f.fee);
  const feeSpread = feeVals.length > 1 ? Math.max(...feeVals) / Math.min(...feeVals) : 1;
  const feeMean = sum(feeVals) / (feeVals.length || 1);
  const feeSd = stdev(feeVals) || 0;

  return {
    total: rows.length,
    live: live.length,
    empty: rows.length - live.length,
    medianSpread: spreadStats.median,
    p95Spread: spreadStats.p95,
    medianFee: live.length ? live.map((r) => r.takerPct).sort((a, b) => a - b)[Math.floor(live.length / 2)] : NaN,
    medianRoundTrip: quantiles(live.map((r) => r.roundTripTakerPct)).median,
    medianEntryCost: quantiles(live.map((r) => r.entryCostPct)).median,
    feeDistinct,
    feeMeaningful:
      feeSpread >= 1.3 && feeSd / (feeMean || 1) > 0.15
        ? `کارمزد بین بازارها معنی‌دار متفاوت است (نسبت ${feeSpread.toFixed(2)}×، ${feeVals.length} مقدار متمایز). محرک اصلی: ارز مقصد بازار.`
        : 'کارمزد تقریباً یکنواخت است؛ تفاوت معنی‌داری بین نمادها دیده نمی‌شود.',
    spreadMeaningful: '',
    usdtIrt,
    spreadStats,
    depthStats,
  };
}

export interface ClassSummary {
  quality: QualityClass;
  title: string;
  desc: string;
  color: string;
  count: number;
  share: number;
  medianSpread: number;
  medianEntryCost: number;
  medianDepth: number;
  examples: string[];
}

export function summarizeClasses(rows: MarketRow[]): ClassSummary[] {
  const live = rows.filter((r) => r.hasBook);
  const keys = Object.keys(QUALITY_LABEL) as QualityClass[];
  return keys
    .map((k) => {
      const g = live.filter((r) => r.quality === k);
      const meta = QUALITY_LABEL[k];
      return {
        quality: k,
        title: meta.title,
        desc: meta.desc,
        color: meta.color,
        count: g.length,
        share: live.length ? (g.length / live.length) * 100 : 0,
        medianSpread: quantiles(g.map((r) => r.spreadPct)).median,
        medianEntryCost: quantiles(g.map((r) => r.entryCostPct)).median,
        medianDepth: quantiles(g.map((r) => r.depthUsd)).median,
        examples: g.sort((a, b) => b.depthUsd - a.depthUsd).slice(0, 6).map((r) => r.symbol),
      };
    })
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);
}
