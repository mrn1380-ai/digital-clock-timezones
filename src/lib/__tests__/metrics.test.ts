import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSymbolCost, corwinSchultzSpreadPct, reprice, ruleTierOf, RULE_TIER_META } from "../metrics";
import { kmeans, kmeans1d, spearman, quantile, median } from "../stats";
import { FEE_TIERS, type RawSymbolData } from "../types";

/** نمونه ساختگی صرفاً برای تست واحد (نه داده بازار) */
function row(bid: number, ask: number, tick: number, quoteVolume = 1e8): RawSymbolData {
  const mid = (bid + ask) / 2;
  return {
    meta: { symbol: "TESTUSDT", base: "TEST", quote: "USDT", pricePrecision: 2, quantityPrecision: 0, tickSize: tick, onboardDate: 1_700_000_000_000, contractType: "PERPETUAL", status: "TRADING" },
    t24: { symbol: "TESTUSDT", lastPrice: mid, openPrice: mid, highPrice: mid * 1.02, lowPrice: mid * 0.98, volume: 1000, quoteVolume, trades: 100, takerBuyBaseVolume: 500, takerBuyQuoteVolume: quoteVolume / 2 },
    book: { symbol: "TESTUSDT", bidPrice: bid, askPrice: ask, bidQty: 1, askQty: 1 },
  };
}

const fee = FEE_TIERS[0]; // VIP0 → taker 5 bps

test("اسپرد بر حسب بیس‌پوینت درست محاسبه می‌شود", () => {
  const c = buildSymbolCost(row(100, 100.1, 0.01), { fee })!;
  // (0.1 / 100.05) * 10000 = 9.995 bps
  assert.ok(Math.abs(c.spreadBps - 9.995) < 0.01, `spreadBps=${c.spreadBps}`);
  assert.ok(Math.abs(c.spreadPct - 0.09995) < 0.001);
});

test("کف تیک = tickSize / mid", () => {
  const c = buildSymbolCost(row(0.9999, 1.0001, 0.0001), { fee })!;
  assert.ok(Math.abs(c.tickFloorBps - 1.0) < 0.01, `tickFloorBps=${c.tickFloorBps}`);
  const low = buildSymbolCost(row(0.9999, 1.0002, 0.0001), { fee })!;
  assert.ok(low.atTickFloor === false, "اسپرد ۲ تیک نباید atTickFloor باشد");
});

test("هزینه رفت‌وبرگشت = ۲×کارمزد تیکر + کل اسپرد", () => {
  const c = buildSymbolCost(row(100, 100.1, 0.01), { fee })!;
  assert.ok(Math.abs(c.roundTripBps - (2 * fee.takerBps + c.spreadBps)) < 1e-9);
  assert.ok(Math.abs(c.oneWayCostBps - (fee.takerBps + c.spreadBps / 2)) < 1e-9);
  assert.ok(Math.abs(c.breakevenMovePct - c.roundTripBps / 100) < 1e-9);
});

test("تغییر رده کارمزد فقط هزینه را عوض می‌کند، نه اسپرد", () => {
  const a = buildSymbolCost(row(100, 100.1, 0.01), { fee })!;
  const b = reprice(a, FEE_TIERS[1]);
  assert.equal(a.spreadBps, b.spreadBps);
  assert.ok(b.roundTripBps < a.roundTripBps);
  assert.ok(Math.abs(b.roundTripBps - (2 * 4.5 + a.spreadBps)) < 1e-9);
});

test("آستانه‌های دسته‌بندی یکتا و پیوسته‌اند", () => {
  const ids = new Set(RULE_TIER_META.map((t) => t.id));
  assert.equal(ids.size, RULE_TIER_META.length);
  assert.equal(ruleTierOf(0.5), "T1");
  assert.equal(ruleTierOf(2), "T2");
  assert.equal(ruleTierOf(5), "T3");
  assert.equal(ruleTierOf(20), "T4");
  assert.equal(ruleTierOf(50), "T5");
  assert.equal(ruleTierOf(500), "T6");
});

test("تخمین‌گر Corwin–Schultz بازار یک‌طرفه را صفر می‌دهد", () => {
  assert.equal(corwinSchultzSpreadPct(100, 90, 99, 90.5), 0);
  // روز دوم با دامنه بسیار کوچک ⇒ تخمین مثبت
  const s = corwinSchultzSpreadPct(101, 99, 100.2, 99.9);
  assert.ok(s > 0 && s < 20, `CS=${s}`);
  // روز دوم با دامنه مشابه ⇒ تخمین منفی ⇒ صفر
  assert.equal(corwinSchultzSpreadPct(101, 99, 100.5, 99.5), 0);
});

test("k-means قطعی و تکرارپذیر است", () => {
  const pts = Array.from({ length: 120 }, (_, i) => [i % 3 === 0 ? 1 : 10, i % 5 === 0 ? 2 : 20]);
  const a = kmeans(pts, 2, 42, 80);
  const b = kmeans(pts, 2, 42, 80);
  assert.deepEqual(a.labels, b.labels);
  assert.equal(new Set(a.labels).size, 2);
});

test("شکست‌های طبیعی روی داده دوقله‌ای پیدا می‌شود", () => {
  const xs = [...Array.from({ length: 200 }, (_, i) => 1 + (i % 7) * 0.001), ...Array.from({ length: 60 }, (_, i) => 50 + (i % 9) * 0.01)];
  const { boundaries } = kmeans1d(xs, 2);
  assert.equal(boundaries.length, 1);
  assert.ok(boundaries[0] > 1 && boundaries[0] < 50, `boundary=${boundaries[0]}`);
});

test("اسپیرمن جهت رابطه را درست می‌گیرد", () => {
  const x = [1, 2, 3, 4, 5, 6];
  assert.ok(spearman(x, [10, 20, 30, 40, 50, 60]) > 0.99);
  assert.ok(spearman(x, [60, 50, 40, 30, 20, 10]) < -0.99);
});

test("کوانتیل و میانه", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(quantile([1, 2, 3, 4], 0), 1);
});

test("نماد بدون قیمت معتبر حذف می‌شود", () => {
  const bad = row(100, 100.1, 0.01);
  bad.t24.lastPrice = 0;
  assert.equal(buildSymbolCost(bad, { fee }), null);
});
