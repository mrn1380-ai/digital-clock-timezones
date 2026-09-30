/**
 * داده نمایشی (SYNTHETIC) — فقط وقتی استفاده می‌شود که به بایننس دسترسی نباشد
 * (مثلاً اجرا در محیطی که IP آن geo-block شده است).
 *
 * ⚠️ این داده واقعی نیست و نباید مبنای تصمیم معاملاتی باشد.
 * مدل تولیدکننده، صرفاً همان روابطی را بازتولید می‌کند که در تحلیل بازار واقعی
 * مشاهده می‌شود: کف اسپرد از tick/mid، و کاهش توانی اسپرد با حجم.
 */
import { type RawSymbolData, type SymbolMeta } from "./types";

const BASES = [
  "BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX", "LINK", "DOT", "MATIC", "TRX",
  "LTC", "BCH", "NEAR", "APT", "ARB", "OP", "SUI", "INJ", "FIL", "ATOM", "ETC", "XLM", "HBAR",
  "TON", "RUNE", "SEI", "TIA", "PEPE", "WIF", "BONK", "FLOKI", "JUP", "PYTH", "JTO", "WLD",
  "ORDI", "STRK", "MANTA", "ALT", "DOGS", "NOT", "1000SATS", "1000LUNC", "1000XEC", "1MBABYDOGE",
  "MEME", "ARKM", "WLD", "PENDLE", "FET", "RENDER", "TAO", "AEVO", "ETHFI", "OMNI", "SAGA",
  "BB", "NOT", "IO", "LISTA", "ZRO", "G", "BANANA", "R", "S", "POL", "SCRT", "KAITO", "SHELL",
];

/** نام‌های بیشتر — فقط برای پر کردن محیط نمایشی */
const BASES_2 = [
  "AAVE", "ALGO", "ANT", "APE", "API3", "ARPA", "ASTR", "AUDIO", "AXL", "BADGER", "BAL", "BAND",
  "BAT", "BCHABC", "BICO", "BLZ", "BNT", "BOND", "BSV", "BTS", "BTTC", "BULL", "C98", "CELO",
  "CFX", "CHESS", "CHZ", "CITY", "CLV", "COCOS", "COS", "COTI", "COVER", "CKB", "CTK", "CTSI",
  "CVC", "CVP", "CVX", "DAR", "DATA", "DCR", "DEGO", "DEXE", "DF", "DGB", "DIA", "DOCK", "DODO",
  "DREP", "DUSK", "EDU", "ELF", "ENS", "EPX", "ERN", "ETHW", "FARM", "FET", "FIDA", "FIO", "FIS",
  "FLM", "FLOW", "FLUX", "FOR", "FORTH", "FRONT", "FTM", "FTT", "GAL", "GAS", "GLM", "GLMR", "GMX",
  "GNO", "GPS", "GTC", "GTO", "HARD", "HFT", "HIFI", "HIGH", "HIVE", "HOOK", "HOT", "ICX", "ID",
  "IDEX", "ILV", "IMX", "IOST", "IOTA", "IOTX", "IRIS", "JASMY", "JOE", "JST", "KAVA", "KDA", "KEY",
  "KLAY", "KMD", "KSM", "LAZIO", "LEND", "LEVER", "LINA", "LPT", "LQTY", "LRC", "LSK", "LTO", "LUN",
  "MAGIC", "MASK", "MBOX", "MC", "MDT", "MDX", "MEME", "METIS", "MINA", "MLN", "MOVR", "MTL", "MULTI",
  "NEBL", "NKN", "NMR", "NULS", "OAX", "OCEAN", "OG", "OGN", "OM", "ONG", "ONT", "OOKI", "ORCA",
  "ORDI", "OSMO", "OXT", "PENDLE", "PEOPLE", "PERP", "PHA", "PHB", "PIVX", "PIXEL", "PLA", "POLYX",
  "POND", "PORTO", "POWR", "PPT", "PROS", "PSG", "PUNDIX", "PYR", "QI", "QKC", "QLC", "QNT", "QUICK",
  "RAD", "RAY", "RARE", "RAYDIUM", "RED", "REI", "REQ", "RIF", "RLC", "RNDR", "ROSE", "RPL", "RSR",
  "RVN", "SANTOS", "SCRT", "SFP", "SHIB", "SIGN", "SLP", "SNGLS", "SOLO", "SOPH", "SNGLS", "SRM",
  "STMX", "STPT", "STORJ", "STPT", "STX", "SUN", "SUPER", "SXP", "SYS", "TCT", "TFUEL", "THE", "TKO",
  "TLM", "TNB", "TNT", "TRB", "TRU", "TRX", "TUSD", "TUT", "UMA", "UNFI", "UST", "VET", "VGX", "VIA",
  "VIB", "VIDT", "VITE", "VOXEL", "VTHO", "WABI", "WAVES", "WBTC", "WCT", "WIN", "WING", "WNXM",
  "WOO", "WPR", "WRX", "XEC", "XEM", "XNO", "XVG", "XVS", "YFI", "YFII", "YGG", "ZEN", "ZIL", "ZRX",
  "CHEEMS", "BABYDOGE", "SLF", "BOME", "MEW", "POPCAT", "TURBO", "MOG", "BRETT", "ANDY", "GIGS",
  "FWOG", "NIGEL", "BR", "SXT", "CGPT", "BSOL", "S", "KAITO", "TUT", "GUN", "BULL", "TRUMP", "MAGA",
];

