/**
 * مدل داده و ثابت‌های تحلیل هزینه معامله — فیوچرز USDⓈ-M بایننس
 * همه مقادیرSpread/کارمزد بر حسب «بیس‌پوینت» (bps = 0.01%) هستند.
 */

export const BPS_IN_PCT = 100; // 1% = 100 bps

export interface FeeTier {
  id: string;
  label: string;
  /** بیس‌پوینت */
  makerBps: number;
  takerBps: number;
  note?: string;
}

/**
 * نرخ‌های رسمی کارمزد فیوچرز USDⓈ-M.
 * مبنا: صفحه کارمزد بایننس — کاربر عادی Maker 0.02% / Taker 0.05%
 * و ۱۰٪ تخفیف در صورت پرداخت با BNB.
 * نرخ دقیق حساب خودتان را در صفحه «Fees» چک کنید (رده‌های ویژه/تخفیف‌ها متفاوت است).
 */
export const FEE_TIERS: FeeTier[] = [
  { id: "vip0", label: "VIP0 — بدون تخفیف", makerBps: 2.0, takerBps: 5.0, note: "پایه: Maker 0.02% / Taker 0.05%" },
  { id: "vip0-bnb", label: "VIP0 — با BNB (−۱۰٪)", makerBps: 1.8, takerBps: 4.5, note: "پرداخت کارمزد با BNB" },
  { id: "vip1", label: "VIP1 — بدون تخفیف", makerBps: 1.8, takerBps: 4.4, note: "حجم ۵ برابری نسبت به اسپات" },
  { id: "vip2", label: "VIP2 — بدون تخفیف", makerBps: 1.6, takerBps: 3.9, note: "سطح حرفه‌ای" },
  { id: "maker", label: "استراتژی Maker (سفارش لیمیت)", makerBps: 2.0, takerBps: 2.0, note: "فرض: هر دو سمت Maker موفق" },
];

export interface SymbolMeta {
  symbol: string;
  base: string;
  quote: string;
  pricePrecision: number;
  quantityPrecision: number;
  tickSize: number;
  onboardDate: number | null;
  contractType: string;
  status: string;
  maxLeverage?: number | null;
}

export interface Ticker24h {
  symbol: string;
  lastPrice: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  volume: number; // حجم قیده (base)
  quoteVolume: number; // حجم ارزشی (USDT)
  trades: number;
  takerBuyBaseVolume: number;
  takerBuyQuoteVolume: number;
}

export interface BookTicker {
  symbol: string;
  bidPrice: number;
  bidQty: number;
  askPrice: number;
  askQty: number;
}

/** یک ردیف کامل: متادیتا + تیکر ۲۴ساعته + دفترچه سفارش + کندل روزانه (اختیاری) */
export interface RawSymbolData {
  meta: SymbolMeta;
  t24: Ticker24h;
  book?: BookTicker;
  /** کندل‌های روزانه: [openTime, o,h,l,c,vol,quoteVol,trades, ...] */
  dailyKlines?: number[][];
}

/** ردیف محاسبه‌شده با همه هزینه‌ها */
export interface SymbolCost {
  symbol: string;
  base: string;
  quote: string;

  lastPrice: number;
  mid: number;
  bid: number;
  ask: number;

  // --- هسته: هزینه نسبت به قیمت ---
  spreadAbs: number; // واحد قیمت
  spreadBps: number; // (ask-bid)/mid*1e4
  spreadPct: number; // (ask-bid)/mid*100
  /** کف ساختاری اسپرد: کمترین اسپرد ممکن با اندازه‌گام قیمت */
  tickFloorBps: number;
  /** آیا اسپرد عملاً روی کف اندازه‌گام چسبیده است؟ (بازار بسیار کم‌عمق) */
  atTickFloor: boolean;
  /** نسبت اسپرد به کف تیک: ۱ یعنی حداقل ممکن */
  tickFillRatio: number;

  /** عمق دفترچه: مجموع بهترین bid و ask */
  topDepthUsd: number;

  quoteVolume24h: number;
  trades24h: number;
  rangePct24h: number; // (high-low)/mid*100
  /** نوسان‌سنجی پارکینسون از سقف/کف ۲۴ساعته */
  parkinsonVolPct: number;
  /** آمیهاد: بازده به‌ازای حجم — نقدینگی پایین = عدد بالا */
  amihud: number;

  /** برآورد اسپرد میانگین ۲۴ساعته با تخمین‌گر Corwin–Schultz (bps) — فقط در حالت عمیق */
  csSpreadBps24h: number | null;
  /** نوسان تحقق‌یافته ۷روزه (روزانه، درصد) — فقط در حالت عمیق */
  realizedVol7dPct: number | null;

