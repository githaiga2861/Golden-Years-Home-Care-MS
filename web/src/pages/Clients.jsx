import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fullName, fmtDate } from '../lib/format'
import { geocodeAddress } from '../lib/geocode'
import { Modal, Field, Empty, Pill, ProfileHeader } from '../components/Ui'
import EditableSelect from '../components/EditableSelect'
import AddressAutocomplete from '../components/AddressAutocomplete'

export default function Clients() {
  const [rows, setRows] = useState([])
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [selected, setSelected] = useState(null)

  const load = () =>
    supabase.from('clients').select('*, payer_types(label)').order('last_name').then(({ data }) => setRows(data || []))
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
            <thead><tr><th>Client</th><th>Address</th><th>Payer</th><th className="num">Bill rate</th><th>Authorized hrs/wk</th><th>Status</th></tr></thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="click" onClick={() => setSelected(r)}>
                  <td><b>{fullName(r)}</b></td>
                  <td className="muted">{r.address}{r.city ? `, ${r.city}` : ''}</td>
                  <td>{r.payer_types?.label ? <Pill kind="info">{r.payer_types.label}</Pill> : <Pill kind="muted">Not set</Pill>}</td>
                  <td className="num">{r.bill_rate ? `$${Number(r.bill_rate).toFixed(2)}/h` : '—'}</td>
                  <td className="num">{r.authorized_hours_per_week ?? '—'}</td>
                  <td>{
                    { active: <Pill kind="ok">Active</Pill>, on_hold: <Pill kind="warn">On hold</Pill>,
                      hospitalized: <Pill kind="bad">Hospitalized</Pill>, discharged: <Pill kind="muted">Discharged</Pill>
                    }[r.status] || (r.is_active ? <Pill kind="ok">Active</Pill> : <Pill kind="muted">Inactive</Pill>)
                  }</td>
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

/* ================= Register / Edit modal (tabbed) ================= */

/* ================= Register / Edit modal (3-step wizard) ================= */

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const STEPS = ['basic', 'clinical', 'operational']
const STEP_LABELS = { basic: '1. Basic Info', clinical: '2. Clinical / Care Info', operational: '3. Operational' }

function ClientModal({ client, onClose, onSaved }) {
  const isNew = !client
  const [step, setStep] = useState('basic')
  const [f, setF] = useState(client || {
    first_name: '', last_name: '', phone: '', address: '', city: '', zip: '',
    latitude: '', longitude: '', geofence_radius_m: 150, formatted_address: '',
    emergency_contact_name: '', emergency_contact_phone: '',
    bill_rate: '', billing_cycle: 'weekly', billing_email: '', service_notes: '',
    payer_type_id: null, mobility_level_id: null, cognitive_status_id: null,
    authorized_hours_per_week: '', is_active: true,
    status: 'active', date_of_birth: '', gender: '', preferred_language: '',
    fall_risk: false, special_precautions: [],
    case_manager_name: '', case_manager_phone: '', rn_name: '', rn_phone: '',
    responsible_party_name: '', responsible_party_phone: '', responsible_party_relationship: '',
    authorization_start: '', authorization_end: '',
  })
  const [secondaryContacts, setSecondaryContacts] = useState([])
  const [newContact, setNewContact] = useState({ name: '', phone: '', relationship: '', notes: '' })
  const [precautionIds, setPrecautionIds] = useState([])
  const [langId, setLangId] = useState(null)
  const [langOptions, setLangOptions] = useState([])
  const [precautionOptions, setPrecautionOptions] = useState([])
  const [diagnosisIds, setDiagnosisIds] = useState([])
  const [allergyIds, setAllergyIds] = useState([])
  const [caregiverIds, setCaregiverIds] = useState([])
  const [allCaregivers, setAllCaregivers] = useState([])
  const [geoStatus, setGeoStatus] = useState(null)
  const [geocoding, setGeocoding] = useState(false)

  // New-client-only: collected locally, written to the DB together on final Save.
  const [careSummary, setCareSummary] = useState('')
  const [careGoals, setCareGoals] = useState('')
  const [careSpecial, setCareSpecial] = useState('')
  const [adlTasks, setAdlTasks] = useState([])
  const [newAdl, setNewAdl] = useState({ category: 'ADL', label: '', instructions: '', frequency: 'Every visit' })
  const [physiciansList, setPhysiciansList] = useState([])
  const [newPhysician, setNewPhysician] = useState({ name: '', phone: '', fax: '', agency_name: '', notes: '' })
  const [medicationsList, setMedicationsList] = useState([])
  const [newMedication, setNewMedication] = useState({ name: '', dosage: '', route: '', times: '', instructions: '' })
  const [carePlanFiles, setCarePlanFiles] = useState([])
  const [dragOver, setDragOver] = useState(false)
  const [auth, setAuth] = useState({
    pattern: 'weekly', weekday_hours: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
    daily_hours: '', monthly_hours: '', effective_until: '',
  })

  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  useEffect(() => {
    supabase.from('caregivers').select('id,first_name,last_name').eq('is_active', true).order('last_name')
      .then(({ data }) => setAllCaregivers(data || []))
    supabase.from('languages_list').select('id,label').order('label').then(({ data }) => {
      setLangOptions(data || [])
      if (!isNew && client.preferred_language) {
        const match = (data || []).find((o) => o.label === client.preferred_language)
        if (match) setLangId(match.id)
      }
    })
    supabase.from('precautions_list').select('id,label').order('label').then(({ data }) => {
      setPrecautionOptions(data || [])
      if (!isNew && client.special_precautions?.length) {
        setPrecautionIds((data || []).filter((o) => client.special_precautions.includes(o.label)).map((o) => o.id))
      }
    })
    if (!isNew) {
      supabase.from('client_diagnoses').select('diagnosis_id').eq('client_id', client.id)
        .then(({ data }) => setDiagnosisIds((data || []).map((r) => r.diagnosis_id)))
      supabase.from('client_allergies').select('allergy_id').eq('client_id', client.id)
        .then(({ data }) => setAllergyIds((data || []).map((r) => r.allergy_id)))
      supabase.from('client_caregivers').select('caregiver_id').eq('client_id', client.id)
        .then(({ data }) => setCaregiverIds((data || []).map((r) => r.caregiver_id)))
      supabase.from('client_contacts').select('*').eq('client_id', client.id)
        .then(({ data }) => setSecondaryContacts((data || []).map((c) => ({ ...c, _id: c.id }))))
      if (client.special_precautions) setF((prev) => ({ ...prev, special_precautions: client.special_precautions }))
    }
  }, [client?.id]) // eslint-disable-line

  const runGeocode = async () => {
    const full = `${f.address}, ${f.city || ''} ${f.state || 'WA'} ${f.zip || ''}`.trim()
    setGeocoding(true); setGeoStatus(null)
    const result = await geocodeAddress(full)
    setGeocoding(false)
    if (!result.ok) { setGeoStatus({ ok: false, msg: result.error }); return }
    setF((prev) => ({ ...prev, latitude: result.lat, longitude: result.lng, formatted_address: result.formatted }))
    setGeoStatus({
      ok: true,
      msg: result.precise
        ? `Located precisely: ${result.formatted}`
        : `Located approximately (not an exact street match): ${result.formatted}. Double-check the address.`,
    })
  }

  // ---------- inline list builders (new-client only) ----------
  const addAdl = () => {
    if (!newAdl.label.trim()) return
    setAdlTasks((t) => [...t, { ...newAdl, _id: Date.now() }])
    setNewAdl({ category: 'ADL', label: '', instructions: '', frequency: 'Every visit' })
  }
  const removeAdl = (id) => setAdlTasks((t) => t.filter((x) => x._id !== id))

  const addPhysician = () => {
    if (!newPhysician.name.trim()) return
    setPhysiciansList((p) => [...p, { ...newPhysician, _id: Date.now() }])
    setNewPhysician({ name: '', phone: '', fax: '', agency_name: '', notes: '' })
  }
  const removePhysician = (id) => setPhysiciansList((p) => p.filter((x) => x._id !== id))

  const addMedication = () => {
    if (!newMedication.name.trim() || !newMedication.dosage.trim()) return
    setMedicationsList((m) => [...m, { ...newMedication, _id: Date.now() }])
    setNewMedication({ name: '', dosage: '', route: '', times: '', instructions: '' })
  }
  const removeMedication = (id) => setMedicationsList((m) => m.filter((x) => x._id !== id))

  const handleFiles = (fileList) => {
    const arr = Array.from(fileList)
    setCarePlanFiles((prev) => [...prev, ...arr])
  }
  const removeFile = (idx) => setCarePlanFiles((prev) => prev.filter((_, i) => i !== idx))

  // ---------- validation / confirm-if-empty ----------
  const missingBasic = () => {
    const miss = []
    if (!f.first_name) miss.push('First name')
    if (!f.last_name) miss.push('Last name')
    if (!f.phone) miss.push('Phone')
    if (!f.billing_email) miss.push('Billing email')
    if (!f.emergency_contact_name) miss.push('Emergency contact name')
    if (!f.emergency_contact_phone) miss.push('Emergency contact phone')
    if (!f.bill_rate) miss.push('Bill rate')
    return miss
  }
  const missingClinical = () => {
    const miss = []
    if (!f.payer_type_id) miss.push('Payer type')
    if (!f.mobility_level_id) miss.push('Mobility level')
    if (!f.cognitive_status_id) miss.push('Cognitive status')
    if (diagnosisIds.length === 0) miss.push('Diagnoses')
    if (allergyIds.length === 0) miss.push('Allergies')
    if (isNew && adlTasks.length === 0) miss.push('ADL/IADL tasks')
    if (isNew && physiciansList.length === 0) miss.push('Physicians')
    if (isNew && medicationsList.length === 0) miss.push('Medications')
    if (isNew && carePlanFiles.length === 0) miss.push('Care plan files')
    return miss
  }
  const hasDetailedAuth = () => {
    if (auth.pattern === 'weekly') return Object.values(auth.weekday_hours).some((h) => Number(h) > 0)
    if (auth.pattern === 'daily') return Number(auth.daily_hours) > 0
    return Number(auth.monthly_hours) > 0
  }
  const missingOperational = () => {
    const miss = []
    if (!hasDetailedAuth()) miss.push('Authorized service hours')
    if (caregiverIds.length === 0) miss.push('Assigned caregivers')
    return miss
  }
  const confirmProceed = (missing) => {
    if (missing.length === 0) return true
    return window.confirm(`These fields are still empty:\n\n${missing.join('\n')}\n\nContinue anyway?`)
  }

  const goNext = () => {
    setErr('')
    if (step === 'basic') {
      if (!f.first_name || !f.last_name || !f.address) return setErr('Name and address are required.')
      if (!f.latitude) return setErr('Please locate the address before continuing, so GPS clock-in checks work.')
      if (!confirmProceed(missingBasic())) return
      setStep('clinical')
    } else if (step === 'clinical') {
      if (!confirmProceed(missingClinical())) return
      setStep('operational')
    }
  }
  const goBack = () => setStep(step === 'operational' ? 'clinical' : 'basic')

  const save = async () => {
    setErr('')
    if (!confirmProceed(missingOperational())) return
    setBusy(true)
    try {
      const row = { ...f,
        bill_rate: f.bill_rate === '' ? null : f.bill_rate,
        authorized_hours_per_week: f.authorized_hours_per_week === '' ? null : f.authorized_hours_per_week,
        latitude: Number(f.latitude), longitude: Number(f.longitude),
        geofence_radius_m: Number(f.geofence_radius_m) || 150,
        payer_type_id: f.payer_type_id || null,
        mobility_level_id: f.mobility_level_id || null,
        cognitive_status_id: f.cognitive_status_id || null,
        date_of_birth: f.date_of_birth || null,
        authorization_start: f.authorization_start || null,
        authorization_end: f.authorization_end || null,
        preferred_language: langId ? (langOptions.find((o) => o.id === langId)?.label || null) : null,
        special_precautions: precautionIds.length
          ? precautionOptions.filter((o) => precautionIds.includes(o.id)).map((o) => o.label)
          : null,
      }
      delete row.id; delete row.created_at; delete row.payer_types
      delete row.mobility_levels; delete row.cognitive_statuses

      const q = isNew ? supabase.from('clients').insert(row).select().single()
                      : supabase.from('clients').update(row).eq('id', client.id).select().single()
      const { data: saved, error } = await q
      if (error) throw error
      const cid = saved.id

      await supabase.from('client_diagnoses').delete().eq('client_id', cid)
      if (diagnosisIds.length) await supabase.from('client_diagnoses').insert(diagnosisIds.map((d) => ({ client_id: cid, diagnosis_id: d })))
      await supabase.from('client_allergies').delete().eq('client_id', cid)
      if (allergyIds.length) await supabase.from('client_allergies').insert(allergyIds.map((a) => ({ client_id: cid, allergy_id: a })))
      await supabase.from('client_caregivers').delete().eq('client_id', cid)
      if (caregiverIds.length) await supabase.from('client_caregivers').insert(caregiverIds.map((c) => ({ client_id: cid, caregiver_id: c })))

      // Secondary contacts: replace all for this client
      await supabase.from('client_contacts').delete().eq('client_id', cid)
      if (secondaryContacts.length) {
        await supabase.from('client_contacts').insert(secondaryContacts.map((c) => ({
          client_id: cid, name: c.name, phone: c.phone, relationship: c.relationship, notes: c.notes,
        })))
      }

      // Detailed authorized-hours schedule (upsert one row per client)
      await supabase.from('client_authorization').upsert({
        client_id: cid,
        pattern: auth.pattern,
        weekday_hours: auth.pattern === 'weekly' ? auth.weekday_hours : {},
        daily_hours: auth.pattern === 'daily' ? (Number(auth.daily_hours) || null) : null,
        monthly_hours: auth.pattern === 'monthly' ? (Number(auth.monthly_hours) || null) : null,
        effective_until: auth.effective_until || null,
        updated_at: new Date().toISOString(),
      })

      if (isNew) {
        // Care plan + ADLs + physicians + medications + files only apply on first creation;
        // ongoing edits happen from the client's profile page.
        if (careSummary || careGoals || careSpecial || adlTasks.length) {
          const { data: plan } = await supabase.from('care_plans')
            .insert({ client_id: cid, title: 'Care Plan', summary: careSummary, goals: careGoals, special_instructions: careSpecial })
            .select().single()
          if (plan && adlTasks.length) {
            await supabase.from('care_plan_tasks').insert(adlTasks.map((t, i) => ({
              care_plan_id: plan.id, category: t.category, label: t.label,
              instructions: t.instructions, frequency: t.frequency, sort_order: i + 1,
            })))
          }
        }
        if (physiciansList.length) {
          await supabase.from('physicians').insert(physiciansList.map((p) => ({
            client_id: cid, name: p.name, phone: p.phone, fax: p.fax, agency_name: p.agency_name, notes: p.notes,
          })))
        }
        if (medicationsList.length) {
          await supabase.from('medications').insert(medicationsList.map((m) => ({
            client_id: cid, name: m.name, dosage: m.dosage, instructions: m.instructions,
            schedule_times: m.times.split(',').map((t) => t.trim()).filter(Boolean), route: m.route,
          })))
        }
        if (carePlanFiles.length) {
          const { data: { user } } = await supabase.auth.getUser()
          for (const file of carePlanFiles) {
            const path = `${cid}/${Date.now()}_${file.name}`
            const { error: upErr } = await supabase.storage.from('client-documents').upload(path, file)
            if (!upErr) {
              await supabase.from('client_documents').insert({
                client_id: cid, doc_type: 'care_plan', title: file.name, storage_path: path, uploaded_by: user.id,
              })
            }
          }
        }
      }

      onSaved()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={isNew ? 'Register client' : 'Edit client'} onClose={onClose} wide footer={
      <>
        {step !== 'basic' && <button className="btn btn-quiet" onClick={goBack} style={{ marginRight: 'auto' }}>Back</button>}
        <button className="btn btn-quiet" onClick={onClose}>Cancel</button>
        {step !== 'operational'
          ? <button className="btn btn-primary" onClick={goNext}>Next</button>
          : <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save client'}</button>}
      </>
    }>
      {err && <p className="notice notice-bad">{err}</p>}
      <div className="toolbar mb">
        {STEPS.map((s) => (
          <span key={s} className={`pill ${s === step ? 'pill-info' : 'pill-muted'}`} style={{ marginRight: '.4rem' }}>{STEP_LABELS[s]}</span>
        ))}
      </div>

      {step === 'basic' && (
        <>
          <div className="form-row">
            <Field label="First name"><input value={f.first_name} onChange={set('first_name')} /></Field>
            <Field label="Last name"><input value={f.last_name} onChange={set('last_name')} /></Field>
          </div>
          <div className="form-row">
            <Field label="Phone"><input value={f.phone || ''} onChange={set('phone')} /></Field>
            <Field label="Billing email"><input type="email" value={f.billing_email || ''} onChange={set('billing_email')} /></Field>
          </div>
          <Field label="Street address" help="Start typing and pick the suggested address — city, state, ZIP, and GPS fill in automatically.">
            <AddressAutocomplete
              value={f.address}
              placeholder="123 Main St"
              onSelect={(r) => {
                setF((prev) => ({
                  ...prev, address: r.address, city: r.city, state: r.state, zip: r.zip,
                  latitude: r.lat, longitude: r.lng, formatted_address: r.formatted,
                }))
                setGeoStatus({ ok: true, msg: `Located precisely: ${r.formatted}` })
              }}
            />
          </Field>
          <div className="form-row-3">
            <Field label="City"><input value={f.city || ''} onChange={set('city')} /></Field>
            <Field label="State"><input value={f.state || 'WA'} onChange={set('state')} /></Field>
            <Field label="ZIP"><input value={f.zip || ''} onChange={set('zip')} /></Field>
          </div>
          <div className="form-row" style={{ alignItems: 'flex-end' }}>
            <div>
              <button type="button" className="btn btn-outline" onClick={runGeocode} disabled={geocoding}>
                {geocoding ? 'Locating…' : '📍 Locate this address'}
              </button>
            </div>
            <Field label="Geofence radius (meters)" help="How far from the home a clock-in is still considered valid.">
              <input type="number" value={f.geofence_radius_m} onChange={set('geofence_radius_m')} />
            </Field>
          </div>
          {geoStatus && <p className={`notice ${geoStatus.ok ? 'notice-ok' : 'notice-bad'}`}>{geoStatus.msg}</p>}
          {f.latitude && !geoStatus && <p className="notice notice-ok">Already located: {f.formatted_address || `${f.latitude}, ${f.longitude}`}</p>}

          <div className="form-row mt">
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
          <Field label="Additional notes"><textarea rows={2} value={f.service_notes || ''} onChange={set('service_notes')} /></Field>

          <h3 className="thread mt">Demographics & status</h3>
          <div className="form-row-3">
            <Field label="Date of birth"><input type="date" value={f.date_of_birth || ''} onChange={set('date_of_birth')} /></Field>
            <Field label="Gender">
              <select value={f.gender || ''} onChange={set('gender')}>
                <option value="">Select…</option>
                <option>Female</option><option>Male</option><option>Non-binary</option><option>Prefer not to say</option>
              </select>
            </Field>
            <Field label="Client status">
              <select value={f.status} onChange={set('status')}>
                <option value="active">Active</option>
                <option value="on_hold">On hold</option>
                <option value="hospitalized">Hospitalized</option>
                <option value="discharged">Discharged</option>
              </select>
            </Field>
          </div>
          <EditableSelect table="languages_list" label="Preferred language"
            value={langId} onChange={setLangId} placeholder="Select language…" />

          <h3 className="thread mt">Responsible party</h3>
          <div className="form-row-3">
            <Field label="Name"><input value={f.responsible_party_name || ''} onChange={set('responsible_party_name')} /></Field>
            <Field label="Phone"><input value={f.responsible_party_phone || ''} onChange={set('responsible_party_phone')} /></Field>
            <Field label="Relationship"><input value={f.responsible_party_relationship || ''} onChange={set('responsible_party_relationship')} /></Field>
          </div>

          <h3 className="thread mt">Additional emergency contacts</h3>
          {secondaryContacts.length === 0 && <p className="muted">Primary emergency contact is set above. Add any others here.</p>}
          {secondaryContacts.map((c) => (
            <div key={c._id} className="shift-line" style={{ padding: '.4rem 0' }}>
              <div style={{ flex: 1 }}>
                <b>{c.name}</b>{c.relationship && <span className="muted"> · {c.relationship}</span>}
                <div className="muted" style={{ fontSize: '.82rem' }}>{c.phone}</div>
              </div>
              <button className="btn btn-quiet" onClick={() => setSecondaryContacts((cs) => cs.filter((x) => x._id !== c._id))}>✕</button>
            </div>
          ))}
          <div className="form-row-3">
            <Field label="Name"><input value={newContact.name} onChange={(e) => setNewContact({ ...newContact, name: e.target.value })} /></Field>
            <Field label="Phone"><input value={newContact.phone} onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })} /></Field>
            <Field label="Relationship"><input value={newContact.relationship} onChange={(e) => setNewContact({ ...newContact, relationship: e.target.value })} /></Field>
          </div>
          <button type="button" className="btn btn-outline mb" onClick={() => {
            if (!newContact.name.trim()) return
            setSecondaryContacts((cs) => [...cs, { ...newContact, _id: Date.now() }])
            setNewContact({ name: '', phone: '', relationship: '', notes: '' })
          }}>+ Add contact</button>
        </>
      )}

      {step === 'clinical' && (
        <>
          <EditableSelect table="payer_types" label="Payer type" value={f.payer_type_id}
            onChange={(v) => setF({ ...f, payer_type_id: v })} placeholder="Select payer…" />
          <EditableSelect table="mobility_levels" label="Mobility level" value={f.mobility_level_id}
            onChange={(v) => setF({ ...f, mobility_level_id: v })} placeholder="Select mobility level…" />
          <EditableSelect table="cognitive_statuses" label="Cognitive status" value={f.cognitive_status_id}
            onChange={(v) => setF({ ...f, cognitive_status_id: v })} placeholder="Select cognitive status…" />
          <EditableSelect table="diagnoses_list" label="Diagnoses" value={diagnosisIds} onChange={setDiagnosisIds} multi />
          <EditableSelect table="allergies_list" label="Allergies" value={allergyIds} onChange={setAllergyIds} multi />
          <EditableSelect table="precautions_list" label="Special precautions" value={precautionIds} onChange={setPrecautionIds} multi />
          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={f.fall_risk} onChange={(e) => setF({ ...f, fall_risk: e.target.checked })} />
              <span><b>Fall risk</b> — flag this client as a fall risk (shown prominently to caregivers)</span>
            </label>
          </div>

          <h3 className="thread mt">Case manager & RN</h3>
          <div className="form-row">
            <Field label="Case manager name"><input value={f.case_manager_name || ''} onChange={set('case_manager_name')} /></Field>
            <Field label="Case manager phone"><input value={f.case_manager_phone || ''} onChange={set('case_manager_phone')} /></Field>
          </div>
          <div className="form-row">
            <Field label="RN name"><input value={f.rn_name || ''} onChange={set('rn_name')} /></Field>
            <Field label="RN phone"><input value={f.rn_phone || ''} onChange={set('rn_phone')} /></Field>
          </div>

          {isNew ? (
            <>
              <h3 className="thread mt">Care plan summary</h3>
              <Field label="Summary / RN overview"><textarea rows={2} value={careSummary} onChange={(e) => setCareSummary(e.target.value)} /></Field>
              <Field label="Goals"><textarea rows={2} value={careGoals} onChange={(e) => setCareGoals(e.target.value)} /></Field>
              <Field label="Special instructions"><textarea rows={2} value={careSpecial} onChange={(e) => setCareSpecial(e.target.value)} /></Field>

              <h3 className="thread mt">ADLs & IADLs needed</h3>
              {adlTasks.length === 0 && <p className="muted">No tasks added yet. These will show up automatically when scheduling this client.</p>}
              {adlTasks.map((t) => (
                <div key={t._id} className="shift-line" style={{ padding: '.4rem 0' }}>
                  <Pill kind="info">{t.category}</Pill>
                  <div style={{ flex: 1, marginLeft: '.6rem' }}>
                    <b>{t.label}</b>{t.instructions && <span className="muted"> — {t.instructions}</span>}
                    <span className="muted"> · {t.frequency}</span>
                  </div>
                  <button className="btn btn-quiet" onClick={() => removeAdl(t._id)}>✕</button>
                </div>
              ))}
              <div className="form-row-3">
                <Field label="Category">
                  <select value={newAdl.category} onChange={(e) => setNewAdl({ ...newAdl, category: e.target.value })}>
                    {['ADL', 'IADL', 'Medication Reminder', 'Safety', 'Other'].map((c) => <option key={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Task"><input value={newAdl.label} onChange={(e) => setNewAdl({ ...newAdl, label: e.target.value })} placeholder="Assist with bathing" /></Field>
                <Field label="Frequency">
                  <select value={newAdl.frequency} onChange={(e) => setNewAdl({ ...newAdl, frequency: e.target.value })}>
                    {['Every visit', 'Daily', 'Weekly', 'As needed'].map((fr) => <option key={fr}>{fr}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Instructions"><input value={newAdl.instructions} onChange={(e) => setNewAdl({ ...newAdl, instructions: e.target.value })} placeholder="Optional details" /></Field>
              <button type="button" className="btn btn-outline mb" onClick={addAdl}>+ Add task</button>

              <h3 className="thread mt">Physicians</h3>
              {physiciansList.length === 0 && <p className="muted">No physicians added yet.</p>}
              {physiciansList.map((p) => (
                <div key={p._id} className="shift-line" style={{ padding: '.4rem 0' }}>
                  <div style={{ flex: 1 }}>
                    <b>{p.name}</b>{p.agency_name && <span className="muted"> · {p.agency_name}</span>}
                    <div className="muted" style={{ fontSize: '.82rem' }}>{p.phone}</div>
                  </div>
                  <button className="btn btn-quiet" onClick={() => removePhysician(p._id)}>✕</button>
                </div>
              ))}
              <div className="form-row">
                <Field label="Name"><input value={newPhysician.name} onChange={(e) => setNewPhysician({ ...newPhysician, name: e.target.value })} /></Field>
                <Field label="Agency"><input value={newPhysician.agency_name} onChange={(e) => setNewPhysician({ ...newPhysician, agency_name: e.target.value })} /></Field>
              </div>
              <div className="form-row">
                <Field label="Phone"><input value={newPhysician.phone} onChange={(e) => setNewPhysician({ ...newPhysician, phone: e.target.value })} /></Field>
                <Field label="Fax"><input value={newPhysician.fax} onChange={(e) => setNewPhysician({ ...newPhysician, fax: e.target.value })} /></Field>
              </div>
              <button type="button" className="btn btn-outline mb" onClick={addPhysician}>+ Add physician</button>

              <h3 className="thread mt">Medications</h3>
              {medicationsList.length === 0 && <p className="muted">No medications added yet.</p>}
              {medicationsList.map((m) => (
                <div key={m._id} className="shift-line" style={{ padding: '.4rem 0' }}>
                  <div style={{ flex: 1 }}>
                    <b>{m.name}</b> — {m.dosage}
                    {m.times && <span className="muted"> · {m.times}</span>}
                  </div>
                  <button className="btn btn-quiet" onClick={() => removeMedication(m._id)}>✕</button>
                </div>
              ))}
              <div className="form-row">
                <Field label="Medication name"><input value={newMedication.name} onChange={(e) => setNewMedication({ ...newMedication, name: e.target.value })} /></Field>
                <Field label="Dosage"><input value={newMedication.dosage} onChange={(e) => setNewMedication({ ...newMedication, dosage: e.target.value })} placeholder="e.g. 10mg" /></Field>
              </div>
              <div className="form-row">
                <Field label="Route">
                  <select value={newMedication.route} onChange={(e) => setNewMedication({ ...newMedication, route: e.target.value })}>
                    <option value="">Select…</option>
                    {['Oral', 'Topical', 'Injection', 'Inhaled', 'Sublingual', 'Rectal', 'Other'].map((r) => <option key={r}>{r}</option>)}
                  </select>
                </Field>
                <Field label="Reminder times" help="Comma-separated, e.g. 09:00, 17:00"><input value={newMedication.times} onChange={(e) => setNewMedication({ ...newMedication, times: e.target.value })} /></Field>
              </div>
              <button type="button" className="btn btn-outline mb" onClick={addMedication}>+ Add medication</button>

              <h3 className="thread mt">Care plan files</h3>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
                style={{
                  border: `2px dashed ${dragOver ? 'var(--blue)' : 'var(--line)'}`, borderRadius: 10,
                  padding: '1.4rem', textAlign: 'center', background: dragOver ? 'var(--blue-soft)' : 'var(--paper)', cursor: 'pointer',
                }}
                onClick={() => document.getElementById('care-plan-file-input').click()}
              >
                <p style={{ margin: 0 }}>Drag & drop files here, or click to browse</p>
                <input id="care-plan-file-input" type="file" multiple style={{ display: 'none' }}
                  onChange={(e) => handleFiles(e.target.files)} />
              </div>
              {carePlanFiles.map((file, i) => (
                <div key={i} className="shift-line" style={{ padding: '.35rem 0' }}>
                  <span style={{ flex: 1 }}>{file.name}</span>
                  <button className="btn btn-quiet" onClick={() => removeFile(i)}>✕</button>
                </div>
              ))}

              <p className="muted mt" style={{ fontSize: '.84rem' }}>
                All of this — care plan, ADLs, physicians, medications, and files — can be edited anytime from the client's profile page after saving.
              </p>
            </>
          ) : (
            <p className="muted mt" style={{ fontSize: '.86rem' }}>
              Care plan, ADLs, physicians, medications, and files are managed from this client's profile page —
              open the client and use the Care Plan / Physicians / Medications / Documents tabs.
            </p>
          )}
        </>
      )}

      {step === 'operational' && (
        <>
          <h3 className="thread">Authorized service hours</h3>
          <Field label="Repeat pattern">
            <select value={auth.pattern} onChange={(e) => setAuth({ ...auth, pattern: e.target.value })}>
              <option value="weekly">Weekly (set hours per day)</option>
              <option value="daily">Daily (same hours every day)</option>
              <option value="monthly">Monthly (one total cap)</option>
            </select>
          </Field>

          {auth.pattern === 'weekly' && (
            <div className="form-row-3" style={{ rowGap: '.6rem' }}>
              {WEEKDAY_LABELS.map((label, i) => (
                <Field key={i} label={label}>
                  <input type="number" step="0.25" min="0" value={auth.weekday_hours[i]}
                    onChange={(e) => setAuth({ ...auth, weekday_hours: { ...auth.weekday_hours, [i]: e.target.value } })} />
                </Field>
              ))}
            </div>
          )}
          {auth.pattern === 'daily' && (
            <Field label="Hours per day"><input type="number" step="0.25" min="0" value={auth.daily_hours}
              onChange={(e) => setAuth({ ...auth, daily_hours: e.target.value })} /></Field>
          )}
          {auth.pattern === 'monthly' && (
            <Field label="Hours per month"><input type="number" step="0.25" min="0" value={auth.monthly_hours}
              onChange={(e) => setAuth({ ...auth, monthly_hours: e.target.value })} /></Field>
          )}
          <Field label="Authorization ends (optional)" help="Leave blank if ongoing.">
            <input type="date" value={auth.effective_until} onChange={(e) => setAuth({ ...auth, effective_until: e.target.value })} />
          </Field>
          <div className="form-row">
            <Field label="Authorization start date"><input type="date" value={f.authorization_start || ''} onChange={set('authorization_start')} /></Field>
            <Field label="Authorization end date"><input type="date" value={f.authorization_end || ''} onChange={set('authorization_end')} /></Field>
          </div>
          <p className="muted" style={{ fontSize: '.82rem' }}>Scheduling will warn if a shift falls outside this authorized pattern.</p>

          <div className="field mt">
            <label>Assigned caregivers (pool)</label>
            <div style={{ border: '1px solid var(--line)', borderRadius: 7, padding: '.5rem .6rem' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem' }}>
                {allCaregivers.map((c) => (
                  <button key={c.id} type="button"
                    className={`btn ${caregiverIds.includes(c.id) ? 'btn-primary' : 'btn-outline'}`}
                    style={{ padding: '.25rem .6rem', fontSize: '.8rem' }}
                    onClick={() => setCaregiverIds((ids) => ids.includes(c.id) ? ids.filter((x) => x !== c.id) : [...ids, c.id])}>
                    {fullName(c)}
                  </button>
                ))}
                {allCaregivers.length === 0 && <span className="muted">Register caregivers first.</span>}
              </div>
            </div>
            <span className="help">Any caregiver in this pool can be freely assigned to this client's shifts.</span>
          </div>
        </>
      )}
    </Modal>
  )
}

/* ================= Client detail / profile ================= */

function ClientDetail({ client, onClose }) {
  const [tab, setTab] = useState('plan')
  const [editing, setEditing] = useState(false)

  const tabs = ['plan', 'clinical', 'physicians', 'medications', 'documents', 'operational', 'details']
  const labels = { plan: 'Care plan', clinical: 'Clinical', physicians: 'Physicians', medications: 'Medications', documents: 'Documents', operational: 'Operational', details: 'Details' }
  const STATUS_KIND = { active: 'ok', on_hold: 'warn', hospitalized: 'bad', discharged: 'muted' }
  const STATUS_LABEL = { active: 'Active', on_hold: 'On hold', hospitalized: 'Hospitalized', discharged: 'Discharged' }
  const initials = `${client.first_name?.[0] || ''}${client.last_name?.[0] || ''}`.toUpperCase()

  return (
    <Modal
      onClose={onClose}
      xwide
      header={
        <ProfileHeader name={fullName(client)} initials={initials} subtitle={client.city ? `${client.city}, WA` : 'Client'}>
          <Pill kind={STATUS_KIND[client.status] || (client.is_active ? 'ok' : 'muted')}>{STATUS_LABEL[client.status] || (client.is_active ? 'Active' : 'Inactive')}</Pill>
          {client.fall_risk && <Pill kind="bad">Fall risk</Pill>}
        </ProfileHeader>
      }
      footer={<button className="btn btn-quiet" onClick={onClose}>Close</button>}
    >
      <div className="profile-layout">
        <div className="profile-nav">
          {tabs.map((t) => (
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{labels[t]}</button>
          ))}
        </div>
        <div className="profile-content">
          {tab === 'plan' && <CarePlanEditor clientId={client.id} />}
          {tab === 'clinical' && <ClinicalTab clientId={client.id} />}
          {tab === 'physicians' && <PhysiciansTab clientId={client.id} />}
          {tab === 'medications' && <MedicationsTab clientId={client.id} />}
          {tab === 'documents' && <Documents clientId={client.id} />}
          {tab === 'operational' && <OperationalTab client={client} />}
          {tab === 'details' && (
            <>
              <dl className="deflist">
                <div><dt>Address</dt><dd>{client.address}{client.city ? `, ${client.city}` : ''} {client.zip || ''}</dd></div>
                <div><dt>Phone</dt><dd>{client.phone || '—'}</dd></div>
                <div><dt>Emergency contact</dt><dd>{client.emergency_contact_name || '—'} {client.emergency_contact_phone || ''}</dd></div>
                <div><dt>Bill rate</dt><dd>{client.bill_rate ? `$${Number(client.bill_rate).toFixed(2)}/h · ${client.billing_cycle}` : '—'}</dd></div>
                <div className="span2"><dt>GPS location</dt><dd>{client.latitude ? `${client.formatted_address || `${client.latitude}, ${client.longitude}`} (±${client.geofence_radius_m} m)` : 'Not located yet.'}</dd></div>
                {client.service_notes && <div className="span2"><dt>Notes</dt><dd className="muted">{client.service_notes}</dd></div>}
              </dl>
              {editing
                ? <ClientModal client={client} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onClose() }} />
                : <button className="btn btn-outline" onClick={() => setEditing(true)}>Edit details</button>}
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

function ClinicalTab({ clientId }) {
  const [client, setClient] = useState(null)
  const [diagnoses, setDiagnoses] = useState([])
  const [allergies, setAllergies] = useState([])
  const [contacts, setContacts] = useState([])

  useEffect(() => {
    supabase.from('clients').select('*, payer_types(label), mobility_levels(label), cognitive_statuses(label)')
      .eq('id', clientId).single().then(({ data }) => setClient(data))
    supabase.from('client_diagnoses').select('diagnoses_list(label)').eq('client_id', clientId)
      .then(({ data }) => setDiagnoses((data || []).map((r) => r.diagnoses_list?.label).filter(Boolean)))
    supabase.from('client_allergies').select('allergies_list(label)').eq('client_id', clientId)
      .then(({ data }) => setAllergies((data || []).map((r) => r.allergies_list?.label).filter(Boolean)))
    supabase.from('client_contacts').select('*').eq('client_id', clientId)
      .then(({ data }) => setContacts(data || []))
  }, [clientId])

  if (!client) return <p className="muted">Loading…</p>
  const STATUS_LABEL = { active: 'Active', on_hold: 'On hold', hospitalized: 'Hospitalized', discharged: 'Discharged' }

  return (
    <>
      <h3 className="thread">Overview</h3>
      <dl className="deflist">
        <div><dt>Status</dt><dd>{STATUS_LABEL[client.status] || 'Active'}</dd></div>
        <div><dt>Date of birth</dt><dd>{client.date_of_birth || 'Not set'}</dd></div>
        <div><dt>Gender</dt><dd>{client.gender || 'Not set'}</dd></div>
        <div><dt>Preferred language</dt><dd>{client.preferred_language || 'Not set'}</dd></div>
        <div><dt>Payer type</dt><dd>{client.payer_types?.label || 'Not set'}</dd></div>
        <div><dt>Mobility level</dt><dd>{client.mobility_levels?.label || 'Not set'}</dd></div>
        <div><dt>Cognitive status</dt><dd>{client.cognitive_statuses?.label || 'Not set'}</dd></div>
        <div><dt>Fall risk</dt><dd>{client.fall_risk ? <Pill kind="bad">Yes</Pill> : 'No'}</dd></div>
        <div className="span2"><dt>Diagnoses</dt><dd>{diagnoses.length ? diagnoses.join(', ') : 'None recorded'}</dd></div>
        <div className="span2"><dt>Allergies</dt><dd>{allergies.length ? allergies.join(', ') : 'None recorded'}</dd></div>
        <div className="span2"><dt>Special precautions</dt><dd>{client.special_precautions?.length ? client.special_precautions.join(', ') : 'None recorded'}</dd></div>
      </dl>

      <h3 className="thread mt">Case manager & RN</h3>
      <dl className="deflist">
        <div><dt>Case manager</dt><dd>{client.case_manager_name || 'Not set'} {client.case_manager_phone}</dd></div>
        <div><dt>RN</dt><dd>{client.rn_name || 'Not set'} {client.rn_phone}</dd></div>
      </dl>

      <h3 className="thread mt">Responsible party</h3>
      <dl className="deflist">
        <div className="span2"><dt>Name & relationship</dt><dd>{client.responsible_party_name || 'Not set'} {client.responsible_party_relationship && `(${client.responsible_party_relationship})`} {client.responsible_party_phone}</dd></div>
      </dl>

      <h3 className="thread mt">Additional emergency contacts</h3>
      {contacts.length === 0 && <p className="muted">None recorded.</p>}
      {contacts.map((c) => (
        <p key={c.id}>{c.name} {c.relationship && `(${c.relationship})`} — {c.phone}</p>
      ))}

      <h3 className="thread mt">Authorization period</h3>
      <p>{client.authorization_start || 'Not set'} → {client.authorization_end || 'Ongoing'}</p>

      <p className="muted mt" style={{ fontSize: '.85rem' }}>To change any of these, use "Edit details" on the Details tab.</p>
    </>
  )
}

function PhysiciansTab({ clientId }) {
  const [list, setList] = useState([])
  const [f, setF] = useState({ name: '', phone: '', fax: '', agency_name: '', notes: '' })
  const [err, setErr] = useState('')

  const load = () => supabase.from('physicians').select('*').eq('client_id', clientId).order('created_at').then(({ data }) => setList(data || []))
  useEffect(() => { load() }, [clientId]) // eslint-disable-line

  const add = async () => {
    setErr('')
    if (!f.name.trim()) return setErr('Physician name is required.')
    const { error } = await supabase.from('physicians').insert({ client_id: clientId, ...f })
    if (error) return setErr(error.message)
    setF({ name: '', phone: '', fax: '', agency_name: '', notes: '' })
    load()
  }
  const remove = async (id) => { await supabase.from('physicians').delete().eq('id', id); load() }

  return (
    <>
      {list.map((p) => (
        <div key={p.id} className="card card-pad mb" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <b>{p.name}</b>{p.agency_name && <span className="muted"> · {p.agency_name}</span>}
            <div className="muted" style={{ fontSize: '.85rem' }}>{p.phone || 'No phone'} {p.fax ? `· Fax ${p.fax}` : ''}</div>
            {p.notes && <div className="muted" style={{ fontSize: '.85rem' }}>{p.notes}</div>}
          </div>
          <button className="btn btn-quiet" onClick={() => remove(p.id)}>Remove</button>
        </div>
      ))}
      {list.length === 0 && <p className="muted">No physicians added yet.</p>}
      <h3 className="thread mt">Add a physician</h3>
      {err && <p className="notice notice-bad">{err}</p>}
      <div className="form-row">
        <Field label="Name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Agency (if any)"><input value={f.agency_name} onChange={(e) => setF({ ...f, agency_name: e.target.value })} /></Field>
      </div>
      <div className="form-row">
        <Field label="Phone"><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Fax"><input value={f.fax} onChange={(e) => setF({ ...f, fax: e.target.value })} /></Field>
      </div>
      <Field label="Notes"><textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      <button className="btn btn-primary" onClick={add}>Add physician</button>
      <p className="muted mt" style={{ fontSize: '.84rem' }}>Attach signed orders from a physician on the Documents tab.</p>
    </>
  )
}

function MedicationsTab({ clientId }) {
  const [list, setList] = useState([])
  const [f, setF] = useState({ name: '', dosage: '', route: '', times: '', instructions: '' })
  const [err, setErr] = useState('')

  const load = () => supabase.from('medications').select('*').eq('client_id', clientId).eq('is_active', true).order('created_at').then(({ data }) => setList(data || []))
  useEffect(() => { load() }, [clientId]) // eslint-disable-line

  const add = async () => {
    setErr('')
    if (!f.name.trim() || !f.dosage.trim()) return setErr('Name and dosage are required.')
    const times = f.times.split(',').map((t) => t.trim()).filter(Boolean)
    const { error } = await supabase.from('medications').insert({
      client_id: clientId, name: f.name, dosage: f.dosage, route: f.route || null, schedule_times: times, instructions: f.instructions,
    })
    if (error) return setErr(error.message)
    setF({ name: '', dosage: '', route: '', times: '', instructions: '' })
    load()
  }
  const remove = async (id) => { await supabase.from('medications').update({ is_active: false }).eq('id', id); load() }

  return (
    <>
      {list.map((m) => (
        <div key={m.id} className="card card-pad mb" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <b>{m.name}</b> — {m.dosage}{m.route && <span className="muted"> · {m.route}</span>}
            <div className="muted" style={{ fontSize: '.85rem' }}>
              {m.schedule_times?.length ? `Times: ${m.schedule_times.join(', ')}` : 'No scheduled times'}
            </div>
            {m.instructions && <div className="muted" style={{ fontSize: '.85rem' }}>{m.instructions}</div>}
          </div>
          <button className="btn btn-quiet" onClick={() => remove(m.id)}>Remove</button>
        </div>
      ))}
      {list.length === 0 && <p className="muted">No medications recorded yet.</p>}
      <h3 className="thread mt">Add a medication</h3>
      {err && <p className="notice notice-bad">{err}</p>}
      <div className="form-row">
        <Field label="Medication name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Dosage"><input value={f.dosage} onChange={(e) => setF({ ...f, dosage: e.target.value })} placeholder="e.g. 10mg" /></Field>
      </div>
      <div className="form-row">
        <Field label="Route">
          <select value={f.route} onChange={(e) => setF({ ...f, route: e.target.value })}>
            <option value="">Select…</option>
            {['Oral', 'Topical', 'Injection', 'Inhaled', 'Sublingual', 'Rectal', 'Other'].map((r) => <option key={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="Reminder times" help="Comma-separated, 24-hour format, e.g. 09:00, 17:00">
          <input value={f.times} onChange={(e) => setF({ ...f, times: e.target.value })} placeholder="09:00, 17:00" />
        </Field>
      </div>
      <Field label="Instructions"><input value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} /></Field>
      <button className="btn btn-primary" onClick={add}>Add medication</button>
      <p className="muted mt" style={{ fontSize: '.84rem' }}>Caregivers see medication reminders as a checklist during the visit.</p>
    </>
  )
}

function OperationalTab({ client }) {
  const [scheduled, setScheduled] = useState(null)
  const [caregivers, setCaregivers] = useState([])

  useEffect(() => {
    const weekStart = new Date(); weekStart.setHours(0,0,0,0); weekStart.setDate(weekStart.getDate() - weekStart.getDay())
    supabase.from('v_client_weekly_scheduled_hours').select('*').eq('client_id', client.id)
      .eq('week_start', weekStart.toISOString()).maybeSingle().then(({ data }) => setScheduled(data?.scheduled_hours ?? 0))
    supabase.from('client_caregivers').select('caregivers(first_name,last_name)').eq('client_id', client.id)
      .then(({ data }) => setCaregivers((data || []).map((r) => r.caregivers).filter(Boolean)))
  }, [client.id])

  const authorized = client.authorized_hours_per_week
  const over = authorized && scheduled != null && scheduled > authorized

  return (
    <>
      <p><b>Authorized hours/week:</b> {authorized ?? 'Not set'}</p>
      <p><b>Scheduled this week:</b> {scheduled ?? '—'} {over && <span className="pill pill-bad" style={{ marginLeft: '.5rem' }}>Over authorized hours</span>}</p>
      <h3 className="thread mt">Assigned caregiver pool</h3>
      {caregivers.length === 0 ? <p className="muted">No caregivers assigned yet — set this on the Details tab (Edit details → Operational).</p> : (
        <ul style={{ paddingLeft: '1.2rem' }}>{caregivers.map((c, i) => <li key={i}>{fullName(c)}</li>)}</ul>
      )}
    </>
  )
}

function CarePlanEditor({ clientId }) {
  const [plan, setPlan] = useState(null)
  const [tasks, setTasks] = useState([])
  const [summary, setSummary] = useState('')
  const [goals, setGoals] = useState('')
  const [special, setSpecial] = useState('')
  const [newTask, setNewTask] = useState({ category: 'ADL', label: '', instructions: '', frequency: 'Every visit' })
  const [msg, setMsg] = useState('')

  const load = async () => {
    let { data: p } = await supabase.from('care_plans').select('*')
      .eq('client_id', clientId).eq('is_active', true).maybeSingle()
    if (!p) {
      const ins = await supabase.from('care_plans')
        .insert({ client_id: clientId, title: 'Care Plan' }).select().single()
      p = ins.data
    }
    setPlan(p); setSummary(p?.summary || ''); setGoals(p?.goals || ''); setSpecial(p?.special_instructions || '')
    const { data: t } = await supabase.from('care_plan_tasks').select('*')
      .eq('care_plan_id', p.id).eq('is_active', true).order('sort_order')
    setTasks(t || [])
  }
  useEffect(() => { load() }, [clientId]) // eslint-disable-line

  const saveSummary = async () => {
    await supabase.from('care_plans').update({
      summary, goals, special_instructions: special, updated_at: new Date().toISOString(),
    }).eq('id', plan.id)
    setMsg('Care plan saved. Caregivers will see it on their next visit.')
    setTimeout(() => setMsg(''), 3500)
  }

  const addTask = async () => {
    if (!newTask.label.trim()) return
    await supabase.from('care_plan_tasks').insert({
      care_plan_id: plan.id, ...newTask, sort_order: tasks.length + 1,
    })
    setNewTask({ category: 'ADL', label: '', instructions: '', frequency: 'Every visit' })
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
        <textarea rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} />
      </Field>
      <Field label="Goals"><textarea rows={2} value={goals} onChange={(e) => setGoals(e.target.value)} /></Field>
      <Field label="Special instructions"><textarea rows={2} value={special} onChange={(e) => setSpecial(e.target.value)} /></Field>
      <button className="btn btn-outline mb" onClick={saveSummary}>Save care plan</button>

      <h3 className="thread" style={{ marginTop: '.6rem' }}>ADLs & IADLs</h3>
      {tasks.length === 0 && <p className="muted">No tasks yet — add the first one below.</p>}
      <table className="data mb">
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id}>
              <td style={{ width: 100 }}><Pill kind="info">{t.category}</Pill></td>
              <td><b>{t.label}</b>{t.instructions && <div className="muted" style={{ fontSize: '.83rem' }}>{t.instructions}</div>}</td>
              <td className="muted" style={{ width: 110 }}>{t.frequency}</td>
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
        <Field label="Frequency">
          <select value={newTask.frequency} onChange={(e) => setNewTask({ ...newTask, frequency: e.target.value })}>
            {['Every visit', 'Daily', 'Weekly', 'As needed'].map((f) => <option key={f}>{f}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Instructions"><input value={newTask.instructions} onChange={(e) => setNewTask({ ...newTask, instructions: e.target.value })} placeholder="Optional details" /></Field>
      <button className="btn btn-primary" onClick={addTask}>Add task</button>
    </>
  )
}

function Documents({ clientId }) {
  const [docs, setDocs] = useState([])
  const [physicians, setPhysicians] = useState([])
  const [f, setF] = useState({ doc_type: 'physician_order', title: '', physician_id: '' })
  const [file, setFile] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => {
    supabase.from('client_documents').select('*, physicians(name)').eq('client_id', clientId)
      .order('created_at', { ascending: false }).then(({ data }) => setDocs(data || []))
    supabase.from('physicians').select('id,name').eq('client_id', clientId).then(({ data }) => setPhysicians(data || []))
  }
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
      physician_id: f.physician_id || null,
    })
    setF({ doc_type: 'physician_order', title: '', physician_id: '' }); setFile(null); setBusy(false)
    load()
  }

  const open = async (d) => {
    const { data } = await supabase.storage.from('client-documents').createSignedUrl(d.storage_path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  return (
    <>
      <p className="muted" style={{ fontSize: '.88rem' }}>
        Physician orders, medication lists, and care plan files live here. Two-way messaging with
        physicians is planned for a later phase.
      </p>
      {err && <p className="notice notice-bad">{err}</p>}
      <div className="form-row-3">
        <Field label="Type">
          <select value={f.doc_type} onChange={(e) => setF({ ...f, doc_type: e.target.value })}>
            <option value="physician_order">Physician order</option>
            <option value="medication_list">Medication list</option>
            <option value="care_plan">Care plan file</option>
            <option value="assessment">Assessment</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Title"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="File"><input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} /></Field>
      </div>
      {f.doc_type === 'physician_order' && (
        <Field label="From which physician? (optional)">
          <select value={f.physician_id} onChange={(e) => setF({ ...f, physician_id: e.target.value })}>
            <option value="">— Not specified —</option>
            {physicians.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
      )}
      <button className="btn btn-primary mb" onClick={upload} disabled={busy}>{busy ? 'Uploading…' : 'Upload document'}</button>

      <table className="data">
        <tbody>
          {docs.map((d) => (
            <tr key={d.id} className="click" onClick={() => open(d)}>
              <td><Pill kind="gold">{d.doc_type.replaceAll('_', ' ')}</Pill></td>
              <td><b>{d.title}</b>{d.physicians?.name && <span className="muted"> — Dr. {d.physicians.name}</span>}</td>
              <td className="muted">{fmtDate(d.created_at)}</td>
            </tr>
          ))}
          {docs.length === 0 && <tr><td className="muted">No documents uploaded yet.</td></tr>}
        </tbody>
      </table>
    </>
  )
}
