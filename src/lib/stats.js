/* ============================================================
 * کتابخانه آمار توصیفی و استنباطی (بدون وابستگی خارجی)
 * Descriptive + non-parametric inference + OLS + k-means
 * ==========================================================*/

export const EPS = 1e-12

/* ---------------- توابع پایه ---------------- */
export const sum = (a) => a.reduce((s, v) => s + v, 0)
export const mean = (a) => (a.length ? sum(a) / a.length : NaN)
export const variance = (a) => {
  if (a.length < 2) return NaN
  const m = mean(a)
  return sum(a.map((v) => (v - m) ** 2)) / (a.length - 1)
}
export const sd = (a) => Math.sqrt(variance(a))

export function quantile(sorted, p) {
  const n = sorted.length
  if (!n) return NaN
  if (n === 1) return sorted[0]
  const idx = (n - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

export function describe(values) {
  const v = values.filter((x) => Number.isFinite(x)).slice().sort((a, b) => a - b)
  const n = v.length
  if (!n) return { n: 0 }
  const m = mean(v)
  const s = sd(v)
  const q = (p) => quantile(v, p)
  const iqr = q(0.75) - q(0.25)
  const skew = n > 2 && s > EPS ? (n / ((n - 1) * (n - 2))) * sum(v.map((x) => ((x - m) / s) ** 3)) : NaN
  const kurt =
    n > 3 && s > EPS
      ? sum(v.map((x) => ((x - m) / s) ** 4)) / n - 3
      : NaN
  const med = q(0.5)
  const mad = median(v.map((x) => Math.abs(x - med)))
  return {
    n,
    mean: m,
    sd: s,
    cv: m !== 0 ? s / Math.abs(m) : NaN,
    min: v[0],
    max: v[n - 1],
    p05: q(0.05),
    p10: q(0.1),
    p25: q(0.25),
    median: med,
    p75: q(0.75),
    p90: q(0.9),
    p95: q(0.95),
    iqr,
    skew,
    kurt,
    mad,
    gmean: v.every((x) => x > 0) ? Math.exp(mean(v.map(Math.log))) : NaN,
  }
}

export const median = (arr) => {
  const v = arr.filter(Number.isFinite).slice().sort((a, b) => a - b)
  return v.length ? quantile(v, 0.5) : NaN
}

/* ---------------- توابع توزیع ---------------- */
export function erf(x) {
  // Abramowitz & Stegun 7.1.26
  const s = x < 0 ? -1 : 1
  x = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * x)
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x)
  return s * y
}
export const normalCdf = (z) => 0.5 * (1 + erf(z / Math.SQRT2))
export const normalSf = (z) => 1 - normalCdf(z)

// Lower regularized incomplete gamma P(a,x)
function gser(a, x) {
  let ap = a,
    s = 1 / a,
    d = 1 / a
  for (let i = 0; i < 500; i++) {
    ap += 1
    d *= x / ap
    s += d
    if (Math.abs(d) < Math.abs(s) * 1e-12) break
  }
  return s * Math.exp(-x + a * Math.log(x) - lgamma(a))
}
function gcf(a, x) {
  const FPMIN = 1e-300
  let b = x + 1 - a,
    c = 1 / FPMIN,
    d = 1 / b,
    h = d
  for (let i = 1; i <= 500; i++) {
    const an = -i * (i - a)
    b += 2
    d = an * d + b
    if (Math.abs(d) < FPMIN) d = FPMIN
    c = b + an / c
    if (Math.abs(c) < FPMIN) c = FPMIN
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 1e-12) break
  }
  return Math.exp(-x + a * Math.log(x) - lgamma(a)) * h
}
export function lgamma(x) {
  const g = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ]
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x)
  x -= 1
  let a = 0.99999999999980993
  const t = x + 7.5
  for (let i = 0; i < g.length; i++) a += g[i] / (x + i + 1)
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a)
}
export function gammainc(a, x) {
  if (x <= 0) return 0
  return x < a + 1 ? gser(a, x) : 1 - gcf(a, x)
}
export const chi2Sf = (x, df) => (x <= 0 ? 1 : 1 - gammainc(df / 2, x / 2))