  ageDays: number | null;

  // --- هزینه معامله (وابسته به رده کارمزد؛ در UI بازمحاسبه می‌شود) ---
  /** هزینه یک‌طرفه ورود با سفارش بازار = نیم‌اسپرد + کارمزد Taker */
  oneWayCostBps: number;
  /** هزینه رفت‌وبرگشت = ۲×کارمزد + کل اسپرد */
  roundTripBps: number;
  roundTripPct: number;
  /** چند برابرِ کارمزد، هزینه اسپرد است */
  spreadOverFee: number;
  /** درصد بازدهی لازم برای سربه‌سر شدن یک معامله Market رفت‌وبرگشتی */
  breakevenMovePct: number;

  // --- خوشه‌بندی ---
  tierRule: string; // دسته قاعده‌محور
  tierData: string; // دسته داده‌محور (k-means)
}

export type DataMode = "live" | "snapshot" | "synthetic";

/** نتیجه بررسی اتصال به یک میزبان بایننس */
export interface HostProbe {
  host: string;
  ok: boolean;
  status: number | null;
  latencyMs: number;
  kind: "ok" | "geo-block" | "rate-limit" | "server" | "http" | "dns" | "timeout" | "network" | "unknown";
  message: string;
}

/** وضعیت کلی اتصال — نمایش داده‌شده در داشبورد */
export interface ConnectionStatus {
  checkedAt: number;
  /** آیا حداقل یک میزبان پاسخ داد؟ */
  reachable: boolean;
  /** آیا مشکل از محدودیت جغرافیایی است؟ */
  geoBlocked: boolean;
  /** میزبانی که دادهٔ واقعی از آن گرفته شد */
  activeHost: string | null;
  /** آخرین زمانی که دادهٔ واقعی با موفقیت گرفته شد (ms) */
  lastLiveSuccessAt: number | null;
  /** توضیح یک‌خطی قابل اقدام */
  message: string;
  probes: HostProbe[];
}

export interface FactorBucket {
  factor: string;
  bucket: string;
  count: number;
  medianSpreadBps: number;
  medianRoundTripBps: number;
  medianTickFloorBps: number;
  medianQuoteVolume: number;
  volumeSharePct: number;
  /** اختلاف میانه با میانه کل بازار، بر حسب bps */
  deltaVsMarketBps: number;
  /** نسبت به میانه کل (۱ = متوسط بازار) */
  ratioVsMarket: number;
}

export interface TreeNode {
  feature?: string;
  featureLabel?: string;
  threshold?: number;
  thresholdLabel?: string;
  n?: number;
  medianSpreadBps?: number;
  leaves?: TreeNode[];
  label?: string;
}

export interface Report {
  generatedAt: number;
  mode: DataMode;
  deep: boolean;
  source: { host: string; exchange: string; endpoints: string[]; note?: string };
  connection: ConnectionStatus;
  feeTierId: string;
  count: number;
  totalQuoteVolume24h: number;
  summary: {
    medianSpreadBps: number;
    meanSpreadBps: number;
    p25SpreadBps: number;
    p75SpreadBps: number;
    p90SpreadBps: number;
    p99SpreadBps: number;
    maxSpreadBps: number;
    medianRoundTripBps: number;
    medianTickFloorBps: number;
    shareAtTickFloorPct: number;
    /** سهم حجم بازار از ۲۰ نماد پرهزینه */
    volumeShareInTopCostPct: number;
    worst: string;
    best: string;
    /** ضریب اختلاف: میانه ۱۰۰ گران‌ترین ÷ میانه ۱۰۰ ارزان‌ترین */
    top100CostRatio: number;
    /** توان قانون نقدینگی: spread ∝ volume^elasticity (کمتر یعنی اثر حجم قوی‌تر) */
    liquidityElasticity: number;
    liquidityFitR2: number;
  };
  histogram: { binStartBps: number; binEndBps: number; count: number; logCount: number }[];
  ruleTiers: {
    id: string;
    label: string;
    range: string;
    advice: string;
    count: number;
    volumeSharePct: number;
    medianSpreadBps: number;
    medianRoundTripBps: number;
    medianTickFloorBps: number;
    medianRangePct: number;
    medianQuoteVolume: number;
    spreadVsFee: number;
    examples: string[];
  }[];
  dataTiers: { id: string; label: string; count: number; volumeSharePct: number; medianSpreadBps: number; medianTickFloorBps: number; examples: string[] }[];
  factors: Record<string, FactorBucket[]>;
  factorImportance: { factor: string; driver: string; description: string; impactBps: number; weight: number }[];
  correlations: { a: string; b: string; rho: number }[];
  tree: TreeNode;
  symbols: SymbolCost[];
}
