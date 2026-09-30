import React, { useMemo, useState } from 'react'
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import DataTable from './DataTable.jsx'
import { num, pctFa, compactUsd, tickNum } from '../lib/format.js'
import { spearmanCalc, fmtP, describe, median } from '../lib/stats.js'
import { matchBook } from '../lib/orderbook.js'

export default function TabDepth({ ob, loading, onFetch, markets, error }) {
  const [notional, setNotional] = useState(100)

  const rows = useMemo(() => {
    if (!ob?.books) return []
    const out = []
    for (const m of markets) {
      const book = matchBook(ob.books, m)
      if (!book) continue
      const met = ob.metrics.get(m.key)
      if (!met) continue
      out.push({ ...m, ...met, __key: m.key })
    }
    return out
  }, [ob, markets])

  const summary = useMemo(() => {
    if (!rows.length) return null
    const corr = spearmanCalc(
      rows.map((r) => r.relTickPct).filter(Number.isFinite),
      rows.map((r) => r.spreadPct).filter(Number.isFinite)
    )
    const tiers = {}
    for (const r of rows) {
      const t = r.volumeTier || 'نامشخص'
      if (!tiers[t]) tiers[t] = []
      tiers[t].push(r)
    }
    return {
      n: rows.length,
      corr,
      tiers: Object.entries(tiers).map(([k, v]) => ({
        tier: k,
        n: v.length,
        spreadMedian: median(v.map((x) => x.spreadPct)),
        relTickMedian: median(v.map((x) => x.relTickPct).filter(Number.isFinite)),
        slipMedian: median(v.map((x) => (notional === 100 ? x.slip100 : x.slip1000)).filter(Number.isFinite)),
        unfilled: v.filter((x) => !(notional === 100 ? x.fill100 : x.fill1000)).length,
      })),
    }
  }, [rows, notional])

  const columns = [
    { key: 'symbol', label: 'نماد' },
    { key: 'quote', label: 'بازار', render: (r) => <span className="badge">{r.quote}</span> },
    { key: 'spreadPct', label: 'اسپرد ٪', num: true, render: (r) => pctFa(r.spreadPct, 3) },
    { key: 'tick', label: 'اندازه تیک', num: true, render: (r) => tickNum(r.tick) },
    { key: 'relTickPct', label: 'تیک نسبی ٪', num: true, render: (r) => pctFa(r.relTickPct, 4) },
    { key: 'slip100', label: 'اسلیپیج $100 (٪)', num: true, render: (r) => (r.fill100 ? pctFa(r.slip100, 3) : <span className="badge bad">عمق ناکافی</span>) },
    { key: 'slip1000', label: 'اسلیپیج $1000 (٪)', num: true, render: (r) => (r.fill1000 ? pctFa(r.slip1000, 3) : <span className="badge bad">عمق ناکافی</span>) },
    { key: 'roundTripSlip', label: 'رفت‌وبرگشت $1000 (٪)', num: true, render: (r) => pctFa(r.roundTripSlip1000, 3) },
    { key: 'levels', label: 'سطوح (خرید/فروش)', render: (r) => `${num(r.askLevels, 0)} / ${num(r.bidLevels, 0)}` },
    { key: 'depth', label: 'عمق ۵۰ سطح (خرید)', num: true, render: (r) => compactUsd(r.depth50AskQuote / (r.priceUsd > 0 ? r.priceQuote / r.priceUsd : 1)) },
    { key: 'volumeUsd', label: 'حجم ۲۴س', num: true, render: (r) => compactUsd(r.volumeUsd) },
  ]

  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="card">
        <div className="card-head">
          <div>
            <h2>عمق بازار، اندازه‌ی تیک و اسلیپیج واقعی</h2>
            <div className="sub">
              منبع: <span className="mono">GET /v3/orderbook/all</span> — دفتر سفارشات تمام بازارها در یک درخواست
            </div>
          </div>
          <div className="inline">
            <button className="primary" onClick={onFetch} disabled={loading}>
              {loading ? <span className="spinner" /> : '↻'} دریافت دفتر سفارشات
            </button>
            {ob && <span className="badge ok">{num(rows.length, 0)} بازار تحلیل شد · {ob.ms}ms</span>}
          </div>
        </div>

        {!ob && (
          <div className="note warn">
            این بخش به‌صورت دستی اجرا می‌شود (حجم پاسخ بالاست). اسپردِ «تاپ‌آف‌بوک» که در تب‌های دیگر می‌بینید فقط
            بهترین خرید/فروش است؛ برای معاملاتِ واقعی، هزینه‌ی عبور از عمق دفتر سفارشات (اسلیپیج) تعیین‌کننده است.
          </div>
        )}
        {error && <div className="note warn">خطا در دریافت: {error}</div>}
        {ob && !rows.length && (
          <div className="note warn">
            پاسخ دریافت شد اما ساختار آن با نمادها تطبیق داده نشد ({num(Object.keys(ob.books || {}).length, 0)} کلید یافت
            شد). در صورت تمایل خروجی را برای بررسی ارسال کنید.
          </div>
        )}

        {summary && (
          <>
            <div className="grid kpis" style={{ marginTop: 10 }}>
              <div className="card kpi">
                <div className="k-label">بازارهای تحلیل‌شده</div>
                <div className="k-value">{num(summary.n, 0)}</div>
                <div className="k-sub">دفتر سفارشات کامل</div>
              </div>
              <div className="card kpi">
                <div className="k-label">همبستگی تیک نسبی با اسپرد</div>
                <div className="k-value">{num(summary.corr?.rho, 2)}</div>
                <div className="k-sub">p={fmtP(summary.corr?.p)}</div>
              </div>
              <div className="card kpi">
                <div className="k-label">میانه اسلیپیج ${notional}</div>
                <div className="k-value">
                  {pctFa(median(rows.map((r) => (notional === 100 ? r.slip100 : r.slip1000)).filter(Number.isFinite)), 3)}
                </div>
                <div className="k-sub">نسبت به قیمت میانی</div>
              </div>
              <div className="card kpi">
                <div className="k-label">نماد با عمق ناکافی برای ${notional}</div>
                <div className="k-value">
                  {num(rows.filter((r) => !(notional === 100 ? r.fill100 : r.fill1000)).length, 0)}
                </div>
                <div className="k-sub">از {num(rows.length, 0)} نماد</div>
              </div>
            </div>

            <div className="card" style={{ marginTop: 12 }}>
              <div className="card-head">
                <div>
                  <h2>اسپردِ نسبیِ تیک در برابر اسپردِ بازار</h2>
                  <div className="sub">
                    اگر نقاط روی خط y=x بنشینند یعنی اسپرد دقیقاً برابر یک تیک است — یعنی عامل مکانیکی، نه نقدشوندگی
                  </div>
                </div>
              </div>
              <div style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 8, right: 10, bottom: 24, left: 4 }}>
                    <CartesianGrid stroke="rgba(148,163,184,.12)" />
                    <XAxis
                      type="number"
                      dataKey="relTickPct"
                      scale="log"
                      domain={['auto', 'auto']}
                      tick={{ fill: '#94a3b8', fontSize: 10 }}
                      tickFormatter={(v) => tickNum(v)}
                      label={{ value: 'اندازه تیک نسبی ٪', fill: '#94a3b8', fontSize: 10, position: 'insideBottom', dy: 12 }}
                    />
                    <YAxis
                      type="number"
                      dataKey="spreadPct"
                      scale="log"
                      domain={['auto', 'auto']}
                      tick={{ fill: '#94a3b8', fontSize: 10 }}
                      width={44}
                      tickFormatter={(v) => tickNum(v)}
                    />
                    <Tooltip
                      contentStyle={{ background: '#0f172a', border: '1px solid #23304a', borderRadius: 10, fontSize: 12 }}
                      content={({ payload }) => {
                        const p = payload?.[0]?.payload
                        if (!p) return null
                        return (
                          <div className="tooltip-box">
                            <div className="t-title">{p.symbol}</div>
                            <div>تیک نسبی: {pctFa(p.relTickPct, 4)}</div>
                            <div>اسپرد: {pctFa(p.spreadPct, 3)}</div>
                            <div>اسلیپیج $1000: {p.fill1000 ? pctFa(p.slip1000, 3) : 'عمق ناکافی'}</div>
                          </div>
                        )
                      }}
                    />
                    <Scatter data={rows} fill="#a78bfa" fillOpacity={0.72} />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card" style={{ marginTop: 12 }}>
              <div className="card-head">
                <div>
                  <h2>جدول عمق و اسلیپیج</h2>
                  <div className="sub">اسلیپیج = انحراف قیمت میانگینِ سفارش از قیمت میانی بازار</div>
                </div>
              </div>
              <DataTable
                columns={columns}
                rows={rows}
                searchKeys={['symbol']}
                initialSort="slip1000"
                initialDir="desc"
                maxHeight={520}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
