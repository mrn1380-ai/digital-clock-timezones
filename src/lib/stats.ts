/** ابزارهای آماری کوچک و وابسته‌نیست (بدون numpy/scipy) */

/** میانه؛ برای آرایه خالی NaN */
export function median(xs: number[]): number {
  return quantile(xs, 0.5);
}

export function quantile(xs: number[], q: number): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return NaN;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function stdev(xs: number[]): number {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

export function safeLog10(x: number): number {
  return x > 0 ? Math.log10(x) : NaN;
}

/** رتبه‌بندی با میانگین برای داده‌های هم‌بیه (ties) */
export function rank(xs: number[]): number[] {
  const idx = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(xs.length);
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

/** ضریب همبستگی اسپیرمن (مقاوم به پرت) */
export function spearman(a: number[], b: number[]): number {
  const pairs = a.map((v, i) => [v, b[i]] as const).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (pairs.length < 3) return NaN;
  const rx = rank(pairs.map((p) => p[0]));
  const ry = rank(pairs.map((p) => p[1]));
  return pearson(rx, ry);
}

export function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return NaN;
  const ma = mean(a.slice(0, n));
  const mb = mean(b.slice(0, n));
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  const den = Math.sqrt(da * db);
  return den === 0 ? NaN : num / den;
}

/** برازش لگاریتمی-لگاریتمی: log(y) = a + b*log(x) — برای رابطه spread و حجم */
export function logLogFit(x: number[], y: number[]): { slope: number; intercept: number; r2: number } {
  const pts = x.map((v, i) => [v, y[i]] as const).filter(([a, b]) => a > 0 && b > 0 && Number.isFinite(a) && Number.isFinite(b));
  if (pts.length < 3) return { slope: NaN, intercept: NaN, r2: NaN };
  const lx = pts.map((p) => Math.log10(p[0]));
  const ly = pts.map((p) => Math.log10(p[1]));
  const b = pearson(lx, ly) * stdev(ly) / stdev(lx);
  const a = mean(ly) - b * mean(lx);
  const m = mean(ly);
  const ssTot = ly.reduce((s, v) => s + (v - m) ** 2, 0);
  const ssRes = ly.reduce((s, v) => s + (v - (a + b * lx[ly.indexOf(v)])) ** 2, 0);
  return { slope: b, intercept: a, r2: ssTot === 0 ? NaN : 1 - ssRes / ssTot };
}

export interface KMeansResult {
  labels: number[];
  centers: number[][];
  inertia: number;
}

/**
 * k-means با مقدار اولیه‌ی k-means++ و seed ثابت => خروجی قطعی و تکرارپذیر.
 * (برای خوشه‌بندی بدون وابستگی خارجی و قابل بازتولید)
 */
export function kmeans(points: number[][], k: number, seed = 42, iters = 120): KMeansResult {
  const n = points.length;
  if (n === 0) return { labels: [], centers: [], inertia: 0 };
  if (n <= k) return { labels: points.map((_, i) => i), centers: points.map((p) => [...p]), inertia: 0 };

  const d = points[0].length;
  let rnd = mulberry32(seed);
  const centers: number[][] = [];
  centers.push([...points[Math.floor(rnd() * n)]]);
  while (centers.length < k) {
    const dists = points.map((p) => {
      let best = Infinity;
      for (const c of centers) {
        let s = 0;
        for (let j = 0; j < d; j++) s += (p[j] - c[j]) ** 2;
        best = Math.min(best, s);
      }
      return best;
    });
    const total = dists.reduce((a, b) => a + b, 0);
    let target = rnd() * total;
    let pick = 0;
    for (let i = 0; i < n; i++) {
      target -= dists[i];
      if (target <= 0) {
        pick = i;
        break;
      }
    }
    centers.push([...points[pick]]);
  }

  let labels = new Array<number>(n).fill(0);
  for (let it = 0; it < iters; it++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < centers.length; c++) {
        let s = 0;
        for (let j = 0; j < d; j++) s += (points[i][j] - centers[c][j]) ** 2;
        if (s < bestD) {
          bestD = s;
          best = c;
        }
      }
      if (labels[i] !== best) {
        labels[i] = best;
        changed = true;
      }
    }
    const sums = Array.from({ length: centers.length }, () => new Array(d).fill(0));
    const counts = new Array(centers.length).fill(0);
    for (let i = 0; i < n; i++) {
      counts[labels[i]]++;
      for (let j = 0; j < d; j++) sums[labels[i]][j] += points[i][j];
    }
    for (let c = 0; c < centers.length; c++) {
      if (counts[c] === 0) {
        centers[c] = [...points[Math.floor(rnd() * n)]];
        continue;
      }
      for (let j = 0; j < d; j++) centers[c][j] = sums[c][j] / counts[c];
    }
    if (!changed && it > 2) break;
  }

  let inertia = 0;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < d; j++) s += (points[i][j] - centers[labels[i]][j]) ** 2;
    inertia += s;
  }
  return { labels, centers, inertia };
}

/** k-means یک‌بعدی روی مقادیر (برای یافتن شکست‌های طبیعی توزیع) */
export function kmeans1d(values: number[], k: number): { sorted: number[]; boundaries: number[] } {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length <= k) return { sorted, boundaries: [] };
  const km = kmeans(
    sorted.map((v) => [v]),
    k,
    7,
  );
  const centers = km.centers.map((c) => c[0]).sort((a, b) => a - b);
  const boundaries: number[] = [];
  for (let c = 0; c < centers.length - 1; c++) {
    const mid = (centers[c] + centers[c + 1]) / 2;
    const below = sorted.filter((v) => v <= mid);
    const above = sorted.filter((v) => v > mid);
    if (below.length === 0 || above.length === 0) continue;
    // برش بین نزدیک‌ترین دو مشاهدهٔ دو طرف مرز
    boundaries.push((below[below.length - 1] + above[0]) / 2);
  }
  return { sorted, boundaries: boundaries.sort((a, b) => a - b) };
}

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
