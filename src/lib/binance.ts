import {
  type BookTicker,
  type HostProbe,
  type RawSymbolData,
  type SymbolMeta,
  type Ticker24h,
} from "./types";

/** میزبان‌های جایگزین؛ اگر یکی geo-block شد یا تایم‌اوت داد، بعدی امتحان می‌شود */
export const HOSTS = [
  "https://fapi.binance.com",
  "https://fapi1.binance.com",
  "https://fapi2.binance.com",
  "https://fapi.binance.us",
] as const;

export interface FetchResult<T> {
  data: T;
  host: string;
}

/** دسته‌بندی خطای اتصال برای نمایش دقیق علت در داشبورد */
export function classifyError(input: { status?: number | null; body?: string; name?: string; message?: string }): { kind: HostProbe["kind"]; message: string } {
  const { status, body = "", name = "", message = "" } = input;
  if (status && status >= 200 && status < 300) return { kind: "ok", message: "پاسخ معتبر" };
  if (body.includes("restricted location") || body.includes("Service unavailable")) {
    return { kind: "geo-block", message: "محدودیت جغرافیایی (IP کشور شما مجاز نیست)" };
  }
  if (status === 451 || status === 403) {
    return { kind: "geo-block", message: body.slice(0, 120) || `HTTP ${status} — دسترسی رد شد` };
  }
  if (status === 429) return { kind: "rate-limit", message: "سقف نرخ درخواست (429)" };
  if (status && status >= 500) return { kind: "server", message: `خطای سرور بایننس: HTTP ${status}` };
  if (status) return { kind: "http", message: body.slice(0, 120) || `HTTP ${status}` };
  if (name === "AbortError" || /timeout|timed? ?out/i.test(message)) {
    return { kind: "timeout", message: "پاسخی در مهلت مقرر نرسید" };
  }
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(message)) {
    return { kind: "dns", message: "DNS resolve نشد (دامنه پیدا نشد یا DNS فیلتر است)" };
  }
  if (/ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|fetch failed|certificate|TLS|SSL|handshake/i.test(message)) {
    return { kind: "network", message: "بلاک شدن اتصال شبکه (فایروال/پراکسی/قطع مسیر TLS)" };
  }
  return { kind: "unknown", message: message || name || "خطای نامشخص" };
}

/**
 * بررسی وضعیت اتصال به هر میزبان با یک درخواست سبک (/fapi/v1/time).
 * همه به‌صورت موازی و مستقل از دریافت داده اصلی اجرا می‌شوند.
 */
export async function probeHosts(timeoutMs = 6_000): Promise<HostProbe[]> {
  return Promise.all(
    HOSTS.map(async (host): Promise<HostProbe> => {
      const started = Date.now();
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), timeoutMs);
      try {
        const res = await fetch(`${host}/fapi/v1/time`, {
          signal: ac.signal,
          headers: { "User-Agent": "cost-distribution-dashboard/1.0", Accept: "application/json" },
          cache: "no-store",
        });
        const body = res.ok ? "" : await res.text().catch(() => "");
        const cls = classifyError({ status: res.status, body });
        return { host, ok: cls.kind === "ok", status: res.status, latencyMs: Date.now() - started, kind: cls.kind, message: cls.message };
      } catch (e) {
        const err = e as Error & { cause?: { code?: string } };
        const raw = `${err.message} ${err.cause?.code ?? ""}`;
        const cls = classifyError({ name: err.name, message: raw });
        return { host, ok: false, status: null, latencyMs: Date.now() - started, kind: cls.kind, message: cls.message };
      } finally {
        clearTimeout(timer);
      }
    }),
  );
}

