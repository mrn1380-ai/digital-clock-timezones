import snapshot from '../data/snapshot.json';

export interface RawBook {
  lastUpdate?: number;
  lastTradePrice?: string;
  lastTrade?: { price?: string; amount?: string; time?: number };
  bids?: [string, string][];
  asks?: [string, string][];
  bid?: [string, string][];
  ask?: [string, string][];
}

export type BooksMap = Record<string, RawBook>;

export interface Attempt {
  label: string;
  ok: boolean;
  ms: number;
  detail: string;
}

export interface LoadResult {
  books: BooksMap;
  source: 'live' | 'proxy' | 'snapshot' | 'sample';
  sourceLabel: string;
  fetchedAt: number;
  error?: string;
  attempts: Attempt[];
}

const LIVE_URL = 'https://apiv2.nobitex.ir/v3/orderbook/all';

const PROXIES: { label: string; build: (u: string) => string }[] = [
  { label: 'پروکسی allorigins', build: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}` },
  { label: 'پروکسی codetabs', build: (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}` },
  { label: 'پروکسی corsproxy.io', build: (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}` },
];

function validate(json: any): BooksMap {
  if (!json || json.status !== 'ok' || typeof json !== 'object') throw new Error('پاسخ نامعتبر از API');
  const out: BooksMap = {};
  for (const [k, v] of Object.entries(json as Record<string, RawBook>)) {
    if (k === 'status' || !v || typeof v !== 'object') continue;
    out[k] = v;
  }
  if (!Object.keys(out).length) throw new Error('هیچ بازاری در پاسخ نبود');
  return out;
}

async function getJson(url: string, timeoutMs = 20000): Promise<BooksMap> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return validate(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

/**
 * تلاش برای گرفتن داده زنده. اول مستقیم (بدون CORS مشکلی از مرورگر)،
 * در صورت شکست از پروکسی‌های عمومی، سپس اسنپ‌شات محلی و در نهایت داده نمونه.
 */
export async function loadBooks(): Promise<LoadResult> {
  const attempts: Attempt[] = [];
  const tryOne = async (label: string, url: string, t: number, onOk: 'live' | 'proxy') => {
    const t0 = performance.now();
    try {
      const books = await getJson(url, t);
      attempts.push({
        label,
        ok: true,
        ms: Math.round(performance.now() - t0),
        detail: `${Object.keys(books).length} بازار دریافت شد`,
      });
      return { books, source: onOk, sourceLabel: `زنده · ${label}` } as const;
    } catch (e: any) {
      attempts.push({
        label,
        ok: false,
        ms: Math.round(performance.now() - t0),
        detail: e?.name === 'AbortError' ? 'timeout' : String(e?.message || e),
      });
      return null;
    }
  };

  const direct = await tryOne('apiv2.nobitex.ir (مستقیم)', LIVE_URL, 15000, 'live');
  if (direct) return { ...direct, fetchedAt: Date.now(), attempts };

  for (const p of PROXIES) {
    const r = await tryOne(p.label, p.build(LIVE_URL), 25000, 'proxy');
    if (r) return { ...r, fetchedAt: Date.now(), attempts };
  }

  const snap = (snapshot as any)?.books;
  if (snap && Object.keys(snap).length) {
    attempts.push({ label: 'اسنپ‌شات آفلاین', ok: true, ms: 0, detail: `${Object.keys(snap).length} بازار از فایل محلی` });
    return {
      books: snap,
      source: 'snapshot',
      sourceLabel: `اسنپ‌شات آفلاین (${(snapshot as any).generatedAt ? new Date((snapshot as any).generatedAt).toLocaleString('fa-IR') : '—'})`,
      fetchedAt: (snapshot as any).generatedAt ?? Date.now(),
      attempts,
    };
  }

  attempts.push({ label: 'داده نمونه (دمو)', ok: true, ms: 0, detail: 'داده ساختگی — فقط برای تست رابط کاربری' });
  return {
    books: SAMPLE_BOOKS,
    source: 'sample',
    sourceLabel: 'داده نمونه (دمو) — ساختگی، صرفاً برای تست رابط کاربری',
    fetchedAt: Date.now(),
    error: attempts.map((a) => `${a.label}: ${a.detail}`).join(' | '),
    attempts,
  };
}

/** نکته: از جداکننده هزار استفاده نمی‌کنیم چون خروجی باید قابل Number() باشد */
function num(n: number, digits = 4) {
  return n.toFixed(digits).replace(/\.?0+$/, '') || '0';
}

/** داده نمونهٔ عمداً ساختگی — برای اینکه داشبورد هرگز خالی نماند */
export const SAMPLE_BOOKS: BooksMap = (() => {
  const out: BooksMap = {};
  const specs: [string, number, number, number][] = [
    // symbol, last, spreadPct, depth factor
    ['BTCIRT', 950_000_000, 0.18, 1.0],
    ['ETHIRT', 42_000_000, 0.22, 0.7],
    ['XRPIRT', 120_000, 0.35, 0.4],
    ['SOLIRT', 18_000_000, 0.4, 0.3],
    ['DOGEIRT', 2_000_000, 0.55, 0.15],
    ['TONIRT', 900_000, 0.75, 0.12],
    ['ADAIRT', 6_000_000, 0.45, 0.22],
    ['TRXIRT', 3_500_000, 0.3, 0.35],
    ['BNBIRT', 70_000_000, 0.28, 0.5],
    ['USDTIRT', 1_020_000, 0.05, 1.2],
    ['BTCUSDT', 93_000, 0.04, 1.4],
    ['ETHUSDT', 3_500, 0.05, 1.0],
    ['SOLUSDT', 160, 0.09, 0.6],
    ['XRPUSDT', 1.8, 0.08, 0.5],
    ['DOGEUSDT', 0.16, 0.16, 0.25],
    ['ADAUSDT', 0.55, 0.11, 0.3],
    ['TONUSDT', 2.6, 0.14, 0.2],
    ['BNBUSDT', 640, 0.07, 0.55],
    ['LINKUSDT', 14.2, 0.13, 0.28],
    ['AVAXUSDT', 22, 0.15, 0.18],
    ['ETHBTC', 0.037, 0.35, 0.2],
    ['BTCFDUSD', 92_800, 0.05, 0.9],
  ];
  const now = Date.now();
  specs.forEach(([sym, last, sp, depth], i) => {
    const mid = last;
    const half = (mid * (sp / 100)) / 2;
    const bid = mid - half;
    const ask = mid + half;
    const mk = (side: number) =>
      Array.from({ length: 24 }, (_, k) => {
        const p = side > 0 ? ask * (1 + k * 0.0009) : bid * (1 - k * 0.0009);
        const amt = ((depth * 220) / (k + 1) / (sym.endsWith('USDT') ? 9000 : 30)) * (1 + 0.1 * Math.sin(i + k));
        return [num(p, 8), num(Math.max(0.01, amt), 4)] as [string, string];
      });
    out[sym] = {
      lastUpdate: now - (i % 6) * 1000 * 37,
      lastTradePrice: num(mid, 8),
      bids: mk(-1),
      asks: mk(1),
    };
  });
  return out;
})();
