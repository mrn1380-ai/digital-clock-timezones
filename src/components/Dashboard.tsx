"use client";

import { useMemo, useState } from "react";
import { type Report, type SymbolCost, FEE_TIERS } from "@/lib/types";
import { bps, faNum, money, pct, price, timeAgo, tierColor, Card, Kpi, SectionTitle, TierPill } from "./ui";
import { FactorBuckets, FactorImpact, HeatGrid, SpreadHistogram, SpreadVsPrice, SpreadVsVolume, TierVolumeDonut } from "./charts";
import { CorrTable, DataTierTable, DecisionTree, FactorTable, RuleTierTable, SymbolTable } from "./tables";

interface Props {
  initial: { report: Report; costs: SymbolCost[] } | null;
  initialError?: string;
}

const FACTOR_LABELS: Record<string, string> = {
  volume: "نقدینگی (حجم ۲۴ساعته)",
  price: "سطح قیمت",
  tick: "کف ساختاری تیک",
  volatility: "نوسان ۲۴ساعته",
  age: "قدمت قرارداد",
  quote: "دارایی تسویه",
};

function useInsights(report: Report | null, costs: SymbolCost[]) {
  return useMemo(() => {
    if (!report) return [];
    const out: { icon: string; color: string; parts: (string | { n: string })[] }[] = [];
    const s = report.summary;
    const fee = FEE_TIERS.find((f) => f.id === report.feeTierId) ?? FEE_TIERS[0];
    const feePart = (2 * fee.takerBps / s.medianRoundTripBps) * 100;
    const spreadPart = 100 - feePart;

    out.push({
      icon: "%",
      color: "var(--accent)",
      parts: [
        "در میانه بازار، هزینه رفت‌وبرگشت یک معامله Market ",
        { n: `${bps(s.medianRoundTripBps)} bps` },
        " است که ",
        { n: `${feePart.toFixed(0)}٪` },
        " آن کارمزد ثابت و ",
        { n: `${spreadPart.toFixed(0)}٪` },
        " آن اسپرد متغیر بین نمادهاست. پس کارمزد بین نمادها تفاوتی ایجاد نمی‌کند؛ کل تفاوت از نقدینگی و ساختار قیمت می‌آید.",
      ],
    });

    out.push({
      icon: "σ",
      color: "var(--accent2)",
      parts: [
        "پراکندگی اسپرد به‌شدت چوله است: میانه ",
        { n: `${bps(s.medianSpreadBps)} bps` },
        "، دامنه ۵۰٪ میانی ",
        { n: `${bps(s.p25SpreadBps)}–${bps(s.p75SpreadBps)}` },
        "، صدک ۹۹ ",
        { n: `${bps(s.p99SpreadBps)}` },
        " و بیشینه ",
        { n: `${bps(s.maxSpreadBps)}` },
        ` روی ${faNum(report.count)} نماد. یعنی میانگین گمراه‌کننده است و باید میانه/صدک‌ها مبنا قرار گیرند.`,
      ],
    });

    const topFactor = report.factorImportance[0];
    if (topFactor) {
      out.push({
        icon: "★",
        color: "var(--warn)",
        parts: [
          "قوی‌ترین عامل تفکیک: ",
          { n: topFactor.driver },
          " — به‌تنهایی ",
          { n: `${bps(topFactor.impactBps)} bps` },
          " دامنه میانه اسپرد بین سطل‌هایش می‌سازد.",
          ...(report.factorImportance[1]
            ? [` دوم: `, { n: report.factorImportance[1].driver }, ` (${bps(report.factorImportance[1].impactBps)} bps).`]
            : []),
        ],
      });
    }

    if (Number.isFinite(s.liquidityElasticity)) {
      out.push({
        icon: "V",
        color: "var(--good)",
        parts: [
          "قانون توان نقدینگی: اسپرد ≈ حجم^",
          { n: s.liquidityElasticity.toFixed(2) },
          ` (R²=${s.liquidityFitR2.toFixed(2)}). یعنی ده‌برابر شدن حجم، اسپرد را حدود ${Math.pow(10, s.liquidityElasticity).toFixed(2)}× کم می‌کند.`,
        ],
      });
    }

    out.push({
      icon: "t",
      color: "#f59e0b",
      parts: [
        "کف ساختاری: کمترین اسپرد ممکن هر نماد = اندازه‌گام قیمتش. میانه کف تیک بازار ",
        { n: `${bps(s.medianTickFloorBps, 3)} bps` },
        " و ",
        { n: `${s.shareAtTickFloorPct.toFixed(1)}٪` },
        " نمادها عملاً روی همین کف چسبیده‌اند؛ برای این گروه، قیمت پایین (=tick بزرگ‌تر) خودش عامل اصلی گرانی است.",
      ],
    });

    out.push({
      icon: "◉",
      color: "var(--bad)",
      parts: [
        "۱۰۰ نماد پرهزینه فقط ",
        { n: `${s.volumeShareInTopCostPct.toFixed(2)}٪` },
        " از حجم ۲۴ساعته بازار را می‌سازند، در حالی که میانه اسپردشان ",
        { n: `${s.top100CostRatio.toFixed(0)}×` },
        " میانه ۱۰۰ نماد ارزان است. نتیجه عملی: این نمادها برای اجرای سفارش بزرگ نامناسب‌اند، نه لزوماً برای معامله.",
      ],
    });

    const dominated = costs.filter((c) => c.spreadBps > 2 * fee.takerBps).length;
    out.push({
      icon: "!",
      color: dominated / Math.max(costs.length, 1) > 0.5 ? "var(--bad)" : "var(--good)",
      parts: [
        "در ",
        { n: `${((dominated / Math.max(costs.length, 1)) * 100).toFixed(0)}٪` },
        " نمادها، خود اسپرد بیش از کل کارمزد رفت‌وبرگشت است؛ یعنی اجرای سفارش، مسئله اصلی است نه کارمزد.",
      ],
    });

    if (report.tree.featureLabel) {
      out.push({
        icon: "⑂",
        color: "var(--accent)",
        parts: [
          "اولین و مؤثرترین شکست توضیح‌دهنده: ",
          { n: report.tree.featureLabel },
          " در آستانه ",
          { n: String(report.tree.thresholdLabel) },
          " — بالاتر از آن، اسپرد به‌شدت جهش می‌کند.",
        ],
      });
    }

    return out;
  }, [report, costs]);
}

