import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fullName, fmtDate } from '../lib/format'
import { Modal, Field, Empty, Pill } from '../components/Ui'

export default function Clients() {
  const [rows, setRows] = useState([])
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [selected, setSelected] = useState(null)

  const load = () =>
    supabase.from('clients').select('*').order('last_name').then(({ data }) => setRows(data || []))
  useEffect(() => { load() }, [])

  const filtered = rows.filter((r) =>
    fullName(r).toLowerCase().includes(q.toLowerCase()) || (r.city || '').toLowerCase().includes(q.toLowerCase()))

  return (
    <>
      <div className="page-head">
        <div><h1 className="thread">Clients</h1><div className="sub">Private-pay clients, their care plans, and physician documents.</div></div>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>+ Register client</button>
      </div>

      <div className="toolbar mb">
        <input className="searchbox" placeholder="Search clients…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="card">
        {filtered.length === 0 ? <Empty title="No clients yet" hint="Register your first client to begin scheduling care." /> : (
          <table className="data">
            <thead><tr><th>Client</th><th>Address</th><th>Phone</th><th className="num">Bill rate</th><th>Billing</th><th>Status</th></tr></thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="click" onClick={() => setSelected(r)}>
                  <td><b>{fullName(r)}</b></td>
                  <td className="muted">{r.address}{r.city ? `, ${r.city}` : ''}</td>
                  <td>{r.phone || '—'}</td>
                  <td className="num">{r.bill_rate ? `$${Number(r.bill_rate).toFixed(2)}/h` : '—'}</td>
                  <td style={{ textTransform: 'capitalize' }}>{r.billing_cycle}</td>
                  <td>{r.is_active ? <Pill kind="ok">Active</Pill> : <Pill kind="muted">Inactive</Pill>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {adding && <ClientModal onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load() }} />}
      {selected && <ClientDetail client={selected} onClose={() => { setSelected(null); load() }} />}
    </>
  )
}

function ClientModal({ client, onClose, onSaved }) {
  const isNew = !client
  const [f, setF] = useState(client || {
    first_name: '', last_name: '', phone: '', address: '', city: '', zip: '',
    latitude: '', longitude: '', geofence_radius_m: 150,
    emergency_contact_name: '', emergency_contact_phone: '',
    bill_rate: '', billing_cycle: 'weekly', billing_email: '', service_notes: '', is_active: true,
  })
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const save = async () => {
    setErr('')
    if (!f.first_name || !f.last_name || !f.address) return setErr('Name and address are required.')
    const row = { ...f,
      bill_rate: f.bill_rate === '' ? null : f.bill_rate,
      latitude: f.latitude === '' ? null : Number(f.latitude),
      longitude: f.longitude === '' ? null : Number(f.longitude),
      geofence_radius_m: Number(f.geofence_radius_m) || 150,
    }
    delete row.id; delete row.created_at
    const q = isNew
      ? supabase.from('clients').insert(row)
      : supabase.from('clients').update(row).eq('id', client.id)
    const { error } = await q
    if (error) return setErr(error.message)
    onSaved()
  }

  return (
    <Modal title={isNew ? 'Register client' : 'Edit client'} onClose={onClose} wide footer={
      <><button className="btn btn-quiet" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save}>Save client</button></>
    }>
      {err && <p className="notice notice-bad">{err}</p>}
      <div className="form-row">
        <Field label="First name"><input value={f.first_name} onChange={set('first_name')} /></Field>
        <Field label="Last name"><input value={f.last_name} onChange={set('last_name')} /></Field>
      </div>
      <div className="form-row">
        <Field label="Phone"><input value={f.phone || ''} onChange={set('phone')} /></Field>
        <Field label="Billing email"><input type="email" value={f.billing_email || ''} onChange={set('billing_email')} /></Field>
      </div>
      <Field label="Street address"><input value={f.address} onChange={set('address')} /></Field>
      <div className="form-row">
        <Field label="City"><input value={f.city || ''} onChange={set('city')} /></Field>
        <Field label="ZIP"><input value={f.zip || ''} onChange={set('zip')} /></Field>
      </div>
      <div className="form-row-3">
        <Field label="Latitude" help="For GPS clock-in checks"><input value={f.latitude ?? ''} onChange={set('latitude')} placeholder="47.2043" /></Field>
        <Field label="Longitude"><input value={f.longitude ?? ''} onChange={set('longitude')} placeholder="-122.2404" /></Field>
        <Field label="Geofence (meters)"><input type="number" value={f.geofence_radius_m} onChange={set('geofence_radius_m')} /></Field>
      </div>
      <div className="form-row">
        <Field label="Emergency contact"><input value={f.emergency_contact_name || ''} onChange={set('emergency_contact_name')} /></Field>
        <Field label="Emergency phone"><input value={f.emergency_contact_phone || ''} onChange={set('emergency_contact_phone')} /></Field>
      </div>
      <div className="form-row">
        <Field label="Bill rate ($/hour)"><input type="number" step="0.01" value={f.bill_rate ?? ''} onChange={set('bill_rate')} /></Field>
        <Field label="Billing cycle">
          <select value={f.billing_cycle} onChange={set('billing_cycle')}>
            <option value="weekly">Weekly</option><option value="biweekly">Biweekly</option><option value="monthly">Monthly</option>
          </select>
        </Field>
      </div>
      <Field label="Service notes"><textarea rows={3} value={f.service_notes || ''} onChange={set('service_notes')} /></Field>
    </Modal>
  )
}

