import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyError } from "../binance";
import { buildConnection } from "../pipeline";
import type { HostProbe } from "../types";

const probe = (over: Partial<HostProbe>): HostProbe => ({
  host: "https://fapi.binance.com",
  ok: false,
  status: null,
  latencyMs: 10,
  kind: "unknown",
  message: "",
  ...over,
});

test("پاسخ معتبر = سالم", () => {
  assert.equal(classifyError({ status: 200 }).kind, "ok");
});

test("پیام محدودیت جغرافیایی بایننس تشخیص داده می‌شود", () => {
  const body = JSON.stringify({
    code: 0,
    msg: "Service unavailable from a restricted location according to 'b. Eligibility' in https://www.binance.com/en/terms.",
  });
  const r = classifyError({ status: 451, body });
  assert.equal(r.kind, "geo-block");
  assert.match(r.message, /جغرافیایی/);
});

test("۴۰۳ هم به‌عنوان مسدودی جغرافیایی تفسیر می‌شود", () => {
  assert.equal(classifyError({ status: 403 }).kind, "geo-block");
});

test("خطاهای شبکه و DNS تفکیک می‌شوند", () => {
  assert.equal(classifyError({ name: "TypeError", message: "fetch failed" }).kind, "network");
  assert.equal(classifyError({ name: "TypeError", message: "fetch failed ENOTFOUND" }).kind, "dns");
  assert.equal(classifyError({ name: "AbortError", message: "The operation was aborted" }).kind, "timeout");
  assert.equal(classifyError({ name: "TypeError", message: "fetch failed ECONNRESET" }).kind, "network");
});

test("۴۲۹ و ۵xx جداگانه گزارش می‌شوند", () => {
  assert.equal(classifyError({ status: 429 }).kind, "rate-limit");
  assert.equal(classifyError({ status: 503 }).kind, "server");
});

test("وضعیت کلی: میزبان سالم ⇒ متصل", () => {
  const c = buildConnection({
    probes: [probe({ ok: true, kind: "ok", status: 200, latencyMs: 120 }), probe({ kind: "timeout" })],
    activeHost: "https://fapi.binance.com",
    lastLiveSuccessAt: 1700000000000,
    dataOk: true,
  });
  assert.equal(c.reachable, true);
  assert.equal(c.geoBlocked, false);
  assert.match(c.message, /متصل/);
  assert.equal(c.activeHost, "https://fapi.binance.com");
});

test("وضعیت کلی: مسدودی جغرافیایی ⇒ راهنمای VPN", () => {
  const c = buildConnection({
    probes: [probe({ kind: "geo-block", status: 451, message: "restricted location" })],
    activeHost: null,
    lastLiveSuccessAt: null,
    dataOk: false,
  });
  assert.equal(c.reachable, false);
  assert.equal(c.geoBlocked, true);
  assert.match(c.message, /VPN/);
});

test("وضعیت کلی: DNS خراب ⇒ پیام مربوط به DNS", () => {
  const c = buildConnection({
    probes: [probe({ kind: "dns" }), probe({ kind: "dns", host: "https://fapi1.binance.com" })],
    activeHost: null,
    lastLiveSuccessAt: null,
    dataOk: false,
  });
  assert.match(c.message, /DNS/);
  assert.equal(c.geoBlocked, false);
});

test("پاسخ دارد ولی داده نیست ⇒ هشدار متناسب", () => {
  const c = buildConnection({
    probes: [probe({ ok: true, kind: "ok", status: 200 })],
    activeHost: null,
    lastLiveSuccessAt: null,
    dataOk: false,
  });
  assert.equal(c.reachable, true);
  assert.match(c.message, /دریافت داده/);
});
