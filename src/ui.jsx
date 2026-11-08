import { useApp } from './lib.js'

export const Page = ({ title, sub, actions, children }) => (
  <main className="page">
    <div className="page-head">
      <div>{sub && <div className="muted small">{sub}</div>}<h1>{title}</h1></div>
      {actions && <div className="row gap8 wrap">{actions}</div>}
    </div>
    {children}
  </main>
)

export const Card = ({ title, right, children, className = '', style }) => (
  <section className={'card ' + className} style={style}>
    {(title || right) && <div className="card-head">{title && <h2>{title}</h2>}{right}</div>}
    {children}
  </section>
)

export const Kpi = ({ label, value, note, tone }) => (
  <div className={'kpi ' + (tone || '')}>
    <div className="small muted">{label}</div>
    <div className="num kpi-v">{value}</div>
    {note && <div className="xs muted">{note}</div>}
  </div>
)

export const Pill = ({ tone = 'grey', children }) => <span className={'pill ' + tone}>{children}</span>

export function Table({ cols, rows, empty = '—', rowStyle }) {
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr>{cols.map((c) => <th key={c.k} className={c.r ? 'r' : ''}>{c.h}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={cols.length} className="muted">{empty}</td></tr>}
          {rows.map((row, i) => (
            <tr key={row.key ?? i} style={rowStyle ? rowStyle(row) : undefined}>
              {cols.map((c) => <td key={c.k} className={(c.r ? 'r ' : '') + (c.num ? 'num' : '')}>{c.f ? c.f(row) : row[c.k]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Loading({ q, children }) {
  const { t } = useApp()
  if (q.loading && !q.data) return <div className="muted pad">{t('loading')}</div>
  if (q.error) return <div className="alert">{t('error')}: {q.error}</div>
  return children
}

// Bar chart: a value above each bar (it.tops, one per bar) or one label above the group (it.top); it.sub = second label line
export function Bars({ items, height = 180, aria }) {
  const max = Math.max(1, ...items.flatMap((i) => i.values.map(Math.abs)))
  const vertical = items.length > 12 && items.some((i) => i.tops)
  const room = height - (vertical ? 44 : 30)
  return (
    <div>
      <div className="bars" style={{ height }} role="img" aria-label={aria}>
        {items.map((it, i) => (
          <div key={i} className="bar-col" title={it.title}>
            {it.top && !it.tops && <div className="bar-top num">{it.top}</div>}
            <div className="bar-group">
              {it.values.map((v, j) => (
                <div key={j} style={{ flex: '1 1 0', maxWidth: 30, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', minWidth: 0 }}>
                  {it.tops && <div className="bar-top num" style={{ marginBottom: 2, ...(vertical ? { writingMode: 'vertical-rl', transform: 'rotate(180deg)' } : {}) }}>{it.tops[j]}</div>}
                  <div className="bar" style={{ flex: 'none', width: '100%', maxWidth: 30, height: Math.max(2, (Math.abs(v) / max) * room), background: it.colors[j] }} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="bar-labels">{items.map((it, i) => <div key={i}>{it.label}{it.sub !== undefined && <div className="num" style={{ color: 'var(--ink)', marginTop: 2 }}>{it.sub}</div>}</div>)}</div>
    </div>
  )
}

export const AdminOnly = ({ children }) => {
  const { role } = useApp()
  return role === 'admin' ? children : null
}

// Daily bars with a moving-average trend line and the value on each bar; negative days go below the zero line
const short = (v) => (Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + 'k' : Math.round(v).toString())
export function Trend({ items, height = 230, aria, color = '#9C86F0', neg = '#E8833A', line = '#4318C4', fmt = (v) => v }) {
  const W = 1000, H = height, vertical = items.length > 24, room = vertical ? 34 : 18
  const vals = items.flatMap((i) => [i.v, i.avg ?? 0])
  const max = Math.max(0, ...vals), min = Math.min(0, ...vals)
  const span = Math.max(1, max - min)
  const topRoom = room, botRoom = min < 0 ? room : 0
  const scale = (H - topRoom - botRoom) / span
  const zero = topRoom + max * scale            // y of the zero line (px from top)
  const y = (v) => zero - v * scale
  const bw = W / Math.max(items.length, 1)
  const pts = items.map((it, i) => (it.avg === null || it.avg === undefined ? null : `${(i + 0.5) * bw},${y(it.avg)}`)).filter(Boolean).join(' ')
  const step = Math.max(1, Math.ceil(items.length / 8))
  return (
    <div>
      <div style={{ position: 'relative', height: H, borderBottom: '1px solid var(--line)' }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img" aria-label={aria} style={{ display: 'block' }}>
          {items.map((it, i) => {
            const top = it.v >= 0 ? y(it.v) : zero
            return (
              <rect key={i} x={i * bw + bw * 0.15} width={bw * 0.7} y={top} height={Math.max(1, Math.abs(it.v) * scale)} fill={it.v < 0 ? neg : color}>
                <title>{`${it.label}: ${fmt(it.v)}${it.avg !== null && it.avg !== undefined ? ' · 7d ' + fmt(it.avg) : ''}`}</title>
              </rect>
            )
          })}
          {min < 0 && <line x1="0" x2={W} y1={zero} y2={zero} stroke="var(--muted)" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
          {pts && <polyline points={pts} fill="none" stroke={line} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
        </svg>
        {items.map((it, i) => {
          const pos = it.v >= 0 ? { bottom: H - y(it.v) + 3 } : { top: y(it.v) + 3 }
          return (
            <span key={'v' + i} className="num" aria-hidden="true" style={{ position: 'absolute', left: `${((i + 0.5) / items.length) * 100}%`, ...pos,
              transform: vertical ? 'translateX(-50%) rotate(180deg)' : 'translateX(-50%)', writingMode: vertical ? 'vertical-rl' : undefined,
              fontSize: 10, lineHeight: 1, color: it.v < 0 ? 'var(--warn)' : 'var(--muted)', whiteSpace: 'nowrap', pointerEvents: 'none' }}>{short(it.v)}</span>
          )
        })}
      </div>
      <div style={{ position: 'relative', height: 18, marginTop: 4 }}>
        {items.map((it, i) => (i % step === 0 ? <span key={i} className="xs muted" style={{ position: 'absolute', left: `${((i + 0.5) / items.length) * 100}%`, transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}>{it.label}</span> : null))}
      </div>
    </div>
  )
}
