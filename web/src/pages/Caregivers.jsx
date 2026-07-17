import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fullName, WEEKDAYS } from '../lib/format'
import { Modal, Field, Empty, Pill } from '../components/Ui'
import EditableSelect from '../components/EditableSelect'

export default function Caregivers() {
  const [rows, setRows] = useState([])
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [selected, setSelected] = useState(null)

  const load = () =>
    supabase.from('caregivers').select('*').order('last_name').then(({ data }) => setRows(data || []))
  useEffect(() => { load() }, [])

  const filtered = rows.filter((r) => fullName(r).toLowerCase().includes(q.toLowerCase()))

  return (
    <>
      <div className="page-head">
        <div><h1 className="thread">Caregivers</h1><div className="sub">Your team, their availability, rates, and credentials.</div></div>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>+ Register caregiver</button>
      </div>
      <div className="toolbar mb">
        <input className="searchbox" placeholder="Search caregivers…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="card">
        {filtered.length === 0 ? <Empty title="No caregivers yet" hint="Register your first caregiver to start scheduling." /> : (
          <table className="data">
            <thead><tr><th>Caregiver</th><th>Phone</th><th>Type</th><th className="num">Pay rate</th><th className="num">Mileage</th><th>App account</th><th>Status</th></tr></thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="click" onClick={() => setSelected(r)}>
                  <td><b>{fullName(r)}</b></td>
                  <td>{r.phone || '—'}</td>
                  <td>{r.caregiver_kind === 'live_in' ? <Pill kind="gold">Live-in</Pill> : <Pill kind="info">Hourly</Pill>}</td>
                  <td className="num">{r.hourly_rate ? `$${Number(r.hourly_rate).toFixed(2)}/h` : '—'}</td>
                  <td className="num">{r.mileage_rate ? `$${Number(r.mileage_rate).toFixed(2)}/mi` : '—'}</td>
                  <td>{r.profile_id ? <Pill kind="ok">Linked</Pill> : <Pill kind="muted">Not linked</Pill>}</td>
                  <td>{r.is_active ? <Pill kind="ok">Active</Pill> : <Pill kind="muted">Inactive</Pill>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {adding && <CaregiverModal onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load() }} />}
      {selected && <CaregiverDetail caregiver={selected} onClose={() => { setSelected(null); load() }} />}
    </>
  )
}

function CaregiverModal({ caregiver, onClose, onSaved }) {
  const isNew = !caregiver
  const [f, setF] = useState(caregiver || {
    first_name: '', last_name: '', phone: '', email: '', address: '',
    caregiver_kind: 'hourly', hourly_rate: '', mileage_rate: '', notes: '', is_active: true,
    employee_id: '', emergency_contact_name: '', emergency_contact_phone: '',
    employment_type: '', overtime_rate: '', payroll_id: '', max_hours_per_week: '',
  })
  const [skillIds, setSkillIds] = useState([])
  const [restrictionIds, setRestrictionIds] = useState([])
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  useEffect(() => {
    if (!isNew) {
      supabase.from('caregiver_skills').select('skill_id').eq('caregiver_id', caregiver.id)
        .then(({ data }) => setSkillIds((data || []).map((r) => r.skill_id)))
      supabase.from('caregiver_restrictions').select('restriction_id').eq('caregiver_id', caregiver.id)
        .then(({ data }) => setRestrictionIds((data || []).map((r) => r.restriction_id)))
    }
  }, [caregiver?.id]) // eslint-disable-line

  const save = async () => {
    setErr('')
    if (!f.first_name || !f.last_name) return setErr('First and last name are required.')
    const row = { ...f,
      hourly_rate: f.hourly_rate === '' ? null : f.hourly_rate,
      mileage_rate: f.mileage_rate === '' ? null : f.mileage_rate,
      overtime_rate: f.overtime_rate === '' ? null : f.overtime_rate,
      max_hours_per_week: f.max_hours_per_week === '' ? null : f.max_hours_per_week,
      employment_type: f.employment_type || null,
    }
    delete row.id; delete row.created_at; delete row.credentials; delete row.profile_id; delete row.hire_date
    const q = isNew
      ? supabase.from('caregivers').insert(row).select().single()
      : supabase.from('caregivers').update(row).eq('id', caregiver.id).select().single()
    const { data: saved, error } = await q
    if (error) return setErr(error.message)
    const cid = saved.id
    await supabase.from('caregiver_skills').delete().eq('caregiver_id', cid)
    if (skillIds.length) await supabase.from('caregiver_skills').insert(skillIds.map((s) => ({ caregiver_id: cid, skill_id: s })))
    await supabase.from('caregiver_restrictions').delete().eq('caregiver_id', cid)
    if (restrictionIds.length) await supabase.from('caregiver_restrictions').insert(restrictionIds.map((r) => ({ caregiver_id: cid, restriction_id: r })))
    onSaved()
  }

  return (
    <Modal title={isNew ? 'Register caregiver' : 'Edit caregiver'} onClose={onClose} footer={
      <><button className="btn btn-quiet" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save}>Save caregiver</button></>
    }>
      {err && <p className="notice notice-bad">{err}</p>}
      <div className="form-row">
        <Field label="First name"><input value={f.first_name} onChange={set('first_name')} /></Field>
        <Field label="Last name"><input value={f.last_name} onChange={set('last_name')} /></Field>
      </div>
      <div className="form-row">
        <Field label="Phone"><input value={f.phone || ''} onChange={set('phone')} /></Field>
        <Field label="Email" help="Used to link their Care App login."><input type="email" value={f.email || ''} onChange={set('email')} /></Field>
      </div>
      <div className="form-row-3">
        <Field label="Type">
          <select value={f.caregiver_kind} onChange={set('caregiver_kind')}>
            <option value="hourly">Hourly</option>
            <option value="live_in">Live-in</option>
          </select>
        </Field>
        <Field label="Pay rate ($/h)"><input type="number" step="0.01" value={f.hourly_rate ?? ''} onChange={set('hourly_rate')} /></Field>
        <Field label="Mileage ($/mi)" help="Leave blank if not reimbursed."><input type="number" step="0.01" value={f.mileage_rate ?? ''} onChange={set('mileage_rate')} /></Field>
      </div>
      <Field label="Notes"><textarea rows={2} value={f.notes || ''} onChange={set('notes')} /></Field>

      <h3 className="thread mt">Identity & payroll</h3>
      <div className="form-row-3">
        <Field label="Employee ID"><input value={f.employee_id || ''} onChange={set('employee_id')} /></Field>
        <Field label="Employment type">
          <select value={f.employment_type || ''} onChange={set('employment_type')}>
            <option value="">Select…</option>
            <option value="W2">W-2 employee</option>
            <option value="1099">1099 contractor</option>
          </select>
        </Field>
        <Field label="Payroll ID"><input value={f.payroll_id || ''} onChange={set('payroll_id')} /></Field>
      </div>
      <div className="form-row-3">
        <Field label="Home address"><input value={f.address || ''} onChange={set('address')} /></Field>
        <Field label="Overtime rate ($/h)"><input type="number" step="0.01" value={f.overtime_rate ?? ''} onChange={set('overtime_rate')} /></Field>
        <Field label="Max hours/week"><input type="number" step="0.5" value={f.max_hours_per_week ?? ''} onChange={set('max_hours_per_week')} /></Field>
      </div>

      <h3 className="thread mt">Emergency contact</h3>
      <div className="form-row">
        <Field label="Name"><input value={f.emergency_contact_name || ''} onChange={set('emergency_contact_name')} /></Field>
        <Field label="Phone"><input value={f.emergency_contact_phone || ''} onChange={set('emergency_contact_phone')} /></Field>
      </div>

      <h3 className="thread mt">Skills & matching</h3>
      <EditableSelect table="skills_list" label="Specialized skills" value={skillIds} onChange={setSkillIds} multi />
      <EditableSelect table="restrictions_list" label="Client matching restrictions" value={restrictionIds} onChange={setRestrictionIds} multi />
      <p className="muted" style={{ fontSize: '.84rem' }}>
        Background check, TB test, and CPR/First Aid are tracked in the Credentials tab after saving.
      </p>
    </Modal>
  )
}

