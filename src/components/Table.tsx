import { useMemo, useState } from 'react';
import { DEPTH_TIER_LABEL, MarketRow, QUALITY_LABEL, SPREAD_TIER_LABEL } from '../lib/analytics';
import { money, num, pct, priceFmt, timeAgo } from '../lib/format';

type SortKey =
  | 'symbol' | 'spreadPct' | 'takerPct' | 'entryCostPct' | 'roundTripTakerPct'
  | 'depthUsd' | 'score' | 'staleSec' | 'mid' | 'levels';

const COLS: { key: SortKey | ''; label: string; num?: boolean }[] = [
  { key: 'symbol', label: 'نماد' },
  { key: 'mid', label: 'قیمت میانه', num: true },
  { key: 'spreadPct', label: 'اسپرد', num: true },
  { key: '', label: 'سطح اسپرد' },
  { key: 'takerPct', label: 'کارمزد تیکر', num: true },
  { key: 'entryCostPct', label: 'هزینه ورود', num: true },
  { key: 'roundTripTakerPct', label: 'رفت‌وبرگشت تیکر', num: true },
  { key: 'depthUsd', label: 'عمق ۱۰ سطح', num: true },
  { key: 'levels', label: 'سطوح', num: true },
  { key: 'staleSec', label: 'تازگی', num: true },
  { key: '', label: 'کلاس اجرا' },
  { key: 'score', label: 'امتیاز اجرا', num: true },
];

export default function MarketTable({ rows }: { rows: MarketRow[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'entryCostPct', dir: 1 });
  const [q, setQ] = useState('');

  const maxCost = Math.max(...rows.map((r) => r.entryCostPct).filter(Number.isFinite), 1);
  const maxScore = Math.max(...rows.map((r) => r.score), 1);

  const data = useMemo(() => {
    const filtered = q
      ? rows.filter((r) => r.symbol.toLowerCase().includes(q.toLowerCase().replace(/\s/g, '')))
      : rows;
    return [...filtered].sort((a, b) => {
      const va = a[sort.key] as number | string;
      const vb = b[sort.key] as number | string;
      if (typeof va === 'string' || typeof vb === 'string')
        return String(va).localeCompare(String(vb)) * sort.dir;
      return ((va as number) - (vb as number)) * sort.dir;
    });
  }, [rows, sort, q]);

  const onSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: 1 }));

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h3>جدول نمادها</h3>
          <p className="hint">برای مرتب‌سازی روی عنوان ستون‌ها کلیک کنید. هزینه ورود = نیمی از اسپرد + کارمزد تیکر.</p>
        </div>
        <input
          type="search"
          placeholder="جستجوی نماد…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {COLS.map((c) => (
                <th
                  key={c.label}
                  className={c.num ? 'num' : ''}
                  onClick={() => c.key && onSort(c.key)}
                  style={{ cursor: c.key ? 'pointer' : 'default' }}
                >
                  {c.label}
                  {sort.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((r) => {
              const qm = QUALITY_LABEL[r.quality];
              return (
                <tr key={r.symbol}>
                  <td>
                    <span className="sym">
                      <b>{r.base}</b>
                      <span className="chip" style={{ color: r.fee.color, borderColor: r.fee.color }}>{r.fee.short}</span>
                      {r.quote}
                    </span>
                  </td>
                  <td className="num mono">{priceFmt(r.mid)}</td>
                  <td className="num mono">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                      {pct(r.spreadPct, 3)}
                      <span className="meter" style={{ width: 46 }}>
                        <i
                          style={{
                            width: `${Math.min(100, (r.spreadPct / maxCost) * 100)}%`,
                            background: r.spreadTier === 'TIGHT' ? '#22c55e' : r.spreadTier === 'NORMAL' ? '#38bdf8' : r.spreadTier === 'WIDE' ? '#eab308' : '#ef4444',
                          }}
                        />
                      </span>
                    </div>
                  </td>
                  <td><span className="chip">{SPREAD_TIER_LABEL[r.spreadTier]}</span></td>
                  <td className="num mono">{pct(r.takerPct)}</td>
                  <td className="num mono" style={{ color: r.entryCostPct > 1 ? '#ef4444' : r.entryCostPct > 0.4 ? '#eab308' : '#22c55e' }}>
                    {pct(r.entryCostPct, 3)}
                  </td>
                  <td className="num mono">{r.hasBook ? pct(r.roundTripTakerPct, 3) : '—'}</td>
                  <td className="num mono">
                    {r.depthUnit === 'USD' ? money(r.depthUsd) : <span className="muted" title="عمق به واحد ارز مقصد است و به دلار تبدیل نشد">{num(r.depthUsd, 0)} {r.quote}</span>}
                  </td>
                  <td className="num mono">{r.levels || '—'}</td>
                  <td className="num mono">{timeAgo(r.staleSec)}</td>
                  <td>
                    <span className="pill" style={{ background: qm.color }}>{qm.title}</span>
                    <div className="muted" style={{ fontSize: 10.5, marginTop: 3 }}>{DEPTH_TIER_LABEL[r.depthTier]}</div>
                  </td>
                  <td className="num mono">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                      <b>{r.score}</b>
                      <span className="meter" style={{ width: 40 }}>
                        <i style={{ width: `${(r.score / maxScore) * 100}%`, background: '#4f8cff' }} />
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!data.length && (
              <tr><td colSpan={COLS.length} className="muted" style={{ textAlign: 'center', padding: 24 }}>نمادی مطابق فیلترها پیدا نشد.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="hint" style={{ margin: '10px 0 0' }}>نمایش {num(data.length, 0)} از {num(rows.length, 0)} نماد</p>
    </div>
  );
}
