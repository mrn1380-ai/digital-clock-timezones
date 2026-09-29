/**
 * جدول رسمی کارمزد معاملات نوبیتکس (پایه / Regular)
 * منبع: https://help.nobitex.ir/knowledgebase/trading-fees/
 * مبنا: درصد از ارزش معامله، تفکیک‌شده بر اساس ارز مقصد (ریال، تتر، سایر)
 */
export type QuoteKind = 'IRT' | 'USDT' | 'OTHER';

export interface FeeTier {
  kind: QuoteKind;
  label: string;
  short: string;
  makerPct: number;
  takerPct: number;
  color: string;
}

export const FEE_TIERS: Record<QuoteKind, FeeTier> = {
  IRT: { kind: 'IRT', label: 'ریالی (IRT)', short: 'ریالی', makerPct: 0.2, takerPct: 0.25, color: '#f59e0b' },
  USDT: { kind: 'USDT', label: 'تتری (USDT)', short: 'تتری', makerPct: 0.1, takerPct: 0.13, color: '#38bdf8' },
  OTHER: { kind: 'OTHER', label: 'سایر بازارها', short: 'سایر', makerPct: 0.2, takerPct: 0.2, color: '#a78bfa' },
};

/** ارزهایی که در انتهای نماد نوبیتکس می‌آیند و نوع بازار را تعیین می‌کنند */
const KNOWN_QUOTES = new Set([
  'IRT', 'USDT', 'BTC', 'ETH', 'BNB', 'TRX', 'USDC', 'BRL', 'EUR', 'TRL', 'DAI', 'XAUT', 'FDUSD', 'EURT',
]);

export function splitSymbol(symbol: string): { base: string; quote: string } {
  // نماد NFT می‌تواند خط تیره دارد: 1M_NFTIRT
  for (const q of KNOWN_QUOTES) {
    if (symbol.length > q.length && symbol.endsWith(q)) {
      return { base: symbol.slice(0, symbol.length - q.length), quote: q };
    }
  }
  return { base: symbol, quote: symbol.slice(-3) };
}

export function quoteKind(quote: string): QuoteKind {
  if (quote === 'IRT') return 'IRT';
  if (quote === 'USDT') return 'USDT';
  return 'OTHER';
}

export function feeFor(quote: string): FeeTier {
  return FEE_TIERS[quoteKind(quote)];
}
