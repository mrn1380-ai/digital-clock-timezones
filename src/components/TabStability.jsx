import React from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart, Bar, Cell,
} from 'recharts'
import DataTable from './DataTable.jsx'
import { num, pctFa, tickNum, timeFa } from '../lib/format.js'

export default function TabStability({ snapshots, series, stability, settings }) {
  const needMore = snapshots.length < 3

  const cols = [
    { key: 'symbol', label: 'نماد' },
    { key: 'n', label: 'نمونه', num: true, render: (r) => num(r.n, 0) },
    { key: 'median', label: 'میانه اسپرد ٪', num: true, render: (r) => pctFa(r.median, 3) },
    { key: 'mean', label: 'میانگین ٪', num: true, render: (r) => pctFa(r.mean, 3) },
    { key: 'sd', label: 'انحراف معیار', num: true, render: (r) => pctFa(r.sd, 3) },
    { key: 'cv', label: 'ضریب تغییرات', num: true, render: (r) => num(r.cv, 2) },
    { key: 'min', label: 'کمینه ٪', num: true, render: (r) => pctFa(r.min, 3) },
    { key: 'max', label: 'بیشینه ٪', num: true, render: (r) => pctFa(r.max, 3) },
    { key: 'range', label: 'دامنه', num: true, render: (r) => pctFa(r.range, 3) },
  ]

  const cvSorted = [...stability].filter((r) => Number.isFinite(r.cv)).sort((a, b) => b.cv - a.cv)
  const topVolatile = cvSorted.slice(0, 18)
  const mostStable = cvSorted.slice(-18).reverse()

  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="card">
        <div className="card-head">
          <div>
            <h2>پایداری اسپرد در طول زمان</h2>
            <div className="sub">
              نمونه‌برداری {settings.autoSample ? `هر ${settings.intervalSec} ثانیه` : 'دستی'} ·{' '}
              {num(snapshots.length, 0)} نمونه جمع‌آوری شده
            </div>
          </div>
          <span className={`badge ${needMore ? 'warn' : 'ok'}`}>{needMore ? 'نمونه کافی نیست' : 'سری زمانی فعال'}</span>
        </div>
        {series.length ? (
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 8, right: 10, bottom: 24, left: 4 }}>
                <CartesianGrid stroke="rgba(148,163,184,.12)" />
                <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 10 }} interval="preserveStartEnd" minTickGap={28} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} width={44} tickFormatter={(v) => tickNum(v)} />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #23304a', borderRadius: 10, fontSize: 12 }}
                  formatter={(v, n) => [pctFa(v, 3), n]}
                  labelFormatter={(l) => `ساعت ${l}`}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="p25" name="چارک اول (p25)" stroke="#34d399" strokeWidth={1.4} dot={false} />
                <Line type="monotone" dataKey="median" name="میانه" stroke="#38bdf8" strokeWidth={2.2} dot={false} />
                <Line type="monotone" dataKey="p75" name="چارک سوم (p75)" stroke="#a78bfa" strokeWidth={1.4} dot={false} />
                <Line type="monotone" dataKey="p90" name="p90" stroke="#f87171" strokeWidth={1.2} strokeDasharray="4 3" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="note warn">هنوز نمونه‌ای جمع‌آوری نشده است.</div>
        )}
        <div className="note">
          میانه‌ی اسپردِ کل بازار معمولاً پایدار است؛ اما «دنباله» (p90) در ساعات کم‌نقدشونده جهش می‌کند. برای
          معامله‌گری، انحرافِ اسپردِ تک‌نماد (ستون ضریب تغییرات) مهم‌تر از میانگین است.
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <div className="card-head">
            <div>
              <h2>نمادهای با اسپردِ ناپایدار</h2>
              <div className="sub">ضریب تغییرات = انحراف معیار / میانگین</div>
            </div>
          </div>
          {topVolatile.length ? (
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topVolatile} margin={{ top: 8, right: 8, bottom: 40, left: 4 }}>
                  <CartesianGrid stroke="rgba(148,163,184,.12)" vertical={false} />
                  <XAxis dataKey="symbol" tick={{ fill: '#94a3b8', fontSize: 10 }} angle={-40} textAnchor="end" height={52} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} width={40} tickFormatter={(v) => tickNum(v)} />
                  <Tooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid #23304a', borderRadius: 10, fontSize: 12 }}
                    formatter={(v) => [num(v, 2), 'ضریب تغییرات']}
                  />
                  <Bar dataKey="cv" radius={[3, 3, 0, 0]}>
                    {topVolatile.map((d, i) => (
                      <Cell key={i} fill={d.cv > 1 ? '#f87171' : d.cv > 0.5 ? '#fbbf24' : '#38bdf8'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="note">داده ندارد.</div>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h2>نمادهای با اسپردِ پایدار</h2>
              <div className="sub">مناسب برای اجرای سفارش‌های بزرگ‌تر</div>
            </div>
          </div>
          <DataTable columns={cols} rows={mostStable} showSearch={false} initialSort="cv" maxHeight={280} />
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>آمار اسپرد هر نماد در طول زمان</h2>
            <div className="sub">برای هر نماد روی تمام نمونه‌های جمع‌آوری‌شده</div>
          </div>
        </div>
        <DataTable columns={cols} rows={stability} searchKeys={['symbol']} initialSort="cv" initialDir="desc" maxHeight={460} />
      </div>
    </div>
  )
}