/* ---------------- Client detail: care plan + documents ---------------- */

function ClientDetail({ client, onClose }) {
  const [tab, setTab] = useState('plan')
  const [editing, setEditing] = useState(false)

  return (
    <Modal title={fullName(client)} onClose={onClose} wide footer={
      <button className="btn btn-quiet" onClick={onClose}>Close</button>
    }>
      <div className="toolbar mb">
        {['plan', 'documents', 'details'].map((t) => (
          <button key={t} className={`btn ${tab === t ? 'btn-primary' : 'btn-outline'}`} style={{ padding: '.4rem .9rem' }} onClick={() => setTab(t)}>
            {{ plan: 'Care plan', documents: 'Physician orders & meds', details: 'Details' }[t]}
          </button>
        ))}
      </div>
      {tab === 'plan' && <CarePlanEditor clientId={client.id} />}
      {tab === 'documents' && <Documents clientId={client.id} />}
      {tab === 'details' && (
        <>
          <p><b>Address:</b> {client.address}{client.city ? `, ${client.city}` : ''} {client.zip || ''}</p>
          <p><b>Phone:</b> {client.phone || '—'} · <b>Emergency:</b> {client.emergency_contact_name || '—'} {client.emergency_contact_phone || ''}</p>
          <p><b>Bill rate:</b> {client.bill_rate ? `$${Number(client.bill_rate).toFixed(2)}/h` : '—'} · <b>Cycle:</b> {client.billing_cycle}</p>
          <p><b>GPS:</b> {client.latitude ? `${client.latitude}, ${client.longitude} (±${client.geofence_radius_m} m)` : 'Not set — add coordinates to enable clock-in location checks.'}</p>
          <p className="muted">{client.service_notes}</p>
          {editing
            ? <ClientModal client={client} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onClose() }} />
            : <button className="btn btn-outline" onClick={() => setEditing(true)}>Edit details</button>}
        </>
      )}
    </Modal>
  )
}

