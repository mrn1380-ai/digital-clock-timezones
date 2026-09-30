#!/usr/bin/env node
/**
 * جمع‌آوری داده واقعی بایننس و ذخیره اسنپ‌شات
 *
 *   npm run collect        → اسپرد زنده + تیکر ۲۴ساعته (سریع، ~۱۰ ثانیه)
 *   npm run collect:deep   → به‌علاوه کندل روزانه ۷روزه برای تخمین اسپرد میانگین
 *   npm run collect -- --fee=vip1 --out=data/snapshot.json
 *
 * باید روی سیستمی اجرا شود که به fapi.binance.com دسترسی دارد.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { collectRaw, probeHosts } from "../src/lib/binance";
import { buildSymbolCost } from "../src/lib/metrics";
import { buildReport } from "../src/lib/analyze";
import { buildConnection } from "../src/lib/pipeline";
import { FEE_TIERS, type SymbolCost } from "../src/lib/types";

function arg(name: string, def?: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : def ?? (process.argv.includes(`--${name}`) ? "1" : undefined);
}

const deep = process.argv.includes("--deep");
const feeId = arg("fee", FEE_TIERS[0].id)!;
const outPath = path.resolve(process.cwd(), arg("out", "data/snapshot.json")!);
const fee = FEE_TIERS.find((f) => f.id === feeId) ?? FEE_TIERS[0];

async function main() {
  console.log(`\n▶ جمع‌آوری داده: Binance USDⓈ-M Futures${deep ? " (حالت عمیق + کندل روزانه)" : ""}`);
  console.log(`  رده کارمزد: ${fee.label}  |  Maker ${fee.makerBps} bps / Taker ${fee.takerBps} bps\n`);

  const { rows, host } = await collectRaw({
    deep,
    concurrency: Number(arg("concurrency", "8")),
    onProgress: (d, t) => process.stdout.write(`\r  کندل روزانه: ${d}/${t}`),
  });
  if (deep) process.stdout.write("\n");

  // گزارش وضعیت اتصال هر میزبان
  const probes = await probeHosts();
  console.log("\n  وضعیت اتصال:");
  for (const p of probes) {
    const mark = p.ok ? "✔" : "✖";
    const code = p.status ? `HTTP ${p.status}` : p.kind.toUpperCase();
    console.log(`    ${mark} ${p.host.padEnd(30)} ${code.padEnd(18)} ${String(p.latencyMs + "ms").padEnd(8)} ${p.message}`);
  }

  const costs: SymbolCost[] = rows
    .map((r) => buildSymbolCost(r, { fee }))
    .filter((c): c is SymbolCost => c !== null);

  if (costs.length === 0) {
    console.error("\n✗ هیچ نمادی دریافت نشد.");
    process.exit(1);
  }

  const report = buildReport({
    costs,
    mode: "live",
    deep,
    host,
    feeTierId: fee.id,
    note: "تولیدشده با اسکریپت collect (داده واقعی بایننس)",
    connection: buildConnection({ probes, activeHost: host, lastLiveSuccessAt: Date.now(), dataOk: true }),
  });

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(report), "utf8");

  const s = report.summary;
  console.log(`\n✓ ${report.count} نماد دائمی (PERPETUAL) از ${host}`);
  console.log(`  حجم ۲۴ساعته کل: $${(report.totalQuoteVolume24h / 1e9).toFixed(1)}B`);
  console.log(`  میانه اسپرد: ${s.medianSpreadBps.toFixed(2)} bps  |  میانه کف تیک: ${s.medianTickFloorBps.toFixed(3)} bps`);
  console.log(`  میانه هزینه رفت‌وبرگشت: ${s.medianRoundTripBps.toFixed(2)} bps (${(s.medianRoundTripBps / 100).toFixed(3)}%)`);
  console.log(`  پهن‌ترین اختلاف: ${s.top100CostRatio.toFixed(1)}× بین ۱۰۰ نماد گران و ۱۰۰ نماد ارزان`);
  console.log(`  سهم ۱۰۰ نماد پرهزینه از حجم بازار: ${s.volumeShareInTopCostPct.toFixed(2)}%`);
  console.log(`\n  ذخیره شد: ${path.relative(process.cwd(), outPath)}\n`);
}

main().catch(async (e) => {
  console.error(`\n✗ خطا: ${(e as Error).message}\n`);

  // تشخیص دقیق علت: وضعیت هر میزبان
  const probes = await probeHosts();
  console.error("  وضعیت اتصال هر میزبان:");
  for (const p of probes) {
    const code = p.status ? `HTTP ${p.status}` : p.kind.toUpperCase();
    console.error(`    ${p.ok ? "✔" : "✖"} ${p.host.padEnd(30)} ${code.padEnd(18)} ${String(p.latencyMs + "ms").padEnd(8)} ${p.message}`);
  }
  const geo = probes.some((p) => p.kind === "geo-block");
  console.error(
    geo
      ? "\n  ⇒ IP شما توسط بایننس geo-block شده است. با VPN یا شبکه دیگری اجرا کنید.\n"
      : "\n  ⇒ دسترسی شبکه به fapi.binance.com برقرار نیست (فایروال/پراکسی/فیلتر DNS را بررسی کنید).\n",
  );
  process.exit(1);
});
