/* ============================================================
 * نرمال‌سازی داده و تحلیل آماری اسپرد/هزینه
 * ==========================================================*/

import {
  describe,
  mannWhitney,
  kruskalWallis,
  spearmanCalc,
  ols,
  holm,
  histogram,
  iqrOutliers,
  zscoreMatrix,
  chooseK,
  mean,
  median,
  quantile,
} from './stats.js'
import { getFee, totalCostPct, toBps } from './fees.js'

const num = (v) => {
  const n = typeof v === 'string' ? parseFloat(v) : v
  return Number.isFinite(n) ? n : null
}

/* ---------------- نرمال‌سازی ---------------- */

export function normalizeNobitex(json) {
  const stats = json?.stats || {}
  const usdtMarket = stats['usdt-rls'] || stats['usdt-irt'] || null
  const usdtRial = num(usdtMarket?.latest)
  const tomanPerUsdt = usdtRial ? usdtRial / 10 : null

  const markets = []
  for (const [key, s] of Object.entries(stats)) {
    const [src, dstRaw] = String(key).split('-')
    if (!src || !dstRaw) continue
    const dst = dstRaw.toLowerCase()
    const quote = dst === 'usdt' ? 'USDT' : dst === 'rls' || dst === 'irt' ? 'IRT' : dst.toUpperCase()
    const bestBuy = num(s?.bestBuy)
    const bestSell = num(s?.bestSell)
    const latest = num(s?.latest)
    const volDst = num(s?.volumeDst)
    const volSrc = num(s?.volumeSrc)
    const priceQuote = latest ?? ((bestBuy && bestSell ? (bestBuy + bestSell) / 2 : null))
    if (priceQuote == null) continue

    let priceUsd = null,
      volumeUsd = null
    if (quote === 'IRT') {
      // قیمت‌ها در بازار ریالی به «ریال» هستند
      priceUsd = tomanPerUsdt ? priceQuote / 10 / tomanPerUsdt : null
      volumeUsd = volDst != null && tomanPerUsdt ? volDst / 10 / tomanPerUsdt : null
    } else {
      priceUsd = priceQuote
      volumeUsd = volDst
    }

    const mid = bestBuy != null && bestSell != null ? (bestBuy + bestSell) / 2 : priceQuote
    const spreadAbs = bestBuy != null && bestSell != null ? bestSell - bestBuy : null
    const spreadPct = spreadAbs != null && mid > 0 ? (spreadAbs / mid) * 100 : null

    const dayLow = num(s?.dayLow),
      dayHigh = num(s?.dayHigh)
    markets.push({
      key,
      symbol: `${src.toUpperCase()}/${quote}`,
      base: src.toUpperCase(),
      quote,
      priceQuote,
      priceUsd,
      bestBuy,
      bestSell,
      mid,
      spreadAbs,
      spreadPct: spreadPct != null && spreadPct >= 0 ? spreadPct : null,
      volumeBase: volSrc,
      volumeQuote: volDst,
      volumeUsd,
      dayChange: num(s?.dayChange),
      dayRangePct: dayLow > 0 && dayHigh > 0 ? ((dayHigh - dayLow) / dayLow) * 100 : null,
      isClosed: !!s?.isClosed,
      closedReason: s?.isClosedReason || null,
    })
  }
  return { markets, meta: { tomanPerUsdt, source: 'nobitex' } }
}

export function normalizeCoingecko(json) {
  const tickers = json?.tickers || []
  const markets = tickers.map((t) => {
    const target = String(t.target || '').toUpperCase()
    const quote = target === 'USDT' ? 'USDT' : target === 'IRT' || target === 'IRR' || target === 'RLS' ? 'IRT' : target
    const priceUsd = num(t.converted_last?.usd) ?? num(t.last)
    const volumeUsd = num(t.converted_volume?.usd)
    const spreadPct = num(t.bid_ask_spread_percentage)
    return {
      key: `${String(t.base).toLowerCase()}-${quote.toLowerCase()}`,
      symbol: `${String(t.base).toUpperCase()}/${quote}`,
      base: String(t.base).toUpperCase(),
      quote,
      priceQuote: num(t.last),
      priceUsd,
      bestBuy: null,
      bestSell: null,
      mid: num(t.last),
      spreadAbs: null,
      spreadPct: spreadPct != null && spreadPct >= 0 ? spreadPct : null,
      volumeBase: null,
      volumeQuote: num(t.volume),
      volumeUsd,
      dayChange: null,
      dayRangePct: null,
      isClosed: !!t.is_stale,
      closedReason: t.is_stale ? 'stale' : null,
      trustScore: t.trust_score || null,
    }
  })
  return { markets, meta: { tomanPerUsdt: null, source: 'coingecko' } }
}