function CarePlanEditor({ clientId }) {
  const [plan, setPlan] = useState(null)
  const [tasks, setTasks] = useState([])
  const [summary, setSummary] = useState('')
  const [newTask, setNewTask] = useState({ category: 'ADL', label: '', instructions: '' })
  const [msg, setMsg] = useState('')

  const load = async () => {
    let { data: p } = await supabase.from('care_plans').select('*')
      .eq('client_id', clientId).eq('is_active', true).maybeSingle()
    if (!p) {
      const ins = await supabase.from('care_plans')
        .insert({ client_id: clientId, title: 'Care Plan' }).select().single()
      p = ins.data
    }
    setPlan(p); setSummary(p?.summary || '')
    const { data: t } = await supabase.from('care_plan_tasks').select('*')
      .eq('care_plan_id', p.id).eq('is_active', true).order('sort_order')
    setTasks(t || [])
  }
  useEffect(() => { load() }, [clientId]) // eslint-disable-line

  const saveSummary = async () => {
    await supabase.from('care_plans').update({ summary, updated_at: new Date().toISOString() }).eq('id', plan.id)
    setMsg('Care plan saved. Caregivers will see it on their next visit.')
    setTimeout(() => setMsg(''), 3500)
  }

  const addTask = async () => {
    if (!newTask.label.trim()) return
    await supabase.from('care_plan_tasks').insert({
      care_plan_id: plan.id, ...newTask, sort_order: tasks.length + 1,
    })
    setNewTask({ category: 'ADL', label: '', instructions: '' })
    load()
  }

  const removeTask = async (id) => {
    await supabase.from('care_plan_tasks').update({ is_active: false }).eq('id', id)
    load()
  }

  if (!plan) return <p className="muted">Loading care plan…</p>
  return (
    <>
      {msg && <p className="notice notice-ok">{msg}</p>}
      <Field label="Care summary / goals" help="The RN overview caregivers see at the top of every visit.">
        <textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
      </Field>
      <button className="btn btn-outline mb" onClick={saveSummary}>Save summary</button>

      <h3 className="thread" style={{ marginTop: '.6rem' }}>ADLs & tasks</h3>
      {tasks.length === 0 && <p className="muted">No tasks yet — add the first one below.</p>}
      <table className="data mb">
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id}>
              <td style={{ width: 110 }}><Pill kind="info">{t.category}</Pill></td>
              <td><b>{t.label}</b>{t.instructions && <div className="muted" style={{ fontSize: '.83rem' }}>{t.instructions}</div>}</td>
              <td style={{ width: 40 }}><button className="btn btn-quiet" onClick={() => removeTask(t.id)} aria-label="Remove task">✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="form-row-3">
        <Field label="Category">
          <select value={newTask.category} onChange={(e) => setNewTask({ ...newTask, category: e.target.value })}>
            {['ADL', 'IADL', 'Medication Reminder', 'Safety', 'Other'].map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Task"><input value={newTask.label} onChange={(e) => setNewTask({ ...newTask, label: e.target.value })} placeholder="Assist with bathing" /></Field>
        <Field label="Instructions"><input value={newTask.instructions} onChange={(e) => setNewTask({ ...newTask, instructions: e.target.value })} placeholder="Optional details" /></Field>
      </div>
      <button className="btn btn-primary" onClick={addTask}>Add task</button>
    </>
  )
}

function Documents({ clientId }) {
  const [docs, setDocs] = useState([])
  const [f, setF] = useState({ doc_type: 'physician_order', title: '' })
  const [file, setFile] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () =>
    supabase.from('client_documents').select('*').eq('client_id', clientId)
      .order('created_at', { ascending: false }).then(({ data }) => setDocs(data || []))
  useEffect(() => { load() }, [clientId]) // eslint-disable-line

  const upload = async () => {
    setErr('')
    if (!file || !f.title.trim()) return setErr('Choose a file and give it a title.')
    setBusy(true)
    const path = `${clientId}/${Date.now()}_${file.name}`
    const { error: upErr } = await supabase.storage.from('client-documents').upload(path, file)
    if (upErr) { setErr(upErr.message); setBusy(false); return }
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('client_documents').insert({
      client_id: clientId, doc_type: f.doc_type, title: f.title, storage_path: path, uploaded_by: user.id,
    })
    setF({ doc_type: 'physician_order', title: '' }); setFile(null); setBusy(false)
    load()
  }

  const open = async (d) => {
    const { data } = await supabase.storage.from('client-documents').createSignedUrl(d.storage_path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  return (
    <>
      <p className="muted" style={{ fontSize: '.88rem' }}>
        Physician orders and medication lists live here as uploaded documents. Two-way messaging with
        physicians is planned for a later phase.
      </p>
      {err && <p className="notice notice-bad">{err}</p>}
      <div className="form-row-3">
        <Field label="Type">
          <select value={f.doc_type} onChange={(e) => setF({ ...f, doc_type: e.target.value })}>
            <option value="physician_order">Physician order</option>
            <option value="medication_list">Medication list</option>
            <option value="assessment">Assessment</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Title"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="File"><input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} /></Field>
      </div>
      <button className="btn btn-primary mb" onClick={upload} disabled={busy}>{busy ? 'Uploading…' : 'Upload document'}</button>

      <table className="data">
        <tbody>
          {docs.map((d) => (
            <tr key={d.id} className="click" onClick={() => open(d)}>
              <td><Pill kind="gold">{d.doc_type.replaceAll('_', ' ')}</Pill></td>
              <td><b>{d.title}</b></td>
              <td className="muted">{fmtDate(d.created_at)}</td>
            </tr>
          ))}
          {docs.length === 0 && <tr><td className="muted">No documents uploaded yet.</td></tr>}
        </tbody>
      </table>
    </>
  )
}
