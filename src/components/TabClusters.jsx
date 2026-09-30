import React, { useState, useMemo } from 'react'
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { num, pctFa, compactUsd, tickNum } from '../lib/format.js'

const COLORS = ['#34d399', '#38bdf8', '#a78bfa', '#f59e0b', '#f87171']

export default function TabClusters({ res }) {
  const cl = res.clusters
  const [kFilter, setKFilter] = useState(null)

  const series = useMemo(() => {
    if (!cl) return []
    return cl.profiles.map((p) => ({
      cluster: p.cluster,
      data: cl.points
        .filter((m) => m.cluster === p.cluster)
        .map((m) => ({
          symbol: m.symbol,
          x: Math.log10(m.volumeUsd),
          y: Math.log10(m.spreadPct),
          vol: m.volumeUsd,
          spread: m.spreadPct,
          cost: m.costPct,
          quote: m.quote,
        })),
    }))
  }, [cl])

  if (!cl) return <div className="card"><div className="note warn">داده‌ی کافی برای خوشه‌بندی وجود ندارد.</div></div>

  const rows = cl.profiles.map((p) => ({
    __key: p.cluster,
    cluster: p.cluster,
    label: `خوشه ${p.cluster + 1}`,
    n: p.n,
    spreadMedian: p.spreadMedian,
    spreadP25: p.spreadP25,
    spreadP75: p.spreadP75,
    costMedian: p.costMedian,
    volMedian: p.volMedian,
    irtShare: p.irtShare,
    dayChangeMedian: p.dayChangeMedian,
    top: p.top.join('، '),
  }))

  const columns = [
    {
      key: 'label',
      label: 'خوشه',
      render: (r) => (
        <span className="badge" style={{ color: COLORS[r.cluster % COLORS.length], borderColor: COLORS[r.cluster % COLORS.length] }}>
          {r.label}
        </span>
      ),
    },
    { key: 'n', label: 'تعداد نماد', num: true, render: (r) => num(r.n, 0) },
    { key: 'spreadMedian', label: 'میانه اسپرد ٪', num: true, render: (r) => pctFa(r.spreadMedian, 3) },
    {
      key: 'range',
      label: 'بازه چارکی اسپرد',
      render: (r) => `${pctFa(r.spreadP25, 2)} – ${pctFa(r.spreadP75, 2)}`,
    },
    { key: 'costMedian', label: 'میانه هزینه کل ٪', num: true, render: (r) => pctFa(r.costMedian, 3) },
    { key: 'volMedian', label: 'میانه حجم ۲۴س', num: true, render: (r) => compactUsd(r.volMedian) },
    { key: 'irtShare', label: 'سهم بازار ریالی', num: true, render: (r) => pctFa(r.irtShare, 0) },
    { key: 'dayChangeMedian', label: 'میانه |تغییر روز|', num: true, render: (r) => pctFa(r.dayChangeMedian, 2) },
    { key: 'top', label: 'نمادهای شاخص', render: (r) => <span className="small">{r.top}</span> },
    {
      key: 'filter',
      label: '',
      render: (r) => (
        <button className="small ghost" onClick={() => setKFilter(kFilter === r.cluster ? null : r.cluster)}>
          {kFilter === r.cluster ? 'حذف فیلتر' : 'فیلتر'}
        </button>
      ),
    },
  ]

  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="card">
        <div className="card-head">
          <div>
            <h2>خوشه‌بندی نمادها بر اساس ویژگی‌های هزینه</h2>
            <div className="sub">
              k-means روی ویژگی‌های استانداردشده: ln(اسپرد)، log10(حجم)، log10(قیمت)، |تغییر روزانه| — تعداد خوشه با
              معیار Silhouette انتخاب شده است
            </div>
          </div>
          <span className="badge info">
            k={cl.k} · Silhouette={num(cl.silhouette, 3)}
          </span>
        </div>
        <div style={{ height: 380 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 10, bottom: 24, left: 4 }}>
              <CartesianGrid stroke="rgba(148,163,184,.12)" />
              <XAxis
                type="number"
                dataKey="x"
                tick={{ fill: '#94a3b8', fontSize: 10 }}
                domain={['dataMin', 'dataMax']}
                label={{ value: 'log10 حجم ۲۴س ($)', fill: '#94a3b8', fontSize: 10, position: 'insideBottom', dy: 12 }}
              />
              <YAxis
                type="number"
                dataKey="y"
                tick={{ fill: '#94a3b8', fontSize: 10 }}
                width={44}
                label={{ value: 'log10 اسپرد ٪', fill: '#94a3b8', fontSize: 10, angle: -90, position: 'insideLeft' }}
              />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #23304a', borderRadius: 10, fontSize: 12 }}
                content={({ payload }) => {
                  const p = payload?.[0]?.payload
                  if (!p) return null
                  return (
                    <div className="tooltip-box">
                      <div className="t-title">
                        {p.symbol} ({p.quote})
                      </div>
                      <div>حجم ۲۴س: {compactUsd(p.vol)}</div>
                      <div>اسپرد: {pctFa(p.spread, 3)}</div>
                      <div>هزینه کل: {pctFa(p.cost, 3)}</div>
                    </div>
                  )
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {series.map((s) => (
                <Scatter
                  key={s.cluster}
                  name={`خوشه ${s.cluster + 1}`}
                  data={kFilter == null || kFilter === s.cluster ? s.data : []}
                  fill={COLORS[s.cluster % COLORS.length]}
                  fillOpacity={0.75}
                />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>پروفایل خوشه‌ها</h2>
            <div className="sub">خوشه‌ها از کم‌هزینه (بالا) به پرهزینه مرتب شده‌اند</div>
          </div>
        </div>
        <div className="table-wrap" style={{ maxHeight: 320 }}>
          <table>
            <thead>
              <tr>
                {columns.filter((c) => c.label).map((c) => (
                  <th key={c.key} className={c.num ? 'num' : ''}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.cluster}>
                  {columns.map((c) => (
                    <td key={c.key} className={c.num ? 'num' : ''}>
                      {c.render ? c.render(r) : String(r[c.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="note">
          کاربرد عملی: خوشه‌ی اول (اسپردِ کم و حجمِ بالا) مناسبِ معاملاتِ کوتاه‌مدت و نوسان‌گیری است؛ خوشه‌های آخر
          (اسپردِ چنددرصدی) برای معاملاتِ اسکالپ عملاً غیرقابل استفاده‌اند و فقط برای سرمایه‌گذاریِ میان‌مدت با
          سفارشِ لیمیت (میکر) معنا دارند.
        </div>
      </div>
    </div>
  )
}
