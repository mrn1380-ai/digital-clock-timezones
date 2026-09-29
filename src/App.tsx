import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadBooks, LoadResult } from './lib/nobitex';
import {
  buildRows,
  classify,
  findDrivers,
  MarketRow,
  normalizeDepth,
  runGroupTests,
  summarize,
  summarizeClasses,
} from './lib/analytics';
import { money, num, pct, timeAgo } from './lib/format';
import { ClassBar, DepthSpreadScatter, FeeHistogram, SpreadHistogram, SpreadTierBox } from './components/Charts';
import MarketTable from './components/Table';
import { ClassCards, DifferencePanel, DriversPanel, FeeInsight, Insights } from './components/Panels';

type KindFilter = 'ALL' | 'IRT' | 'USDT' | 'OTHER';
const KIND_LABEL: Record<KindFilter, string> = { ALL: 'همه بازارها', IRT: 'ریالی', USDT: 'تتری', OTHER: 'سایر' };

export default function App() {
  const [data, setData] = useState<LoadResult | null>(null);
  const [rows, setRows] = useState<MarketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [auto, setAuto] = useState(true);
  const [kind, setKind] = useState<KindFilter>('ALL');
  const [minDepth, setMinDepth] = useState(0);
  const [onlyActive, setOnlyActive] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await loadBooks();
      setData(res);
      const built = buildRows(res.books);
      const { usdtIrt } = normalizeDepth(built);
      classify(built);
      setRows(built);
      setData((d) => (d ? { ...d, books: res.books } : d));
      void usdtIrt;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 30_000);
    return () => clearInterval(id);
  }, [auto, refresh]);

  // تحلیل روی کل جهان (مرجع دسته‌بندی همیشه کل بازار است، نه فیلترها)
  const analysis = useMemo(() => {
    const live = rows.filter((r) => r.hasBook);
    const usdtIrt = rows.find((r) => r.symbol === 'USDTIRT' && r.hasBook)?.mid ?? NaN;
    return {
      summary: summarize(rows, usdtIrt),
      tests: runGroupTests(rows),
      drivers: findDrivers(rows),
      classes: summarizeClasses(rows),
    };
  }, [rows]);

  const view = useMemo(() => {
    return rows.filter((r) => {
      if (onlyActive && !r.hasBook) return false;
      if (kind !== 'ALL' && r.kind !== kind) return false;
      if (r.depthUsd < minDepth) return false;
      return true;
    });
  }, [rows, kind, minDepth, onlyActive]);

  const maxDepth = useMemo(() => Math.max(...rows.map((r) => r.depthUsd).filter(Number.isFinite), 0), [rows]);
  const dotClass = data?.source === 'live' || data?.source === 'proxy' ? 'live' : data?.source === 'snapshot' ? 'snapshot' : 'sample';

  return (
    <div className="app">
      <header className="hdr">
        <div>
          <h1>نوبیتکس — تحلیل توزیع کارمزد و اسپرد</h1>
          <div className="sub">
            توزیع آماری اسپرد و کارمزد نسبت به قیمت، در کنار تفکیک نمادها بر اساس عوامل مؤثر بر تغییر
          </div>
        </div>
        <div className="hdr-actions">
          <span className="badge">
            <i className={`dot ${dotClass}`} />
            {data?.sourceLabel ?? 'در حال اتصال…'}
          </span>
          {data && (
            <span className="badge">
              به‌روزرسانی: {new Date(data.fetchedAt).toLocaleTimeString('fa-IR')}
            </span>
          )}
          <button className="primary" onClick={refresh} disabled={loading}>
            {loading ? 'در حال دریافت…' : 'به‌روزرسانی'}
          </button>
          <button onClick={() => setAuto((a) => !a)}>
            بروزرسانی خودکار: {auto ? 'روشن' : 'خاموش'}
          </button>
        </div>
      </header>

      {data?.source === 'sample' && (
        <div className="errbox">
          ⚠️ داده زنده دریافت نشد؛ داشبورد فعلاً با <b>داده نمونهٔ ساختگی</b> نمایش داده می‌شود (فقط برای تست رابط کاربری).
          <br />
          خطا: {data.error}
        </div>
      )}
      {data?.source === 'snapshot' && (
        <div className="errbox" style={{ background: '#2a2312', borderColor: '#5a4a20', color: '#ffd98a' }}>
          ⚠️ داده زنده در دسترس نبود؛ از اسنپ‌شات آفلاین داخل پروژه استفاده شد. برای به‌روز کردن: <code>npm run snapshot</code>
        </div>
      )}

      <div className="filters">
        <div className="seg">
          {(Object.keys(KIND_LABEL) as KindFilter[]).map((k) => (
            <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <div className="field">
          حداقل عمق
          <input
            type="range"
            min={0}
            max={100}
            value={minDepth}
            onChange={(e) => setMinDepth((Number(e.target.value) / 100) ** 3 * maxDepth)}
          />
          <span className="mono" style={{ minWidth: 62 }}>{minDepth >= 1000 ? money(minDepth) : `${num(minDepth, 0)}$`}</span>
        </div>
        <label className="field" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
          فقط بازارهای دارای دو سر سفارش
        </label>
        <span className="badge">نمایش {num(view.length, 0)} از {num(rows.length, 0)} نماد</span>
      </div>

      <div className="grid kpis">
        <div className="card">
          <div className="kpi-val">{num(analysis.summary.live, 0)}<small>بازار فعال</small></div>
          <div className="kpi-sub">از مجموع {num(analysis.summary.total, 0)} نماد ({num(analysis.summary.empty, 0)} نماد بدون نقدینگی)</div>
        </div>
        <div className="card">
          <div className="kpi-val">{pct(analysis.summary.medianSpread, 3)}<small>میانه اسپرد</small></div>
          <div className="kpi-sub">صدک ۹۵: {pct(analysis.summary.p95Spread, 3)} · میانگین {pct(analysis.summary.spreadStats.mean, 3)}</div>
        </div>
        <div className="card">
          <div className="kpi-val">{pct(analysis.summary.medianEntryCost, 3)}<small>میانه هزینه ورود</small></div>
          <div className="kpi-sub">نیم اسپرد + کارمزد تیکر (بدون اسلیپیج)</div>
        </div>
        <div className="card">
          <div className="kpi-val">{pct(analysis.summary.medianRoundTrip, 3)}<small>رفت‌وبرگشت</small></div>
          <div className="kpi-sub">کل اسپرد + دو کارمزد تیکر = حداقل رشد لازم برای سربه‌سر</div>
        </div>
        <div className="card">
          <div className="kpi-val">{pct(analysis.summary.medianFee)}<small>کارمزد میانه</small></div>
          <div className="kpi-sub">{analysis.summary.feeDistinct.length} مقدار متمایز: {analysis.summary.feeDistinct.map((f) => pct(f.fee)).join(' / ')}</div>
        </div>
        <div className="card">
          <div className="kpi-val">{num(analysis.summary.usdtIrt, 0)}<small>تتر/ریال</small></div>
          <div className="kpi-sub">نرخ تبدیل برای یکسان‌سازی عمق بازارهای ریالی</div>
        </div>
      </div>

      <Insights
        summary={analysis.summary}
        drivers={analysis.drivers}
        tests={analysis.tests}
        rows={rows}
      />

      <div className="grid two mb">
        <div className="card">
          <h3>توزیع اسپرد در کل بازار</h3>
          <p className="hint">
            هر ستون بازه اسپرد و تعداد نمادهاست؛ رنگ بر اساس چارک‌ها: سبز=۲۵٪ پایین‌تر، آبی=میانه، زرد=۷۵٪ بالاتر، قرمز=دنباله بالا (بازارهای گران).
          </p>
          <SpreadHistogram rows={rows} />
        </div>
        <div className="card">
          <h3>توزیع کارمزد تیکر</h3>
          <p className="hint">کارمزد بین نمادها پیوسته نیست؛ فقط چند مقدار گسسته دارد که مستقیماً از ارز مقصد بازار می‌آید.</p>
          <FeeHistogram rows={rows} />
        </div>
      </div>

      <div className="card mb">
        <h3>عامل اصلی تغییر: عمق در برابر اسپرد</h3>
        <p className="hint">
          هر نقطه یک نماد است. اگر الگوی نزولی واضح باشد یعنی نقدینگی بالا اسپرد را می‌شکند؛
          رنگ‌ها نوع بازار (ریالی/تتری/سایر) را نشان می‌دهند. اندازه نقطه متناسب با عمق است.
        </p>
        <DepthSpreadScatter rows={rows} />
        <div className="legend">
          <span><i style={{ background: '#f59e0b' }} />ریالی</span>
          <span><i style={{ background: '#38bdf8' }} />تتری</span>
          <span><i style={{ background: '#a78bfa' }} />سایر</span>
        </div>
      </div>

      <div className="grid two mb">
        <DifferencePanel tests={analysis.tests} />
        <DriversPanel drivers={analysis.drivers} />
      </div>

      <div className="mb"><ClassCards classes={analysis.classes} /></div>

      <div className="grid two mb">
        <div className="card">
          <h3>میانه هزینه ورود به تفکیک دسته</h3>
          <p className="hint">همان دسته‌بندی بالا، از نظر هزینه واقعی ورود (نیم اسپرد + کارمزد تیکر).</p>
          <ClassBar classes={analysis.classes} />
        </div>
        <div className="card">
          <h3>پراکندگی اسپرد در هر سطح</h3>
          <p className="hint">میانه، صدک ۷۵ و ۹۵ اسپرد برای هر سطح؛ هرچه فاصله میانه تا صدک ۹۵ بیشتر باشد، عدم‌قطعیت اجرا بیشتر است.</p>
          <SpreadTierBox rows={rows} />
        </div>
      </div>

      <div className="grid two mb">
        <FeeInsight summary={analysis.summary} />
        <div className="card">
          <h3>چطور بخوانم؟</h3>
          <p className="note">
            <b>اسپرد</b> = (بهترین فروش − بهترین خرید) ÷ قیمت میانه. هزینه‌ای که با باز کردن و بستن موقعیت در همان لحظه می‌پردازی.<br />
            <b>کارمزد تیکر</b> = هزینه سفارش‌بردار (اسلش) و <b>میکر</b> = هزینه سفارش‌گذار، طبق جدول رسمی سطح پایه.<br />
            <b>هزینه ورود</b> = نیم اسپرد + کارمزد تیکر؛ حداقل هزینه یک خرید بازار.<br />
            <b>رفت‌وبرگشت</b> = کل اسپرد + دو کارمزد تیکر؛ یعنی قیمت باید دست‌کم این مقدار حرکت کند تا معامله سربه‌سر شود.<br />
            <b>عمق</b> = ارزش سفارش‌های ۱۰ سطح اول در هر دو سمت، تبدیل‌شده به دلار.<br />
            همه اعداد لحظه‌ای‌اند و فقط برای همان لحظه معتبرند.
          </p>
        </div>
      </div>

      <MarketTable rows={view} />

      <p className="foot">
        منبع داده: <code>GET https://apiv2.nobitex.ir/v3/orderbook/all</code> — دفتر سفارش زنده همه بازارها، بدون نیاز به احراز هویت.
        <br />
        جدول کارمزد: <a href="https://help.nobitex.ir/knowledgebase/trading-fees/" target="_blank" rel="noreferrer">راهنمای رسمی کارمزد نوبیتکس</a> (سطح پایه: ریالی ۰.۲٪/۰.۲۵٪، تتری ۰.۱٪/۰.۱۳٪).
        {data && <> · آخرین به‌روزرسانی {timeAgo((Date.now() - data.fetchedAt) / 1000)}</>}
        <br />
        هشدار: این داشبورد ابزار تحلیل است، نه سیگنال معاملاتی. اسلیپیج، عمق لحظه اجرا و کارمزد سطح‌های بالاتر در محاسبات لحاظ نشده‌اند.
      </p>
    </div>
  );
}