// Regularized incomplete beta (for Student-t)
function betacf(a, b, x) {
  const FPMIN = 1e-300,
    MAXIT = 300,
    qab = a + b,
    qap = a + 1,
    qam = a - 1
  let c = 1,
    d = 1 - (qab * x) / qap
  if (Math.abs(d) < FPMIN) d = FPMIN
  d = 1 / d
  let h = d
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2))
    d = 1 + aa * d
    if (Math.abs(d) < FPMIN) d = FPMIN
    c = 1 + aa / c
    if (Math.abs(c) < FPMIN) c = FPMIN
    d = 1 / d
    h *= d * c
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2))
    d = 1 + aa * d
    if (Math.abs(d) < FPMIN) d = FPMIN
    c = 1 + aa / c
    if (Math.abs(c) < FPMIN) c = FPMIN
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 1e-12) break
  }
  return h
}
export function betainc(a, b, x) {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const lbeta = lgamma(a + b) - lgamma(a) - lgamma(b)
  const front = Math.exp(lbeta + a * Math.log(x) + b * Math.log(1 - x))
  return x < (a + 1) / (a + b + 2) ? (front * betacf(a, b, x)) / a : 1 - (front * betacf(b, a, 1 - x)) / b
}
export function tSf(t, df) {
  const x = df / (df + t * t)
  const p = 0.5 * betainc(df / 2, 0.5, x)
  return t > 0 ? p : 1 - p
}
export const tTwoSided = (t, df) => 2 * tSf(Math.abs(t), df)

/* ---------------- رتبه‌بندی ---------------- */
export function ranks(values) {
  const idx = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0])
  const r = new Array(values.length)
  let i = 0
  while (i < idx.length) {
    let j = i
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++
    const avg = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg
    i = j + 1
  }
  return r
}

/* ---------------- آزمون من‌ویتنی (دو گروه) ---------------- */
export function mannWhitney(a, b) {
  const A = a.filter(Number.isFinite)
  const B = b.filter(Number.isFinite)
  const n1 = A.length,
    n2 = B.length
  if (n1 < 3 || n2 < 3) return { n1, n2, p: NaN, U: NaN, z: NaN, delta: NaN, note: 'نمونه کم' }
  const all = [...A.map((v) => [v, 0]), ...B.map((v) => [v, 1])]
  const r = ranks(all.map((x) => x[0]))
  let R1 = 0
  for (let i = 0; i < all.length; i++) if (all[i][1] === 0) R1 += r[i]
  const U1 = R1 - (n1 * (n1 + 1)) / 2
  const N = n1 + n2
  const mu = (n1 * n2) / 2
  // تصحيح گره (tie correction)
  const counts = new Map()
  for (const v of all) counts.set(v[0], (counts.get(v[0]) || 0) + 1)
  let tieTerm = 0
  for (const c of counts.values()) if (c > 1) tieTerm += c ** 3 - c
  const sigma = Math.sqrt((n1 * n2) / 12 * ((N + 1) - tieTerm / (N * (N - 1))))
  if (!(sigma > 0)) return { n1, n2, p: 1, U: U1, z: 0, delta: 0 }
  const z = (U1 - mu - Math.sign(U1 - mu) * 0.5) / sigma // تصحيح پیوستگی
  const p = Math.min(1, 2 * normalSf(Math.abs(z)))
  const rb = (2 * U1) / (n1 * n2) - 1 // rank-biserial == Cliff's delta
  return { n1, n2, U: U1, z, p, delta: rb, U2: n1 * n2 - U1, mu }
}

