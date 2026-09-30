import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Controls from './components/Controls.jsx'
import Kpis from './components/Kpis.jsx'
import TabDistribution from './components/TabDistribution.jsx'
import TabFactors from './components/TabFactors.jsx'
import TabClusters from './components/TabClusters.jsx'
import TabSymbols from './components/TabSymbols.jsx'
import TabStability from './components/TabStability.jsx'
import TabDepth from './components/TabDepth.jsx'
import { TRANSPORTS, fetchWithFallback, fetchOrderbookAll, detectShape } from './lib/sources.js'
import { normalizeNobitex, normalizeCoingecko, analyze, stabilityFromHistory, medianSeries } from './lib/analyze.js'
import { parseOrderbookAll, bookMetrics, matchBook } from './lib/orderbook.js'

const TABS = [
  { id: 'dist', label: '📊 توزیع اسپرد' },
  { id: 'factors', label: '🔬 تحلیل عوامل' },
  { id: 'clusters', label: '🗂 خوشه‌بندی' },
  { id: 'symbols', label: '📋 جدول نمادها' },
  { id: 'stability', label: '⏱ پایداری زمانی' },
  { id: 'depth', label: '📚 عمق بازار' },
]

const DEFAULT_SETTINGS = {
  feeLevel: 'regular',
  customFees: null,
  side: 'taker',
  costMode: 'roundtrip',
  includeClosed: false,
  minVolumeUsd: 0,
  quotes: ['IRT', 'USDT'],
  intervalSec: 30,
  autoSample: true,
}

