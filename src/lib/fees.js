/* ============================================================
 * جدول کارمزد نوبیتکس (۷ سطح، بر اساس حجم معاملات ۳۰ روزه)
 * منبع: مستندات/بلاگ رسمی نوبیتکس. در صورت تغییر، از UI قابل ویرایش است.
 * ==========================================================*/

export const FEE_LEVELS = [
  { id: 'regular', label: 'پایه (Regular)', vol: 'کمتر از ۱۰۰ میلیون تومان', irt: { maker: 0.20, taker: 0.25 }, usdt: { maker: 0.10, taker: 0.13 } },
  { id: 'vip1', label: 'ویژه ۱ (VIP1)', vol: '۱۰۰ تا ۳۰۰ میلیون تومان', irt: { maker: 0.17, taker: 0.20 }, usdt: { maker: 0.095, taker: 0.12 } },
  { id: 'vip2', label: 'ویژه ۲ (VIP2)', vol: '۳۰۰ میلیون تا ۱ میلیارد تومان', irt: { maker: 0.15, taker: 0.19 }, usdt: { maker: 0.09, taker: 0.11 } },
  { id: 'vip3', label: 'ویژه ۳ (VIP3)', vol: '۱ تا ۵ میلیارد تومان', irt: { maker: 0.125, taker: 0.175 }, usdt: { maker: 0.08, taker: 0.10 } },
  { id: 'vip4', label: 'ویژه ۴ (VIP4)', vol: '۵ تا ۲۰ میلیارد تومان', irt: { maker: 0.10, taker: 0.155 }, usdt: { maker: 0.07, taker: 0.10 } },
  { id: 'vip5', label: 'ویژه ۵ (VIP5)', vol: '۲۰ تا ۸۰ میلیارد تومان', irt: { maker: 0.09, taker: 0.145 }, usdt: { maker: 0.065, taker: 0.095 } },
  { id: 'vip6', label: 'ویژه ۶ (VIP6)', vol: 'بیش از ۸۰ میلیارد تومان', irt: { maker: 0.08, taker: 0.135 }, usdt: { maker: 0.06, taker: 0.09 } },
]

export const FEE_NOTE =
  'کارمزدها بر اساس حجم معاملات ۳۰ روز گذشته و تفکیک بازار ریالی/تتری است. سطح پایه ریالی: میکر ۰.۲۰٪ / تیکر ۰.۲۵٪ (در برخی منابع میکر ریالی ۰.۲۵٪ ذکر شده؛ در صورت نیاز از تنظیمات ویرایش کنید).'

export function getFee(levelId, quote, side) {
  const lvl = FEE_LEVELS.find((l) => l.id === levelId) || FEE_LEVELS[0]
  const q = quote === 'USDT' ? lvl.usdt : lvl.irt
  return side === 'maker' ? q.maker : q.taker
}

/**
 * هزینه کل معامله بر حسب درصد
 * mode: 'roundtrip' => رفت و برگشت (خرید+فروش)  |  'oneway' => یک طرفه
 * side: 'taker' (عبور از اسپرد) | 'maker' (سفارش‌گذار؛ اسپرد پرداخت نمی‌شود)
 * برای تیکرِ رفت‌وبرگشت: کل اسپرد + دو برابر کارمزد تیکر
 * برای تیکرِ یک‌طرفه: نیمی از اسپرد + کارمزد تیکر
 */
export function totalCostPct(spreadPct, feePct, { mode = 'roundtrip', side = 'taker' } = {}) {
  if (!Number.isFinite(spreadPct)) return NaN
  const spreadPart = side === 'taker' ? (mode === 'roundtrip' ? spreadPct : spreadPct / 2) : 0
  const feePart = mode === 'roundtrip' ? 2 * feePct : feePct
  return spreadPart + feePart
}

export const toBps = (pct) => pct * 100
