export const pct = (v: number, d = 2) => (Number.isFinite(v) ? `${v.toFixed(d)}٪` : '—');
export const num = (v: number, d = 2) =>
  Number.isFinite(v)
    ? v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
    : '—';

export function money(v: number, currency: 'IRT' | 'USDT' = 'USDT') {
  if (!Number.isFinite(v)) return '—';
  if (currency === 'IRT') {
    if (v >= 1e9) return `${(v / 1e9).toFixed(2)} میلیارد ریال`;
    if (v >= 1e6) return `${(v / 1e6).toFixed(1)} میلیون ریال`;
    return `${num(v, 0)} ریال`;
  }
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M $`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K $`;
  return `${num(v, 0)} $`;
}

export const priceFmt = (v: number) => {
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e6) return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (abs >= 1) return num(v, 2);
  return num(v, 6);
};

export const timeAgo = (sec: number) => {
  if (!Number.isFinite(sec)) return '—';
  if (sec < 1) return 'همین حالا';
  if (sec < 60) return `${Math.round(sec)} ثانیه پیش`;
  if (sec < 3600) return `${Math.round(sec / 60)} دقیقه پیش`;
  return `${(sec / 3600).toFixed(1)} ساعت پیش`;
};
