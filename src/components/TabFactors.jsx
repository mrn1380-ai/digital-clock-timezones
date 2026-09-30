import React from 'react'
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, Legend, BarChart, Bar, Cell,
} from 'recharts'
import BoxPlot from './charts/BoxPlot.jsx'
import DataTable from './DataTable.jsx'
import { num, pctFa, compactUsd, tickNum } from '../lib/format.js'
import { fmtP, stars, effectLabel } from '../lib/stats.js'

function TestBadge({ test, kind }) {
  if (!test || !Number.isFinite(test.p)) return <span className="badge">آزمون ممکن نیست</span>
  const sig = test.p < 0.05
  return (
    <span className={`badge ${sig ? 'ok' : 'warn'}`}>
      {kind === 'kw' ? `کروسکال-والیس H=${num(test.H, 1)}` : `من‌ویتنی U=${num(test.U, 0)}`} · p=
      {fmtP(test.p)} {stars(test.p)}
    </span>
  )
}

function GroupCard({ title, sub, groups, test, kind = 'kw', note, height = 300, logScale = true }) {
  const sorted = [...groups].sort((a, b) => a.median - b.median)
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>{title}</h2>
          <div className="sub">{sub}</div>
        </div>
        <TestBadge test={test} kind={kind} />
      </div>
      <BoxPlot groups={groups} height={height} logScale={logScale} format={(v) => tickNum(v)} unit="اسپرد ٪" />
      <div className="table-wrap" style={{ maxHeight: 220, marginTop: 8 }}>
        <table>
          <thead>
            <tr>
              <th>گروه</th>
              <th className="num">تعداد</th>
              <th className="num">میانه اسپرد ٪</th>
              <th className="num">p25</th>
              <th className="num">p75</th>
              <th className="num">میانه هزینه کل ٪</th>
              <th className="num">میانه حجم ۲۴س</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((g) => (
              <tr key={g.key}>
                <td>{g.key}</td>
                <td className="num">{num(g.n, 0)}</td>
                <td className="num">{pctFa(g.median, 3)}</td>
                <td className="num">{pctFa(g.p25, 3)}</td>
                <td className="num">{pctFa(g.p75, 3)}</td>
                <td className="num">{pctFa(g.costMedian, 3)}</td>
                <td className="num">{compactUsd(g.volMedian)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {note && <div className="note">{note}</div>}
    </div>
  )
}

export default function TabFactors({ res }) {
  const [irt, usdt] = [res.quoteGroups.find((g) => g.key === 'IRT'), res.quoteGroups.find((g) => g.key === 'USDT')]
  const qt = res.quoteTest
  const qct = res.quoteCostTest
  const ratio = irt && usdt && usdt.median > 0 ? irt.median / usdt.median : NaN

  const scatterData = res.markets
    .filter((m) => Number.isFinite(m.volumeUsd) && m.volumeUsd > 0 && m.spreadPct > 0)
    .map((m) => ({
      symbol: m.symbol,
      logVol: Math.log10(m.volumeUsd),
      vol: m.volumeUsd,
      spread: m.spreadPct,
      cost: m.costPct,
      quote: m.quote,
    }))

  const irtPts = scatterData.filter((d) => d.quote === 'IRT')
  const usdtPts = scatterData.filter((d) => d.quote === 'USDT')

  const reg = res.reg
  // تفسیر: هر ۱۰ برابر شدن حجم => تغییر اسپرد
  const volCoef = reg ? reg.beta[1] : NaN
  const pctPerDecade = Number.isFinite(volCoef) ? (Math.exp(Math.log(10) * volCoef) - 1) * 100 : NaN

  return (
    <div className="grid" style={{ gap: 14 }}>
      {/* ۱. تفاوت دو بازار */}
      <div className="grid two">
        <div className="card">
          <div className="card-head">
            <div>
              <h2>عامل ۱ — نوع بازار (ریالی در برابر تتری)</h2>
              <div className="sub">آیا تفاوت اسپردِ دو بازار معنادار است؟</div>
            </div>
            <TestBadge test={qt} kind="mw" />
          </div>
          {qt && (
            <div className="kv">
              <div className="k">میانه اسپرد ریالی</div>
              <div className="v">{irt ? pctFa(irt.median, 3) : '—'}</div>
              <div className="k">میانه اسپرد تتری</div>
              <div className="v">{usdt ? pctFa(usdt.median, 3) : '—'}</div>
              <div className="k">نسبت</div>
              <div className="v">{Number.isFinite(ratio) ? `${num(ratio, 2)} برابر` : '—'}</div>
              <div className="k">اندازه اثر (Cliff's δ)</div>
              <div className="v">
                {num(qt.delta, 3)} — {effectLabel(qt.delta)}
              </div>
              <div className="k">آماره z</div>
              <div className="v">{num(qt.z, 2)}</div>
              <div className="k">تعداد نمونه</div>
              <div className="v">
                {qt.n1} در برابر {qt.n2}
              </div>
            </div>
          )}
          <div className="note">
            {qt && qt.p < 0.05
              ? `تفاوت از نظر آماری معنادار است (p=${fmtP(qt.p)}). `
              : 'تفاوت از نظر آماری معنادار نیست. '}
            {Number.isFinite(ratio) && ratio > 1.1
              ? `بازار ریالی حدود ${num((ratio - 1) * 100, 0)}٪ اسپرد مؤثر بیشتری دارد — حتی با کارمزدِ اسمیِ بیشتر در بازار ریالی.`
              : Number.isFinite(ratio) && ratio < 0.9
              ? 'بازار تتری اسپرد مؤثر بیشتری دارد.'
              : 'دو بازار از نظر اسپردِ خالص تقریباً هم‌سطح‌اند؛ تفاوت اصلی در کارمزد است.'}
          </div>
          {qct && (
            <div className="note good">
              هزینه کل (اسپرد + کارمزد): میانه ریالی {pctFa(irt?.costMedian, 3)} در برابر تتری{' '}
              {pctFa(usdt?.costMedian, 3)} — p={fmtP(qct.p)} {stars(qct.p)}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h2>اسپرد در برابر نقدشوندگی</h2>
              <div className="sub">محور افقی: لگاریتم حجم ۲۴ ساعته (دلار) · محور عمودی: اسپرد ٪ (لگاریتمی)</div>
            </div>
          </div>
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 10, bottom: 24, left: 4 }}>
                <CartesianGrid stroke="rgba(148,163,184,.12)" />
                <XAxis
                  type="number"
                  dataKey="logVol"
                  name="log10 حجم"
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                  domain={['dataMin', 'dataMax']}
                  label={{ value: 'log10 حجم ۲۴س ($)', fill: '#94a3b8', fontSize: 10, position: 'insideBottom', dy: 12 }}
                />
                <YAxis
                  type="number"
                  dataKey="spread"
                  name="اسپرد ٪"
                  scale="log"
                  domain={['auto', 'auto']}
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                  width={44}
                  tickFormatter={(v) => tickNum(v)}
                />
                <ZAxis range={[26, 26]} />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  contentStyle={{ background: '#0f172a', border: '1px solid #23304a', borderRadius: 10, fontSize: 12 }}
                  formatter={(v, name) => (name === 'log10 حجم' ? [num(10 ** v, 0) + ' $', 'حجم ۲۴س'] : [pctFa(v, 3), 'اسپرد'])}
                  labelFormatter={() => ''}
                  content={({ payload }) => {
                    const p = payload?.[0]?.payload
                    if (!p) return null
                    return (
                      <div className="tooltip-box">
                        <div className="t-title">{p.symbol}</div>
                        <div>حجم ۲۴س: {compactUsd(p.vol)}</div>
                        <div>اسپرد: {pctFa(p.spread, 3)}</div>
                        <div>هزینه کل: {pctFa(p.cost, 3)}</div>
                      </div>
                    )
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Scatter name="ریالی (IRT)" data={irtPts} fill="#f59e0b" fillOpacity={0.72} />
                <Scatter name="تتری (USDT)" data={usdtPts} fill="#38bdf8" fillOpacity={0.72} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className="note">
            شیب نزولی یعنی هرچه حجم معاملات بیشتر، اسپرد کمتر: این قوی‌ترین عامل توضیح‌دهنده است.
          </div>
        </div>
      </div>

      {/* ۲. سطوح نقدشوندگی */}
      <GroupCard
        title="عامل ۲ — سطح نقدشوندگی (چارک‌های حجم ۲۴ ساعته)"
        sub="Q1 = کم‌نقدشونده‌ترین، Q4 = نقدشونده‌ترین"
        groups={res.tierGroups}
        test={res.tierTest}
        note={
          res.tierTest && res.tierTest.p < 0.05
            ? `اختلاف بین چارک‌ها معنادار است (H=${num(res.tierTest.H, 1)}, p=${fmtP(res.tierTest.p)}) و ε²=${num(
                res.tierTest.epsilon2,
                3
              )} یعنی حدود ${num(res.tierTest.epsilon2 * 100, 0)}٪ از واریانس رتبه‌ای اسپرد با نقدشوندگی توضیح داده می‌شود.`
            : 'اختلاف معنادار نیست.'
        }
      />

      <div className="card">
        <div className="card-head">
          <div>
            <h2>مقایسه دوبه‌دوی سطوح نقدشوندگی (با تصحيح هولم)</h2>
            <div className="sub">آزمون من‌ویتنی روی اسپرد</div>
          </div>
        </div>
        <div className="table-wrap" style={{ maxHeight: 260 }}>
          <table>
            <thead>
              <tr>
                <th>مقایسه</th>
                <th className="num">میانه A</th>
                <th className="num">میانه B</th>
                <th className="num">U</th>
                <th className="num">z</th>
                <th className="num">Cliff's δ</th>
                <th className="num">p خام</th>
                <th className="num">p تصحيح‌شده</th>
                <th>معناداری</th>
              </tr>
            </thead>
            <tbody>
              {res.tierPairs.map((p) => {
                const ga = res.tierGroups.find((g) => g.key === p.a)
                const gb = res.tierGroups.find((g) => g.key === p.b)
                return (
                  <tr key={p.a + p.b}>
                    <td>
                      {p.a} ↔ {p.b}
                    </td>
                    <td className="num">{pctFa(ga?.median, 3)}</td>
                    <td className="num">{pctFa(gb?.median, 3)}</td>
                    <td className="num">{num(p.U, 0)}</td>
                    <td className="num">{num(p.z, 2)}</td>
                    <td className="num">
                      {num(p.delta, 3)} ({effectLabel(p.delta)})
                    </td>
                    <td className="num">{fmtP(p.p)}</td>
                    <td className="num">{fmtP(p.pAdj)}</td>
                    <td className={p.pAdj < 0.05 ? 'sig yes' : 'sig no'}>
                      {p.pAdj < 0.05 ? `معنادار ${stars(p.pAdj)}` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ۳. اندازه قیمت / تیک */}
      <GroupCard
        title="عامل ۳ — قدرِ قیمت (نماینده‌ی اندازه‌ی تیک قیمتی)"
        sub="نمادهای ارزان‌قیمت نمی‌توانند اسپردی کوچک‌تر از یک واحد تغییر قیمت داشته باشند"
        groups={res.priceGroups}
        test={res.priceTest}
        note="اگر در بازه‌های قیمتی پایین اسپرد جهش می‌کند، عامل مکانیکی «اندازه تیک» است نه نقدشوندگی؛ برای اندازه‌گیری دقیق، تب «عمق بازار» را ببینید."
      />

      {/* ۴. نوسان */}
      <GroupCard
        title="عامل ۴ — نوسان روزانه (|تغییر قیمت ۲۴ ساعته|)"
        sub="نوسان بالا معمولاً با اسپرد بالاتر همراه است (ریسکِ موجودیِ بازارگردان)"
        groups={res.volaGroups}
        test={res.volaTest}
      />

      {/* ۵. همبستگی‌ها */}
      <div className="card">
        <div className="card-head">
          <div>
            <h2>همبستگی رتبه‌ای (اسپیرمن)</h2>
            <div className="sub">روی تمام نمادهای فیلترشده</div>
          </div>
        </div>
        <div className="table-wrap" style={{ maxHeight: 260 }}>
          <table>
            <thead>
              <tr>
                <th>رابطه</th>
                <th>تبدیل</th>
                <th className="num">ρ</th>
                <th className="num">n</th>
                <th className="num">p</th>
                <th>تفسیر</th>
              </tr>
            </thead>
            <tbody>
              {res.corrRows.map((c) => (
                <tr key={c.label}>
                  <td>{c.label}</td>
                  <td className="small">{c.transform}</td>
                  <td className="num">{num(c.rho, 3)}</td>
                  <td className="num">{c.n}</td>
                  <td className="num">{fmtP(c.p)}</td>
                  <td className={c.p < 0.05 ? 'sig yes' : 'sig no'}>
                    {c.p >= 0.05
                      ? 'فاقد رابطه معنادار'
                      : c.rho < -0.5
                      ? 'معکوسِ قوی'
                      : c.rho < -0.3
                      ? 'معکوسِ متوسط'
                      : c.rho < -0.1
                      ? 'معکوسِ ضعیف'
                      : c.rho > 0.5
                      ? 'مستقیمِ قوی'
                      : c.rho > 0.3
                      ? 'مستقیمِ متوسط'
                      : 'مستقیمِ ضعیف'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ۶. رگرسیون */}
      <div className="card">
        <div className="card-head">
          <div>
            <h2>رگرسیون چندمتغیره — سهم هر عامل در توضیح اسپرد</h2>
            <div className="sub">متغیر وابسته: ln(اسپرد٪) · برآورد OLS</div>
          </div>
          {reg && <span className="badge info">R² = {num(reg.r2, 3)}</span>}
        </div>
        {reg ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>متغیر</th>
                    <th className="num">ضریب</th>
                    <th className="num">خطای استاندارد</th>
                    <th className="num">ضریب استاندارد (β)</th>
                    <th className="num">t</th>
                    <th className="num">p</th>
                    <th>معناداری</th>
                  </tr>
                </thead>
                <tbody>
                  {reg.names.map((n, i) => (
                    <tr key={n}>
                      <td>{n}</td>
                      <td className="num">{num(reg.beta[i], 4)}</td>
                      <td className="num">{num(reg.se[i], 4)}</td>
                      <td className="num">{i === 0 ? '—' : num(reg.stdBeta[i], 3)}</td>
                      <td className="num">{num(reg.t[i], 2)}</td>
                      <td className="num">{fmtP(reg.p[i])}</td>
                      <td className={reg.p[i] < 0.05 ? 'sig yes' : 'sig no'}>{reg.p[i] < 0.05 ? stars(reg.p[i]) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="note good">
              تفسیر عملی: به‌ازای هر <b>۱۰ برابر شدن حجم ۲۴ ساعته</b>، اسپرد به‌طور میانگین{' '}
              <b>{num(pctPerDecade, 1)}٪</b> تغییر می‌کند (با ثابت بودن سایر عوامل). ضریبِ متغیرِ «IRT بودن» اثرِ خالصِ
              بازار ریالی را پس از کنترل حجم و قیمت نشان می‌دهد:{' '}
              {reg.beta[4] > 0 ? 'مثبت (اسپرد مؤثر بیشتر)' : 'منفی یا ناچیز'}. مدل در مجموع{' '}
              <b>{num(reg.r2 * 100, 1)}٪</b> از تغییرات لگاریتم اسپرد را توضیح می‌دهد (R² تعدیل‌شده{' '}
              {num(reg.adjR2, 3)}، n={reg.n}).
            </div>
            <div className="note warn">
              باقی‌مانده‌ی توضیح‌نداده‌شده ناشی از عواملی است که در این داده نیست: اندازه‌ی واقعی تیک، تعداد
              بازارگردان، عمقِ لحظه‌ای دفتر سفارش و زمانِ روز. تب «عمق بازار» اندازه‌ی تیک را مستقیماً اندازه می‌گیرد.
            </div>
          </>
        ) : (
          <div className="note">داده‌ی کافی برای برآورد مدل وجود ندارد.</div>
        )}
      </div>
    </div>
  )
}