const QUOTES = ["USDT", "USDC"] as const;

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** قیمت مرجع بازارِ نمایشی */
const REF_PRICE: Record<string, number> = {
  BTC: 68000, ETH: 3500, SOL: 155, BNB: 590, XRP: 0.55, DOGE: 0.14, ADA: 0.42, AVAX: 27,
  LINK: 14, DOT: 6.2, MATIC: 0.52, TRX: 0.13, LTC: 82, BCH: 380, NEAR: 5.1, APT: 8.4,
  ARB: 0.78, OP: 1.7, SUI: 1.9, INJ: 22, FIL: 4.4, ATOM: 7.6, ETC: 21, XLM: 0.27, HBAR: 0.19,
  TON: 5.4, RUNE: 2.1, SEI: 0.42, TIA: 5.8, PEPE: 0.000011, WIF: 1.4, BONK: 0.000023, FLOKI: 0.00012,
  JUP: 0.75, PYTH: 0.35, JTO: 1.6, WLD: 1.4, ORDI: 28, STRK: 0.4, MANTA: 1.1, ALT: 0.12,
  DOGS: 0.00011, NOT: 0.004, MEME: 0.014, ARKM: 0.9, PENDLE: 3.9, FET: 1.2, RENDER: 5.2,
  TAO: 260, AEVO: 0.8, ETHFI: 1.5, OMNI: 9.5, SAGA: 0.18, BB: 0.5, IO: 1.4, LISTA: 0.4,
  ZRO: 0.11, G: 0.02, BANANA: 0.0035, R: 0.006, S: 0.5, POL: 0.31, SCRT: 0.005, KAITO: 0.5,
  SHELL: 0.2, "1000SATS": 0.017, "1000LUNC": 0.1, "1000XEC": 0.25, "1MBABYDOGE": 0.9,
};

/** تولید یک قیمت با توزیع نمایی-لگاریتمی تا ارقام بازار واقعی بازتولید شود */
function synthPrice(base: string, rnd: () => number): number {
  const ref = REF_PRICE[base] ?? Math.pow(10, -3 + rnd() * 5);
  const jitter = Math.pow(10, (rnd() - 0.5) * 0.5);
  const p = ref * jitter;
  if (p >= 1000) return Math.round(p);
  if (p >= 100) return Math.round(p * 100) / 100;
  if (p >= 10) return Math.round(p * 1000) / 1000;
  if (p >= 1) return Math.round(p * 10000) / 10000;
  if (p >= 0.01) return Math.round(p * 1e6) / 1e6;
  if (p >= 0.0001) return Math.round(p * 1e8) / 1e8;
  return Math.round(p * 1e10) / 1e10;
}