export default function App() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [sourceId, setSourceId] = useState('auto')
  const [raw, setRaw] = useState(null)
  const [history, setHistory] = useState([])
  const [state, setState] = useState('idle')
  const [lastMs, setLastMs] = useState(null)
  const [lastError, setLastError] = useState(null)
  const [log, setLog] = useState([])
  const [tab, setTab] = useState('dist')
  const [ob, setOb] = useState(null)
  const [obLoading, setObLoading] = useState(false)
  const [obError, setObError] = useState(null)
  const [showDiag, setShowDiag] = useState(false)
  const [manualText, setManualText] = useState('')
  const inflight = useRef(false)

  const order = useMemo(() => {
    if (sourceId === 'auto') return TRANSPORTS.map((t) => t.id).filter((id) => id !== 'mock')
    return [sourceId, ...TRANSPORTS.map((t) => t.id).filter((id) => id !== sourceId && id !== 'mock')]
  }, [sourceId])

  const applyJson = useCallback((json, transport) => {
    const shape = detectShape(json)
    const norm = shape === 'coingecko-tickers' ? normalizeCoingecko(json) : normalizeNobitex(json)
    if (!norm.markets.length) throw new Error('هیچ بازاری در پاسخ یافت نشد')
    const ts = Date.now()
    setRaw({ ...norm, ts, transport: transport || { id: 'manual', label: 'درج دستی' } })
    const map = {}
    for (const m of norm.markets) {
      if (Number.isFinite(m.spreadPct)) map[m.symbol] = { spreadPct: m.spreadPct, volumeUsd: m.volumeUsd }
    }
    setHistory((h) => [...h, { ts, map }].slice(-240))
    setLastError(null)
    setState('ok')
  }, [])

  const load = useCallback(async () => {
    if (inflight.current) return
    inflight.current = true
    setState('loading')
    const res = await fetchWithFallback(order)
    inflight.current = false
    setLog(res.log)
    if (!res.json) {
      setState('error')
      setLastError(res.log.map((l) => `${l.id}: ${l.error}`).join(' | '))
      return
    }
    try {
      applyJson(res.json, res.transport)
      setLastMs(res.ms)
    } catch (e) {
      setState('error')
      setLastError(String(e.message || e))
    }
  }, [order, applyJson])

  const loadManual = useCallback(() => {
    try {
      const json = JSON.parse(manualText)
      applyJson(json, { id: 'manual', label: 'درج دستی (JSON)' })
      setLastMs(null)
    } catch (e) {
      setLastError('JSON نامعتبر: ' + String(e.message || e))
      setState('error')
    }
  }, [manualText, applyJson])

  // بارگذاری اولیه
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // نمونه‌برداری خودکار
  useEffect(() => {
    if (!settings.autoSample) return
    const id = setInterval(load, settings.intervalSec * 1000)
    return () => clearInterval(id)
  }, [settings.autoSample, settings.intervalSec, load])

  const res = useMemo(() => {
    if (!raw) return null
    return analyze(raw.markets, {
      feeLevelId: settings.feeLevel,
      side: settings.side,
      costMode: settings.costMode,
      includeClosed: settings.includeClosed,
      minVolumeUsd: settings.minVolumeUsd,
      quotes: settings.quotes,
      extraFees: settings.feeLevel === 'custom' ? settings.customFees : null,
    })
  }, [raw, settings])

  const stability = useMemo(() => stabilityFromHistory(history), [history])
  const stabMap = useMemo(() => new Map(stability.map((r) => [r.symbol, r])), [stability])
  const series = useMemo(() => medianSeries(history), [history])

  const fetchDepth = useCallback(async () => {
    setObLoading(true)
    setObError(null)
    const r = await fetchOrderbookAll()
    if (!r.json) {
      setObError(r.log.map((l) => `${l.url}: ${l.error}`).join(' | '))
      setObLoading(false)
      return
    }
    const books = parseOrderbookAll(r.json)
    const metrics = new Map()
    for (const m of raw?.markets || []) {
      const book = matchBook(books, m)
      if (!book) continue
      const m100 = bookMetrics(book, m, 100)
      const m1000 = bookMetrics(book, m, 1000)
      if (!m100) continue
      metrics.set(m.key, {
        ...m100,
        slip100: m100.buySlippagePct,
        fill100: m100.buyFilled,
        slip1000: m1000?.buySlippagePct,
        fill1000: m1000?.buyFilled,
        roundTripSlip1000: m1000?.roundTripSlippagePct,
      })
    }
    setOb({ books, metrics, ms: r.ms, ts: Date.now(), keys: Object.keys(books).length })
    setObLoading(false)
  }, [raw])

  return (
    <div className="app">
      <div className="header">
        <div className="title-wrap">
          <div className="brand">
            <h1>داشبورد تحلیل اسپرد و هزینه‌ی معاملات نوبیتکس</h1>
          </div>
          <div className="sub">
            توزیعِ آماری «کارمزدِ پنهان» (اسپرد) در تمام نمادها، کشف عواملِ ایجاد تفاوت، و تفکیک نمادها بر اساس آن
          </div>
          <div className="inline" style={{ marginTop: 4 }}>
            <span className={`badge ${state === 'ok' ? 'ok' : state === 'error' ? 'bad' : 'info'}`}>
              <span className={`dot ${state === 'ok' ? '' : state === 'error' ? 'bad' : 'loading'}`} />
              {raw?.transport ? raw.transport.label : 'در حال اتصال…'}
            </span>
            {raw && <span className="badge">{raw.meta.source === 'coingecko' ? 'منبع: CoinGecko' : 'منبع: Nobitex'}</span>}
            {raw?.meta?.tomanPerUsdt ? (
              <span className="badge">هر تتر ≈ {Math.round(raw.meta.tomanPerUsdt).toLocaleString('fa-IR')} تومان</span>
            ) : null}
            <button className="small ghost" onClick={() => setShowDiag((v) => !v)}>
              {showDiag ? 'پنهان کردن' : 'گزارش اتصال'}
            </button>
          </div>
        </div>
        <div className="controls">
          <button className="primary" onClick={load} disabled={state === 'loading'}>
            {state === 'loading' ? <span className="spinner" /> : '↻'} بروزرسانی
          </button>
        </div>
      </div>

      {showDiag && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h2>گزارش اتصال (Fallback chain)</h2>
          <div className="sub">
            چون سرور میزبان به اینترنت دسترسی ندارد، داده مستقیماً از مرورگر شما دریافت می‌شود. در صورت مسدود بودن
            دسترسی مستقیم به نوبیتکس (مثلاً تحریمِ جغرافیایی)، منابع جایگزین امتحان می‌شوند.
          </div>
          <div className="table-wrap" style={{ maxHeight: 220, marginTop: 8 }}>
            <table>
              <thead>
                <tr>
                  <th>منبع</th>
                  <th>وضعیت</th>
                  <th>زمان</th>
                  <th>توضیح</th>
                </tr>
              </thead>
              <tbody>
                {log.map((l, i) => {
                  const t = TRANSPORTS.find((x) => x.id === l.id)
                  return (
                    <tr key={i}>
                      <td>{t?.label || l.id}</td>
                      <td className={l.ok ? 'sig yes' : 'sig no'}>{l.ok ? 'موفق' : 'ناموفق'}</td>
                      <td className="num">{l.ms != null ? `${l.ms}ms` : '—'}</td>
                      <td className="small">{l.error || t?.note || ''}</td>
                    </tr>
                  )
                })}
                {!log.length && (
                  <tr>
                    <td colSpan={4} className="small">هنوز تلاشی ثبت نشده است.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {lastError && <div className="note warn">آخرین خطا: {lastError}</div>}
          <div className="divider" />
          <h3>مسیر دستی (وقتی CORS یا دسترسی مستقیم مسدود است)</h3>
          <div className="sub">
            آدرس زیر را در یک تبِ جدیدِ مرورگر باز کنید، خروجی JSON را کپی و در کادر پایین بچسبانید:
            <div className="mono" style={{ direction: 'ltr', textAlign: 'left', marginTop: 4 }}>
              https://apiv2.nobitex.ir/market/stats
            </div>
          </div>
          <textarea
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder='{"status":"ok","stats":{...}}'
            style={{
              width: '100%',
              minHeight: 90,
              direction: 'ltr',
              textAlign: 'left',
              background: 'var(--bg-soft)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: 9,
              padding: 8,
              fontFamily: 'monospace',
              fontSize: 11,
            }}
          />
          <div className="inline" style={{ marginTop: 6 }}>
            <button onClick={loadManual} disabled={!manualText.trim()}>
              بارگذاری JSON دستی
            </button>
            <span className="small">همچنین می‌توانید خروجی CoinGecko (exchanges/nobitex/tickers) را هم همین‌جا بچسبانید.</span>
          </div>
        </div>
      )}

      <Controls
        settings={settings}
        setSettings={setSettings}
        state={state}
        lastMs={lastMs}
        lastTs={raw?.ts}
        onRefresh={load}
        sourceId={sourceId}
        setSourceId={setSourceId}
      />

      {!res ? (
        <div className="card">
          <div className="inline">
            <span className="spinner" /> در حال دریافت داده از نوبیتکس…
          </div>
          {state === 'error' && (
            <div className="note warn">
              هیچ منبعی پاسخ نداد. از بخش «منبع داده» گزینه‌ی «داده شبیه‌سازی‌شده» را انتخاب کنید تا خط لوله‌ی تحلیل را
              ببینید، یا گزارش اتصال را بررسی کنید.
            </div>
          )}
        </div>
      ) : (
        <>
          <Kpis res={res} raw={raw} settings={settings} snapshots={history} />

          <div className="tabs">
            {TABS.map((t) => (
              <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'dist' && <TabDistribution res={res} stabMap={stabMap} settings={settings} />}
          {tab === 'factors' && <TabFactors res={res} />}
          {tab === 'clusters' && <TabClusters res={res} />}
          {tab === 'symbols' && <TabSymbols res={res} stabMap={stabMap} settings={settings} />}
          {tab === 'stability' && (
            <TabStability snapshots={history} series={series} stability={stability} settings={settings} />
          )}
          {tab === 'depth' && (
            <TabDepth ob={ob} loading={obLoading} onFetch={fetchDepth} markets={res.markets} error={obError} />
          )}
        </>
      )}

      <div className="note" style={{ marginTop: 16 }}>
        روش‌شناسی: اسپردِ هر نماد از <span className="mono">(bestSell − bestBuy) / mid</span> محاسبه شده؛ چون توزیع آن
        نرمال نیست (چولگی بالا و دنباله‌ی سنگین)، برای مقایسه‌ی گروه‌ها از آزمون‌های ناپارامتری من‌ویتنی و
        کروسکال-والیس استفاده شده، برای چندمقایسه‌ای تصحيح هولم اعمال شده، و سهم هر عامل با رگرسیون روی لگاریتم اسپرد
        برآورد شده است. کارمزدها طبق جدول سطوح نوبیتکس (پایه تا VIP6) اعمال می‌شود.
      </div>
    </div>
  )
}