/* ---------------- دسته‌بندی‌ها ---------------- */

const PRICE_BUCKETS = [
  { max: 0.001, label: '< ۰.۰۰۱' },
  { max: 0.01, label: '۰.۰۰۱ – ۰.۰۱' },
  { max: 0.1, label: '۰.۰۱ – ۰.۱' },
  { max: 1, label: '۰.۱ – ۱' },
  { max: 10, label: '۱ – ۱۰' },
  { max: 100, label: '۱۰ – ۱۰۰' },
  { max: 1000, label: '۱۰۰ – ۱,۰۰۰' },
  { max: 10000, label: '۱,۰۰۰ – ۱۰,۰۰۰' },
  { max: Infinity, label: '> ۱۰,۰۰۰' },
]
export const priceBucket = (p) => (PRICE_BUCKETS.find((b) => p < b.max) || PRICE_BUCKETS.at(-1)).label
export const priceBucketOrder = PRICE_BUCKETS.map((b) => b.label)

const VOLA_BUCKETS = [
  { max: 1, label: 'آرام (<۱٪)' },
  { max: 2, label: '۱ – ۲٪' },
  { max: 4, label: '۲ – ۴٪' },
  { max: Infinity, label: 'پرنوسان (>۴٪)' },
]
export const volaBucket = (v) => (VOLA_BUCKETS.find((b) => v < b.max) || VOLA_BUCKETS.at(-1)).label
export const volaBucketOrder = VOLA_BUCKETS.map((b) => b.label)

export function volumeTier(m, qs) {
  const v = m.volumeUsd
  if (v == null) return 'نامشخص'
  if (v <= qs[0]) return 'Q1 (کم‌نقدشونده‌ترین)'
  if (v <= qs[1]) return 'Q2'
  if (v <= qs[2]) return 'Q3'
  return 'Q4 (نقدشونده‌ترین)'
}
export const volumeTierOrder = ['Q1 (کم‌نقدشونده‌ترین)', 'Q2', 'Q3', 'Q4 (نقدشونده‌ترین)']

/* ---------------- تحلیل اصلی ---------------- */

