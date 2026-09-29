/** ابزارهای آماری پایه — بدون وابستگی خارجی */

export const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
export const mean = (a: number[]) => (a.length ? sum(a) / a.length : NaN);

export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function quantiles(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  return {
    n: s.length,
    min: s[0] ?? NaN,
    p05: quantile(s, 0.05),
    p25: quantile(s, 0.25),
    median: quantile(s, 0.5),
    p75: quantile(s, 0.75),
    p95: quantile(s, 0.95),
    max: s[s.length - 1] ?? NaN,
    iqr: quantile(s, 0.75) - quantile(s, 0.25),
    mean: mean(s),
  };
}

export function stdev(a: number[]): number {
  if (a.length < 2) return NaN;
  const m = mean(a);
  return Math.sqrt(sum(a.map((x) => (x - m) ** 2)) / (a.length - 1));
}

export function histogram(values: number[], binCount = 24) {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length < 2) return [];
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  if (min === max) return [{ x0: min, x1: min, count: clean.length, label: fmtBin(min, min) }];
  const width = (max - min) / binCount;
  const bins = Array.from({ length: binCount }, (_, i) => ({
    x0: min + i * width,
    x1: min + (i + 1) * width,
    count: 0,
    label: '',
  }));
  for (const v of clean) {
    const idx = Math.min(binCount - 1, Math.floor((v - min) / width));
    bins[idx].count++;
  }
  return bins.map((b) => ({ ...b, label: fmtBin(b.x0, b.x1) }));
}

export function fmtBin(x0: number, x1: number) {
  const dec = Math.abs(x1 - x0) < 0.01 ? 3 : Math.abs(x1 - x0) < 0.1 ? 3 : 2;
  return `${x0.toFixed(dec)}–${x1.toFixed(dec)}`;
}

/** رتبه‌بندی با میانگین رتبه (برای هم‌بندی) */
function ranks(x: number[]): number[] {
  const idx = x.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(x.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}

/** همبستگی رتبه‌ای اسپیرمَن + p-value تقریبی (t با df=n-2) */
export function spearman(x: number[], y: number[]): { rho: number; p: number; n: number } {
  const pairs = x.map((v, i) => [v, y[i]] as const).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  const n = pairs.length;
  if (n < 6) return { rho: NaN, p: NaN, n };
  const xs = pairs.map((p) => p[0]);
  const ys = pairs.map((p) => p[1]);
  const rx = ranks(xs);
  const ry = ranks(ys);
  const mx = mean(rx);
  const my = mean(ry);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  const rho = dx && dy ? num / Math.sqrt(dx * dy) : NaN;
  const df = n - 2;
  const t = rho * Math.sqrt(df / Math.max(1e-12, 1 - rho * rho));
  const p = 2 * (1 - studentTCdf(Math.abs(t), df));
  return { rho, p, n };
}

function logGamma(z: number): number {
  const g = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1;
  let x = 0.99999999999980993;
  for (let i = 0; i < g.length; i++) x += g[i] / (z + i + 1);
  const t = z + g.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200;
  const EPS = 3e-12;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

function betai(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}

function studentTCdf(t: number, df: number): number {
  const x = df / (df + t * t);
  return 1 - 0.5 * betai(df / 2, 0.5, x);
}

/** آزمون t ولچ روی داده‌های نرمال‌شده (اینجا: لگاریتم اسپرد) */
export function welchT(a: number[], b: number[]) {
  const A = a.filter(Number.isFinite);
  const B = b.filter(Number.isFinite);
  if (A.length < 3 || B.length < 3) return null;
  const ma = mean(A);
  const mb = mean(B);
  const va = (stdev(A) ?? 0) ** 2 / A.length;
  const vb = (stdev(B) ?? 0) ** 2 / B.length;
  const t = (ma - mb) / Math.sqrt(va + vb);
  const df = (va + vb) ** 2 / (va ** 2 / (A.length - 1) + vb ** 2 / (B.length - 1));
  const p = 2 * (1 - studentTCdf(Math.abs(t), df));
  const pooled = Math.sqrt(((A.length - 1) * (stdev(A) ?? 0) ** 2 + (B.length - 1) * (stdev(B) ?? 0) ** 2) / (A.length + B.length - 2) || 1e-12);
  const d = (ma - mb) / pooled;
  return { t, df, p, d, nA: A.length, nB: B.length, meanA: ma, meanB: mb };
}

export function describeEffect(d: number): string {
  const ad = Math.abs(d);
  if (ad < 0.2) return 'بی‌اثر';
  if (ad < 0.5) return 'اثر کوچک';
  if (ad < 0.8) return 'اثر متوسط';
  return 'اثر بزرگ';
}
