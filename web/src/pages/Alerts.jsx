import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtDateTime } from '../lib/format'
import { Empty, Pill } from '../components/Ui'

export default function Alerts() {
  const [rows, setRows] = useState([])
  const [showResolved, setShowResolved] = useState(false)

  const load = () => {
    let q = supabase.from('alerts')
      .select('*, clients(first_name,last_name), caregivers(first_name,last_name)')
      .order('created_at', { ascending: false }).limit(200)
    if (!showResolved) q = q.eq('resolved', false)
    q.then(({ data }) => setRows(data || []))
  }
  useEffect(load, [showResolved]) // eslint-disable-line

  const resolve = async (id) => {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('alerts').update({
      resolved: true, resolved_by: user.id, resolved_at: new Date().toISOString(),
    }).eq('id', id)
    load()
  }

  return (
    <>
      <div className="page-head">
        <div><h1 className="thread">Alerts</h1><div className="sub">Location mismatches, missed clock-ins, unfilled shifts — resolved here.</div></div>
        <label style={{ display: 'flex', gap: '.45rem', alignItems: 'center', fontSize: '.9rem' }}>
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
          Show resolved
        </label>
      </div>
      <div className="card">
        {rows.length === 0 ? <Empty icon="✓" title="All clear" hint="No alerts to review." /> : rows.map((a) => (
          <div className="alert-row" key={a.id}>
            <div className={`alert-dot sev-${a.severity}`} />
            <div style={{ flex: 1 }}>
              <b style={{ textTransform: 'capitalize' }}>{a.alert_type.replaceAll('_', ' ')}</b>
              {a.caregivers && <span className="muted"> · {a.caregivers.first_name} {a.caregivers.last_name}</span>}
              {a.clients && <span className="muted"> → {a.clients.first_name} {a.clients.last_name}</span>}
              <div style={{ fontSize: '.9rem' }}>{a.message}</div>
              <div className="muted" style={{ fontSize: '.76rem' }}>{fmtDateTime(a.created_at)}</div>
            </div>
            {a.resolved
              ? <Pill kind="ok">Resolved</Pill>
              : <button className="btn btn-outline" onClick={() => resolve(a.id)}>Resolve</button>}
          </div>
        ))}
      </div>
    </>
  )
}