async function getJson<T>(path: string, timeoutMs = 12_000, hostOverride?: string): Promise<FetchResult<T>> {
  const hosts = hostOverride ? [hostOverride] : [...HOSTS];
  const errors: string[] = [];
  for (const host of hosts) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(`${host}${path}`, {
        signal: ac.signal,
        headers: { "User-Agent": "cost-distribution-dashboard/1.0", Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        errors.push(`${host} → HTTP ${res.status} ${text.slice(0, 120)}`);
        continue;
      }
      const data = (await res.json()) as T;
      return { data, host };
    } catch (e) {
      const err = e as Error & { cause?: { code?: string } };
      errors.push(`${host} → ${err.cause?.code ?? err.name}: ${err.message}`);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`اتصال به بایننس ناموفق بود:\n${errors.join("\n")}`);
}

interface RawExchangeInfo {
  symbols: {
    symbol: string;
    pair: string;
    contractType: string;
    status: string;
    onboardDate: number;
    baseAsset: string;
    quoteAsset: string;
    pricePrecision: number;
    quantityPrecision: number;
    filters: { filterType: string; tickSize?: string }[];
  }[];
}

export async function fetchExchangeInfo(): Promise<FetchResult<RawExchangeInfo["symbols"]>> {
  return getJson<RawExchangeInfo["symbols"]>("/fapi/v1/exchangeInfo");
}

export async function fetchBookTickers(): Promise<FetchResult<BookTicker[]>> {
  // بدون پارامتر = همه نمادها در یک درخواست
  return getJson<BookTicker[]>("/fapi/v1/ticker/bookTicker");
}

export async function fetch24hTickers(): Promise<FetchResult<Ticker24h[]>> {
  return getJson<Ticker24h[]>("/fapi/v1/ticker/24hr");
}

/** کندل روزانه برای یک نماد (برای تخمین اسپرد میانگین و نوسان ۷روزه) */
export async function fetchDailyKlines(symbol: string, limit = 8, timeoutMs = 12_000): Promise<number[][]> {
  const { data } = await getJson<number[][]>(`/fapi/v1/klines?symbol=${symbol}&interval=1d&limit=${limit}`, timeoutMs);
  return data;
}

export function toSymbolMeta(s: RawExchangeInfo["symbols"][number]): SymbolMeta {
  const pf = s.filters.find((f) => f.filterType === "PRICE_FILTER");
  return {
    symbol: s.symbol,
    base: s.baseAsset,
    quote: s.quoteAsset,
    pricePrecision: s.pricePrecision,
    quantityPrecision: s.quantityPrecision,
    tickSize: pf?.tickSize ? Number(pf.tickSize) : 0,
    onboardDate: s.onboardDate || null,
    contractType: s.contractType,
    status: s.status,
  };
}

export function toTicker24h(t: Record<string, unknown>): Ticker24h {
  return {
    symbol: String(t.symbol),
    lastPrice: Number(t.lastPrice),
    openPrice: Number(t.openPrice),
    highPrice: Number(t.highPrice),
    lowPrice: Number(t.lowPrice),
    volume: Number(t.volume),
    quoteVolume: Number(t.quoteVolume),
    trades: Number(t.count ?? t.trades ?? 0),
    takerBuyBaseVolume: Number(t.takerBuyBaseVolume),
    takerBuyQuoteVolume: Number(t.takerBuyQuoteVolume),
  };
}

export interface CollectOptions {
  deep?: boolean;
  concurrency?: number;
  klineLimit?: number;
  onProgress?: (done: number, total: number) => void;
}

/** جمع‌آوری داده واقعی همه نمادهای USDⓈ-M */
export async function collectRaw(opts: CollectOptions = {}): Promise<{ rows: RawSymbolData[]; host: string }> {
  const [{ data: symbols, host }, { data: books }, { data: tickers }] = await Promise.all([
    fetchExchangeInfo(),
    fetchBookTickers(),
    fetch24hTickers(),
  ]);

  const bookMap = new Map<string, BookTicker>();
  for (const b of books) bookMap.set(b.symbol, b);
  const tMap = new Map<string, Ticker24h>();
  for (const t of tickers) tMap.set(t.symbol, toTicker24h(t as unknown as Record<string, unknown>));

  // همه قراردادهای دائمی (PERPETUAL) با وضعیت TRADING — شامل USDT و USDC
  const rows: RawSymbolData[] = [];
  for (const s of symbols) {
    if (s.status !== "TRADING" || s.contractType !== "PERPETUAL") continue;
    const t = tMap.get(s.symbol);
    if (!t || !(t.lastPrice > 0)) continue;
    rows.push({ meta: toSymbolMeta(s), t24: t, book: bookMap.get(s.symbol) });
  }

  if (opts.deep) {
    const conc = opts.concurrency ?? 8;
    const limit = opts.klineLimit ?? 8;
    let done = 0;
    const queue = [...rows];
    const workers = Array.from({ length: conc }, async () => {
      while (queue.length) {
        const row = queue.shift();
        if (!row) return;
        try {
          row.dailyKlines = await fetchDailyKlines(row.meta.symbol, limit);
        } catch {
          /* بدون کندل، فیلدهای عمیق خالی می‌مانند */
        }
        done++;
        if (done % 25 === 0 || done === rows.length) opts.onProgress?.(done, rows.length);
      }
    });
    await Promise.all(workers);
  }

  return { rows, host };
}
