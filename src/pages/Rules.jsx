import { supabase, useApp, useQuery, q, usd, day, n } from '../lib.js'
import { Page, Card, Loading, Table, Pill } from '../ui.jsx'

async function load() {
  const [rules, unc, provs, types] = await Promise.all([
    q(supabase.from('profit_rules').select('*, providers(name), txn_types(name), payment_methods(name)').order('provider_id')),
    q(supabase.from('v_unclassified').select('*').limit(100)),
    q(supabase.from('providers').select('provider_id, name')),
    q(supabase.from('txn_types').select('txn_type_id, name'))
  ])
  return { rules, unc, provs, types }
}

const pc = (v) => (n(v) ? (n(v) * 100).toFixed(2).replace(/\.?0+$/, '') + '%' : '—')
const money = (v) => (n(v) ? usd(v) : '—')

export default function Rules() {
  const { t, lang } = useApp()
  const r = useQuery(load)
  const d = r.data
  const open = (x) => new Date(x.valid_to).getFullYear() >= 2999
  return (
    <Page title={t('feeRules')}>
      <Loading q={r}>{d && <>
        <Card title={t('feeRules')}>
          <div className="xs muted num">profit = fixed profit + profit % × amount − fixed cost − cost % × amount − extra cost</div>
          <Table cols={[
            { k: 'p', h: t('provider'), f: (x) => x.providers?.name },
            { k: 'ty', h: t('txnType'), f: (x) => x.txn_types?.name },
            { k: 'm', h: t('method'), f: (x) => x.payment_methods?.name || '—' },
            { k: 'fp', h: t('fixedProfit'), r: 1, num: 1, f: (x) => money(x.fixed_profit) },
            { k: 'pp', h: t('profitPct'), r: 1, num: 1, f: (x) => pc(x.pct_profit) },
            { k: 'fc', h: t('fixedCost'), r: 1, num: 1, f: (x) => money(x.fixed_cost) },
            { k: 'cp', h: t('costPct'), r: 1, num: 1, f: (x) => pc(x.pct_cost) },
            { k: 'xc', h: t('extraCost'), r: 1, num: 1, f: (x) => money(x.extra_cost) },
            { k: 'vf', h: t('validFrom'), num: 1, f: (x) => day(x.valid_from, lang) },
            { k: 'vt', h: t('validTo'), f: (x) => (open(x) ? <Pill tone="good">{t('open')}</Pill> : <Pill>{day(x.valid_to, lang)}</Pill>) }
          ]} rows={d.rules.map((x) => ({ ...x, key: x.rule_id }))} empty={t('loading') && '—'} />
        </Card>
        <Card title={`${t('needsAttention')} · ${d.unc.length}`}>
          <Table cols={[
            { k: 'p', h: t('provider'), f: (x) => d.provs.find((p) => p.provider_id === x.provider_id)?.name },
            { k: 'd', h: t('date'), num: 1, f: (x) => day(x.txn_time, lang) },
            { k: 'desc', h: t('description'), f: (x) => x.raw_description || x.raw_type },
            { k: 'a', h: t('amount'), r: 1, num: 1, f: (x) => usd(x.amount_usd) },
            { k: 'ty', h: t('txnType'), f: (x) => d.types.find((y) => y.txn_type_id === x.txn_type_id)?.name || <Pill tone="warn">?</Pill> }
          ]} rows={d.unc.map((x) => ({ ...x, key: x.txn_id }))} />
        </Card>
      </>}</Loading>
    </Page>
  )
}
