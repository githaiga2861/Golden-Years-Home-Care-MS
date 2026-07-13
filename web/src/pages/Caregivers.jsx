import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fullName, WEEKDAYS } from '../lib/format'
import { Modal, Field, Empty, Pill } from '../components/Ui'

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
  })
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const save = async () => {
    setErr('')
    if (!f.first_name || !f.last_name) return setErr('First and last name are required.')
    const row = { ...f,
      hourly_rate: f.hourly_rate === '' ? null : f.hourly_rate,
      mileage_rate: f.mileage_rate === '' ? null : f.mileage_rate,
    }
    delete row.id; delete row.created_at; delete row.credentials; delete row.profile_id; delete row.hire_date
    const q = isNew
      ? supabase.from('caregivers').insert(row)
      : supabase.from('caregivers').update(row).eq('id', caregiver.id)
    const { error } = await q
    if (error) return setErr(error.message)
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
    </Modal>
  )
}

function CaregiverDetail({ caregiver, onClose }) {
  const [tab, setTab] = useState('availability')
  const [editing, setEditing] = useState(false)

  return (
    <Modal title={fullName(caregiver)} onClose={onClose} wide footer={<button className="btn btn-quiet" onClick={onClose}>Close</button>}>
      <div className="toolbar mb">
        {['availability', 'account', 'details'].map((t) => (
          <button key={t} className={`btn ${tab === t ? 'btn-primary' : 'btn-outline'}`} style={{ padding: '.4rem .9rem' }} onClick={() => setTab(t)}>
            {{ availability: 'Availability', account: 'App account', details: 'Details' }[t]}
          </button>
        ))}
      </div>
      {tab === 'availability' && <AvailabilityEditor caregiverId={caregiver.id} />}
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