function CaregiverDetail({ caregiver, onClose }) {
  const [tab, setTab] = useState('availability')
  const [editing, setEditing] = useState(false)

  return (
    <Modal title={fullName(caregiver)} onClose={onClose} wide footer={<button className="btn btn-quiet" onClick={onClose}>Close</button>}>
      <div className="toolbar mb">
        {['availability', 'timeoff', 'credentials', 'account', 'details'].map((t) => (
          <button key={t} className={`btn ${tab === t ? 'btn-primary' : 'btn-outline'}`} style={{ padding: '.4rem .9rem' }} onClick={() => setTab(t)}>
            {{ availability: 'Availability', timeoff: 'Time off', credentials: 'Credentials', account: 'App account', details: 'Details' }[t]}
          </button>
        ))}
      </div>
      {tab === 'availability' && <AvailabilityEditor caregiverId={caregiver.id} />}
      {tab === 'timeoff' && <TimeOffTab caregiverId={caregiver.id} />}
      {tab === 'credentials' && <CredentialsTab caregiverId={caregiver.id} />}
      {tab === 'account' && <AccountLink caregiver={caregiver} />}
      {tab === 'details' && (
        <>
          <p><b>Phone:</b> {caregiver.phone || '—'} · <b>Email:</b> {caregiver.email || '—'}</p>
          <p><b>Type:</b> {caregiver.caregiver_kind === 'live_in' ? 'Live-in' : 'Hourly'} ·
             <b> Pay:</b> {caregiver.hourly_rate ? ` $${Number(caregiver.hourly_rate).toFixed(2)}/h` : ' —'} ·
             <b> Mileage:</b> {caregiver.mileage_rate ? ` $${Number(caregiver.mileage_rate).toFixed(2)}/mi` : ' not reimbursed'}</p>
          <p className="muted">{caregiver.notes}</p>
          {editing
            ? <CaregiverModal caregiver={caregiver} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onClose() }} />
            : <button className="btn btn-outline" onClick={() => setEditing(true)}>Edit details</button>}
        </>
      )}
    </Modal>
  )
}