/* ---------------- آزمون کروسکال-والیس (k گروه) ---------------- */
export function kruskalWallis(groups) {
  const gs = groups.map((g) => g.values.filter(Number.isFinite)).filter((g) => g.length)
  const k = gs.length
  const N = gs.reduce((s, g) => s + g.length, 0)
  if (k < 2 || N < 6) return { H: NaN, df: NaN, p: NaN, epsilon2: NaN, k, N }
  const all = []
  gs.forEach((g, gi) => g.forEach((v) => all.push([v, gi])))
  const r = ranks(all.map((x) => x[0]))
  const Rsum = new Array(k).fill(0)
  for (let i = 0; i < all.length; i++) Rsum[all[i][1]] += r[i]
  let H = 0
  gs.forEach((g, i) => (H += Rsum[i] ** 2 / g.length))
  H = (12 / (N * (N + 1))) * H - 3 * (N + 1)
  const counts = new Map()
  for (const [v] of all) counts.set(v, (counts.get(v) || 0) + 1)
  let tieTerm = 0
  for (const c of counts.values()) if (c > 1) tieTerm += c ** 3 - c
  const corr = 1 - tieTerm / (N ** 3 - N)
  const Hc = corr > 0 ? H / corr : H
  const df = k - 1
  const p = chi2Sf(Hc, df)
  const eps2 = (Hc - k + 1) / (N - k)
  return { H: Hc, df, p, epsilon2: eps2, k, N, groupSizes: gs.map((g) => g.length) }
}

/* ---------------- اندازه اثر و برچسب ---------------- */
export function effectLabel(d) {
  const a = Math.abs(d)
  if (!Number.isFinite(a)) return '—'
  if (a < 0.147) return 'ناچیز'
  if (a < 0.33) return 'کوچک'
  if (a < 0.474) return 'متوسط'
  return 'بزرگ'
}

/* ---------------- همبستگی ---------------- */
export function pearson(x, y) {
  const pairs = x.map((v, i) => [v, y[i]]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b))
  const n = pairs.length
  if (n < 4) return { r: NaN, p: NaN, n }
  const mx = mean(pairs.map((p) => p[0]))
  const my = mean(pairs.map((p) => p[1]))
  let sxy = 0,
    sxx = 0,
    syy = 0
  for (const [a, b] of pairs) {
    sxy += (a - mx) * (b - my)
    sxx += (a - mx) ** 2
    syy += (b - my) ** 2
  }
  if (sxx <= 0 || syy <= 0) return { r: NaN, p: NaN, n }
  const r = sxy / Math.sqrt(sxx * syy)
  const t = (r * Math.sqrt(n - 2)) / Math.sqrt(Math.max(1 - r * r, EPS))
  return { r, p: tTwoSided(t, n - 2), n, t }
}

export function spearman(x, y) {
  const pairs = x.map((v, i) => [v, y[i]]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b))
  const n = pairs.length
  if (n < 5) return { rho: NaN, p: NaN, n }
  const rx = ranks(pairs.map((p) => p[0]))
  const ry = ranks(pairs.map((p) => p[1]))
  return { ...pearson(rx, ry), rho: 0, n }
}
export function spearmanCalc(x, y) {
  const s = spearman(x, y)
  return { ...s, rho: s.r }
}

/* ---------------- رگرسیون خطی چندگانه (OLS) ---------------- */
function invert(M) {
  const n = M.length
  const A = M.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))])
  for (let col = 0; col < n; col++) {
    let piv = col
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r
    if (Math.abs(A[piv][col]) < 1e-14) return null
    ;[A[col], A[piv]] = [A[piv], A[col]]
    const d = A[col][col]
    for (let j = 0; j < 2 * n; j++) A[col][j] /= d
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = A[r][col]
      if (!f) continue
      for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[col][j]
    }
  }
  return A.map((row) => row.slice(n))
}

/**
 * rows: [{y, x:[x1..xp]}]  (intercept added automatically)
 */
