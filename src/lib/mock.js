/* ============================================================
 * تولید داده شبیه‌سازی‌شده برای تست خط لوله تحلیل (بدون اینترنت)
 * رابطه‌ی مدل‌شده: اسپرد با نقدشوندگی نسبت عکس دارد و
 * برای بازار ریالی «کفِ اندازه تیک» (tick floor) هم اعمال می‌شود.
 * ==========================================================*/

import { mulberry32 } from './stats.js'

const COINS = [
  ['btc', 68000], ['eth', 3200], ['usdt', 1], ['bnb', 590], ['sol', 145], ['xrp', 0.62],
  ['ada', 0.46], ['doge', 0.13], ['trx', 0.14], ['ton', 6.2], ['avax', 27], ['link', 15],
  ['dot', 6.1], ['matic', 0.52], ['ltc', 82], ['shib', 0.000021], ['atom', 7.4], ['xlm', 0.1],
  ['near', 5.1], ['apt', 9.3], ['arb', 0.85], ['op', 1.9], ['inj', 24], ['sui', 1.6],
  ['sei', 0.45], ['tia', 6.4], ['pepe', 0.0000118], ['floki', 0.00016], ['bonk', 0.000026],
  ['wif', 2.4], ['jup', 0.95], ['pyth', 0.38], ['jto', 2.9], ['ena', 0.62], ['ondo', 0.95],
  ['pol', 0.55], ['kas', 0.16], ['rndr', 7.8], ['fet', 1.35], ['aave', 105], ['uni', 9.2],
  ['mkr', 2400], ['grt', 0.22], ['sand', 0.42], ['mana', 0.44], ['axs', 6.1], ['gala', 0.028],
  ['chz', 0.09], ['egld', 38], ['hbar', 0.11], ['vet', 0.035], ['algo', 0.17], ['icp', 10.5],
  ['fil', 5.2], ['bch', 430], ['etc', 27], ['xmr', 165], ['zec', 28], ['dash', 33],
  ['not', 0.008], ['hmstr', 0.0045], ['cats', 0.00035], ['dogs', 0.00075], ['major', 0.6],
  ['usdc', 1], ['dai', 1], ['paxg', 2450], ['xaut', 2450], ['wld', 2.1], ['arkm', 2.3],
  ['zk', 0.14], ['strk', 0.45], ['me', 3.2], ['layer', 1.1], ['saga', 1.9], ['ceti', 0.09],
  ['alt', 0.05], ['dexe', 6.5], ['aergo', 0.12], ['mxm', 0.6], ['pundix', 0.35], ['tpt', 0.021],
]

const TOMAN_PER_USDT = 150000 // ۱۵۰ هزار تومان
const RIAL_PER_USD = TOMAN_PER_USDT * 10

function tickFor(priceQuote) {
  if (priceQuote >= 100) return 0.01
  if (priceQuote >= 1) return 0.0001
  if (priceQuote >= 0.001) return 1e-6
  return 1e-8
}

export function makeMockStats(seed = 7) {
  const rand = mulberry32(seed)
  const stats = {}
  const gauss = () => {
    let u = 0,
      v = 0
    while (!u) u = rand()
    while (!v) v = rand()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }

  for (const [coin, pUsd] of COINS) {
    for (const dst of ['rls', 'usdt']) {
      if (dst === 'usdt' && (coin === 'usdt' || coin === 'usdc' || coin === 'dai')) continue
      if (dst === 'rls' && coin === 'usdc') continue
      const isRls = dst === 'rls'
      const priceQuote = isRls ? pUsd * RIAL_PER_USD : pUsd
      // حجم ۲۴ساعته: لگاریتمی یکنواخت بین ۵۰۰ دلار و ۲۰ میلیون دلار
      const volUsd = 10 ** (Math.log10(500) + rand() * (Math.log10(2e7) - Math.log10(500)))
      // اسپرد پایه: با نقدشوندگی نسبت عکس دارد
      let spreadPct = Math.exp(Math.log(0.8) + -0.693 * (Math.log10(volUsd) - 3) + 0.35 * gauss())
      if (isRls) spreadPct *= 1.15 + rand() * 0.25
      // کفِ تیک: اسپرد نمی‌تواند از یک واحد تغییر قیمت کوچک‌تر باشد
      const tick = isRls ? Math.max(1, tickFor(priceQuote / 100)) : tickFor(priceQuote)
      const tickFloorPct = (tick / priceQuote) * 100
      spreadPct = Math.max(spreadPct, tickFloorPct * (1 + rand() * 1.5))
      spreadPct = Math.min(spreadPct, 12)

      const mid = priceQuote
      const bestBuy = +(mid * (1 - spreadPct / 200)).toFixed(isRls ? 2 : 8)
      const bestSell = +(mid * (1 + spreadPct / 200)).toFixed(isRls ? 2 : 8)
      const latest = +(mid * (1 + 0.001 * gauss())).toFixed(isRls ? 2 : 8)
      const dayChange = +(gauss() * 3.2).toFixed(2)
      const dayOpen = +(latest / (1 + dayChange / 100)).toFixed(isRls ? 2 : 8)
      const dayHigh = +(Math.max(latest, dayOpen) * (1 + Math.abs(gauss()) * 0.015)).toFixed(isRls ? 2 : 8)
      const dayLow = +(Math.min(latest, dayOpen) * (1 - Math.abs(gauss()) * 0.015)).toFixed(isRls ? 2 : 8)
      const volSrc = +(volUsd / pUsd).toFixed(6)
      const volDst = +(isRls ? volUsd * RIAL_PER_USD : volUsd).toFixed(2)

      stats[`${coin}-${dst}`] = {
        isClosed: rand() < 0.04,
        bestSell: String(bestSell),
        bestBuy: String(bestBuy),
        volumeSrc: String(volSrc),
        volumeDst: String(volDst),
        latest: String(latest),
        mark: String(latest),
        dayLow: String(dayLow),
        dayHigh: String(dayHigh),
        dayOpen: String(dayOpen),
        dayClose: String(latest),
        dayChange: String(dayChange),
      }
    }
  }
  // نرخ تتر برای تبدیل ریال به دلار
  stats['usdt-rls'].latest = String(RIAL_PER_USD)
  stats['usdt-rls'].bestBuy = String(RIAL_PER_USD * 0.999)
  stats['usdt-rls'].bestSell = String(RIAL_PER_USD * 1.001)
  return { status: 'ok', stats, __mock: true }
}
