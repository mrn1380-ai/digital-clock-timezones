import { promises as fs } from "node:fs";
import path from "node:path";
import { collectRaw, probeHosts } from "./binance";
import { buildSymbolCost, reprice } from "./metrics";
import { buildReport } from "./analyze";
import { generateSyntheticRows } from "./synthetic";
import { FEE_TIERS, type ConnectionStatus, type HostProbe, type Report, type RawSymbolData, type SymbolCost } from "./types";

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

/* ------------------------------------------------------------------ */
/* وضعیت اتصال                                                        */
/* ------------------------------------------------------------------ */

function describeFailure(probes: HostProbe[]): string {
  if (probes.length === 0) return "هیچ میزبانی امتحان نشد";
  const kinds = new Set(probes.map((p) => p.kind));
  if (kinds.has("geo-block")) {
    return "IP شما توسط بایننس به‌دلیل محدودیت جغرافیایی مسدود است (HTTP 451). با VPN یا شبکهٔ دیگری اجرا کنید.";
  }
  if (kinds.size === 1 && kinds.has("dns")) {
    return "دامنه‌های بایننس در DNS این شبکه resolve نمی‌شوند (فیلتر DNS یا قطع دسترسی).";
  }
  if ([...kinds].every((k) => k === "network" || k === "timeout")) {
    return "دسترسی شبکه به دامنه‌های بایننس مسدود است (فایروال، پراکسی سازمانی یا قطع مسیر TLS).";
  }
  const first = probes[0];
  return `هیچ میزبانی پاسخ نداد — آخرین خطا: ${first.message}`;
}

export function buildConnection(input: {
  probes: HostProbe[];
  activeHost: string | null;
  lastLiveSuccessAt: number | null;
  dataOk: boolean;
}): ConnectionStatus {
  const reachable = input.probes.some((p) => p.ok);
  const geoBlocked = !reachable && input.probes.some((p) => p.kind === "geo-block");

  let message: string;
  if (input.dataOk && input.activeHost) {
    message = `متصل — دادهٔ زنده از ${input.activeHost} دریافت شد.`;
  } else if (reachable) {
    message = "میزبان بایننس پاسخ داد اما دریافت داده کامل ناموفق بود؛ داشبورد از منبع جایگزین استفاده می‌کند.";
  } else {
    message = describeFailure(input.probes);
  }

  return {
    checkedAt: Date.now(),
    reachable,
    geoBlocked,
    activeHost: input.activeHost,
    lastLiveSuccessAt: input.lastLiveSuccessAt,
    message,
    probes: input.probes,
  };
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
 * در هر سه حالت، وضعیت اتصال هر میزبان گزارش می‌شود.
 */
export async function runPipeline(opts: RunOptions = {}): Promise<LoadResult> {
  const feeTierId = opts.feeTierId ?? FEE_TIERS[0].id;
  const mode = opts.mode ?? "auto";

  if (mode === "live" || mode === "auto") {
    let activeHost: string | null = null;
    let lastLiveSuccessAt: number | null = null;
    try {
      const [collected, probes] = await Promise.all([
        withTimeout(collectRaw({ deep: opts.deep }), opts.deep ? 180_000 : 30_000, "اتصال به بایننس بیش از حد طول کشید"),
        probeHosts(),
      ]);
      const { rows, host } = collected;
      activeHost = host;
      lastLiveSuccessAt = Date.now();
      const costs = costsFromRaw(rows, feeTierId);
      if (costs.length > 0) {
        const report = buildReport({
          costs,
          mode: "live",
          deep: !!opts.deep,
          host,
          feeTierId,
          note: "داده زنده مستقیم از REST بایننس",
          connection: buildConnection({ probes, activeHost, lastLiveSuccessAt, dataOk: true }),
        });
        if (opts.save !== false) await writeSnapshot(report);
        return { report, costs: costsFromReport(report, feeTierId) };
      }
    } catch (e) {
      if (mode === "live") throw e;
      const snap = await readSnapshot();
      const probes = await probeHosts();
      if (snap) {
        const note = `اتصال زنده برقرار نشد (${(e as Error).message.split("\n")[0]}) — نمایش آخرین اسنپ‌شات ذخیره‌شده`;
        return {
          report: {
            ...snap,
            feeTierId,
            source: { ...snap.source, note },
            connection: buildConnection({
              probes,
              activeHost: null,
              lastLiveSuccessAt: snap.connection?.lastLiveSuccessAt ?? snap.generatedAt ?? null,
              dataOk: false,
            }),
          },
          costs: costsFromReport(snap, feeTierId),
        };
      }
      return syntheticResult(feeTierId, probes, e as Error);
    }
  }

  const probes = await probeHosts();
  return syntheticResult(feeTierId, probes, null);
}

function syntheticResult(feeTierId: string, probes: HostProbe[], err: Error | null): LoadResult {
  const rows = generateSyntheticRows(320);
  const costs = costsFromRaw(rows, feeTierId);
  const connection = buildConnection({ probes, activeHost: null, lastLiveSuccessAt: null, dataOk: false });
  const report = buildReport({
    costs,
    mode: "synthetic",
    deep: false,
    host: "synthetic://model",
    feeTierId,
    note: `⚠️ داده نمایشی — ${connection.message} برای داده واقعی: npm run collect را روی سیستمی که به fapi.binance.com دسترسی دارد اجرا کنید.`,
    connection,
  });
  void err;
  return { report, costs: costsFromReport(report, feeTierId) };
}
