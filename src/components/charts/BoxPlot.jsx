import React, { useEffect, useMemo, useRef, useState } from 'react'

function useWidth() {
  const ref = useRef(null)
  const [w, setW] = useState(640)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width
      if (width) setW(width)
    })
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

/**
 * نمودار جعبه‌ای (Box Plot) دست‌ساز
 * groups: [{key, n, p25, median, p75, min, max, mean, values:[] }]
 */
export default function BoxPlot({ groups, height = 300, logScale = false, color = '#38bdf8', format = (v) => v.toFixed(2), unit = '٪' }) {
  const [ref, width] = useWidth()
  const pad = { top: 14, right: 18, bottom: 56, left: 62 }

  const model = useMemo(() => {
    const gs = groups.map((g) => {
      const vals = (g.values || []).filter(Number.isFinite).sort((a, b) => a - b)
      const iqr = g.p75 - g.p25
      let lo = g.min,
        hi = g.max
      if (vals.length) {
        const lowerFence = g.p25 - 1.5 * iqr
        const upperFence = g.p75 + 1.5 * iqr
        const inside = vals.filter((v) => v >= lowerFence && v <= upperFence)
        lo = inside.length ? inside[0] : g.p25
        hi = inside.length ? inside[inside.length - 1] : g.p75
      }
      return { ...g, lo, hi, vals }
    })
    const all = []
    gs.forEach((g) => {
      all.push(g.lo, g.hi)
      if (g.outlierVals?.length) all.push(...g.outlierVals.slice(0, 30))
    })
    const finite = all.filter(Number.isFinite)
    if (!finite.length) return { gs, min: 0, max: 1, t: (v) => v, empty: true }
    const rawMin = Math.min(...finite, 0)
    const rawMax = Math.max(...finite)
    const t = (v) => (logScale ? Math.log10(Math.max(v, 1e-6)) : v)
    const min = t(Math.max(rawMin, logScale ? 1e-4 : rawMin))
    const max = t(rawMax * 1.02 || 1)
    return { gs, min, max, t }
  }, [groups, logScale])

  const innerW = Math.max(width - pad.left - pad.right, 120)
  const innerH = height - pad.top - pad.bottom
  const y = (v) => {
    const tv = model.t(v)
    const r = (tv - model.min) / (model.max - model.min || 1)
    return pad.top + innerH * (1 - r)
  }

  const ticks = useMemo(() => {
    const n = 5
    const out = []
    for (let i = 0; i <= n; i++) {
      const tv = model.min + ((model.max - model.min) * i) / n
      out.push(logScale ? 10 ** tv : tv)
    }
    return out
  }, [model, logScale])

  const band = innerW / Math.max(model.gs.length, 1)
  const boxW = Math.min(58, band * 0.55)

  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg width={width} height={height} style={{ display: 'block' }}>
        {/* grid */}
        {ticks.map((tv, i) => (
          <g key={i}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={y(tv)}
              y2={y(tv)}
              stroke="rgba(148,163,184,.14)"
              strokeDasharray="3 4"
            />
            <text x={pad.left - 8} y={y(tv) + 4} textAnchor="end" fill="#94a3b8" fontSize="10.5">
              {format(tv)}
            </text>
          </g>
        ))}

        {model.gs.map((g, i) => {
          const cx = pad.left + band * i + band / 2
          const yMed = y(g.median)
          const yQ1 = y(g.p25)
          const yQ3 = y(g.p75)
          const yLo = y(g.lo)
          const yHi = y(g.hi)
          return (
            <g key={g.key}>
              <line x1={cx} x2={cx} y1={yHi} y2={yQ3} stroke="#64748b" strokeWidth="1.2" />
              <line x1={cx} x2={cx} y1={yQ1} y2={yLo} stroke="#64748b" strokeWidth="1.2" />
              <line x1={cx - boxW * 0.28} x2={cx + boxW * 0.28} y1={yHi} y2={yHi} stroke="#94a3b8" strokeWidth="1.4" />
              <line x1={cx - boxW * 0.28} x2={cx + boxW * 0.28} y1={yLo} y2={yLo} stroke="#94a3b8" strokeWidth="1.4" />
              <rect
                x={cx - boxW / 2}
                y={Math.min(yQ1, yQ3)}
                width={boxW}
                height={Math.max(Math.abs(yQ3 - yQ1), 2)}
                fill={`${color}33`}
                stroke={color}
                strokeWidth="1.3"
                rx="3"
              />
              <line x1={cx - boxW / 2} x2={cx + boxW / 2} y1={yMed} y2={yMed} stroke="#f8fafc" strokeWidth="2" />
              {Number.isFinite(g.mean) && (
                <circle cx={cx} cy={y(g.mean)} r="2.6" fill="none" stroke="#fcd34d" strokeWidth="1.6" />
              )}
              <text x={cx} y={height - pad.bottom + 16} textAnchor="middle" fill="#cbd5e1" fontSize="11">
                {g.key}
              </text>
              <text x={cx} y={height - pad.bottom + 30} textAnchor="middle" fill="#64748b" fontSize="10">
                n={g.n}
              </text>
            </g>
          )
        })}
        <text x={pad.left - 8} y={pad.top - 2} textAnchor="end" fill="#94a3b8" fontSize="10">
          {unit}
        </text>
      </svg>
    </div>
  )
}
