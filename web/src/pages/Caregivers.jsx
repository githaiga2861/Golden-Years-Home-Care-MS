import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fullName, WEEKDAYS } from '../lib/format'
import { Modal, Field, Empty, Pill, ProfileHeader } from '../components/Ui'
import EditableSelect from '../components/EditableSelect'
import { createCaregiverAccount } from '../lib/createCaregiverAccount'

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

const CG_STEPS = ['basic', 'skills', 'availability', 'timeoff', 'account']
const CG_STEP_LABELS = { basic: '1. Basic Info', skills: '2. Skills & Credentials', availability: '3. Availability', timeoff: '4. Time Off', account: '5. Account' }

function CaregiverModal({ caregiver, onClose, onSaved }) {
  const isNew = !caregiver
  const [step, setStep] = useState('basic')
  const [f, setF] = useState(caregiver || {
    first_name: '', last_name: '', phone: '', email: '', address: '',
    caregiver_kind: 'hourly', hourly_rate: '', mileage_rate: '', notes: '', is_active: true,
    employee_id: '', emergency_contact_name: '', emergency_contact_phone: '',
    employment_type: '', overtime_rate: '', payroll_id: '', max_hours_per_week: '',
  })
  const [skillIds, setSkillIds] = useState([])
  const [restrictionIds, setRestrictionIds] = useState([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  // New-registration-only: collected locally, written together on final Save.
  const [availList, setAvailList] = useState([])
  const [newAvail, setNewAvail] = useState({ weekday: 1, start_time: '08:00', end_time: '17:00' })
  const [timeOffList, setTimeOffList] = useState([])
  const [newTimeOff, setNewTimeOff] = useState({ starts_at: '', ends_at: '', reason: '' })
  const [credList, setCredList] = useState([])
  const [newCred, setNewCred] = useState({ credential_type: '', credential_number: '', issued_date: '', expiry_date: '', notes: '' })
  const [makeAccount, setMakeAccount] = useState(true)
  const [acctEmail, setAcctEmail] = useState('')
  const [acctPassword, setAcctPassword] = useState('')

  useEffect(() => {
    if (!isNew) {
      supabase.from('caregiver_skills').select('skill_id').eq('caregiver_id', caregiver.id)
        .then(({ data }) => setSkillIds((data || []).map((r) => r.skill_id)))
      supabase.from('caregiver_restrictions').select('restriction_id').eq('caregiver_id', caregiver.id)
        .then(({ data }) => setRestrictionIds((data || []).map((r) => r.restriction_id)))
    }
  }, [caregiver?.id]) // eslint-disable-line

  useEffect(() => { setAcctEmail(f.email || '') }, [f.email])

  const addAvail = () => {
    if (newAvail.end_time <= newAvail.start_time) return
    setAvailList((a) => [...a, { ...newAvail, weekday: Number(newAvail.weekday), _id: Date.now() }])
  }
  const removeAvail = (id) => setAvailList((a) => a.filter((x) => x._id !== id))

  const addTimeOff = () => {
    if (!newTimeOff.starts_at || !newTimeOff.ends_at) return
    setTimeOffList((t) => [...t, { ...newTimeOff, _id: Date.now() }])
    setNewTimeOff({ starts_at: '', ends_at: '', reason: '' })
  }
  const removeTimeOff = (id) => setTimeOffList((t) => t.filter((x) => x._id !== id))

  const addCred = () => {
    if (!newCred.credential_type.trim()) return
    setCredList((c) => [...c, { ...newCred, _id: Date.now() }])
    setNewCred({ credential_type: '', credential_number: '', issued_date: '', expiry_date: '', notes: '' })
  }
  const removeCred = (id) => setCredList((c) => c.filter((x) => x._id !== id))

  const missingBasic = () => {
    const miss = []
    if (!f.phone) miss.push('Phone')
    if (!f.hourly_rate) miss.push('Pay rate')
    if (!f.emergency_contact_name) miss.push('Emergency contact name')
    if (!f.employment_type) miss.push('Employment type')
    return miss
  }
  const missingSkills = () => {
    const miss = []
    if (skillIds.length === 0) miss.push('Specialized skills')
    if (isNew && credList.length === 0) miss.push('Credentials (background check, TB test, CPR/First Aid, etc.)')
    return miss
  }
  const missingAvail = () => {
    return isNew && availList.length === 0 ? ['Weekly availability'] : []
  }
  const confirmProceed = (missing) => {
    if (missing.length === 0) return true
    return window.confirm(`These fields are still empty:\n\n${missing.join('\n')}\n\nContinue anyway?`)
  }

  const goNext = () => {
    setErr('')
    if (step === 'basic') {
      if (!f.first_name || !f.last_name) return setErr('First and last name are required.')
      if (!confirmProceed(missingBasic())) return
      setStep('skills')
    } else if (step === 'skills') {
      if (!confirmProceed(missingSkills())) return
      setStep('availability')
    } else if (step === 'availability') {
      if (!confirmProceed(missingAvail())) return
      setStep('timeoff')
    } else if (step === 'timeoff') {
      setStep('account')
    }
  }
  const goBack = () => {
    const i = CG_STEPS.indexOf(step)
    if (i > 0) setStep(CG_STEPS[i - 1])
  }

  const save = async () => {
    setErr('')
    if (isNew && makeAccount) {
      if (!acctEmail.trim()) return setErr('Enter an email for the Care App login, or turn off account creation.')
      if (!acctPassword || acctPassword.length < 8) return setErr('Password must be at least 8 characters.')
    }
    setBusy(true)
    try {
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
      if (error) throw error
      const cid = saved.id

      await supabase.from('caregiver_skills').delete().eq('caregiver_id', cid)
      if (skillIds.length) await supabase.from('caregiver_skills').insert(skillIds.map((s) => ({ caregiver_id: cid, skill_id: s })))
      await supabase.from('caregiver_restrictions').delete().eq('caregiver_id', cid)
      if (restrictionIds.length) await supabase.from('caregiver_restrictions').insert(restrictionIds.map((r) => ({ caregiver_id: cid, restriction_id: r })))

      if (isNew) {
        if (availList.length) {
          await supabase.from('caregiver_availability').insert(availList.map((a) => ({
            caregiver_id: cid, weekday: a.weekday, start_time: a.start_time, end_time: a.end_time,
          })))
        }
        if (timeOffList.length) {
          await supabase.from('caregiver_time_off').insert(timeOffList.map((t) => ({
            caregiver_id: cid, starts_at: t.starts_at, ends_at: t.ends_at, reason: t.reason, status: 'approved',
          })))
        }
        if (credList.length) {
          await supabase.from('caregiver_credentials').insert(credList.map((c) => ({
            caregiver_id: cid, credential_type: c.credential_type, credential_number: c.credential_number,
            issued_date: c.issued_date || null, expiry_date: c.expiry_date || null, notes: c.notes,
          })))
        }
        if (makeAccount) {
          const result = await createCaregiverAccount({
            email: acctEmail.trim(), password: acctPassword, caregiverId: cid, fullName: `${f.first_name} ${f.last_name}`,
          })
          if (!result.ok) {
            setErr(`Caregiver saved, but the login could not be created: ${result.error}. You can try again from the App Account tab.`)
            setBusy(false)
            onSaved()
            return
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

  // Editing an existing caregiver keeps the original single-page form —
  // ongoing availability/time-off/credentials changes happen in their profile tabs.
  if (!isNew) {
    return (
      <Modal title="Edit caregiver" onClose={onClose} footer={
        <><button className="btn btn-quiet" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save caregiver'}</button></>
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
          <Field label="Mileage ($/mi)"><input type="number" step="0.01" value={f.mileage_rate ?? ''} onChange={set('mileage_rate')} /></Field>
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
          Credentials, availability, and time off are managed from this caregiver's profile tabs.
        </p>
      </Modal>
    )
  }

  return (
    <Modal title="Register caregiver" onClose={onClose} wide footer={
      <>
        {step !== 'basic' && <button className="btn btn-quiet" onClick={goBack} style={{ marginRight: 'auto' }}>Back</button>}
        <button className="btn btn-quiet" onClick={onClose}>Cancel</button>
        {step !== 'account'
          ? <button className="btn btn-primary" onClick={goNext}>Next</button>
          : <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save caregiver'}</button>}
      </>
    }>
      {err && <p className="notice notice-bad">{err}</p>}
      <div className="toolbar mb">
        {CG_STEPS.map((s) => (
          <span key={s} className={`pill ${s === step ? 'pill-info' : 'pill-muted'}`} style={{ marginRight: '.4rem' }}>{CG_STEP_LABELS[s]}</span>
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
            <Field label="Email" help="Also used as their Care App login email."><input type="email" value={f.email || ''} onChange={set('email')} /></Field>
          </div>
          <div className="form-row-3">
            <Field label="Type">
              <select value={f.caregiver_kind} onChange={set('caregiver_kind')}>
                <option value="hourly">Hourly</option>
                <option value="live_in">Live-in</option>
              </select>
            </Field>
            <Field label="Pay rate ($/h)"><input type="number" step="0.01" value={f.hourly_rate ?? ''} onChange={set('hourly_rate')} /></Field>
            <Field label="Mileage ($/mi)"><input type="number" step="0.01" value={f.mileage_rate ?? ''} onChange={set('mileage_rate')} /></Field>
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
        </>
      )}

      {step === 'skills' && (
        <>
          <EditableSelect table="skills_list" label="Specialized skills" value={skillIds} onChange={setSkillIds} multi />
          <EditableSelect table="restrictions_list" label="Client matching restrictions" value={restrictionIds} onChange={setRestrictionIds} multi />

          <h3 className="thread mt">Credentials</h3>
          {credList.length === 0 && <p className="muted">No credentials added yet.</p>}
          {credList.map((c) => (
            <div key={c._id} className="shift-line" style={{ padding: '.4rem 0' }}>
              <div style={{ flex: 1 }}>
                <b>{c.credential_type}</b>{c.credential_number && <span className="muted"> · #{c.credential_number}</span>}
                {c.expiry_date && <span className="muted"> · Expires {c.expiry_date}</span>}
              </div>
              <button className="btn btn-quiet" onClick={() => removeCred(c._id)}>✕</button>
            </div>
          ))}
          <div className="form-row">
            <Field label="Type" help="e.g. CNA, HHA, CPR/First Aid, TB Test, Background Check">
              <input value={newCred.credential_type} onChange={(e) => setNewCred({ ...newCred, credential_type: e.target.value })} />
            </Field>
            <Field label="Credential / license number"><input value={newCred.credential_number} onChange={(e) => setNewCred({ ...newCred, credential_number: e.target.value })} /></Field>
          </div>
          <div className="form-row">
            <Field label="Issued date"><input type="date" value={newCred.issued_date} onChange={(e) => setNewCred({ ...newCred, issued_date: e.target.value })} /></Field>
            <Field label="Expiry date" help="Leave blank if it doesn't expire"><input type="date" value={newCred.expiry_date} onChange={(e) => setNewCred({ ...newCred, expiry_date: e.target.value })} /></Field>
          </div>
          <button type="button" className="btn btn-outline mb" onClick={addCred}>+ Add credential</button>
        </>
      )}

      {step === 'availability' && (
        <>
          <p className="muted" style={{ fontSize: '.88rem' }}>Weekly availability powers the ★ suggestions when assigning shifts.</p>
          {availList.length === 0 && <p className="muted">No availability added yet.</p>}
          {availList.map((a) => (
            <div key={a._id} className="shift-line" style={{ padding: '.4rem 0' }}>
              <div style={{ flex: 1 }}><b>{WEEKDAYS[a.weekday]}</b> · {a.start_time} – {a.end_time}</div>
              <button className="btn btn-quiet" onClick={() => removeAvail(a._id)}>✕</button>
            </div>
          ))}
          <div className="form-row-3">
            <Field label="Day">
              <select value={newAvail.weekday} onChange={(e) => setNewAvail({ ...newAvail, weekday: e.target.value })}>
                {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </Field>
            <Field label="From"><input type="time" value={newAvail.start_time} onChange={(e) => setNewAvail({ ...newAvail, start_time: e.target.value })} /></Field>
            <Field label="To"><input type="time" value={newAvail.end_time} onChange={(e) => setNewAvail({ ...newAvail, end_time: e.target.value })} /></Field>
          </div>
          <button type="button" className="btn btn-outline mb" onClick={addAvail}>+ Add availability</button>
        </>
      )}

      {step === 'timeoff' && (
        <>
          <p className="muted" style={{ fontSize: '.88rem' }}>Optional — block any known upcoming time off now, or add it later.</p>
          {timeOffList.length === 0 && <p className="muted">No time off added yet.</p>}
          {timeOffList.map((t) => (
            <div key={t._id} className="shift-line" style={{ padding: '.4rem 0' }}>
              <div style={{ flex: 1 }}>
                <b>{new Date(t.starts_at).toLocaleDateString()} → {new Date(t.ends_at).toLocaleDateString()}</b>
                {t.reason && <span className="muted"> · {t.reason}</span>}
              </div>
              <button className="btn btn-quiet" onClick={() => removeTimeOff(t._id)}>✕</button>
            </div>
          ))}
          <div className="form-row">
            <Field label="Starts"><input type="datetime-local" value={newTimeOff.starts_at} onChange={(e) => setNewTimeOff({ ...newTimeOff, starts_at: e.target.value })} /></Field>
            <Field label="Ends"><input type="datetime-local" value={newTimeOff.ends_at} onChange={(e) => setNewTimeOff({ ...newTimeOff, ends_at: e.target.value })} /></Field>
          </div>
          <Field label="Reason (optional)"><input value={newTimeOff.reason} onChange={(e) => setNewTimeOff({ ...newTimeOff, reason: e.target.value })} /></Field>
          <button type="button" className="btn btn-outline mb" onClick={addTimeOff}>+ Add time off</button>
        </>
      )}

      {step === 'account' && (
        <>
          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={makeAccount} onChange={(e) => setMakeAccount(e.target.checked)} />
              <span><b>Create their Care App login now</b></span>
            </label>
          </div>
          {makeAccount && (
            <>
              <div className="form-row">
                <Field label="Login email"><input type="email" value={acctEmail} onChange={(e) => setAcctEmail(e.target.value)} /></Field>
                <Field label="Temporary password" help="At least 8 characters. Share this with them securely.">
                  <input type="text" value={acctPassword} onChange={(e) => setAcctPassword(e.target.value)} />
                </Field>
              </div>
              <p className="muted" style={{ fontSize: '.84rem' }}>
                This creates a real login instantly — no need to use Supabase directly. They can change their password later from the Care App.
              </p>
            </>
          )}
          {!makeAccount && (
            <p className="muted" style={{ fontSize: '.86rem' }}>
              You can create their login anytime from the App Account tab on their profile.
            </p>
          )}
        </>
      )}
    </Modal>
  )
}
function CaregiverDetail({ caregiver, onClose }) {
  const [tab, setTab] = useState('availability')
  const [editing, setEditing] = useState(false)
  const tabs = ['availability', 'timeoff', 'credentials', 'account', 'details']
  const labels = { availability: 'Availability', timeoff: 'Time off', credentials: 'Credentials', account: 'App account', details: 'Details' }
  const initials = `${caregiver.first_name?.[0] || ''}${caregiver.last_name?.[0] || ''}`.toUpperCase()

  return (
    <Modal
      onClose={onClose}
      xwide
      header={
        <ProfileHeader name={fullName(caregiver)} initials={initials} subtitle={caregiver.employee_id ? `Employee #${caregiver.employee_id}` : 'Caregiver'}>
          <Pill kind={caregiver.is_active ? 'ok' : 'muted'}>{caregiver.is_active ? 'Active' : 'Inactive'}</Pill>
          {caregiver.caregiver_kind === 'live_in' && <Pill kind="info">Live-in</Pill>}
          {caregiver.employment_type && <Pill kind="muted">{caregiver.employment_type}</Pill>}
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
          {tab === 'availability' && <AvailabilityEditor caregiverId={caregiver.id} />}
          {tab === 'timeoff' && <TimeOffTab caregiverId={caregiver.id} />}
          {tab === 'credentials' && <CredentialsTab caregiverId={caregiver.id} />}
          {tab === 'account' && <AccountLink caregiver={caregiver} />}
          {tab === 'details' && (
            <>
              <dl className="deflist">
                <div><dt>Phone</dt><dd>{caregiver.phone || '—'}</dd></div>
                <div><dt>Email</dt><dd>{caregiver.email || '—'}</dd></div>
                <div><dt>Type</dt><dd>{caregiver.caregiver_kind === 'live_in' ? 'Live-in' : 'Hourly'}</dd></div>
                <div><dt>Pay rate</dt><dd>{caregiver.hourly_rate ? `$${Number(caregiver.hourly_rate).toFixed(2)}/h` : '—'}</dd></div>
                <div><dt>Mileage</dt><dd>{caregiver.mileage_rate ? `$${Number(caregiver.mileage_rate).toFixed(2)}/mi` : 'Not reimbursed'}</dd></div>
                <div><dt>Home address</dt><dd>{caregiver.address || '—'}</dd></div>
                <div><dt>Employment type</dt><dd>{caregiver.employment_type || '—'}</dd></div>
                <div><dt>Payroll ID</dt><dd>{caregiver.payroll_id || '—'}</dd></div>
                <div><dt>Overtime rate</dt><dd>{caregiver.overtime_rate ? `$${Number(caregiver.overtime_rate).toFixed(2)}/h` : '—'}</dd></div>
                <div><dt>Max hours/week</dt><dd>{caregiver.max_hours_per_week || '—'}</dd></div>
                <div className="span2"><dt>Emergency contact</dt><dd>{caregiver.emergency_contact_name || '—'} {caregiver.emergency_contact_phone || ''}</dd></div>
                {caregiver.notes && <div className="span2"><dt>Notes</dt><dd className="muted">{caregiver.notes}</dd></div>}
              </dl>
              {editing
                ? <CaregiverModal caregiver={caregiver} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onClose() }} />
                : <button className="btn btn-outline" onClick={() => setEditing(true)}>Edit details</button>}
            </>
          )}
        </div>
      </div>
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
