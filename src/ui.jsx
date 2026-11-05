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

// Daily bars with a moving-average trend line and the value above each bar
const short = (v) => (Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + 'k' : Math.round(v).toString())
export function Trend({ items, height = 230, aria, color = '#9C86F0', line = '#4318C4', fmt = (v) => v }) {
  const W = 1000, H = height, top = items.length > 24 ? 34 : 18
  const max = Math.max(1, ...items.map((i) => Math.max(i.v, i.avg ?? 0)))
  const bw = W / Math.max(items.length, 1)
  const hOf = (v) => (Math.max(v, 0) / max) * (H - top)
  const y = (v) => H - hOf(v)
  const pts = items.map((it, i) => (it.avg === null || it.avg === undefined ? null : `${(i + 0.5) * bw},${y(it.avg)}`)).filter(Boolean).join(' ')
  const step = Math.max(1, Math.ceil(items.length / 8))
  const vertical = items.length > 24
  return (
    <div>
      <div style={{ position: 'relative', height: H }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img" aria-label={aria} style={{ display: 'block', borderBottom: '1px solid var(--line)' }}>
          {items.map((it, i) => (
            <rect key={i} x={i * bw + bw * 0.15} width={bw * 0.7} y={y(it.v)} height={Math.max(1, hOf(it.v))} fill={color}>
              <title>{`${it.label}: ${fmt(it.v)}${it.avg !== null && it.avg !== undefined ? ' · 7d ' + fmt(it.avg) : ''}`}</title>
            </rect>
          ))}
          {pts && <polyline points={pts} fill="none" stroke={line} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
        </svg>
        {items.map((it, i) => (
          <span key={'v' + i} className="num" aria-hidden="true" style={{ position: 'absolute', left: `${((i + 0.5) / items.length) * 100}%`, bottom: hOf(it.v) + 3,
            transform: vertical ? 'translateX(-50%) rotate(180deg)' : 'translateX(-50%)', writingMode: vertical ? 'vertical-rl' : undefined,
            fontSize: 10, lineHeight: 1, color: 'var(--muted)', whiteSpace: 'nowrap', pointerEvents: 'none' }}>{short(it.v)}</span>
        ))}
      </div>
      <div style={{ position: 'relative', height: 18, marginTop: 4 }}>
        {items.map((it, i) => (i % step === 0 ? <span key={i} className="xs muted" style={{ position: 'absolute', left: `${((i + 0.5) / items.length) * 100}%`, transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}>{it.label}</span> : null))}
      </div>
    </div>
  )
}
