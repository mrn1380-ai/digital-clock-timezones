/* قالب‌بندی اعداد برای نمایش فارسی */

const nf = (min, max, loc = 'fa-IR') => new Intl.NumberFormat(loc, { minimumFractionDigits: min, maximumFractionDigits: max })

export function num(value, digits = 2) {
  if (!Number.isFinite(value)) return '—'
  return nf(digits, digits).format(value)
}

export function num0(value) {
  if (!Number.isFinite(value)) return '—'
  return nf(0, 0).format(value)
}

export function pctFa(value, digits = 3) {
  if (!Number.isFinite(value)) return '—'
  return `${nf(digits, digits).format(value)}٪`
}

export function bpsFa(value) {
  if (!Number.isFinite(value)) return '—'
  return `${nf(1, 1).format(value)}`
}

export function compactUsd(v) {
  if (!Number.isFinite(v)) return '—'
  const abs = Math.abs(v)
  if (abs >= 1e9) return `${nf(1, 1).format(v / 1e9)} میلیارد $`
  if (abs >= 1e6) return `${nf(1, 1).format(v / 1e6)} میلیون $`
  if (abs >= 1e3) return `${nf(0, 0).format(v / 1e3)} هزار $`
  return `${nf(0, 0).format(v)} $`
}

export function compactNum(v) {
  if (!Number.isFinite(v)) return '—'
  const abs = Math.abs(v)
  if (abs >= 1e9) return `${nf(2, 2).format(v / 1e9)} میلیارد`
  if (abs >= 1e6) return `${nf(2, 2).format(v / 1e6)} میلیون`
  if (abs >= 1e3) return `${nf(1, 1).format(v / 1e3)} هزار`
  return nf(0, Math.abs(v) >= 100 ? 0 : 2).format(v)
}

/** اعداد لاتین برای محورهای نمودار (جلوگیری از به‌هم‌ریختگی تیک‌ها) */
export const tickNum = (v) => {
  if (!Number.isFinite(v)) return ''
  const abs = Math.abs(v)
  if (abs >= 1000) return `${(v / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`
  if (abs >= 1) return v.toFixed(abs >= 10 ? 1 : 2)
  if (abs >= 0.01) return v.toFixed(3)
  return v.toExponential(1)
}

export const timeFa = (ts) => new Date(ts).toLocaleTimeString('fa-IR', { hour12: false })
export const dateTimeFa = (ts) => new Date(ts).toLocaleString('fa-IR', { hour12: false })

export function toCsv(rows, headers) {
  const esc = (v) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [headers.map(esc).join(',')]
  for (const r of rows) lines.push(r.map(esc).join(','))
  return '﻿' + lines.join('\n') // BOM برای اکسل
}
