import React, { useMemo, useState } from 'react'

export default function DataTable({
  columns,
  rows,
  searchKeys = [],
  initialSort = null,
  initialDir = 'asc',
  placeholder = 'جستجو…',
  maxHeight = 600,
  showSearch = true,
}) {
  const [sortKey, setSortKey] = useState(initialSort || columns[0]?.key)
  const [dir, setDir] = useState(initialDir)
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    if (!q || !searchKeys.length) return rows
    const needle = q.trim().toLowerCase()
    return rows.filter((r) => searchKeys.some((k) => String(r[k] ?? '').toLowerCase().includes(needle)))
  }, [rows, q, searchKeys])

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey)
    if (!col) return filtered
    const val = (r) => {
      const v = col.sortValue ? col.sortValue(r) : r[col.key]
      return typeof v === 'number' ? v : Number(v)
    }
    const arr = [...filtered].sort((a, b) => {
      const va = val(a),
        vb = val(b)
      const na = Number.isFinite(va),
        nb = Number.isFinite(vb)
      if (na && nb) return dir === 'asc' ? va - vb : vb - va
      const sa = String(va ?? ''),
        sb = String(vb ?? '')
      return dir === 'asc' ? sa.localeCompare(sb, 'fa') : sb.localeCompare(sa, 'fa')
    })
    return arr
  }, [filtered, sortKey, dir, columns])

  const toggle = (key) => {
    if (key === sortKey) setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setDir('asc')
    }
  }

  return (
    <div>
      {showSearch && (
        <div className="inline" style={{ marginBottom: 8 }}>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder}
            style={{ minWidth: 220 }}
          />
          <span className="small">{filtered.length.toLocaleString('fa-IR')} ردیف</span>
        </div>
      )}
      <div className="table-wrap" style={{ maxHeight }}>
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  onClick={() => toggle(c.key)}
                  className={c.num ? 'num' : ''}
                  title={c.hint || ''}
                >
                  {c.label}
                  <span className="sort-ind">{sortKey === c.key ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={r.__key || i}>
                {columns.map((c) => (
                  <td key={c.key} className={c.num ? 'num' : ''}>
                    {c.render ? c.render(r, i) : String(r[c.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
            {!sorted.length && (
              <tr>
                <td colSpan={columns.length} style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>
                  داده‌ای برای نمایش نیست
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
