import { useState } from 'react'

interface Row { site: string; tls: number; digiher: number }

/** Grouped bars: laser-scan RMSE vs. DigiHeR RMSE per site (paper Table 3). */
export function RmseChart({ rows }: { rows: Row[] }) {
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null)
  const W = 520, H = 240, L = 44, B = 36, T = 16
  const max = 7
  const plotH = H - B - T
  const groupW = (W - L - 16) / rows.length
  const barW = 34
  const y = (v: number) => T + plotH - (v / max) * plotH
  const ticks = [0, 2, 4, 6]
  return (
    <figure className="chart">
      <figcaption className="legend">
        <span><i style={{ background: 'var(--series-1)' }} />Laser scan (TLS)</span>
        <span><i style={{ background: 'var(--series-2)' }} />DigiHeR</span>
      </figcaption>
      <div className="chart-wrap" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Reconstruction error in millimetres by site">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={L} x2={W - 8} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
              <text x={L - 8} y={y(t) + 4} textAnchor="end" className="axis">{t}</text>
            </g>
          ))}
          <text x={8} y={T + 4} className="axis">mm</text>
          {rows.map((r, i) => {
            const gx = L + 16 + i * groupW + groupW / 2 - barW - 1
            const bars = [
              { v: r.tls, x: gx, c: 'var(--series-1)', name: 'Laser scan' },
              { v: r.digiher, x: gx + barW + 2, c: 'var(--series-2)', name: 'DigiHeR' },
            ]
            return (
              <g key={r.site}>
                {bars.map((b) => {
                  const top = y(b.v)
                  return (
                    <g key={b.name}>
                      <path
                        d={`M${b.x},${y(0)} V${top + 4} q0,-4 4,-4 h${barW - 8} q4,0 4,4 V${y(0)} Z`}
                        fill={b.c}
                      />
                      <text x={b.x + barW / 2} y={top - 6} textAnchor="middle" className="val">{b.v}</text>
                      <rect
                        x={b.x - 3} y={T} width={barW + 6} height={plotH} fill="transparent"
                        onMouseMove={() => setHover({ x: b.x + barW / 2, y: top, text: `${r.site}: ${b.name} ${b.v} mm` })}
                      />
                    </g>
                  )
                })}
                <text x={gx + barW + 1} y={H - 12} textAnchor="middle" className="axis-label">{r.site}</text>
              </g>
            )
          })}
          <line x1={L} x2={W - 8} y1={y(0)} y2={y(0)} stroke="var(--ink-3)" />
        </svg>
        {hover && (
          <div className="tip" style={{ left: `${(hover.x / W) * 100}%`, top: `${(hover.y / H) * 100}%` }}>{hover.text}</div>
        )}
      </div>
    </figure>
  )
}
