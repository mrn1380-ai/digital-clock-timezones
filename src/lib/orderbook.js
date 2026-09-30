/* ============================================================
 * تحلیل دفتر سفارشات: اندازه تیک واقعی و اسلیپیج بر حسب اندازه سفارش
 * اندپوینت: GET https://apiv2.nobitex.ir/v3/orderbook/all
 * ==========================================================*/

const num = (v) => {
  const n = typeof v === 'string' ? parseFloat(v) : v
  return Number.isFinite(n) ? n : null
}

function normalizeSide(arr) {
  if (!Array.isArray(arr)) return []
  const out = []
  for (const it of arr) {
    let p = null,
      q = null
    if (Array.isArray(it)) [p, q] = [num(it[0]), num(it[1])]
    else if (it && typeof it === 'object') {
      p = num(it.price ?? it[0])
      q = num(it.amount ?? it.quantity ?? it.volume ?? it[1])
    }
    if (p != null && p > 0 && q != null && q > 0) out.push([p, q])
  }
  return out
}

/** استخراج دفتر سفارشات از ساختارهای مختلف پاسخ */
export function parseOrderbookAll(json) {
  const books = {}
  const add = (sym, val) => {
    if (typeof sym !== 'string' || !val || typeof val !== 'object') return
    const bids = normalizeSide(val.bids)
    const asks = normalizeSide(val.asks)
    if (bids.length || asks.length) {
      books[sym.toUpperCase()] = {
        bids: bids.sort((a, b) => b[0] - a[0]),
        asks: asks.sort((a, b) => a[0] - b[0]),
        lastTradePrice: num(val.lastTradePrice),
        lastUpdate: val.lastUpdate || null,
      }
    }
  }

  if (Array.isArray(json)) {
    for (const it of json) if (it && it.symbol) add(it.symbol, it)
    return books
  }
  if (json?.bids || json?.asks) add(json.symbol || 'ALL', json)

  for (const [k, v] of Object.entries(json || {})) {
    if (!v || typeof v !== 'object') continue
    if (Array.isArray(v.bids) || Array.isArray(v.asks)) {
      add(k === 'status' || k === 'global' ? null : k, v)
    } else if (Array.isArray(v)) {
      for (const it of v) if (it && it.symbol) add(it.symbol, it)
    } else {
      // یک سطح تودرتو: { markets: {...} } یا { BTCIRT: {...} }
      for (const [k2, v2] of Object.entries(v)) {
        if (v2 && typeof v2 === 'object' && (Array.isArray(v2.bids) || Array.isArray(v2.asks))) add(k2, v2)
      }
    }
  }
  return books
}

/** کوچک‌ترین گام قیمت (اندازه تیک) مشاهده‌شده در کتاب */
export function estimateTick(book) {
  const prices = [...new Set([...book.bids.map((b) => b[0]), ...book.asks.map((a) => a[0])])].sort((a, b) => a - b)
  if (prices.length < 2) return null
  let minDiff = Infinity
  for (let i = 1; i < Math.min(prices.length, 400); i++) {
    const d = prices[i] - prices[i - 1]
    if (d > 0) minDiff = Math.min(minDiff, d)
  }
  return Number.isFinite(minDiff) ? minDiff : null
}

function walk(side, notionalQuote) {
  // side: آرایه‌ی مرتب‌شده [price, amount]
  let remaining = notionalQuote
  let cost = 0,
    qty = 0,
    levels = 0
  for (const [p, q] of side) {
    const levelQuote = p * q
    if (remaining <= 0) break
    const take = Math.min(q, remaining / p)
    cost += take * p
    qty += take
    levels++
    remaining -= take * p
  }
  return { filled: remaining <= notionalQuote * 1e-9, vwap: qty > 0 ? cost / qty : null, cost, qty, levels }
}

/** تطبیق کلیدهای دفتر سفارشات با نماد نرمال‌شده */
export function matchBook(books, m) {
  const cands = [
    m.symbol.replace('/', ''),
    m.base + m.quote,
    m.base + 'RLS',
    m.base + 'IRT',
    m.base + 'USDT',
    m.key.replace('-', '').toUpperCase(),
    m.key.toUpperCase(),
  ]
  for (const c of cands) if (books[c]) return books[c]
  return null
}

/**
 * محاسبه شاخص‌های عمق برای یک بازار
 * market: شیء نرمال‌شده از analyze.normalizeNobitex
 */
export function bookMetrics(book, market, notionalUsd = 100) {
  const bestBid = book.bids.length ? book.bids[0][0] : null
  const bestAsk = book.asks.length ? book.asks[0][0] : null
  if (bestBid == null || bestAsk == null) return null
  const mid = (bestBid + bestAsk) / 2
  const spreadPct = ((bestAsk - bestBid) / mid) * 100
  const tick = estimateTick(book)
  // نرخ تبدیل: واحدِ بازار به‌ازای هر دلار
  const quotePerUsd = market?.priceUsd > 0 ? market.priceQuote / market.priceUsd : 1
  const notionalQuote = notionalUsd * quotePerUsd
  const buy = walk(book.asks, notionalQuote)
  const sell = walk(book.bids, notionalQuote) // فروش به bidها
  const bidDepthQuote = book.bids.slice(0, 50).reduce((s, [p, q]) => s + p * q, 0)
  const askDepthQuote = book.asks.slice(0, 50).reduce((s, [p, q]) => s + p * q, 0)
  return {
    spreadPct,
    bestBid,
    bestAsk,
    mid,
    tick,
    relTickPct: tick ? (tick / mid) * 100 : null,
    bidLevels: book.bids.length,
    askLevels: book.asks.length,
    depth50BidQuote: bidDepthQuote,
    depth50AskQuote: askDepthQuote,
    notionalUsd,
    buyVwap: buy.vwap,
    buyFilled: buy.filled,
    buyLevels: buy.levels,
    buySlippagePct: buy.vwap ? ((buy.vwap - mid) / mid) * 100 : null,
    sellVwap: sell.vwap,
    sellFilled: sell.filled,
    sellSlippagePct: sell.vwap ? ((mid - sell.vwap) / mid) * 100 : null,
    roundTripSlippagePct:
      buy.vwap && sell.vwap ? ((buy.vwap - sell.vwap) / mid) * 100 : null,
  }
}