export function analyze(allMarkets, opts = {}) {
  const {
    feeLevelId = 'regular',
    side = 'taker',
    costMode = 'roundtrip',
    includeClosed = false,
    minVolumeUsd = 0,
    quotes = ['IRT', 'USDT'],
    extraFees = null,
  } = opts

  let markets = allMarkets.filter((m) => {
    if (!includeClosed && m.isClosed) return false
    if (!Number.isFinite(m.spreadPct)) return false
    if (quotes.length && !quotes.includes(m.quote)) return false
    if (minVolumeUsd > 0 && !(m.volumeUsd >= minVolumeUsd)) return false
    return true
  })

  // کارمزد و هزینه کل هر نماد
  for (const m of markets) {
    const lvlFees = extraFees?.[m.quote]
    m.feePct = lvlFees ? lvlFees[side] : getFee(feeLevelId, m.quote, side)
    m.costPct = totalCostPct(m.spreadPct, m.feePct, { mode: costMode, side })
    m.costBps = toBps(m.costPct)
    m.spreadShare = m.costPct > 0 ? ((m.costPct - (costMode === 'roundtrip' ? 2 * m.feePct : m.feePct)) / m.costPct) * 100 : NaN
    m.absVolatility = m.dayChange != null ? Math.abs(m.dayChange) : null
    m.priceBucket = m.priceQuote != null ? priceBucket(m.priceQuote) : 'نامشخص'
    m.volaBucket = m.absVolatility != null ? volaBucket(m.absVolatility) : 'نامشخص'
  }

  const volVals = markets.map((m) => m.volumeUsd).filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b)
  const q = volVals.length
    ? [0.25, 0.5, 0.75].map((p) => quantile(volVals, p))
    : [0, 0, 0]
  for (const m of markets) m.volumeTier = volumeTier(m, q)

  const spreads = markets.map((m) => m.spreadPct)
  const costs = markets.map((m) => m.costPct)
  const spreadStats = describe(spreads)
  const costStats = describe(costs)
  const hist = histogram(spreads, { bins: 26, log: true })
  const histLinear = histogram(spreads, { bins: 26, log: false })
  const out = iqrOutliers(markets, (m) => m.spreadPct)

  /* ---- مقایسه گروهی ---- */
  const groupBy = (fn) => {
    const map = new Map()
    for (const m of markets) {
      const k = fn(m)
      if (k == null || k === 'نامشخص') continue
      if (!map.has(k)) map.set(k, [])
      map.get(k).push(m)
    }
    return map
  }
  const groupStats = (map, order) => {
    const keys = order ? order.filter((k) => map.has(k)) : [...map.keys()]
    return keys.map((k) => {
      const arr = map.get(k)
      const d = describe(arr.map((m) => m.spreadPct))
      const dc = describe(arr.map((m) => m.costPct))
      return {
        key: k,
        n: arr.length,
        ...d,
        costMedian: dc.median,
        volMedian: median(arr.map((m) => m.volumeUsd).filter(Number.isFinite)),
        items: arr,
      }
    })
  }

  const quoteMap = groupBy((m) => m.quote)
  const quoteGroups = groupStats(quoteMap, ['IRT', 'USDT'])
  const quoteTest =
    quoteGroups.length === 2
      ? mannWhitney(quoteGroups[0].items.map((m) => m.spreadPct), quoteGroups[1].items.map((m) => m.spreadPct))
      : null
  // مقایسه هزینه کل (اسپرد + کارمزد) بین دو بازار
  const quoteCostTest =
    quoteGroups.length === 2
      ? mannWhitney(quoteGroups[0].items.map((m) => m.costPct), quoteGroups[1].items.map((m) => m.costPct))
      : null

  const tierMap = groupBy((m) => m.volumeTier)
  const tierGroups = groupStats(tierMap, volumeTierOrder)
  const tierTest = kruskalWallis(tierGroups.map((g) => ({ name: g.key, values: g.items.map((m) => m.spreadPct) })))

  const priceMap = groupBy((m) => m.priceBucket)
  const priceGroups = groupStats(priceMap, priceBucketOrder)
  const priceTest = kruskalWallis(priceGroups.map((g) => ({ name: g.key, values: g.items.map((m) => m.spreadPct) })))

  const volaMap = groupBy((m) => m.volaBucket)
  const volaGroups = groupStats(volaMap, volaBucketOrder)
  const volaTest = kruskalWallis(volaGroups.map((g) => ({ name: g.key, values: g.items.map((m) => m.spreadPct) })))

  // مقایسه دوبه‌دوی سطوح نقدشوندگی با تصحيح هولم
  const pairNames = []
  const pairPs = []
  const pairs = []
  for (let i = 0; i < tierGroups.length; i++) {
    for (let j = i + 1; j < tierGroups.length; j++) {
      const r = mannWhitney(tierGroups[i].items.map((m) => m.spreadPct), tierGroups[j].items.map((m) => m.spreadPct))
      pairs.push({ a: tierGroups[i].key, b: tierGroups[j].key, ...r })
      pairNames.push(`${tierGroups[i].key} ↔ ${tierGroups[j].key}`)
      pairPs.push(r.p)
    }
  }
  const pairAdj = holm(pairPs)
  pairs.forEach((p, i) => (p.pAdj = pairAdj[i]))

  /* ---- همبستگی‌ها ---- */
  const corrRows = []
  const pushCorr = (label, xs, ys, transform = 'none') => {
    const r = spearmanCalc(xs, ys)
    if (Number.isFinite(r.rho)) corrRows.push({ label, transform, ...r })
  }
  pushCorr('اسپرد ٪ ~ حجم ۲۴س (دلار)', markets.map((m) => m.spreadPct), markets.map((m) => (m.volumeUsd > 0 ? Math.log10(m.volumeUsd) : NaN)), 'log10 حجم')
  pushCorr('اسپرد ٪ ~ قیمت واحد (واحدِ بازار)', markets.map((m) => m.spreadPct), markets.map((m) => (m.priceQuote > 0 ? Math.log10(m.priceQuote) : NaN)), 'log10 قیمت')
  pushCorr('اسپرد ٪ ~ |تغییر روزانه|', markets.map((m) => m.spreadPct), markets.map((m) => m.absVolatility), '—')
  pushCorr('اسپرد ٪ ~ دامنه نوسان روز (High-Low)', markets.map((m) => m.spreadPct), markets.map((m) => m.dayRangePct), '—')
  pushCorr('حجم ~ قیمت واحد', markets.map((m) => (m.volumeUsd > 0 ? Math.log10(m.volumeUsd) : NaN)), markets.map((m) => (m.priceQuote > 0 ? Math.log10(m.priceQuote) : NaN)), 'log-log')

  /* ---- رگرسیون ---- */
  const rows = markets
    .filter((m) => m.spreadPct > 0 && Number.isFinite(m.volumeUsd) && m.volumeUsd > 0 && Number.isFinite(m.priceUsd) && m.priceUsd > 0)
    .map((m) => ({
      y: Math.log(m.spreadPct),
      x: [
        Math.log10(m.volumeUsd),
        Math.log10(m.priceUsd),
        m.absVolatility ?? 0,
        m.quote === 'IRT' ? 1 : 0,
      ],
    }))
  const reg = ols(rows, ['log10(حجم دلاری)', 'log10(قیمت دلاری)', '|تغییر روزانه|', 'IRT بودن (dummy)'])

  /* ---- خوشه‌بندی ---- */
  const clusterInput = markets.filter(
    (m) => m.spreadPct > 0 && Number.isFinite(m.volumeUsd) && m.volumeUsd > 0 && Number.isFinite(m.priceUsd) && m.priceUsd > 0
  )
  let clusters = null
  if (clusterInput.length >= 12) {
    const raw = clusterInput.map((m) => [
      Math.log(m.spreadPct),
      Math.log10(m.volumeUsd),
      Math.log10(m.priceUsd),
      m.absVolatility ?? 0,
    ])
    const z = zscoreMatrix(raw)
    const best = chooseK(z.data, [2, 3, 4, 5], 42)
    if (best?.labels) {
      clusterInput.forEach((m, i) => (m.cluster = best.labels[i]))
      const profs = Array.from({ length: best.k }, (_, c) => {
        const items = clusterInput.filter((m) => m.cluster === c)
        const d = describe(items.map((m) => m.spreadPct))
        return {
          cluster: c,
          n: items.length,
          spreadMedian: d.median,
          spreadP25: d.p25,
          spreadP75: d.p75,
          volMedian: median(items.map((m) => m.volumeUsd).filter(Number.isFinite)),
          irtShare: (items.filter((m) => m.quote === 'IRT').length / items.length) * 100,
          dayChangeMedian: median(items.map((m) => m.absVolatility).filter(Number.isFinite)),
          costMedian: median(items.map((m) => m.costPct)),
          top: items.sort((a, b) => b.volumeUsd - a.volumeUsd).slice(0, 6).map((m) => m.symbol),
        }
      }).sort((a, b) => a.spreadMedian - b.spreadMedian)
      profs.forEach((p, i) => (p.rank = i))
      clusters = { k: best.k, silhouette: best.sil, profiles: profs, points: clusterInput }
    }
  }

  /* ---- سهم اسپرد از هزینه کل ---- */
  const spreadShareOfCost =
    100 * (median(markets.map((m) => m.costPct - (costMode === 'roundtrip' ? 2 * m.feePct : m.feePct))) / median(costs))

  const cheapest = markets.filter((m) => Number.isFinite(m.costPct)).sort((a, b) => a.costPct - b.costPct)
  const priciest = cheapest.slice().reverse()

  return {
    markets,
    spreadStats,
    costStats,
    hist,
    histLinear,
    outliers: out,
    quoteGroups,
    quoteTest,
    quoteCostTest,
    tierGroups,
    tierTest,
    tierPairs: pairs,
    priceGroups,
    priceTest,
    volaGroups,
    volaTest,
    corrRows,
    reg,
    clusters,
    spreadShareOfCost,
    cheapest: cheapest.slice(0, 12),
    priciest: priciest.slice(0, 12),
    volumeQuartiles: q,
  }
}