export function ols(rows, names) {
  const data = rows.filter((r) => Number.isFinite(r.y) && r.x.every(Number.isFinite))
  const n = data.length
  const p = (data[0]?.x.length || 0) + 1
  if (n < p + 3) return null
  const X = data.map((r) => [1, ...r.x])
  const y = data.map((r) => r.y)
  const XtX = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => sum(X.map((row) => row[i] * row[j]))))
  const Xty = Array.from({ length: p }, (_, i) => sum(X.map((row, k) => row[i] * y[k])))
  const inv = invert(XtX)
  if (!inv) return null
  const beta = Xty.map((_, i) => sum(inv[i].map((c, j) => c * Xty[j])))
  const fitted = X.map((row) => sum(row.map((v, i) => v * beta[i])))
  const resid = y.map((v, i) => v - fitted[i])
  const rss = sum(resid.map((r) => r * r))
  const ybar = mean(y)
  const tss = sum(y.map((v) => (v - ybar) ** 2))
  const df = n - p
  const sigma2 = rss / df
  const se = beta.map((_, i) => Math.sqrt(sigma2 * inv[i][i]))
  const tStats = beta.map((b, i) => b / se[i])
  const pVals = tStats.map((t) => tTwoSided(t, df))
  const r2 = tss > 0 ? 1 - rss / tss : NaN
  const adjR2 = 1 - (1 - r2) * ((n - 1) / df)
  const fStat = r2 > 0 && r2 < 1 ? (r2 / (p - 1)) / ((1 - r2) / df) : NaN
  // partial (standardized) coefficients
  const sdX = Array.from({ length: p }, (_, i) => (i === 0 ? 0 : sd(X.map((row) => row[i]))))
  const sdY = sd(y)
  return {
    n,
    p,
    df,
    names: ['عرض از مبدأ', ...names],
    beta,
    se,
    t: tStats,
    p: pVals,
    stdBeta: beta.map((b, i) => (i === 0 ? NaN : (b * sdX[i]) / sdY)),
    r2,
    adjR2,
    fStat,
    fP: Number.isFinite(fStat) ? chi2Sf(fStat * (p - 1), p - 1) : NaN, // تقریب خی‌دو برای F
    residSd: Math.sqrt(sigma2),
  }
}

/* ---------------- تصحيح چندمقایسه‌ای هولم ---------------- */
export function holm(pvals) {
  const idx = pvals.map((p, i) => [p, i]).filter(([p]) => Number.isFinite(p)).sort((a, b) => a[0] - b[0])
  const m = idx.length
  const out = new Array(pvals.length).fill(NaN)
  let prev = 0
  idx.forEach(([p, i], k) => {
    const adj = Math.min(1, (m - k) * p)
    prev = Math.max(prev, adj)
    out[i] = prev
  })
  return out
}

/* ---------------- هیستوگرام ---------------- */
export function histogram(values, { bins = 24, log = false } = {}) {
  const v = values.filter((x) => Number.isFinite(x))
  if (!v.length) return []
  let lo = Math.min(...v),
    hi = Math.max(...v)
  let edges
  if (log) {
    const pos = v.filter((x) => x > 0)
    if (pos.length < 2) return histogram(values, { bins, log: false })
    const lmin = Math.log10(Math.min(...pos)),
      lmax = Math.log10(Math.max(...pos))
    edges = Array.from({ length: bins + 1 }, (_, i) => 10 ** (lmin + ((lmax - lmin) * i) / bins))
    v.length = 0
    v.push(...pos)
  } else {
    if (hi === lo) hi = lo + 1
    edges = Array.from({ length: bins + 1 }, (_, i) => lo + ((hi - lo) * i) / bins)
  }
  const counts = new Array(bins).fill(0)
  for (const x of v) {
    let k = 0
    for (let i = bins - 1; i >= 0; i--) {
      if (x >= edges[i]) {
        k = i
        break
      }
    }
    counts[k]++
  }
  return counts.map((c, i) => ({
    from: edges[i],
    to: edges[i + 1],
    center: log ? Math.sqrt(edges[i] * edges[i + 1]) : (edges[i] + edges[i + 1]) / 2,
    count: c,
    label: log ? `${fmtTick(edges[i])}` : `${fmtTick(edges[i])} تا ${fmtTick(edges[i + 1])}`,
  }))
}

function fmtTick(x) {
  if (x >= 100) return x.toFixed(0)
  if (x >= 10) return x.toFixed(1)
  if (x >= 1) return x.toFixed(2)
  if (x >= 0.01) return x.toFixed(3)
  return x.toExponential(1)
}

/* ---------------- داده‌های پرت (IQR) ---------------- */
export function iqrOutliers(items, getVal) {
  const vals = items.map(getVal).filter(Number.isFinite)
  if (vals.length < 8) return { lower: -Infinity, upper: Infinity, outliers: [] }
  const s = vals.slice().sort((a, b) => a - b)
  const q1 = quantile(s, 0.25),
    q3 = quantile(s, 0.75)
  const iqr = q3 - q1
  const upper = q3 + 1.5 * iqr
  const lower = Math.max(0, q1 - 1.5 * iqr)
  return { lower, upper, outliers: items.filter((it) => getVal(it) > upper) }
}

