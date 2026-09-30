/**
 * تست سراسریِ خط لوله تحلیل با داده شبیه‌سازی‌شده (بدون نیاز به اینترنت)
 * اجرا: npm run selftest
 */
import { makeMockStats } from '../src/lib/mock.js'
import { normalizeNobitex, analyze, stabilityFromHistory, medianSeries } from '../src/lib/analyze.js'
import { describe, mannWhitney, kruskalWallis, spearmanCalc, ols, chooseK, zscoreMatrix } from '../src/lib/stats.js'

const raw = makeMockStats(7)
const { markets, meta } = normalizeNobitex(raw)
console.log(`نمادها: ${markets.length} | هر تتر ${meta.tomanPerUsdt} تومان`)

const res = analyze(markets, { feeLevelId: 'regular', side: 'taker', costMode: 'roundtrip' })
const f = (v, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : '—')

console.log('اسپرد — میانه/میانگین/p90:', f(res.spreadStats.median), f(res.spreadStats.mean), f(res.spreadStats.p90))
console.log('هزینه کل — میانه:', f(res.costStats.median))
console.log('سهم اسپرد از هزینه کل:', f(res.spreadShareOfCost, 1) + '٪')
console.log('IRT در برابر USDT — p =', f(res.quoteTest?.p, 5), '| delta =', f(res.quoteTest?.delta))
console.log('چارک‌های نقدشوندگی — H =', f(res.tierTest?.H, 1), '| p =', f(res.tierTest?.p, 6), '| eps2 =', f(res.tierTest?.epsilon2))
console.log('بازه‌های قیمتی — H =', f(res.priceTest?.H, 1), '| p =', f(res.priceTest?.p, 6))
console.log('رگرسیون R² =', f(res.reg?.r2), '| n =', res.reg?.n, '| beta =', res.reg?.beta.map((b) => f(b, 4)).join(', '))
console.log('خوشه‌ها: k =', res.clusters?.k, '| silhouette =', f(res.clusters?.silhouette))
console.log('خوشه‌ها (پروفایل):')
for (const p of res.clusters?.profiles || []) {
  console.log(
    `  #${p.cluster + 1}: n=${p.n} اسپرد=${f(p.spreadMedian)}٪ حجم=${Math.round(p.volMedian).toLocaleString('en-US')}$ سهم‌ریالی=${f(p.irtShare, 0)}٪`
  )
}
console.log('همبستگی اسپرد ~ log حجم:', f(res.corrRows[0]?.rho), 'p=', f(res.corrRows[0]?.p, 6))
console.log('همبستگی اسپرد ~ log قیمت:', f(res.corrRows[1]?.rho), 'p=', f(res.corrRows[1]?.p, 6))
console.log('پرت‌ها (>1.5 IQR):', res.outliers.outliers.length)
console.log('ارزان‌ترین:', res.cheapest.slice(0, 5).map((m) => `${m.symbol} ${f(m.costPct, 2)}٪`).join(' | '))
console.log('گران‌ترین:', res.priciest.slice(0, 5).map((m) => `${m.symbol} ${f(m.costPct, 2)}٪`).join(' | '))

// سناریوی میکر
const resMaker = analyze(markets, { feeLevelId: 'vip3', side: 'maker', costMode: 'roundtrip' })
console.log('هزینه کل میکر (VIP3):', f(resMaker.costStats.median))

// ثبات زمانی با سه نمونه
const snaps = [1, 2, 3].map((i) => {
  const m = normalizeNobitex(makeMockStats(7 + i)).markets
  const map = {}
  for (const x of m) if (Number.isFinite(x.spreadPct)) map[x.symbol] = { spreadPct: x.spreadPct }
  return { ts: Date.now() + i * 1000, map }
})
const st = stabilityFromHistory(snaps)
const ser = medianSeries(snaps)
console.log('نمادهای دارای سری زمانی:', st.length, '| نقاط سری میانه:', ser.length, '| میانه آخرین نمونه:', f(ser.at(-1).median))

// فیلترها
const onlyIrt = analyze(markets, { quotes: ['IRT'] })
console.log('فقط ریالی:', onlyIrt.markets.length, 'نماد | میانه اسپرد', f(onlyIrt.spreadStats.median))
console.log('\n✅ همه محاسبات بدون خطا انجام شد.')