/** tickSize متناسب با pricePrecision (مانند بایننس) */
function synthTick(p: number): number {
  if (p >= 1000) return 0.1;
  if (p >= 100) return 0.01;
  if (p >= 10) return 0.001;
  if (p >= 1) return 0.0001;
  if (p >= 0.1) return 0.00001;
  if (p >= 0.01) return 0.000001;
  if (p >= 0.001) return 0.0000001;
  return 0.00000001;
}

export function generateSyntheticRows(count = 320, seed = 7, now = Date.now()): RawSymbolData[] {
  const rnd = mulberry32(seed);
  const rows: RawSymbolData[] = [];
  const used = new Set<string>();

  for (const base of [...BASES, ...BASES_2]) {
    const n = base === "BTC" || base === "ETH" ? 1 : 1 + Math.floor(rnd() * 2);
    for (let k = 0; k < n; k++) {
      const quote = QUOTES[Math.floor(rnd() * QUOTES.length)];
      let symbol = `${base}${quote}`;
      if (k === 1) symbol = `1000${base}${quote}`;
      if (used.has(symbol)) continue;
      used.add(symbol);
      const price = synthPrice(base, rnd);

      // حجم: توزیع پاور-لوا (چند نماد بسیار پرحجم، دنبالهٔ بلند نمادهای مرده)
      const u = rnd();
      const volume = Math.pow(10, 4.4 + u * 5.4) * (price > 1000 ? 1.6 : 1);
      const tick = synthTick(price);
      const tickFloorBps = (tick / price) * 1e4;
      const rangePct = Math.pow(10, 0.25 + rnd() * 1.15); // ۱.۸٪ تا ۱۷٪
      // اسپرد = کف تیک  +  کاهش توانی با حجم × نوسان × نویز لگاریتمی
      // نمادهای «مرده» (حجم ناچیز) دنبالهٔ سنگین اسپرد می‌سازند
      const dead = volume < 1e5;
      const liqPart =
        3.0 * Math.pow(volume / 1e6, -0.33) * (1 + rangePct / 8) * Math.pow(10, (rnd() - 0.5) * 0.7) * (dead ? 1.6 + rnd() * 3.4 : 1);
      // در نمادهای کم‌عمق، بازار اغلب دقیقاً روی کمترین اسپرد ممکن (یک تیک) می‌نشیند
      const pinnedToFloor = volume < 3e5 && rnd() < 0.55;
      const spreadBps = pinnedToFloor
        ? tickFloorBps * (1 + rnd() * 0.02)
        : Math.max(tickFloorBps * (1 + rnd() * 1.2), tickFloorBps + liqPart);
      const halfSpread = (spreadBps / 1e4) * price * 0.5;
      const bid = price - halfSpread;
      const ask = price + halfSpread;

      const meta: SymbolMeta = {
        symbol,
        base,
        quote,
        pricePrecision: Math.max(0, Math.min(8, Math.round(-Math.log10(tick)))),
        quantityPrecision: 0,
        tickSize: tick,
        onboardDate: now - Math.floor(rnd() * 1200) * 86_400_000,
        contractType: "PERPETUAL",
        status: "TRADING",
      };

      rows.push({
        meta,
        book: {
          symbol,
          bidPrice: bid,
          askPrice: ask,
          bidQty: (volume / price / 2000) * (0.2 + rnd()),
          askQty: (volume / price / 2000) * (0.2 + rnd()),
        },
        t24: {
          symbol,
          lastPrice: price,
          openPrice: price * (1 + (rnd() - 0.5) * 0.04),
          highPrice: price * (1 + rangePct / 200),
          lowPrice: price * (1 - rangePct / 200),
          volume: volume / price,
          quoteVolume: volume,
          trades: Math.floor(volume / (50 + rnd() * 4000)),
          takerBuyBaseVolume: (volume / price) * 0.5,
          takerBuyQuoteVolume: volume * 0.5,
        },
      });
    }
    if (rows.length >= count) break;
  }
  return rows;
}