/* ---------------- k-means (++ init) با RNG قطعی ---------------- */
export function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function zscoreMatrix(rows) {
  const dims = rows[0]?.length || 0
  const out = { data: [], means: [], sds: [] }
  const cols = Array.from({ length: dims }, (_, d) => rows.map((r) => r[d]))
  out.means = cols.map(mean)
  out.sds = cols.map((c) => sd(c) || 1)
  out.data = rows.map((r) => r.map((v, d) => (v - out.means[d]) / out.sds[d]))
  return out
}

export function kmeans(points, k, { maxIter = 60, seed = 42 } = {}) {
  const n = points.length
  if (n < k) return null
  const rand = mulberry32(seed)
  const dim = points[0].length
  const dist = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0))
  // k-means++
  const cents = [points[Math.floor(rand() * n)]]
  while (cents.length < k) {
    const d2 = points.map((p) => Math.min(...cents.map((c) => dist(p, c) ** 2)))
    const tot = sum(d2)
    let r = rand() * tot,
      idx = 0
    for (let i = 0; i < n; i++) {
      r -= d2[i]
      if (r <= 0) {
        idx = i
        break
      }
    }
    cents.push(points[idx].slice())
  }
  let labels = new Array(n).fill(0)
  for (let it = 0; it < maxIter; it++) {
    let changed = false
    const groups = Array.from({ length: k }, () => [])
    for (let i = 0; i < n; i++) {
      let best = 0,
        bd = Infinity
      for (let c = 0; c < k; c++) {
        const d = dist(points[i], cents[c])
        if (d < bd) {
          bd = d
          best = c
        }
      }
      if (labels[i] !== best) changed = true
      labels[i] = best
      groups[best].push(i)
    }
    for (let c = 0; c < k; c++) {
      if (!groups[c].length) continue
      cents[c] = Array.from({ length: dim }, (_, d) => mean(groups[c].map((i) => points[i][d])))
    }
    if (!changed) break
  }
  return { labels, cents }
}

export function silhouette(points, labels) {
  const n = points.length
  if (n < 3) return NaN
  const dist = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0))
  const counts = new Map()
  for (const l of labels) counts.set(l, (counts.get(l) || 0) + 1)
  let tot = 0,
    counted = 0
  for (let i = 0; i < n; i++) {
    const same = []
    const sums = new Map()
    for (let j = 0; j < n; j++) {
      if (i === j) continue
      const d = dist(points[i], points[j])
      if (labels[i] === labels[j]) same.push(d)
      else sums.set(labels[j], (sums.get(labels[j]) || 0) + d)
    }
    if (!same.length || !sums.size) continue
    const a = mean(same)
    let b = Infinity
    for (const [lab, s] of sums) {
      const c = counts.get(lab) || 1
      b = Math.min(b, s / c)
    }
    const denom = Math.max(a, b)
    tot += denom > 0 ? (b - a) / denom : 0
    counted++
  }
  return counted ? tot / counted : NaN
}

export function chooseK(points, ks = [2, 3, 4, 5], seed = 42) {
  let best = { k: ks[0], sil: -Infinity, labels: null }
  for (const k of ks) {
    const res = kmeans(points, k, { seed })
    if (!res) continue
    const s = silhouette(points, res.labels)
    if (Number.isFinite(s) && s > best.sil) best = { k, sil: s, labels: res.labels }
  }
  return best
}

/* ---------------- قالب‌بندی ---------------- */
export function fmtP(p) {
  if (!Number.isFinite(p)) return '—'
  if (p < 1e-4) return '<0.0001'
  if (p < 0.001) return p.toExponential(1)
  return p.toFixed(4)
}
export function stars(p) {
  if (!Number.isFinite(p)) return ''
  if (p < 0.001) return '***'
  if (p < 0.01) return '**'
  if (p < 0.05) return '*'
  if (p < 0.1) return '.'
  return ''
}
