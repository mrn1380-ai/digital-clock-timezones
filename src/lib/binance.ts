import { type BookTicker, type RawSymbolData, type SymbolMeta, type Ticker24h } from "./types";

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
      errors.push(`${host} → ${(e as Error).name}: ${(e as Error).message}`);
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
