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
