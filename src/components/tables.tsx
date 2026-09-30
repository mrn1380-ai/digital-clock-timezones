"use client";

import { useMemo, useState } from "react";
import { type Report, type SymbolCost, type TreeNode } from "@/lib/types";
import { bps, money, pct, price, tierColor, TierPill, faNum } from "./ui";

/* ---------------- جدول دسته‌ها (قاعده‌محور) ---------------- */
export function RuleTierTable({ report }: { report: Report }) {
  return (
    <div className="tbl-scroll">
      <table>
        <thead>
          <tr>
            <th style={{ cursor: "default" }}>دسته</th>
            <th style={{ cursor: "default" }}>بازه اسپرد</th>
            <th style={{ cursor: "default" }}>تعداد نماد</th>
            <th style={{ cursor: "default" }}>سهم حجم ۲۴س</th>
            <th style={{ cursor: "default" }}>میانه اسپرد</th>
            <th style={{ cursor: "default" }}>میانه کف تیک</th>
            <th style={{ cursor: "default" }}>میانه هزینه رفت‌وبرگشت</th>
            <th style={{ cursor: "default" }}>اسپرد ÷ کارمزد</th>
            <th style={{ cursor: "default" }}>نمونه‌ها</th>
            <th style={{ cursor: "default" }}>کاربرد</th>
          </tr>
        </thead>
        <tbody>
          {report.ruleTiers.map((t) => (
            <tr key={t.id}>
              <td className="txt"><TierPill tier={t.id} /> <b style={{ color: tierColor(t.id) }}>{t.label}</b></td>
              <td>{t.range}</td>
              <td>{t.count}</td>
              <td>{pct(t.volumeSharePct, 2)}</td>
              <td style={{ fontWeight: 700, color: tierColor(t.id) }}>{bps(t.medianSpreadBps)}</td>
              <td>{bps(t.medianTickFloorBps, 3)}</td>
              <td>{bps(t.medianRoundTripBps)}</td>
              <td>{t.spreadVsFee > 0 ? `${t.spreadVsFee.toFixed(1)}×` : "—"}</td>
              <td className="txt" style={{ fontFamily: "var(--mono)", direction: "ltr", textAlign: "right" }}>
                {t.examples.join(" · ") || "—"}
              </td>
              <td className="txt" style={{ whiteSpace: "normal", minWidth: 190, color: "var(--txt2)" }}>{t.advice}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- جدول خوشه‌های داده‌محور ---------------- */
export function DataTierTable({ report }: { report: Report }) {
  return (
    <div className="tbl-scroll" style={{ maxHeight: 300 }}>
      <table>
        <thead>
          <tr>
            <th style={{ cursor: "default" }}>خوشه</th>
            <th style={{ cursor: "default" }}>تعداد نماد</th>
            <th style={{ cursor: "default" }}>سهم حجم ۲۴س</th>
            <th style={{ cursor: "default" }}>میانه اسپرد</th>
            <th style={{ cursor: "default" }}>میانه کف تیک</th>
            <th style={{ cursor: "default" }}>نمونه‌های پرحجم</th>
          </tr>
        </thead>
        <tbody>
          {report.dataTiers.map((t, i) => (
            <tr key={t.id}>
              <td className="txt"><span className={`pill C${i + 1}`}>{t.id}</span> {t.label}</td>
              <td>{t.count}</td>
              <td>{pct(t.volumeSharePct, 2)}</td>
              <td style={{ fontWeight: 700 }}>{bps(t.medianSpreadBps)}</td>
              <td>{bps(t.medianTickFloorBps, 3)}</td>
              <td className="txt" style={{ fontFamily: "var(--mono)", direction: "ltr", textAlign: "right" }}>{t.examples.join(" · ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- جدول عوامل ---------------- */
export function FactorTable({ report, factor }: { report: Report; factor: string }) {
  const rows = report.factors[factor] ?? [];
  return (
    <div className="tbl-scroll" style={{ maxHeight: 300 }}>
      <table>
        <thead>
          <tr>
            <th style={{ cursor: "default" }}>سطل</th>
            <th style={{ cursor: "default" }}>تعداد نماد</th>
            <th style={{ cursor: "default" }}>میانه اسپرد (bps)</th>
            <th style={{ cursor: "default" }}>میانه کف تیک</th>
            <th style={{ cursor: "default" }}>میانه حجم ۲۴س</th>
            <th style={{ cursor: "default" }}>سهم حجم بازار</th>
            <th style={{ cursor: "default" }}>اختلاف با میانه بازار</th>
            <th style={{ cursor: "default" }}>ضریب نسبت</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.bucket}>
              <td className="txt">{b.bucket}</td>
              <td>{b.count}</td>
              <td style={{ fontWeight: 700, color: b.ratioVsMarket > 1.5 ? "#fdba74" : b.ratioVsMarket < 0.7 ? "#86efac" : undefined }}>
                {bps(b.medianSpreadBps)}
              </td>
              <td>{bps(b.medianTickFloorBps, 3)}</td>
              <td>{money(b.medianQuoteVolume)}$</td>
              <td>{pct(b.volumeSharePct, 2)}</td>
              <td style={{ color: b.deltaVsMarketBps > 0 ? "#fdba74" : "#86efac" }}>
                {b.deltaVsMarketBps > 0 ? "+" : ""}{bps(b.deltaVsMarketBps)}
              </td>
              <td>{b.ratioVsMarket.toFixed(2)}×</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- درخت تصمیم ---------------- */
export function DecisionTree({ node }: { node: TreeNode }) {
  if (!node.leaves) {
    return <div className="leaf">{node.label}</div>;
  }
  return (
    <div className="tree-node">
      <div className="tree-split">
        اگر <b>{node.featureLabel}</b> ≤ {node.thresholdLabel} ← وگرنه →
        <span style={{ color: "var(--txt3)", fontWeight: 400 }}> (میانه کل: {bps(node.medianSpreadBps ?? 0)} bps، {node.n} نماد)</span>
      </div>
      <div className="tree-leaves">
        {node.leaves.map((l, i) => (
          <div key={i} style={{ flex: "1 1 260px", minWidth: 0 }}>
            <DecisionTree node={l} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- جدول نمادها ---------------- */
type SortKey = keyof Pick<
  SymbolCost,
  "symbol" | "spreadBps" | "roundTripBps" | "tickFloorBps" | "quoteVolume24h" | "lastPrice" | "rangePct24h" | "spreadOverFee"
>;

export function SymbolTable({ costs }: { costs: SymbolCost[] }) {
  const [q, setQ] = useState("");
  const [tier, setTier] = useState("all");
  const [sort, setSort] = useState<SortKey>("quoteVolume24h");
  const [desc, setDesc] = useState(true);
  const [limit, setLimit] = useState(60);

  const rows = useMemo(() => {
    const needle = q.trim().toUpperCase();
    const filtered = costs.filter(
      (c) => (tier === "all" || c.tierRule === tier) && (!needle || c.symbol.includes(needle) || c.base.includes(needle)),
    );
    const sorted = [...filtered].sort((a, b) => {
      const av = a[sort];
      const bv = b[sort];
      if (typeof av === "string" || typeof bv === "string") {
        return desc ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv));
      }
      return desc ? (bv as number) - (av as number) : (av as number) - (bv as number);
    });
    return sorted;
  }, [costs, q, tier, sort, desc]);

  const th = (key: SortKey, label: string) => (
    <th
      onClick={() => {
        if (sort === key) setDesc(!desc);
        else {
          setSort(key);
          setDesc(true);
        }
      }}
      style={{ color: sort === key ? "var(--accent2)" : undefined }}
    >
      {label} {sort === key ? (desc ? "▾" : "▴") : ""}
    </th>
  );

  return (
    <>
      <div className="tabs">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی نماد… (مثلاً BTC)" style={{ minWidth: 190 }} />
        <button className={tier === "all" ? "on" : ""} onClick={() => setTier("all")}>همه ({costs.length})</button>
        {(["T1", "T2", "T3", "T4", "T5", "T6"] as const).map((t) => {
          const n = costs.filter((c) => c.tierRule === t).length;
          if (!n) return null;
          return (
            <button key={t} className={tier === t ? "on" : ""} onClick={() => setTier(t)}>
              {t} ({n})
            </button>
          );
        })}
        <button onClick={() => setLimit(limit >= costs.length ? 60 : costs.length)}>
          {limit >= costs.length ? "نمایش ۶۰ ردیف" : "نمایش همه"}
        </button>
        <span className="badge">{faNum(rows.length)} نتیجه</span>
      </div>

      <div className="tbl-scroll" style={{ maxHeight: 620 }}>
        <table>
          <thead>
            <tr>
              {th("symbol", "نماد")}
              <th style={{ cursor: "default" }}>دسته</th>
              {th("lastPrice", "قیمت")}
              {th("spreadBps", "اسپرد (bps)")}
              {th("roundTripBps", "هزینه رفت‌وبرگشت")}
              {th("spreadOverFee", "اسپرد ÷ کارمزد")}
              {th("tickFloorBps", "کف تیک (bps)")}
              {th("quoteVolume24h", "حجم ۲۴س")}
              {th("rangePct24h", "دامنه ۲۴س")}
              <th style={{ cursor: "default" }}>اسپرد %</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((c) => (
              <tr key={c.symbol}>
                <td className="txt"><span className="sym">{c.symbol}</span></td>
                <td><TierPill tier={c.tierRule} /></td>
                <td>{price(c.lastPrice)}</td>
                <td style={{ fontWeight: 700, color: tierColor(c.tierRule) }}>{bps(c.spreadBps)}</td>
                <td>{bps(c.roundTripBps)} <span style={{ color: "var(--txt3)", fontSize: 10.5 }}>({pct(c.roundTripPct, 3)})</span></td>
                <td style={{ color: c.spreadOverFee > 1 ? "#fdba74" : "#86efac" }}>{c.spreadOverFee.toFixed(2)}×</td>
                <td>{bps(c.tickFloorBps, 3)}</td>
                <td>{money(c.quoteVolume24h)}$</td>
                <td>{c.rangePct24h.toFixed(2)}%</td>
                <td>{c.spreadPct.toFixed(4)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---------------- جدول همبستگی ---------------- */
export function CorrTable({ report }: { report: Report }) {
  return (
    <div className="tbl-scroll" style={{ maxHeight: 330 }}>
      <table>
        <thead>
          <tr>
            <th style={{ cursor: "default" }}>متغیر هدف</th>
            <th style={{ cursor: "default" }}>متغیر توضیح‌دهنده</th>
            <th style={{ cursor: "default" }}>اسپیرمن ρ</th>
            <th style={{ cursor: "default" }}>شدت</th>
          </tr>
        </thead>
        <tbody>
          {report.correlations.slice(0, 14).map((c, i) => (
            <tr key={i}>
              <td className="txt">{c.b}</td>
              <td className="txt">{c.a}</td>
              <td style={{ fontWeight: 700, color: Math.abs(c.rho) > 0.6 ? (c.rho > 0 ? "#fdba74" : "#86efac") : undefined }}>
                {c.rho.toFixed(3)}
              </td>
              <td>
                <div style={{ background: "var(--line2)", height: 6, borderRadius: 3, width: 90, position: "relative" }}>
                  <div
                    style={{
                      position: "absolute",
                      insetInlineStart: c.rho > 0 ? "50%" : undefined,
                      insetInlineEnd: c.rho < 0 ? "50%" : undefined,
                      width: `${Math.abs(c.rho) * 50}%`,
                      background: c.rho > 0 ? "#f97316" : "#22c55e",
                      height: "100%",
                      borderRadius: 3,
                    }}
                  />
                  <div style={{ position: "absolute", insetInlineStart: "50%", width: 1, height: "100%", background: "var(--txt3)" }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
