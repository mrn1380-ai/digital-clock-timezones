import React from 'react'
import { num, pctFa, compactUsd, bpsFa } from '../lib/format.js'
import { effectLabel } from '../lib/stats.js'
import { fmtP } from '../lib/stats.js'

export default function Kpis({ res, raw, settings, snapshots }) {
  const s = res.spreadStats
  const c = res.costStats
  const qt = res.quoteTest
  const [irt, usdt] = [res.quoteGroups.find((g) => g.key === 'IRT'), res.quoteGroups.find((g) => g.key === 'USDT')]
  const ratio = irt && usdt && usdt.median > 0 ? irt.median / usdt.median : NaN

  const items = [
    {
      label: 'نمادهای تحلیل‌شده',
      value: num(res.markets.length, 0),
      sub: `${num(raw?.markets?.length || 0, 0)} نماد دریافت‌شده از منبع`,
    },
    {
      label: 'میانه اسپرد (٪)',
      value: pctFa(s.median, 3),
      sub: `میانگین ${pctFa(s.mean, 3)} · IQR ${pctFa(s.p25, 2)} تا ${pctFa(s.p75, 2)}`,
    },
    {
      label: 'پراکندگی اسپرد',
      value: `p90/p10 = ${num(s.p90 / (s.p10 || NaN), 1)}×`,
      sub: `انحراف معیار ${pctFa(s.sd, 3)} · چولگی ${num(s.skew, 2)}`,
    },
    {
      label: `هزینه کل (${settings.side === 'taker' ? 'تیکر' : 'میکر'} ${settings.costMode === 'roundtrip' ? 'رفت‌وبرگشت' : 'یک‌طرفه'})`,
      value: pctFa(c.median, 3),
      sub: `${bpsFa(c.median * 100)} نقطه پایه · p90 ${pctFa(c.p90, 2)}`,
    },
    {
      label: 'سهم اسپرد از هزینه کل',
      value: pctFa(res.spreadShareOfCost, 0),
      sub: settings.side === 'maker' ? 'میکر اسپرد نمی‌پردازد' : 'باقی آن کارمزد صرافی است',
    },
    {
      label: 'ریالی در برابر تتری (اسپرد)',
      value: Number.isFinite(ratio) ? `${num(ratio, 2)}×` : '—',
      sub: qt ? `p=${fmtP(qt.p)} · اندازه اثر ${effectLabel(qt.delta)}` : '—',
    },
    {
      label: 'ارزان‌ترین نماد',
      value: res.cheapest[0]?.symbol || '—',
      sub: res.cheapest[0] ? `${pctFa(res.cheapest[0].costPct, 3)} · حجم ${compactUsd(res.cheapest[0].volumeUsd)}` : '—',
    },
    {
      label: 'گران‌ترین نماد',
      value: res.priciest[0]?.symbol || '—',
      sub: res.priciest[0] ? `${pctFa(res.priciest[0].costPct, 2)} · حجم ${compactUsd(res.priciest[0].volumeUsd)}` : '—',
    },
    {
      label: 'نمونه‌های زمانی جمع‌شده',
      value: num(snapshots.length, 0),
      sub: settings.autoSample ? `هر ${settings.intervalSec} ثانیه` : 'دریافت دستی',
    },
  ]

  return (
    <div className="grid kpis" style={{ marginBottom: 14 }}>
      {items.map((it) => (
        <div className="card kpi" key={it.label}>
          <div className="k-label">{it.label}</div>
          <div className="k-value">{it.value}</div>
          <div className="k-sub">{it.sub}</div>
        </div>
      ))}
    </div>
  )
}