export default function Dashboard({ initial, initialError }: Props) {
  const [report, setReport] = useState<Report | null>(initial?.report ?? null);
  const [costs, setCosts] = useState<SymbolCost[]>(initial?.costs ?? []);
  const [feeId, setFeeId] = useState<string>(initial?.report?.feeTierId ?? FEE_TIERS[0].id);
  const [deep, setDeep] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [factor, setFactor] = useState("volume");

  const fee = FEE_TIERS.find((f) => f.id === feeId) ?? FEE_TIERS[0];
  // قلاب‌ها همیشه و به همان ترتیب صدا زده می‌شوند (قوانین React)
  const insights = useInsights(report, costs);

  async function load(nextFee: string, nextDeep: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/market?fee=${nextFee}${nextDeep ? "&deep=1" : ""}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "خطای نامشخص");
      setReport(json.report);
      setCosts(json.costs);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!report) {
    return (
      <div className="wrap">
        <div className="loading">
          <div className="spinner" />
          {error ? `خطا: ${error}` : "در حال دریافت داده…"}
        </div>
      </div>
    );
  }

  const s = report.summary;
  const modeBadge =
    report.mode === "live" ? (
      <span className="badge live"><i className="dot" /> داده زنده بایننس</span>
    ) : report.mode === "snapshot" ? (
      <span className="badge snapshot"><i className="dot" /> آخرین اسنپ‌شات ذخیره‌شده</span>
    ) : (
      <span className="badge synthetic"><i className="dot" /> داده نمایشی</span>
    );

  return (
    <div className="wrap">
      <div className="header">
        <div>
          <h1 className="title">توزیع هزینه معامله در فیوچرز بایننس (USDⓈ-M)</h1>
          <p className="subtitle">
            اسپرد و کارمزد بر حسب درصدی از قیمت (bps) روی همه نمادهای PERPETUAL — به‌همراه دسته‌بندی و عوامل مؤثر
          </p>
          <div style={{ display: "flex", gap: 7, marginTop: 8, flexWrap: "wrap" }}>
            {modeBadge}
            <span className="badge">{faNum(report.count)} نماد</span>
            <span className="badge">حجم ۲۴س: {money(report.totalQuoteVolume24h)}$</span>
            <span className="badge">به‌روزرسانی: {timeAgo(report.generatedAt)}</span>
            {report.source.host && <span className="badge" style={{ direction: "ltr" }}>{report.source.host}</span>}
          </div>
        </div>

        <div className="controls">
          <select value={feeId} onChange={(e) => { setFeeId(e.target.value); load(e.target.value, deep); }} title="رده کارمزد">
            {FEE_TIERS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label} — Taker {f.takerBps} bps
              </option>
            ))}
          </select>
          <button className={deep ? "on" : ""} onClick={() => { const d = !deep; setDeep(d); load(feeId, d); }} title="افزودن کندل روزانه و تخمین اسپرد ۲۴ساعته">
            حالت عمیق
          </button>
          <button className="primary" disabled={busy} onClick={() => load(feeId, deep)}>
            {busy ? "در حال دریافت…" : "↻ به‌روزرسانی"}
          </button>
        </div>
      </div>

      {report.mode === "synthetic" && (
        <div className="banner synthetic">
          <span>⚠️</span>
          <div>
            <b>داده نمایشی است، نه داده واقعی بازار.</b> دسترسی زنده به <code style={{ direction: "ltr" }}>fapi.binance.com</code> از این محیط ممکن نبود
            (محدودیت جغرافیایی IP یا شبکه). برای داده واقعی، روی سیستمی که به بایننس دسترسی دارد اجرا کنید:{" "}
            <code>npm run collect</code> و بعد <code>npm run dev</code>. اعداد این صفحه صرفاً ساختار تحلیل را نشان می‌دهند و مبنای تصمیم معاملاتی نیستند.
          </div>
        </div>
      )}
      {report.mode === "snapshot" && (
        <div className="banner snapshot">
          <span>⏱</span>
          <div>
            <b>اتصال زنده برقرار نشد</b> — داشبورد آخرین اسنپ‌شات ذخیره‌شده (<code>data/snapshot.json</code>) را نشان می‌دهد. برای داده لحظه‌ای دکمهٔ «به‌روزرسانی» را بزنید یا شبکه/VPN مناسب فعال کنید.
            {report.source.note ? ` (${report.source.note})` : ""}
          </div>
        </div>
      )}
      {error && (
        <div className="banner synthetic">
          <span>✖</span>
          <div><b>خطا در دریافت داده:</b> <span style={{ direction: "ltr", display: "inline-block" }}>{error}</span></div>
        </div>
      )}

      {/* ---------- KPI ---------- */}
      <SectionTitle title="خلاصه توزیع" sub={`اعداد بر حسب بیس‌پوینت از قیمت (bps)؛ ۱٪ = ۱۰۰ bps. رده کارمزد فعال: ${fee.label}`} />
      <div className="grid g6">
        <Kpi label="میانه اسپرد" value={bps(s.medianSpreadBps)} unit="bps" note={`میانگین ${bps(s.meanSpreadBps)} (فریب‌دهنده)`} />
        <Kpi label="دامنه ۵۰٪ میانی" value={`${bps(s.p25SpreadBps)}–${bps(s.p75SpreadBps)}`} unit="bps" note={`صدک ۹۰: ${bps(s.p90SpreadBps)}`} />
        <Kpi label="هزینه رفت‌وبرگشت (میانه)" value={bps(s.medianRoundTripBps)} unit="bps" note={`= ${pct(s.medianRoundTripBps / 100, 3)} بازده لازم`} />
        <Kpi label="میانه کف تیک" value={bps(s.medianTickFloorBps, 3)} unit="bps" note={`${s.shareAtTickFloorPct.toFixed(1)}٪ نماد روی کف`} />
        <Kpi label="اختلاف ۱۰۰ گران ÷ ۱۰۰ ارزان" value={s.top100CostRatio.toFixed(1)} unit="×" note={`بیشترین: ${s.worst}`} />
        <Kpi label="سهم حجم در ۱۰۰ نماد گران" value={s.volumeShareInTopCostPct.toFixed(2)} unit="٪" note="تمرکز جریان روی نمادهای ارزان" />
      </div>

      {/* ---------- بینش ---------- */}
      <SectionTitle title="عوامل تغییر — به زبان مستقیم" sub="خلاصه خودکار از داده فعلی" />
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 0 }}>
        <Card title="یافته‌های کلیدی">
          <div className="insights">
            {insights.map((i, idx) => (
              <div key={idx} className="insight">
                <span className="ic" style={{ background: `color-mix(in srgb, ${i.color} 22%, transparent)`, color: i.color }}>{i.icon}</span>
                <div>
                  {i.parts.map((p, j) =>
                    typeof p === "string" ? (
                      <span key={j}>{p}</span>
                    ) : (
                      <span key={j} className="num" style={{ fontWeight: 700 }}>{p.n}</span>
                    ),
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="توزیع اسپرد" hint="محور عمودی لگاریتمی است؛ رنگ = دسته هزینه (T1 سبز تا T6 قرمز)">
          <SpreadHistogram report={report} />
          <div className="legend">
            {report.ruleTiers.filter((t) => t.count > 0).map((t) => (
              <span key={t.id}><i style={{ background: tierColor(t.id) }} />{t.id}</span>
            ))}
          </div>
          <p className="chart-note">
            بیشتر نمادها در اسپردهای بسیار کوچک (زیر ۳ bps) جمع می‌شوند و دنبالهٔ بلند تا چند صد bps کشیده شده است —
            همان دنباله‌ای که تعیین می‌کند کجا نباید سفارش بازار زد.
          </p>
        </Card>
      </div>

      {/* ---------- دسته‌بندی ---------- */}
      <SectionTitle title="دسته‌بندی هزینه" sub="تفکیک نمادها به گروه‌هایی که هزینه معامله در آن‌ها واقعاً متفاوت است" />
      <Card title="الف) دسته‌بندی قاعده‌محور" hint="آستانه‌های ثابت بر حسب اسپرد — مناسب تصمیم اجرای سفارش">
        <RuleTierTable report={report} />
      </Card>

      <div className="grid g2" style={{ marginTop: 14 }}>
        <Card title="ب) خوشه‌بندی داده‌محور" hint="k-means پنج‌بُعدی روی لگاریتم اسپرد، حجم، کف تیک و نوسان — مرزها را خودِ داده تعیین می‌کند">
          <DataTierTable report={report} />
          <p className="chart-note">اگر این خوشه‌ها تقریباً با دسته‌های قاعده‌محور هم‌راستا باشند یعنی مرزبندی بالا «واقعی» است، نه دلبخواهی.</p>
        </Card>
        <Card title="ج) سهم هر دسته از حجم بازار" hint="تمرکز نقدینگی: پول کجا می‌رود">
          <TierVolumeDonut report={report} />
        </Card>
      </div>

      {/* ---------- عوامل ---------- */}
      <SectionTitle
        title="عوامل مؤثر بر تفاوت هزینه"
        sub="هر عامل به سطل‌های تقسیم شده و اثر هر سطل روی میانه اسپرد اندازه‌گیری شده است"
      />
      <div className="grid g2">
        <Card title="رتبه‌بندی عوامل" hint="دامنه میانه اسپرد بین بهترین و بدترین سطل هر عامل">
          <FactorImpact report={report} />
          <div style={{ marginTop: 10 }}>
            {report.factorImportance.map((f) => (
              <div key={f.factor} className="insight" style={{ marginBottom: 6 }}>
                <span className="ic" style={{ background: "rgba(76,141,255,0.2)", color: "var(--accent)" }}>◆</span>
                <div>
                  <b>{f.driver}</b> — {f.description}. <span className="num">دامنه {bps(f.impactBps)} bps</span>{" "}
                  ({f.weight.toFixed(2)}× میانه بازار)
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="اثر هر سطل" hint="میانه اسپرد، کف تیک و هزینه رفت‌وبرگشت به تفکیک سطل‌های عامل انتخابی">
          <div className="tabs">
            {Object.keys(FACTOR_LABELS).map((k) => (
              <button key={k} className={factor === k ? "on" : ""} onClick={() => setFactor(k)}>
                {FACTOR_LABELS[k]}
              </button>
            ))}
          </div>
          <FactorBuckets report={report} factor={factor} />
          <p className="chart-note">
            ستون آبی = اسپرد واقعی، ستون نارنجی = کف تیک. هرجا این دو به هم نزدیک شوند، یعنی بازار آنجا «تهی» است و
            اسپرد دیگر قابل بهبود نیست.
          </p>
        </Card>
      </div>

      <div className="grid" style={{ marginTop: 14 }}>
        <Card title={`جزئیات سطل‌های «${FACTOR_LABELS[factor]}»`} hint="مقایسه هر سطل با میانه کل بازار">
          <FactorTable report={report} factor={factor} />
        </Card>
      </div>

      {/* ---------- نمودارهای رابطه ---------- */}
      <SectionTitle title="رابطه هزینه با نقدینگی و قیمت" sub="محورهای لگاریتمی — هر نقطه یک نماد" />
      <div className="grid g2">
        <Card title="اسپرد در برابر حجم ۲۴ساعته" hint="خط‌چین نارنجی = برازش توانی log-log">
          <SpreadVsVolume
            costs={costs}
            elasticity={s.liquidityElasticity}
            intercept={interceptOf(costs, s.liquidityElasticity)}
          />
          <p className="chart-note">
            اگر R² بالا باشد، نقدینگی تقریباً همه‌چیز را توضیح می‌دهد و بقیه عوامل نقش اصلاحی دارند.
            {" "}ضریب بهینجاری <b>R² = {Number.isFinite(s.liquidityFitR2) ? s.liquidityFitR2.toFixed(2) : "—"}</b>
          </p>
        </Card>
        <Card title="اسپرد در برابر سطح قیمت" hint="خط نارنجی = کف ساختاری (tickSize ÷ قیمت)">
          <SpreadVsPrice costs={costs} />
          <p className="chart-note">
            نقطه‌هایی که روی خط نارنجی می‌نشینند، اسپردشان کاملاً با اندازه‌گام قیتمان تعیین شده؛
            یعنی هیچ نقدینگی‌دهی مؤثری روی آن‌ها نیست.
          </p>
        </Card>
      </div>

      <div className="grid" style={{ marginTop: 14 }}>
        <Card title="نقشه حرارتی: میانه اسپرد بر حسب قیمت × حجم" hint="سبز = ارزان، قرمز = گران. عدد = میانه اسپرد بر حسب bps">
          <HeatGrid costs={costs} />
          <p className="chart-note">این جدول سریع‌ترین راه برای پیدا کردن «تلهٔ هزینه» است: ردیف‌های قیمت پایین، ستون‌های حجم کم.</p>
        </Card>
      </div>

      {/* ---------- درخت و همبستگی ---------- */}
      <SectionTitle title="درخت تصمیم و همبستگی" sub="استخراج خودکار مهم‌ترین عوامل مؤثر بر اسپرد" />
      <div className="grid g2">
        <Card title="درخت تصمیم (CART)" hint="هدف: لگاریتم اسپرد — هر شاخه، یک آستانه از یک عامل">
          <DecisionTree node={report.tree} />
          <p className="chart-note">عمق ۳ و حداقل ۱۲ نماد در هر برگ تا نتیجه روی چند نماد قواره‌ای ناپایدار نشود.</p>
        </Card>
        <Card title="همبستگی اسپیرمن" hint="ρ نزدیک ±۱ یعنی رابطه یکنواخت و قوی">
          <CorrTable report={report} />
          <p className="chart-note">نارنجی = رابطه مستقیم (عامل هزینه‌زا)، سبز = رابطه معکوس (عامل کاهنده هزینه).</p>
        </Card>
      </div>

      {/* ---------- جدول نمادها ---------- */}
      <SectionTitle title="جدول کامل نمادها" sub="قابل مرتب‌سازی و فیلتر بر اساس دسته هزینه" />
      <Card>
        <SymbolTable costs={costs} />
      </Card>

      {/* ---------- متدولوژی ---------- */}
      <div className="footer">
        <b>روش محاسبه (دقیق):</b>
        <div style={{ marginTop: 6 }}>
          • <b>میانه قیمت</b> = (بهترین bid + بهترین ask) ÷ 2 — از <code dir="ltr">/fapi/v1/ticker/bookTicker</code> (اسپرد واقعی لحظه‌ای، نه تیکر ۲۴ساعته)<br />
          • <b>اسپرد</b> = (ask − bid) ÷ mid × 10,۰۰۰ بر حسب bps — معادل درصدی از قیمت (نسبت بی‌بُعد، مستقل از مقیاس قیمت)<br />
          • <b>کف تیک</b> = tickSize ÷ mid × 10,۰۰۰ — کمترین اسپرد ممکن با اندازه‌گام قیمت بایننس<br />
          • <b>هزینه رفت‌وبرگشت</b> = ۲ × کارمزد تیکر + کل اسپرد (ورود و خروج با سفارش بازار)<br />
          • <b>کارمزد</b> بر پایه جدول رسمی USDⓈ-M: کاربر عادی Maker 0.02% / Taker 0.05% (۱۰٪ تخفیف با BNB) — نرخ حساب خودتان را در نوار بالا انتخاب کنید<br />
          • در حالت عمیق، <b>اسپرد میانگین ۲۴ساعته</b> با تخمین‌گر Corwin–Schultz از کندل روزانه و <b>نوسان تحقق‌یافته ۷روزه</b> محاسبه می‌شود
        </div>
        <div style={{ marginTop: 10 }}>
          <b>محدودیت‌ها:</b> اسپرد لحظه‌ای یک عکس در زمان است و در بازار پرنوسان تغییر می‌کند؛ برای تصمیم اجرای سفارش، اسپرد را در ساعت‌های اوج و افت نیز بسنجید.
          همچنین این داشبورد هزینه را نشان می‌دهد، نه عمق واقعی اجرا (Slippage) که برای سفارش‌های بزرگ تعیین‌کننده است.
        </div>
        <div style={{ marginTop: 10 }}>
          <b>منابع:</b> <span dir="ltr">{report.source.endpoints.join("  ·  ")}</span> — بدون نیاز به API Key.
        </div>
      </div>
    </div>
  );
}

/** عرض از مبدأ برازش لگاریتمی: log10(spread) = intercept + slope·log10(volume) */
function interceptOf(costs: SymbolCost[], slope: number): number {
  if (!Number.isFinite(slope) || costs.length === 0) return NaN;
  let n = 0;
  let s = 0;
  for (const c of costs) {
    if (!(c.quoteVolume24h > 0) || !(c.spreadBps > 0)) continue;
    s += Math.log10(c.spreadBps) - slope * Math.log10(c.quoteVolume24h);
    n++;
  }
  return n ? s / n : NaN;
}