function TimeOffTab({ caregiverId }) {
  const [list, setList] = useState([])
  const [f, setF] = useState({ starts_at: '', ends_at: '', reason: '' })
  const [err, setErr] = useState('')

  const load = () => supabase.from('caregiver_time_off').select('*').eq('caregiver_id', caregiverId)
    .order('starts_at', { ascending: false }).then(({ data }) => setList(data || []))
  useEffect(() => { load() }, [caregiverId]) // eslint-disable-line

  const add = async () => {
    setErr('')
    if (!f.starts_at || !f.ends_at) return setErr('Start and end are required.')
    const { error } = await supabase.from('caregiver_time_off').insert({
      caregiver_id: caregiverId, starts_at: f.starts_at, ends_at: f.ends_at, reason: f.reason, status: 'approved',
    })
    if (error) return setErr(error.message)
    setF({ starts_at: '', ends_at: '', reason: '' })
    load()
  }
  const setStatus = async (id, status) => { await supabase.from('caregiver_time_off').update({ status }).eq('id', id); load() }
  const remove = async (id) => { await supabase.from('caregiver_time_off').delete().eq('id', id); load() }

  const STATUS_KIND = { pending: 'warn', approved: 'ok', denied: 'bad' }

  return (
    <>
      {list.map((t) => (
        <div key={t.id} className="card card-pad mb" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <b>{new Date(t.starts_at).toLocaleDateString()} → {new Date(t.ends_at).toLocaleDateString()}</b>
            {t.reason && <div className="muted" style={{ fontSize: '.85rem' }}>{t.reason}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
            <Pill kind={STATUS_KIND[t.status] || 'muted'}>{t.status}</Pill>
            {t.status === 'pending' && (
              <>
                <button className="btn btn-outline" onClick={() => setStatus(t.id, 'approved')}>Approve</button>
                <button className="btn btn-outline" onClick={() => setStatus(t.id, 'denied')}>Deny</button>
              </>
            )}
            <button className="btn btn-quiet" onClick={() => remove(t.id)}>Remove</button>
          </div>
        </div>
      ))}
      {list.length === 0 && <p className="muted">No time off recorded yet.</p>}
      <h3 className="thread mt">Block time off (auto-approved)</h3>
      {err && <p className="notice notice-bad">{err}</p>}
      <div className="form-row">
        <Field label="Starts"><input type="datetime-local" value={f.starts_at} onChange={(e) => setF({ ...f, starts_at: e.target.value })} /></Field>
        <Field label="Ends"><input type="datetime-local" value={f.ends_at} onChange={(e) => setF({ ...f, ends_at: e.target.value })} /></Field>
      </div>
      <Field label="Reason (optional)"><input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
      <button className="btn btn-primary" onClick={add}>Add time off</button>
      <p className="muted mt" style={{ fontSize: '.84rem' }}>Caregivers can also request time off from the Care App — requests appear here as "pending" for you to approve or deny.</p>
    </>
  )
}

function CredentialsTab({ caregiverId }) {
  const [list, setList] = useState([])
  const [f, setF] = useState({ credential_type: '', credential_number: '', issued_date: '', expiry_date: '', notes: '' })
  const [err, setErr] = useState('')

  const load = () => supabase.from('caregiver_credentials').select('*').eq('caregiver_id', caregiverId)
    .order('expiry_date', { nullsFirst: false }).then(({ data }) => setList(data || []))
  useEffect(() => { load() }, [caregiverId]) // eslint-disable-line

  const add = async () => {
    setErr('')
    if (!f.credential_type.trim()) return setErr('Credential type is required.')
    const row = { caregiver_id: caregiverId, ...f,
      issued_date: f.issued_date || null, expiry_date: f.expiry_date || null }
    const { error } = await supabase.from('caregiver_credentials').insert(row)
    if (error) return setErr(error.message)
    setF({ credential_type: '', credential_number: '', issued_date: '', expiry_date: '', notes: '' })
    load()
  }
  const remove = async (id) => { await supabase.from('caregiver_credentials').delete().eq('id', id); load() }

  const statusPill = (expiry) => {
    if (!expiry) return null
    const days = Math.floor((new Date(expiry) - new Date()) / 86400000)
    if (days < 0) return <Pill kind="bad">Expired</Pill>
    if (days <= 30) return <Pill kind="warn">Expires in {days}d</Pill>
    return <Pill kind="ok">Valid</Pill>
  }

  return (
    <>
      {list.map((c) => (
        <div key={c.id} className="card card-pad mb" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <b>{c.credential_type}</b>{c.credential_number && <span className="muted"> · #{c.credential_number}</span>}
            <div className="muted" style={{ fontSize: '.85rem' }}>
              {c.issued_date && `Issued ${c.issued_date}`}{c.expiry_date && ` · Expires ${c.expiry_date}`}
              {!c.expiry_date && ' · No expiry'}
            </div>
            {c.notes && <div className="muted" style={{ fontSize: '.85rem' }}>{c.notes}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
            {statusPill(c.expiry_date)}
            <button className="btn btn-quiet" onClick={() => remove(c.id)}>Remove</button>
          </div>
        </div>
      ))}
      {list.length === 0 && <p className="muted">No credentials recorded yet.</p>}
      <h3 className="thread mt">Add a credential</h3>
      {err && <p className="notice notice-bad">{err}</p>}
      <div className="form-row">
        <Field label="Type" help="e.g. CNA, HHA, CPR/First Aid, TB Test, Background Check">
          <input value={f.credential_type} onChange={(e) => setF({ ...f, credential_type: e.target.value })} />
        </Field>
        <Field label="Credential / license number"><input value={f.credential_number} onChange={(e) => setF({ ...f, credential_number: e.target.value })} /></Field>
      </div>
      <div className="form-row">
        <Field label="Issued date"><input type="date" value={f.issued_date} onChange={(e) => setF({ ...f, issued_date: e.target.value })} /></Field>
        <Field label="Expiry date" help="Leave blank if it doesn't expire"><input type="date" value={f.expiry_date} onChange={(e) => setF({ ...f, expiry_date: e.target.value })} /></Field>
      </div>
      <Field label="Notes"><input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      <button className="btn btn-primary" onClick={add}>Add credential</button>
      <p className="muted mt" style={{ fontSize: '.84rem' }}>Credentials expiring within 30 days automatically raise an alert for the office.</p>
    </>
  )
}

function AvailabilityEditor({ caregiverId }) {
  const [rows, setRows] = useState([])
  const [f, setF] = useState({ weekday: 1, start_time: '08:00', end_time: '17:00' })

  const load = () =>
    supabase.from('caregiver_availability').select('*').eq('caregiver_id', caregiverId).order('weekday')
      .then(({ data }) => setRows(data || []))
  useEffect(() => { load() }, [caregiverId]) // eslint-disable-line

  const add = async () => {
    if (f.end_time <= f.start_time) return
    await supabase.from('caregiver_availability').insert({ caregiver_id: caregiverId, ...f, weekday: Number(f.weekday) })
    load()
  }
  const remove = async (id) => { await supabase.from('caregiver_availability').delete().eq('id', id); load() }

  return (
    <>
      <p className="muted" style={{ fontSize: '.88rem' }}>Weekly availability powers the ★ suggestions when assigning shifts.</p>
      <table className="data mb"><tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td><b>{WEEKDAYS[r.weekday]}</b></td>
            <td>{r.start_time.slice(0, 5)} – {r.end_time.slice(0, 5)}</td>
            <td style={{ width: 40 }}><button className="btn btn-quiet" onClick={() => remove(r.id)} aria-label="Remove">✕</button></td>
          </tr>
        ))}
        {rows.length === 0 && <tr><td className="muted">No availability recorded yet.</td></tr>}
      </tbody></table>
      <div className="form-row-3">
        <Field label="Day">
          <select value={f.weekday} onChange={(e) => setF({ ...f, weekday: e.target.value })}>
            {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </Field>
        <Field label="From"><input type="time" value={f.start_time} onChange={(e) => setF({ ...f, start_time: e.target.value })} /></Field>
        <Field label="To"><input type="time" value={f.end_time} onChange={(e) => setF({ ...f, end_time: e.target.value })} /></Field>
      </div>
      <button className="btn btn-primary" onClick={add}>Add availability</button>
    </>
  )
}

function AccountLink({ caregiver }) {
  const [profiles, setProfiles] = useState([])
  const [choice, setChoice] = useState(caregiver.profile_id || '')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    supabase.from('profiles').select('id,full_name,email,role').eq('role', 'caregiver')
      .then(({ data }) => setProfiles(data || []))
  }, [])

  const save = async () => {
    const { error } = await supabase.from('caregivers')
      .update({ profile_id: choice || null }).eq('id', caregiver.id)
    setMsg(error ? error.message : 'Linked. The caregiver can now sign in to the Care App.')
  }

  return (
    <>
      <p className="muted" style={{ fontSize: '.88rem' }}>
        1) Create the caregiver's login in Supabase (Authentication → Add user) or send them an invite. 
        2) Their profile appears below — link it here so the Care App shows their shifts.
      </p>
      <Field label="Care App login">
        <select value={choice} onChange={(e) => setChoice(e.target.value)}>
          <option value="">— Not linked —</option>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name} ({p.email})</option>)}
        </select>
      </Field>
      {msg && <p className="notice notice-ok">{msg}</p>}
      <button className="btn btn-primary" onClick={save}>Save link</button>
    </>
  )
}
