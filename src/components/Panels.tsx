import { ClassSummary, Driver, GroupTest, MarketRow, Summary } from '../lib/analytics';
import { num, pct } from '../lib/format';

/** خلاصهٔ خودکار یافته‌ها — کوتاه و کاربردی */
export function Insights({ summary, drivers, tests, rows }: {
  summary: Summary;
  drivers: Driver[];
  tests: GroupTest[];
  rows: MarketRow[];
}) {
  const live = rows.filter((r) => r.hasBook).sort((a, b) => a.entryCostPct - b.entryCostPct);
  const best = live.slice(0, 3);
  const worst = live.slice(-3).reverse();
  const top = drivers[0];
  const sig = tests.filter((t) => t.meaningful);
  const maxMin = summary.spreadStats.max / (summary.spreadStats.min || 1e-9);

  const items: [string, string][] = [
    [
      'کارمزد',
      summary.feeDistinct.length === 1
        ? `کارمزد تیکر در همه بازارها یکسان است (${pct(summary.medianFee)})؛ پس کارمزد عامل تفاوت بین نمادها نیست.`
        : `کارمزد فقط ${summary.feeDistinct.length} مقدار متمایز دارد (${summary.feeDistinct.map((f) => pct(f.fee)).join('، ')}) و مستقیماً تابع ارز مقصد بازار است — نه نماد.`,
    ],
    [
      'اسپرد',
      `میانه ${pct(summary.medianSpread, 3)} ولی دنباله راست است: صدک ۹۵ برابر ${pct(summary.p95Spread, 3)} و بیشترین اسپرد ${num(maxMin, 0)}× کمترین. یعنی میانگین گمراه‌کننده است و باید روی میانه/چارک تصمیم گرفت.`,
    ],
    [
      'تفاوت معنی‌دار',
      sig.length
        ? sig.map((t) => `${t.label} (${num(t.ratio, 2)}×)`).join(' و ') + ' — این تفکیک‌ها آماری معتبرند.'
        : 'بین گروه‌ها تفاوت معنی‌داری یافت نشد؛ کل بازار از نظر اسپرد هم‌گن است.',
    ],
    [
      'عامل اصلی تغییر',
      top && Number.isFinite(top.rho)
        ? `${top.factor} با ρ=${num(top.rho, 2)} (${top.strength}) — ${top.direction}.`
        : 'داده کافی برای تعیین عامل نیست.',
    ],
    [
      'بهترین اجرا',
      best.length ? best.map((r) => `${r.symbol} (${pct(r.entryCostPct, 3)})`).join('، ') : '—',
    ],
    [
      'بدترین اجرا',
      worst.length ? worst.map((r) => `${r.symbol} (${pct(r.entryCostPct, 3)})`).join('، ') : '—',
    ],
  ];

  return (
    <div className="card mb">
      <h3>یافته‌های کلیدی</h3>
      <p className="hint">خلاصه خودکار محاسبات همین صفحه.</p>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        {items.map(([k, v]) => (
          <div key={k} style={{ borderRight: '3px solid var(--accent)', paddingRight: 10 }}>
            <div style={{ fontWeight: 600, fontSize: 12.5, marginBottom: 3 }}>{k}</div>
            <div className="note" style={{ lineHeight: 1.85 }}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** پنل «آیا تفاوت معنی‌دار است؟» */
export function DifferencePanel({ tests }: { tests: GroupTest[] }) {
  return (
    <div className="card" style={{ height: '100%' }}>
      <h3>آیا تفاوت بین گروه‌ها معنی‌دار است؟</h3>
      <p className="hint">
        مقایسه اسپرد روی مقیاس لگاریتمی با آزمون t ولچ (Welch) و اندازه اثر Cohen. معنی‌دار = p&lt;0.05 و |d|≥0.5.
      </p>
      <table>
        <thead>
          <tr>
            <th>مقایسه</th>
            <th className="num">تعداد</th>
            <th className="num">نسبت اسپرد</th>
            <th className="num">p-value</th>
            <th className="num">اندازه اثر</th>
            <th>نتیجه</th>
          </tr>
        </thead>
        <tbody>
          {tests.map((t) => (
            <tr key={t.id}>
              <td>{t.label}</td>
              <td className="num mono">{t.nA} / {t.nB}</td>
              <td className="num mono">{num(t.ratio, 2)}×</td>
              <td className="num mono">{t.p < 0.001 ? '<0.001' : num(t.p, 3)}</td>
              <td className="num mono">
                {num(t.d, 2)} <span className="muted">({t.effect})</span>
              </td>
              <td>
                <span className="pill" style={{ background: t.meaningful ? '#22c55e' : '#64748b' }}>
                  {t.meaningful ? 'معنی‌دار' : 'غیرمعنی‌دار'}
                </span>
              </td>
            </tr>
          ))}
          {!tests.length && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center' }}>داده کافی برای آزمون آماری وجود ندارد.</td></tr>}
        </tbody>
      </table>
      {!!tests.length && (
        <p className="note" style={{ marginTop: 10 }}>
          {tests.filter((t) => t.meaningful).length > 0 ? (
            <>
              <b>نتیجه:</b> {tests.filter((t) => t.meaningful).map((t) => t.label).join('، ')} تفاوت معنی‌دار دارند؛
              بنابراین تفکیک نمادها بر اساس همین عوامل معتبر است.
            </>
          ) : (
            <><b>نتیجه:</b> هیچ‌کدام از تفاوت‌ها از نظر آماری معنی‌دار نیست؛ پس می‌توان کل بازار را یک گروه فرض کرد.</>
          )}
        </p>
      )}
    </div>
  );
}

/** پنل «عوامل تغییر» */
export function DriversPanel({ drivers }: { drivers: Driver[] }) {
  return (
    <div className="card" style={{ height: '100%' }}>
      <h3>عوامل تغییر اسپرد (همبستگی رتبه‌ای اسپیرمَن)</h3>
      <p className="hint">هرچه |ρ| بزرگ‌تر باشد، آن عامل سهم بیشتری در تفاوت اسپرد نمادها دارد.</p>
      <table>
        <thead>
          <tr>
            <th>عامل</th>
            <th className="num">ρ</th>
            <th className="num">p</th>
            <th>شدت</th>
            <th>جهت</th>
          </tr>
        </thead>
        <tbody>
          {drivers.map((d) => (
            <tr key={d.factor}>
              <td>{d.factor}</td>
              <td className="num mono" style={{ color: Math.abs(d.rho) > 0.3 ? '#38bdf8' : '#8b9ab4' }}>
                {num(d.rho, 3)}
              </td>
              <td className="num mono">{d.p < 0.001 ? '<0.001' : num(d.p, 3)}</td>
              <td>
                <span className="chip" style={{ color: d.strength === 'بی‌ارتباط' ? '#64748b' : '#38bdf8' }}>
                  {d.strength}
                </span>
              </td>
              <td className="muted" style={{ whiteSpace: 'normal', minWidth: 190 }}>{d.direction}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** کارت دسته‌بندی */
export function ClassCards({ classes }: { classes: ClassSummary[] }) {
  const max = Math.max(...classes.map((c) => c.count), 1);
  return (
    <div className="card">
      <h3>دسته‌بندی نمادها بر اساس هزینه اجرا</h3>
      <p className="hint">قواعد: سطح اسپرد (کوارتیل) × سطح عمق (سه‌ک‌وانتیل) × تازگی داده.</p>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        {classes.map((c) => (
          <div key={c.quality} className="class-card" style={{ borderRightColor: c.color }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span className="ttl">{c.title}</span>
              <span className="mono" style={{ color: c.color, fontWeight: 700 }}>
                {num(c.count, 0)} <span className="muted" style={{ fontWeight: 400 }}>({num(c.share, 0)}٪)</span>
              </span>
            </div>
            <div className="bar-line"><i style={{ width: `${(c.count / max) * 100}%`, background: c.color }} /></div>
            <div className="dsc">{c.desc}</div>
            <div className="mono" style={{ fontSize: 11.5, color: '#8b9ab4' }}>
              میانه اسپرد {pct(c.medianSpread, 3)} · هزینه ورود {pct(c.medianEntryCost, 3)} · عمق {c.medianDepth >= 1e6 ? `$${num(c.medianDepth / 1e6, 2)}M` : `$${num(c.medianDepth / 1e3, 0)}K`}
            </div>
            <div className="exs">{c.examples.join(' · ')}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** نتیجه‌گیری کارمزد */
export function FeeInsight({ summary }: { summary: Summary }) {
  return (
    <div className="card" style={{ height: '100%' }}>
      <h3>توزیع کارمزد</h3>
      <p className="hint">کارمزد تیکر (سفارش‌بردار) در سطح پایه، به تفکیک ارز مقصد بازار.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {summary.feeDistinct.map((f) => (
          <div key={f.fee} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '8px 12px', background: 'var(--panel-2)' }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{pct(f.fee)}</div>
            <div className="muted" style={{ fontSize: 11.5 }}>{num(f.count, 0)} بازار</div>
          </div>
        ))}
      </div>
      <p className="note">{summary.feeMeaningful}</p>
    </div>
  );
}
