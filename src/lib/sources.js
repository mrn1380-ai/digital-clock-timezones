/* ============================================================
 * لایه داده: دریافت آمار بازار از نوبیتکس با زنجیره‌ی جایگزین (Fallback)
 * نکته مهم: سرور توسعه دسترسی مستقیم به اینترنت ندارد،
 * بنابراین همه فراخوانی‌ها از مرورگر کاربر انجام می‌شود.
 * ==========================================================*/

const STATS_APIV2 = 'https://apiv2.nobitex.ir/market/stats'
const STATS_API = 'https://api.nobitex.ir/market/stats'
const enc = encodeURIComponent

export const TRANSPORTS = [
  {
    id: 'apiv2',
    label: 'نوبیتکس apiv2 (مستقیم)',
    kind: 'nobitex',
    url: STATS_APIV2,
    note: 'اندپوینت رسمی، ۲۰ درخواست در دقیقه',
  },
  {
    id: 'api',
    label: 'نوبیتکس api (مستقیم)',
    kind: 'nobitex',
    url: STATS_API,
    note: 'اندپوینت قدیمی‌تر',
  },
  {
    id: 'allorigins-apiv2',
    label: 'AllOrigins ← apiv2',
    kind: 'nobitex',
    url: `https://api.allorigins.win/raw?url=${enc(STATS_APIV2)}`,
    note: 'پروکسی CORS عمومی',
  },
  {
    id: 'allorigins-api',
    label: 'AllOrigins ← api',
    kind: 'nobitex',
    url: `https://api.allorigins.win/raw?url=${enc(STATS_API)}`,
    note: 'پروکسی CORS عمومی',
  },
  {
    id: 'corsproxy',
    label: 'corsproxy.io ← apiv2',
    kind: 'nobitex',
    url: `https://corsproxy.io/?url=${enc(STATS_APIV2)}`,
    note: 'پروکسی CORS عمومی',
  },
  {
    id: 'jina',
    label: 'r.jina.ai ← apiv2',
    kind: 'nobitex',
    url: `https://r.jina.ai/${STATS_APIV2}`,
    note: 'خروجی متنی؛ تلاش برای استخراج JSON',
  },
  {
    id: 'coingecko',
    label: 'CoinGecko — تیکرهای نوبیتکس',
    kind: 'coingecko',
    url: 'https://api.coingecko.com/api/v3/exchanges/nobitex/tickers?page=1&order=volume_desc',
    note: 'جایگزین در صورت بلاک بودن دسترسی مستقیم؛ شامل bid_ask_spread_percentage',
  },
  { id: 'mock', label: 'داده شبیه‌سازی‌شده (آفلاین)', kind: 'mock', url: null, note: 'برای تست خط لوله تحلیل' },
]

export const ORDERBOOK_ALL_APIV2 = 'https://apiv2.nobitex.ir/v3/orderbook/all'

async function fetchText(url, timeout = 15000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  try {
    // بدون هدر سفارشی => درخواست ساده (بدون preflight) احتمال عبور از CORS بیشتر است
    const res = await fetch(url, { method: 'GET', signal: ctrl.signal, cache: 'no-store' })
    const text = await res.text()
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return text
  } finally {
    clearTimeout(timer)
  }
}

export function extractJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1))
      } catch {
        /* ignore */
      }
    }
    throw new Error('خروجی JSON معتبر نبود')
  }
}

/** تلاش برای یک منبع واحد */
export async function tryTransport(transport) {
  const t0 = performance.now()
  if (transport.kind === 'mock') {
    const { makeMockStats } = await import('./mock.js')
    return { json: makeMockStats(), ms: 0 }
  }
  const text = await fetchText(transport.url)
  const json = extractJson(text)
  return { json, ms: Math.round(performance.now() - t0) }
}

/** پیمایش ترتیبی منابع تا اولین موفقیت */
export async function fetchWithFallback(order = TRANSPORTS.map((t) => t.id)) {
  const log = []
  const list = order.map((id) => TRANSPORTS.find((t) => t.id === id)).filter(Boolean)
  for (const tr of list) {
    try {
      const { json, ms } = await tryTransport(tr)
      const shape = detectShape(json)
      if (shape === 'unknown') throw new Error('ساختار پاسخ ناشناخته')
      return { transport: tr, json, ms, log: [...log, { id: tr.id, ok: true, ms }], shape }
    } catch (e) {
      log.push({ id: tr.id, ok: false, error: String(e.message || e) })
    }
  }
  return { transport: null, json: null, log, shape: 'unknown' }
}

export function detectShape(json) {
  if (json?.stats && typeof json.stats === 'object') return 'nobitex-stats'
  if (json?.tickers && Array.isArray(json.tickers)) return 'coingecko-tickers'
  return 'unknown'
}

/** دفتر سفارشات همه بازارها (برای تحلیل عمق و اندازه تیک) */
export async function fetchOrderbookAll() {
  const attempts = [
    ORDERBOOK_ALL_APIV2,
    `https://api.allorigins.win/raw?url=${enc(ORDERBOOK_ALL_APIV2)}`,
    `https://corsproxy.io/?url=${enc(ORDERBOOK_ALL_APIV2)}`,
  ]
  const log = []
  for (const url of attempts) {
    try {
      const t0 = performance.now()
      const json = extractJson(await fetchText(url, 25000))
      if (!json || typeof json !== 'object') throw new Error('پاسخ نامعتبر')
      return { json, ms: Math.round(performance.now() - t0), url, log }
    } catch (e) {
      log.push({ url, error: String(e.message || e) })
    }
  }
  return { json: null, log }
}
