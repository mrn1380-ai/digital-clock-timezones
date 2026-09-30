import { promises as fs } from "node:fs";
import path from "node:path";
import { collectRaw } from "./binance";
import { buildSymbolCost, reprice } from "./metrics";
import { buildReport } from "./analyze";
import { generateSyntheticRows } from "./synthetic";
import { FEE_TIERS, type Report, type RawSymbolData, type SymbolCost } from "./types";

export const SNAPSHOT_PATH = path.join(process.cwd(), "data", "snapshot.json");

export const FEE_BY_ID = (id: string) => FEE_TIERS.find((f) => f.id === id) ?? FEE_TIERS[0];

export function costsFromRaw(rows: RawSymbolData[], feeTierId: string): SymbolCost[] {
  const fee = FEE_BY_ID(feeTierId);
  return rows
    .map((r) => buildSymbolCost(r, { fee }))
    .filter((c): c is SymbolCost => c !== null);
}

export interface LoadResult {
  report: Report;
  costs: SymbolCost[];
}

/** تبدیل گزارش ذخیره‌شده به ردیف‌های هزینه برای تغییر رده کارمزد در سمت کلاینت */
export function costsFromReport(report: Report, feeTierId: string): SymbolCost[] {
  const fee = FEE_BY_ID(feeTierId);
  return report.symbols.map((c) => reprice(c, fee));
}

export async function readSnapshot(): Promise<Report | null> {
  try {
    const txt = await fs.readFile(SNAPSHOT_PATH, "utf8");
    const parsed = JSON.parse(txt) as Report;
    if (!parsed?.symbols?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeSnapshot(report: Report): Promise<void> {
  await fs.mkdir(path.dirname(SNAPSHOT_PATH), { recursive: true });
  await fs.writeFile(SNAPSHOT_PATH, JSON.stringify(report), "utf8");
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export interface RunOptions {
  feeTierId?: string;
  deep?: boolean;
  mode?: "auto" | "live" | "synthetic";
  save?: boolean;
}

/**
 * اجرای خط لوله: داده زنده ← در صورت خطا: اسنپ‌شات ذخیره‌شده ← در صورت نبود: داده نمایشی
 */
export async function runPipeline(opts: RunOptions = {}): Promise<LoadResult> {
  const feeTierId = opts.feeTierId ?? FEE_TIERS[0].id;
  const mode = opts.mode ?? "auto";

  if (mode === "live" || mode === "auto") {
    try {
      // سقف زمانی کلی: هرگز نباید صفحه معطل بماند
      const { rows, host } = await withTimeout(
        collectRaw({ deep: opts.deep }),
        opts.deep ? 180_000 : 30_000,
        "اتصال به بایننس بیش از حد طول کشید",
      );
      const costs = costsFromRaw(rows, feeTierId);
      if (costs.length > 0) {
        const report = buildReport({
          costs,
          mode: "live",
          deep: !!opts.deep,
          host,
          feeTierId,
          note: "داده زنده مستقیم از REST بایننس",
        });
        if (opts.save !== false) await writeSnapshot(report);
        return { report, costs: costsFromReport(report, feeTierId) };
      }
    } catch (e) {
      if (mode === "live") throw e;
      const snap = await readSnapshot();
      if (snap) {
        return {
          report: { ...snap, source: { ...snap.source, note: `اتصال زنده برقرار نشد (${(e as Error).message.split("\n")[0]}) — نمایش آخرین اسنپ‌شات ذخیره‌شده` } },
          costs: costsFromReport(snap, feeTierId),
        };
      }
    }
  }

  const rows = generateSyntheticRows(320);
  const costs = costsFromRaw(rows, feeTierId);
  const report = buildReport({
    costs,
    mode: "synthetic",
    deep: false,
    host: "synthetic://model",
    feeTierId,
    note: "⚠️ داده نمایشی — به بایننس دسترسی نبود. برای داده واقعی: npm run collect را روی سیستمی که به fapi.binance.com دسترسی دارد اجرا کنید.",
  });
  return { report, costs: costsFromReport(report, feeTierId) };
}
