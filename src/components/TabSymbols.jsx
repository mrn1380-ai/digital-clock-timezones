import React from 'react'
import DataTable from './DataTable.jsx'
import { num, pctFa, compactUsd, tickNum, toCsv } from '../lib/format.js'

export default function TabSymbols({ res, stabMap, settings }) {
  const rows = res.markets.map((m) => {
    const st = stabMap.get(m.symbol)
    return { ...m, __key: m.key, spreadSd: st?.sd, spreadCv: st?.cv, samples: st?.n ?? 0 }
  })

  const columns = [
    { key: 'symbol', label: 'نماد', sortValue: (r) => r.symbol },
    { key: 'quote', label: 'بازار', render: (r) => <span className={`badge ${r.quote === 'USDT' ? 'info' : 'warn'}`}>{r.quote}</span> },
    { key: 'priceQuote', label: 'قیمت', num: true, render: (r) => tickNum(r.priceQuote) },
    { key: 'priceUsd', label: 'قیمت (دلار)', num: true, render: (r) => tickNum(r.priceUsd) },
    {
      key: 'spreadPct',
      label: 'اسپرد ٪',
      num: true,
      render: (r) => {
        const d = res.spreadStats
        const color = r.spreadPct > d.p90 ? 'bad' : r.spreadPct > d.median ? 'warn' : 'ok'
        return <span className={`badge ${color}`}>{pctFa(r.spreadPct, 3)}</span>
      },
    },
    { key: 'feePct', label: 'کارمزد ٪', num: true, render: (r) => pctFa(r.feePct, 3) },
    {
      key: 'costPct',
      label: `هزینه کل ٪ (${settings.side === 'taker' ? 'تیکر' : 'میکر'})`,
      num: true,
      render: (r) => <b>{pctFa(r.costPct, 3)}</b>,
    },
    { key: 'costBps', label: 'هزینه کل (bps)', num: true, render: (r) => num(r.costBps, 1) },
    { key: 'volumeUsd', label: 'حجم ۲۴س', num: true, render: (r) => compactUsd(r.volumeUsd) },
    { key: 'volumeTier', label: 'سطح نقدشوندگی' },
    { key: 'dayChange', label: 'تغییر روز ٪', num: true, render: (r) => (r.dayChange == null ? '—' : pctFa(r.dayChange, 2)) },
    { key: 'spreadSd', label: 'انحراف اسپرد (زمان)', num: true, render: (r) => pctFa(r.spreadSd, 3) },
    { key: 'spreadCv', label: 'ضریب تغییرات اسپرد', num: true, render: (r) => num(r.spreadCv, 2) },
    { key: 'samples', label: 'تعداد نمونه', num: true, render: (r) => num(r.samples, 0) },
    { key: 'priceBucket', label: 'بازه قیمتی' },
  ]

  const exportCsv = () => {
    const headers = [
      'نماد', 'بازار', 'قیمت', 'قیمت_دلار', 'اسپرد_درصد', 'کارمزد_درصد', 'هزینه_کل_درصد', 'هزینه_کل_bps',
      'حجم_24س_دلار', 'سطح_نقدشوندگی', 'تغییر_روز_درصد', 'انحراف_اسپرد', 'ضریب_تغییرات_اسپرد', 'تعداد_نمونه', 'بازه_قیمتی',
    ]
    const data = rows.map((r) => [
      r.symbol, r.quote, r.priceQuote, r.priceUsd, r.spreadPct, r.feePct, r.costPct, r.costBps,
      r.volumeUsd, r.volumeTier, r.dayChange, r.spreadSd, r.spreadCv, r.samples, r.priceBucket,
    ])
    const blob = new Blob([toCsv(data, headers)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `nobitex-cost-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>جدول کامل نمادها</h2>
          <div className="sub">
            مرتب‌سازی با کلیک روی سرستون · هزینه کل بر اساس سناریوی{' '}
            {settings.side === 'taker' ? 'تیکر' : 'میکر'} {settings.costMode === 'roundtrip' ? 'رفت‌وبرگشت' : 'یک‌طرفه'}
          </div>
        </div>
        <button onClick={exportCsv}>⭳ خروجی CSV</button>
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        searchKeys={['symbol', 'base', 'quote']}
        initialSort="costPct"
        initialDir="desc"
        placeholder="جستجوی نماد (مثل BTC)…"
        maxHeight={640}
      />
    </div>
  )
}
