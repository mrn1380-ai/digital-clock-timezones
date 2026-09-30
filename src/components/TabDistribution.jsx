import React, { useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Cell,
} from 'recharts'
import BoxPlot from './charts/BoxPlot.jsx'
import DataTable from './DataTable.jsx'
import { num, pctFa, compactUsd, tickNum } from '../lib/format.js'

function StatRow({ label, d, unit = '٪' }) {
  return (
    <tr>
      <td>{label}</td>
      <td className="num">{num(d.n, 0)}</td>
      <td className="num">{num(d.mean, 3)}</td>
      <td className="num">{num(d.median, 3)}</td>
      <td className="num">{num(d.sd, 3)}</td>
      <td className="num">{num(d.p10, 3)}</td>
      <td className="num">{num(d.p25, 3)}</td>
      <td className="num">{num(d.p75, 3)}</td>
      <td className="num">{num(d.p90, 3)}</td>
      <td className="num">{num(d.iqr, 3)}</td>
      <td className="num">{num(d.skew, 2)}</td>
      <td className="num">{num(d.max, 3)}</td>
      <td className="small">{unit}</td>
    </tr>
  )
}

export default function TabDistribution({ res, stabMap, settings }) {
  const [logBins, setLogBins] = useState(true)
  const hist = logBins ? res.hist : res.histLinear
  const data = hist.map((b) => ({ label: tickNum(b.center), count: b.count, from: b.from, to: b.to }))
  const s = res.spreadStats
  const medianBin = data.length
    ? data.reduce((best, d) => (Math.abs(d.center - s.median) < Math.abs(best.center - s.median) ? d : best), data[0])
    : null

  const priceCols = [
    { key: 'symbol', label: 'نماد', sortValue: (r) => r.symbol },
    { key: 'quote', label: 'بازار', render: (r) => <span className="badge">{r.quote}</span> },
    { key: 'spreadPct', label: 'اسپرد ٪', num: true, render: (r) => pctFa(r.spreadPct, 3) },
    { key: 'costPct', label: 'هزینه کل ٪', num: true, render: (r) => pctFa(r.costPct, 3) },
    { key: 'volumeUsd', label: 'حجم ۲۴س', num: true, render: (r) => compactUsd(r.volumeUsd) },
    { key: 'spreadSd', label: 'انحراف اسپرد در زمان', num: true, render: (r) => pctFa(stabMap.get(r.symbol)?.sd, 3) },
    { key: 'priceQuote', label: 'قیمت', num: true, render: (r) => tickNum(r.priceQuote) },
  ]

  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="grid two">
        <div className="card">
          <div className="card-head">
            <div>
              <h2>توزیع اسپرد تمام نمادها</h2>
              <div className="sub">درصد اسپرد نسبت به قیمت میانی: (bestSell − bestBuy) / mid × ۱۰۰</div>
            </div>
            <button className="small ghost" onClick={() => setLogBins((v) => !v)}>
              {logBins ? 'محور خطی' : 'محور لگاریتمی'}
            </button>
          </div>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, bottom: 22, left: 4 }}>
                <CartesianGrid stroke="rgba(148,163,184,.12)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                  interval="preserveStartEnd"
                  angle={-35}
                  textAnchor="end"
                  height={46}
                />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} width={44} />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #23304a', borderRadius: 10, fontSize: 12 }}
                  formatter={(v) => [`${v} نماد`, 'تعداد']}
                  labelFormatter={(l, p) => (p?.[0] ? `بازه ${tickNum(p[0].payload.from)} تا ${tickNum(p[0].payload.to)} ٪` : l)}
                />
                <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                  {data.map((d, i) => (
                    <Cell key={i} fill={d.center > s.p90 ? '#f87171' : d.center > s.median ? '#38bdf8' : '#34d399'} />
                  ))}
                </Bar>
                <ReferenceLine
                  x={medianBin?.label}
                  stroke="#fcd34d"
                  strokeDasharray="4 3"
                  label={{ value: `میانه ${pctFa(s.median, 2)}`, fill: '#fcd34d', fontSize: 10, position: 'top' }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="legend">
            <span><i style={{ background: '#34d399' }} /> کمتر از میانه</span>
            <span><i style={{ background: '#38bdf8' }} /> میانه تا p90</span>
            <span><i style={{ background: '#f87171' }} /> بالاتر از p90</span>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h2>آمار توصیفی</h2>
              <div className="sub">اسپرد و هزینه کل (٪)</div>
            </div>
          </div>
          <div className="table-wrap" style={{ maxHeight: 300 }}>
            <table>
              <thead>
                <tr>
                  <th>متغیر</th>
                  <th className="num">n</th>
                  <th className="num">میانگین</th>
                  <th className="num">میانه</th>
                  <th className="num">انحراف</th>
                  <th className="num">p10</th>
                  <th className="num">p25</th>
                  <th className="num">p75</th>
                  <th className="num">p90</th>
                  <th className="num">IQR</th>
                  <th className="num">چولگی</th>
                  <th className="num">بیشینه</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                <StatRow label="اسپرد" d={s} />
                <StatRow label="هزینه کل" d={res.costStats} />
              </tbody>
            </table>
          </div>
          <div className="note">
            چولگی مثبتِ بالا یعنی توزیع «دنباله‌دار» است: بیشتر نمادها اسپرد کمی دارند اما تعداد کمی نماد
            (معمولاً کم‌نقدشونده‌ها) اسپردهای بسیار بزرگ می‌سازند. برای مقایسه گروهی از میانه و آزمون‌های
            ناپارامتری استفاده شده، چون توزیع نرمال نیست.
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>مقایسه توزیع بر حسب بازار (ریالی / تتری)</h2>
            <div className="sub">جعبه: چارک‌ها، خط وسط: میانه، دایره طلایی: میانگین</div>
          </div>
          <div className="inline">
            {res.quoteGroups.map((g) => (
              <span className="badge" key={g.key}>
                {g.key}: میانه {pctFa(g.median, 3)} (n={g.n})
              </span>
            ))}
          </div>
        </div>
        <BoxPlot groups={res.quoteGroups} height={320} logScale={true} format={(v) => tickNum(v)} unit="اسپرد ٪" />
      </div>

      <div className="grid two">
        <div className="card">
          <div className="card-head">
            <div>
              <h2>ارزان‌ترین نمادها برای معامله</h2>
              <div className="sub">هزینه کل = اسپرد + کارمزد (بر اساس تنظیمات فعلی)</div>
            </div>
          </div>
          <DataTable columns={priceCols} rows={res.cheapest} showSearch={false} initialSort="costPct" maxHeight={330} />
        </div>
        <div className="card">
          <div className="card-head">
            <div>
              <h2>پرهزینه‌ترین نمادها</h2>
              <div className="sub">داده‌های پرت بر اساس قاعده ۱.۵×IQR</div>
            </div>
            <span className="badge bad">{res.outliers.outliers.length} نماد پرت</span>
          </div>
          <DataTable columns={priceCols} rows={res.priciest} showSearch={false} initialSort="costPct" initialDir="desc" maxHeight={330} />
        </div>
      </div>
    </div>
  )
}