/* ---------------- پایداری اسپرد در طول زمان ---------------- */

export function stabilityFromHistory(snapshots) {
  // snapshots: [{ts, map: {symbol -> {spreadPct}}}]
  const acc = new Map()
  for (const s of snapshots) {
    for (const [sym, v] of Object.entries(s.map || {})) {
      if (!Number.isFinite(v.spreadPct)) continue
      if (!acc.has(sym)) acc.set(sym, [])
      acc.get(sym).push(v.spreadPct)
    }
  }
  const rows = []
  for (const [sym, arr] of acc) {
    const d = describe(arr)
    rows.push({
      symbol: sym,
      n: arr.length,
      mean: d.mean,
      median: d.median,
      sd: d.sd,
      cv: d.cv,
      min: d.min,
      max: d.max,
      range: d.max - d.min,
    })
  }
  return rows
}

export function medianSeries(snapshots) {
  return snapshots.map((s) => {
    const vals = Object.values(s.map || {})
      .map((v) => v.spreadPct)
      .filter(Number.isFinite)
      .sort((a, b) => a - b)
    return {
      ts: s.ts,
      label: new Date(s.ts).toLocaleTimeString('fa-IR', { hour12: false }),
      median: vals.length ? quantile(vals, 0.5) : NaN,
      p25: vals.length ? quantile(vals, 0.25) : NaN,
      p75: vals.length ? quantile(vals, 0.75) : NaN,
      p90: vals.length ? quantile(vals, 0.9) : NaN,
      count: vals.length,
      mean: vals.length ? mean(vals) : NaN,
    }
  })
}
