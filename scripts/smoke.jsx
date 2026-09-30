/**
 * تست دود (smoke test) برای رندر تمام تب‌ها با داده شبیه‌سازی‌شده در jsdom
 * اجرا: npm run smoke  (نیاز به باندل با esbuild، فایل scripts/run-smoke.mjs آن را انجام می‌دهد)
 */
import { JSDOM } from 'jsdom'

async function main() {
  const dom = new JSDOM('<!doctype html><html dir="rtl"><body><div id="root"></div></body></html>', {
    pretendToBeVisual: true,
    url: 'https://example.test/',
  })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  try {
    Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
  } catch {
    /* در برخی نسخه‌های Node فقط getter است */
  }
  globalThis.HTMLElement = dom.window.HTMLElement
  globalThis.Element = dom.window.Element
  globalThis.Node = dom.window.Node
  globalThis.getComputedStyle = dom.window.getComputedStyle
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0)
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  dom.window.ResizeObserver = globalThis.ResizeObserver
  globalThis.IS_REACT_ACT_ENVIRONMENT = true

  const { makeMockStats } = await import('../src/lib/mock.js')
  const mock = makeMockStats(11)
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(mock),
  })

  const React = (await import('react')).default
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const App = (await import('../src/App.jsx')).default

  const { normalizeNobitex, analyze, stabilityFromHistory, medianSeries } = await import('../src/lib/analyze.js')
  const { parseOrderbookAll, bookMetrics, matchBook } = await import('../src/lib/orderbook.js')

  const errors = []
  const origError = console.error
  console.error = (...args) => {
    const msg = args.map(String).join(' ')
    if (!/not wrapped in act|ReactDOMTestUtils/.test(msg)) errors.push(msg)
    origError(...args)
  }

  const container = document.getElementById('root')
  const root = createRoot(container)

  await act(async () => {
    root.render(React.createElement(App))
  })
  // صبر برای اجرای افکت‌ها (دریافت داده)
  await act(async () => {
    await new Promise((r) => setTimeout(r, 60))
  })

  const html = container.innerHTML
  if (!html.includes('داشبورد')) throw new Error('هدر رندر نشد')
  if (!html.includes('نمادهای تحلیل‌شده')) throw new Error('کارت‌های KPI رندر نشدند (احتمالاً داده دریافت نشده)')
  console.log('✓ رندر اولیه App با داده mock موفق بود (' + html.length + ' کاراکتر)')

  // کلیک روی همه تب‌ها
  const tabs = [...container.querySelectorAll('.tab')]
  console.log('تعداد تب‌ها:', tabs.length)
  for (const t of tabs) {
    await act(async () => {
      t.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    if (!container.innerHTML.includes('card')) throw new Error('تب رندر نشد: ' + t.textContent)
    console.log('  ✓ تب «' + t.textContent.trim() + '» رندر شد')
  }

  // رندر مستقیم تب‌ها با داده کامل (شامل عمق بازار)
  const { markets } = normalizeNobitex(mock)
  const res = analyze(markets, { feeLevelId: 'regular', side: 'taker', costMode: 'roundtrip' })
  const series = medianSeries([{ ts: Date.now(), map: Object.fromEntries(markets.filter((m) => m.spreadPct != null).map((m) => [m.symbol, { spreadPct: m.spreadPct }])) }])
  const stability = stabilityFromHistory(series.map((s) => ({ ts: s.ts, map: Object.fromEntries(markets.filter((m) => m.spreadPct != null).map((m) => [m.symbol, { spreadPct: m.spreadPct }])) })))
  const stabMap = new Map(stability.map((r) => [r.symbol, r]))

  const mods = {
    dist: (await import('../src/components/TabDistribution.jsx')).default,
    factors: (await import('../src/components/TabFactors.jsx')).default,
    clusters: (await import('../src/components/TabClusters.jsx')).default,
    symbols: (await import('../src/components/TabSymbols.jsx')).default,
    stability: (await import('../src/components/TabStability.jsx')).default,
    depth: (await import('../src/components/TabDepth.jsx')).default,
  }

  for (const [name, Comp] of Object.entries(mods)) {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const r2 = createRoot(el)
    const props = { res, settings: { side: 'taker', costMode: 'roundtrip', intervalSec: 30, autoSample: true }, stabMap, markets: res.markets }
    if (name === 'stability') Object.assign(props, { snapshots: [{ ts: Date.now(), map: {} }], series, stability })
    if (name === 'depth') Object.assign(props, { ob: null, loading: false, onFetch: () => {}, error: null })
    await act(async () => {
      r2.render(React.createElement(Comp, props))
    })
    const len = el.innerHTML.length
    if (len < 200) throw new Error(`تب ${name} خروجی کافی نداشت (${len})`)
    console.log(`  ✓ کامپوننت ${name} رندر شد (${len} کاراکتر)`)
    await act(async () => r2.unmount())
  }

  // تست عمق بازار با کتاب سفارشات مصنوعی
  const fakeBook = {}
  for (const m of markets.slice(0, 20)) {
    const mid = m.priceQuote
    const step = Math.max(mid * 0.0005, 1)
    fakeBook[m.symbol.replace('/', '')] = {
      bids: Array.from({ length: 30 }, (_, i) => [String(mid * (1 - 0.0004) - i * step), String(10 / (i + 1))]),
      asks: Array.from({ length: 30 }, (_, i) => [String(mid * (1 + 0.0004) + i * step), String(10 / (i + 1))]),
    }
  }
  const books = parseOrderbookAll({ status: 'ok', ...fakeBook })
  const metrics = new Map()
  for (const m of res.markets) {
    const b = matchBook(books, m)
    if (!b) continue
    const a = bookMetrics(b, m, 100)
    const c = bookMetrics(b, m, 1000)
    if (!a) continue
    metrics.set(m.key, { ...a, slip100: a.buySlippagePct, fill100: a.buyFilled, slip1000: c?.buySlippagePct, fill1000: c?.buyFilled, roundTripSlip1000: c?.roundTripSlippagePct })
  }
  console.log('✓ دفتر سفارشات مصنوعی تطبیق داده شد:', Object.keys(books).length, 'کتاب |', metrics.size, 'بازار محاسبه شد')
  if (!metrics.size) throw new Error('هیچ بازاری با دفتر سفارشات تطبیق داده نشد')
  const sample = [...metrics.values()][0]
  console.log('  نمونه: تیک نسبی', sample.relTickPct?.toFixed(4), '٪ | اسلیپیج $1000:', sample.buySlippagePct?.toFixed(3), '٪')

  const el = document.createElement('div')
  document.body.appendChild(el)
  const r3 = createRoot(el)
  await act(async () => {
    r3.render(React.createElement(mods.depth, { res, ob: { books, metrics, ms: 12, ts: Date.now(), keys: Object.keys(books).length }, loading: false, onFetch: () => {}, markets: res.markets, error: null }))
  })
  console.log('  ✓ تب عمق بازار با داده رندر شد (' + el.innerHTML.length + ' کاراکتر)')

  if (errors.length) {
    console.log('\n⚠ هشدار/خطا در رندر:')
    errors.slice(0, 10).forEach((e) => console.log('   -', e.slice(0, 300)))
  }
  console.log('\n✅ همه تست‌های دود موفق بود.')
  process.exit(0)

}

main().catch((e) => { console.error(e); process.exit(1) })
