// All market costs are basis points (1 bp = 0.01%). Public bookTicker is a single top-of-book snapshot.
export const USD_QUOTES = new Set(['USDT', 'USDC', 'FDUSD', 'TUSD', 'USDP', 'DAI', 'USD1', 'BUSD']);
export const BINS = [0, 1, 2, 5, 10, 25, 50, 100, Infinity];
export const BIN_LABELS = ['۰–۱', '۱–۲', '۲–۵', '۵–۱۰', '۱۰–۲۵', '۲۵–۵۰', '۵۰–۱۰۰', '۱۰۰+'];

export function feeFor(market, quote, fees) {
  if (market === 'futures') return { maker: fees.futuresMaker, taker: fees.futuresTaker };
  return { maker: fees.spotMaker, taker: quote === 'USDC' ? fees.spotUsdcTaker : fees.spotTaker };
}
export const defaultFees = { spotMaker: 10, spotTaker: 10, spotUsdcTaker: 9.5, futuresMaker: 2, futuresTaker: 5 };

export function normalizeMarket(payload, market, fees = defaultFees) {
  if (!payload || payload.error || !Array.isArray(payload.exchange?.symbols) || !Array.isArray(payload.book)) return [];
  const books = new Map(payload.book.map(x => [x.symbol, x]));
  const stats = new Map((payload.stats || []).map(x => [x.symbol, x]));
  const rows = [];
  for (const info of payload.exchange.symbols) {
    if (info.status !== 'TRADING' || market === 'spot' && info.isSpotTradingAllowed === false) continue;
    const b = books.get(info.symbol);
    const bid = Number(b?.bidPrice), ask = Number(b?.askPrice);
    if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= bid) continue;
    const mid = (bid + ask) / 2;
    const spread = (ask - bid) / mid * 10000;
    const tick = Number(info.filters?.find(f => f.filterType === 'PRICE_FILTER')?.tickSize);
    const turnover = Number(stats.get(info.symbol)?.quoteVolume);
    const quote = info.quoteAsset || info.marginAsset || '—';
    const fee = feeFor(market, quote, fees);
    rows.push({
      symbol: info.symbol, base: info.baseAsset || info.symbol, quote, market, bid, ask, mid,
      spread, tickBps: tick > 0 ? tick / mid * 10000 : null,
      volume: USD_QUOTES.has(quote) && Number.isFinite(turnover) && turnover >= 0 ? turnover : null,
      feeMaker: fee.maker, feeTaker: fee.taker, roundtrip: spread + 2 * fee.taker,
      topNotional: Math.min(Number(b.bidQty) * bid, Number(b.askQty) * ask)
    });
  }
  return rows;
}
export function percentile(sorted, p) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
export function summary(rows, key = 'spread') {
  const vals = rows.map(r => r[key]).filter(Number.isFinite).sort((a, b) => a - b);
  if (!vals.length) return { n: 0, median: null, p90: null, p25: null, p75: null, min: null, max: null };
  return { n: vals.length, median: percentile(vals, .5), p90: percentile(vals, .9), p25: percentile(vals, .25), p75: percentile(vals, .75), min: vals[0], max: vals.at(-1) };
}
export function histogram(rows, key = 'spread') {
  const bins = Array(BINS.length - 1).fill(0);
  for (const r of rows) {
    const v = r[key];
    if (!Number.isFinite(v) || v < 0) continue;
    const i = BINS.findIndex((edge, j) => j < BINS.length - 1 && v >= edge && v < BINS[j + 1]);
    if (i >= 0) bins[i]++;
  }
  return bins;
}
export function volumeQuartiles(rows) {
  const eligible = rows.filter(r => Number.isFinite(r.volume) && r.volume > 0).sort((a,b) => a.volume - b.volume);
  const groups = [[], [], [], []];
  eligible.forEach((r, i) => groups[Math.min(3, Math.floor(i * 4 / eligible.length))].push(r));
  return groups;
}
export function grouped(rows, factor) {
  const buckets = new Map();
  const add = (name, r) => { if (!buckets.has(name)) buckets.set(name, []); buckets.get(name).push(r); };
  if (factor === 'volume') {
    volumeQuartiles(rows).forEach((group, i) => group.forEach(r => add(['کم‌حجم Q1', 'Q2', 'Q3', 'پرحجم Q4'][i], r)));
  } else {
    rows.forEach(r => {
      let name = r.market === 'spot' ? 'اسپات' : 'فیوچرز';
      if (factor === 'quote') name = r.quote;
      if (factor === 'tick') name = r.tickBps == null ? 'نامشخص' : r.tickBps < 1 ? 'کمتر از ۱ bp' : r.tickBps < 5 ? '۱ تا ۵ bp' : '۵ bp و بیشتر';
      add(name, r);
    });
  }
  const out = [...buckets].map(([name, items]) => ({ name, ...summary(items), items }));
  return factor === 'volume' || factor === 'tick' ? out : out.sort((a,b) => b.n - a.n);
}
export function practicalGap(groups) {
  const eligible = groups.filter(g => g.n >= 10 && g.median != null);
  if (eligible.length < 2) return null;
  const lo = [...eligible].sort((a,b) => a.median - b.median)[0];
  const hi = [...eligible].sort((a,b) => b.median - a.median)[0];
  return { lo, hi, ratio: lo.median ? hi.median / lo.median : Infinity, significant: hi.median - lo.median >= 1 && hi.median >= 2 * lo.median };
}
