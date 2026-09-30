import { NextResponse } from "next/server";
import { runPipeline, costsFromReport } from "@/lib/pipeline";
import { FEE_TIERS } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/market?fee=vip0&refresh=1&deep=1
 * خروجی: گزارش کامل + ردیف‌های هزینه برای رده کارمزد انتخابی
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const fee = url.searchParams.get("fee") ?? FEE_TIERS[0].id;
  const refresh = url.searchParams.get("refresh") === "1";
  const deep = url.searchParams.get("deep") === "1";
  const forceLive = url.searchParams.get("live") === "1";

  try {
    const { report, costs } = await runPipeline({ feeTierId: fee, deep, mode: forceLive ? "live" : "auto" });
    // اگر کاربر رده کارمزد دیگری خواست و داده از اسنپ‌شات/نمایشی آمد، هزینه‌ها بازمحاسبه می‌شوند
    const finalCosts = report.feeTierId === fee ? costs : costsFromReport(report, fee);
    return NextResponse.json(
      { report: { ...report, feeTierId: fee }, costs: finalCosts, fees: FEE_TIERS, refreshed: refresh },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message, hint: "اتصال به fapi.binance.com برقرار نشد. اگر IP شما geo-block است، از VPN یا شبکه دیگری استفاده کنید." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
