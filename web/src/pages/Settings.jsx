import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Field } from '../components/Ui'

export default function Settings() {
  const [s, setS] = useState(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    supabase.from('app_settings').select('*').eq('id', 1).single().then(({ data }) => setS(data))
  }, [])

  const save = async () => {
    const { error } = await supabase.from('app_settings').update({
      agency_name: s.agency_name, agency_phone: s.agency_phone, agency_email: s.agency_email,
      invoice_prefix: s.invoice_prefix, default_geofence_m: s.default_geofence_m, gps_required: s.gps_required,
    }).eq('id', 1)
    setMsg(error ? error.message : 'Settings saved.')
    setTimeout(() => setMsg(''), 3000)
  }

  if (!s) return <p className="muted">Loading settings…</p>
  const set = (k) => (e) => setS({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  return (
    <>
      <div className="page-head">
        <div><h1 className="thread">Settings</h1><div className="sub">Agency details, clock-in rules, and integrations.</div></div>
      </div>
      {msg && <p className="notice notice-ok mb">{msg}</p>}

      <div className="grid grid-2">
        <div className="card card-pad">
          <h2 className="thread">Agency</h2>
          <Field label="Agency name"><input value={s.agency_name} onChange={set('agency_name')} /></Field>
          <div className="form-row">
            <Field label="Phone"><input value={s.agency_phone || ''} onChange={set('agency_phone')} /></Field>
            <Field label="Email"><input value={s.agency_email || ''} onChange={set('agency_email')} /></Field>
          </div>
          <div className="form-row">
            <Field label="Invoice prefix"><input value={s.invoice_prefix} onChange={set('invoice_prefix')} /></Field>
            <Field label="Default geofence (meters)"><input type="number" value={s.default_geofence_m} onChange={set('default_geofence_m')} /></Field>
          </div>
          <label style={{ display: 'flex', gap: '.5rem', alignItems: 'center', fontSize: '.92rem', marginBottom: '1rem' }}>
            <input type="checkbox" checked={s.gps_required} onChange={set('gps_required')} />
            Require GPS at clock-in (Care App)
          </label>
          <button className="btn btn-primary" onClick={save}>Save settings</button>
        </div>

        <div className="card card-pad">
          <h2 className="thread">QuickBooks</h2>
          <p className="muted" style={{ fontSize: '.92rem' }}>
            This is where QuickBooks Online will connect (Phase 2). Once connected, verified invoices sync
            automatically as accounts receivable and verified hours flow to payroll — no retyping.
          </p>
          <p>
            Status: <b>{s.qb_connected ? `Connected — ${s.qb_company_name}` : 'Not connected'}</b>
          </p>
          <button className="btn btn-outline" disabled title="Coming in Phase 2">
            Connect to QuickBooks Online
          </button>
          <p className="muted" style={{ fontSize: '.8rem', marginTop: '.8rem' }}>
            Requires an Intuit developer app (OAuth). Until then, use the payroll CSV export on the
            Verified Hours page.
          </p>
        </div>
      </div>
    </>
  )
}
