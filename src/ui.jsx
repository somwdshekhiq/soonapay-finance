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

// Bar chart with the value printed above each column
export function Bars({ items, height = 180, aria }) {
  const max = Math.max(1, ...items.flatMap((i) => i.values.map(Math.abs)))
  const room = height - 24
  return (
    <div>
      <div className="bars" style={{ height }} role="img" aria-label={aria}>
        {items.map((it, i) => (
          <div key={i} className="bar-col" title={it.title}>
            {it.top && <div className="bar-top num">{it.top}</div>}
            <div className="bar-group">
              {it.values.map((v, j) => (
                <div key={j} className="bar" style={{ height: Math.max(2, (Math.abs(v) / max) * room), background: it.colors[j] }} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="bar-labels">{items.map((it, i) => <div key={i}>{it.label}</div>)}</div>
    </div>
  )
}

export const AdminOnly = ({ children }) => {
  const { role } = useApp()
  return role === 'admin' ? children : null
}

// Daily bars with a moving-average trend line (SVG, scales to the card width)
export function Trend({ items, height = 200, aria, color = '#9C86F0', line = '#4318C4', fmt = (v) => v }) {
  const W = 640, H = height, pad = 18
  const max = Math.max(1, ...items.map((i) => Math.max(i.v, i.avg ?? 0)))
  const bw = W / Math.max(items.length, 1)
  const y = (v) => H - pad - (Math.max(v, 0) / max) * (H - pad * 2)
  const pts = items.map((it, i) => (it.avg === null || it.avg === undefined ? null : `${(i + 0.5) * bw},${y(it.avg)}`)).filter(Boolean).join(' ')
  const step = Math.max(1, Math.ceil(items.length / 10))
  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} width="100%" role="img" aria-label={aria} style={{ display: 'block' }}>
      <line x1="0" x2={W} y1={H - pad} y2={H - pad} stroke="var(--line)" />
      {items.map((it, i) => (
        <rect key={i} x={i * bw + bw * 0.15} width={bw * 0.7} y={y(it.v)} height={Math.max(1, H - pad - y(it.v))} rx="2" fill={color}>
          <title>{`${it.label}: ${fmt(it.v)}${it.avg !== null && it.avg !== undefined ? ' · 7d ' + fmt(it.avg) : ''}`}</title>
        </rect>
      ))}
      {pts && <polyline points={pts} fill="none" stroke={line} strokeWidth="2.5" strokeLinejoin="round" />}
      {items.map((it, i) => (i % step === 0 ? <text key={'l' + i} x={(i + 0.5) * bw} y={H + 12} fontSize="12" textAnchor="middle" fill="var(--muted)">{it.label}</text> : null))}
    </svg>
  )
}
