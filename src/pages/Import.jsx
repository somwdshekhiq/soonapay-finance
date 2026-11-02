import { supabase, useApp, useQuery, q, day, int } from '../lib.js'
import { Page, Card, Loading, Table } from '../ui.jsx'

async function load() {
  const provs = await q(supabase.from('providers').select('provider_id, name, status').order('name'))
  const last = await Promise.all(provs.map((p) =>
    q(supabase.from('transactions').select('txn_time').eq('provider_id', p.provider_id).order('txn_time', { ascending: false }).limit(1))
      .then((rows) => ({ ...p, last: rows[0]?.txn_time }))))
  const batches = await q(supabase.from('import_batches').select('*').order('imported_at', { ascending: false }).limit(10))
  return { provs: last, batches }
}

export default function ImportPage() {
  const { t, lang } = useApp()
  const r = useQuery(load)
  const d = r.data
  return (
    <Page title={t('importFiles')}>
      <div className="ok">{t('importSoon')}</div>
      <Loading q={r}>{d && <>
        <Card title={t('provider')}>
          <Table cols={[
            { k: 'name', h: t('provider') },
            { k: 'status', h: t('status'), f: (x) => x.status },
            { k: 'last', h: t('date'), num: 1, f: (x) => day(x.last, lang) }
          ]} rows={d.provs.map((p) => ({ ...p, key: p.provider_id }))} />
        </Card>
        <Card title={t('importFiles')}>
          <Table cols={[
            { k: 'f', h: 'File', f: (x) => x.file_name },
            { k: 'd', h: t('date'), num: 1, f: (x) => day(x.imported_at, lang) },
            { k: 'n', h: t('transactions'), r: 1, num: 1, f: (x) => int(x.rows_inserted) }
          ]} rows={d.batches.map((b) => ({ ...b, key: b.batch_id }))} />
        </Card>
      </>}</Loading>
    </Page>
  )
}
