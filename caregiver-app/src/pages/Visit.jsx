import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { getPosition, distanceM } from '../lib/geo'
import { enqueue, syncQueue } from '../lib/offline'

const fmtT = (d) => new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
const WarnIcon = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: '-3px', marginRight: '.35rem' }}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>

/**
 * The heart of the Care App: one visit, start to finish.
 * Flow: arrive -> Start Visit (GPS captured) -> care plan + ADL checklist
 * -> write note -> End Visit. Every action works offline and syncs later.
 */
export default function Visit() {
  const { shiftId } = useParams()
  const nav = useNavigate()
  const { caregiver, session } = useAuth()

  const [shift, setShift] = useState(null)
  const [client, setClient] = useState(null)
  const [allergies, setAllergies] = useState([])
  const [mobility, setMobility] = useState(null)
  const [medications, setMedications] = useState([])
  const [documents, setDocuments] = useState([])
  const [plan, setPlan] = useState(null)
  const [planTasks, setPlanTasks] = useState([])
  const [visit, setVisit] = useState(null)      // server visit row (null if offline-created)
  const [tasks, setTasks] = useState([])        // visit_tasks (server) or local snapshot (offline)
  const [note, setNote] = useState('')
  const [savedNotes, setSavedNotes] = useState([])
  const [msg, setMsg] = useState(null)          // {kind, text}
  const [busy, setBusy] = useState(false)
  const [gps, setGps] = useState(null)          // last known {lat,lng}
  const [locationReady, setLocationReady] = useState(null) // null=checking, true=ok, false=denied/unavailable
  const [mileage, setMileage] = useState('')
  const [mileageNotes, setMileageNotes] = useState('')
  const [mileageSaved, setMileageSaved] = useState(false)
  const [photos, setPhotos] = useState([])
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [vitalsHistory, setVitalsHistory] = useState([])
  const [vitalsForm, setVitalsForm] = useState({ blood_pressure: '', pulse: '', temperature: '', weight: '', blood_glucose: '', notes: '' })
  const [now, setNow] = useState(new Date())

  // Local mirror so the screen keeps working offline
  const localKey = `gy-visit-${shiftId}`
  const localState = () => { try { return JSON.parse(localStorage.getItem(localKey)) || {} } catch { return {} } }
  const setLocal = (patch) => localStorage.setItem(localKey, JSON.stringify({ ...localState(), ...patch }))

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(t)
  }, [])

  const load = async () => {
    const { data: s } = await supabase.from('shifts')
      .select('*, clients(*, mobility_levels(label))').eq('id', shiftId).single()
    if (!s) return
    setShift(s); setClient(s.clients); setMobility(s.clients?.mobility_levels?.label || null)

    const { data: al } = await supabase.from('client_allergies').select('allergies_list(label)').eq('client_id', s.client_id)
    setAllergies((al || []).map((r) => r.allergies_list?.label).filter(Boolean))

    const { data: meds } = await supabase.from('medications').select('*')
      .eq('client_id', s.client_id).eq('is_active', true).order('created_at')
    setMedications(meds || [])

    const { data: docs } = await supabase.from('client_documents').select('*')
      .eq('client_id', s.client_id).in('doc_type', ['physician_order', 'care_plan'])
      .order('created_at', { ascending: false })
    setDocuments(docs || [])

    const { data: cp } = await supabase.from('care_plans').select('*')
      .eq('client_id', s.client_id).eq('is_active', true).maybeSingle()
    setPlan(cp)
    if (cp) {
      const { data: t } = await supabase.from('care_plan_tasks').select('*')
        .eq('care_plan_id', cp.id).eq('is_active', true).order('sort_order')
      setPlanTasks(t || [])
    }

    const { data: v } = await supabase.from('visits').select('*').eq('shift_id', shiftId).maybeSingle()
    setVisit(v)
    if (v) {
      const { data: vt } = await supabase.from('visit_tasks').select('*').eq('visit_id', v.id)
      setTasks(vt || [])
      const { data: n } = await supabase.from('visit_notes').select('*').eq('visit_id', v.id).order('created_at')
      setSavedNotes(n || [])
      setMileage(v.mileage_miles ?? ''); setMileageNotes(v.mileage_notes || ''); setMileageSaved(!!v.mileage_miles)
      const { data: ph } = await supabase.from('visit_photos').select('*').eq('visit_id', v.id).order('created_at', { ascending: false })
      setPhotos(ph || [])
      const { data: vi } = await supabase.from('visit_vitals').select('*').eq('visit_id', v.id).order('recorded_at', { ascending: false })
      setVitalsHistory(vi || [])
    }
  }

  useEffect(() => { load().catch(() => {}) }, [shiftId]) // eslint-disable-line

  useEffect(() => {
    // Ask for location immediately when the visit screen opens — not just
    // when the caregiver taps Clock In — so the permission prompt (and any
    // "please enable location" warning) appears right away.
    getPosition().then((pos) => { setGps(pos); setLocationReady(!!pos) })
  }, [])

  // ---- derived state (works both online and offline) ----
  const ls = localState()
  const clockedIn = Boolean(visit?.clock_in_at || ls.clock_in_at)
  const clockedOut = Boolean(visit?.clock_out_at || ls.clock_out_at)
  const clockInAt = visit?.clock_in_at || ls.clock_in_at
  const clockOutAt = visit?.clock_out_at || ls.clock_out_at
  const displayTasks = tasks.length ? tasks : (ls.tasks || [])

  const flash = (kind, text, ms = 4000) => { setMsg({ kind, text }); setTimeout(() => setMsg(null), ms) }

  const clockIn = async () => {
    setBusy(true)
    const pos = await getPosition()
    setGps(pos)
    setLocationReady(!!pos)

    if (!pos) {
      setBusy(false)
      flash('bad', 'Location access is required to clock in. Please allow location access for this app in your device settings, then try again.', 9000)
      return
    }

    const at = new Date().toISOString()

    if (client?.latitude != null && client?.longitude != null) {
      const d = distanceM(pos.lat, pos.lng, client.latitude, client.longitude)
      const radius = client.geofence_radius_m || 150
      if (d > radius) {
        const miles = (d / 1609.34).toFixed(2)
        const alertMsg = `${caregiver.first_name} ${caregiver.last_name} attempted to clock IN for ${client.first_name} ${client.last_name} but was ${miles} mi (${d} m) outside the ${radius} m geofence. Clock-in was blocked.`
        if (navigator.onLine) {
          await supabase.from('alerts').insert({
            alert_type: 'other', severity: 'critical', message: alertMsg,
            shift_id: shift.id, client_id: client.id, caregiver_id: caregiver.id,
          })
        } else {
          enqueue({ type: 'geofence_block', message: alertMsg, shift_id: shift.id, client_id: client.id, caregiver_id: caregiver.id })
        }
        setBusy(false)
        flash('bad', `You're about ${miles} mi from ${client.first_name}'s home — too far away to clock in. If you believe this is a mistake, please contact the office immediately.`, 12000)
        return
      }
    }

    if (navigator.onLine) {
      const { data, error } = await supabase.rpc('clock_in', {
        p_shift_id: shiftId, p_lat: pos.lat, p_lng: pos.lng, p_at: at,
      })
      if (error) {
        // Fall back to the offline queue (e.g. flaky connection mid-request)
        enqueue({ type: 'clock_in', shift_id: shiftId, lat: pos.lat, lng: pos.lng, at })
        setLocal({ clock_in_at: at, tasks: planTasks.map((t) => ({ id: `local-${t.id}`, label: t.label, category: t.category, instructions: t.instructions, completed: false })) })
      } else {
        await load()
      }
    } else {
      enqueue({ type: 'clock_in', shift_id: shiftId, lat: pos.lat, lng: pos.lng, at })
      setLocal({ clock_in_at: at, tasks: planTasks.map((t) => ({ id: `local-${t.id}`, label: t.label, category: t.category, instructions: t.instructions, completed: false })) })
      flash('warn', "You're offline — clock-in saved on this phone and will upload automatically.", 6000)
    }
    setBusy(false)
  }

  const clockOut = async () => {
    if (!confirm('End this visit and clock out?')) return
    setBusy(true)
    const pos = await getPosition()
    setGps(pos)

    if (!pos) {
      setBusy(false)
      flash('bad', 'Location access is required to clock out. Please allow location access and try again.', 9000)
      return
    }

    if (client?.latitude != null && client?.longitude != null) {
      const d = distanceM(pos.lat, pos.lng, client.latitude, client.longitude)
      const radius = client.geofence_radius_m || 150
      if (d > radius) {
        const miles = (d / 1609.34).toFixed(2)
        const alertMsg = `${caregiver.first_name} ${caregiver.last_name} attempted to clock OUT for ${client.first_name} ${client.last_name} but was ${miles} mi (${d} m) outside the ${radius} m geofence. Clock-out was blocked.`
        if (navigator.onLine) {
          await supabase.from('alerts').insert({
            alert_type: 'other', severity: 'critical', message: alertMsg,
            shift_id: shift.id, client_id: client.id, caregiver_id: caregiver.id,
          })
        } else {
          enqueue({ type: 'geofence_block', message: alertMsg, shift_id: shift.id, client_id: client.id, caregiver_id: caregiver.id })
        }
        setBusy(false)
        flash('bad', `You're about ${miles} mi from ${client.first_name}'s home — too far away to clock out. If you believe this is a mistake, please contact the office immediately.`, 12000)
        return
      }
    }

    const at = new Date().toISOString()

    if (navigator.onLine && visit) {
      const { error } = await supabase.rpc('clock_out', {
        p_visit_id: visit.id, p_lat: pos.lat, p_lng: pos.lng, p_at: at,
      })
      if (error) {
        enqueue({ type: 'clock_out', shift_id: shiftId, lat: pos.lat, lng: pos.lng, at })
        setLocal({ clock_out_at: at })
      } else await load()
    } else {
      enqueue({ type: 'clock_out', shift_id: shiftId, lat: pos.lat, lng: pos.lng, at })
      setLocal({ clock_out_at: at })
      flash('warn', "You're offline — clock-out saved and will upload automatically.", 6000)
    }
    setBusy(false)
    syncQueue()
  }

  const toggleTask = async (t) => {
    const completed = !t.completed
    const at = new Date().toISOString()
    if (navigator.onLine && visit && !String(t.id).startsWith('local-')) {
      await supabase.from('visit_tasks').update({ completed, completed_at: completed ? at : null }).eq('id', t.id)
      setTasks((xs) => xs.map((x) => (x.id === t.id ? { ...x, completed } : x)))
    } else {
      enqueue({ type: 'task', task_id: t.id, completed, at })
      if (tasks.length) {
        // Server-loaded checklist, but we're offline: update the visible list too
        setTasks((xs) => xs.map((x) => (x.id === t.id ? { ...x, completed } : x)))
      } else {
        const updated = (ls.tasks || displayTasks).map((x) => (x.id === t.id ? { ...x, completed } : x))
        setLocal({ tasks: updated })
        setTasks([]) // trigger re-render from local snapshot
      }
    }
  }

  const saveNote = async () => {
    const body = note.trim()
    if (!body) return
    if (navigator.onLine && visit) {
      const { error } = await supabase.from('visit_notes').insert({
        visit_id: visit.id, author_id: session.user.id, body,
      })
      if (!error) { setNote(''); flash('ok', 'Note saved.'); load(); return }
    }
    enqueue({ type: 'note', shift_id: shiftId, author_id: session.user.id, body })
    setLocal({ pendingNote: true })
    setNote('')
    flash('warn', 'Note saved on this phone — it will upload automatically.')
  }

  const saveMileage = async () => {
    if (!visit || mileage === '') return
    const { error } = await supabase.from('visits').update({
      mileage_miles: Number(mileage), mileage_notes: mileageNotes || null,
    }).eq('id', visit.id)
    if (!error) { setMileageSaved(true); flash('ok', 'Mileage saved.') }
  }

  const uploadPhoto = async (file) => {
    if (!visit || !file) return
    setUploadingPhoto(true)
    const path = `${visit.id}/${Date.now()}_${file.name}`
    const { error: upErr } = await supabase.storage.from('visit-photos').upload(path, file)
    if (!upErr) {
      await supabase.from('visit_photos').insert({ visit_id: visit.id, storage_path: path })
      const { data: ph } = await supabase.from('visit_photos').select('*').eq('visit_id', visit.id).order('created_at', { ascending: false })
      setPhotos(ph || [])
    }
    setUploadingPhoto(false)
  }

  const viewPhoto = async (p) => {
    const { data } = await supabase.storage.from('visit-photos').createSignedUrl(p.storage_path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const saveVitals = async () => {
    if (!visit) return
    const hasAny = Object.values(vitalsForm).some((v) => v !== '')
    if (!hasAny) return
    const row = {
      visit_id: visit.id,
      blood_pressure: vitalsForm.blood_pressure || null,
      pulse: vitalsForm.pulse ? Number(vitalsForm.pulse) : null,
      temperature: vitalsForm.temperature ? Number(vitalsForm.temperature) : null,
      weight: vitalsForm.weight ? Number(vitalsForm.weight) : null,
      blood_glucose: vitalsForm.blood_glucose ? Number(vitalsForm.blood_glucose) : null,
      notes: vitalsForm.notes || null,
    }
    const { error } = await supabase.from('visit_vitals').insert(row)
    if (!error) {
      setVitalsForm({ blood_pressure: '', pulse: '', temperature: '', weight: '', blood_glucose: '', notes: '' })
      const { data: vi } = await supabase.from('visit_vitals').select('*').eq('visit_id', visit.id).order('recorded_at', { ascending: false })
      setVitalsHistory(vi || [])
      flash('ok', 'Vitals recorded.')
    }
  }

  const openDocument = async (d) => {
    const { data } = await supabase.storage.from('client-documents').createSignedUrl(d.storage_path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  if (!shift || !client) return <div className="empty"><p>Loading visit…</p></div>

  return (
    <>
      <button className="btn btn-quiet" onClick={() => nav(-1)}>← Back</button>
      <div className="card">
        <h2>{client.first_name} {client.last_name}</h2>
        <p className="muted" style={{ margin: '.15rem 0' }}>{client.address}{client.city ? `, ${client.city}` : ''}</p>
        <p className="muted" style={{ margin: 0, fontSize: '.86rem' }}>
          Scheduled {fmtT(shift.starts_at)} – {fmtT(shift.ends_at)} · {shift.service_type}
        </p>
        {shift.notes && <p className="notice notice-warn" style={{ marginTop: '.7rem' }}>Office note: {shift.notes}</p>}
      </div>

      {(allergies.length > 0 || mobility || client.fall_risk || client.special_precautions?.length > 0) && (
        <div className="card" style={{ borderLeft: '4px solid var(--bad)' }}>
          <h3 style={{ marginBottom: '.5rem' }}>{WarnIcon}Safety information</h3>
          {client.fall_risk && (
            <p style={{ margin: '0 0 .4rem' }}><span className="pill pill-bad">Fall risk</span></p>
          )}
          {allergies.length > 0 && (
            <p style={{ margin: '0 0 .4rem' }}>
              <b>Allergies:</b>{' '}
              {allergies.map((a) => <span key={a} className="pill pill-bad" style={{ marginRight: '.3rem' }}>{a}</span>)}
            </p>
          )}
          {mobility && (
            <p style={{ margin: '0 0 .4rem' }}><b>Mobility level:</b> <span className="pill pill-warn">{mobility}</span></p>
          )}
          {client.special_precautions?.length > 0 && (
            <p style={{ margin: 0 }}>
              <b>Special precautions:</b>{' '}
              {client.special_precautions.map((p) => <span key={p} className="pill pill-bad" style={{ marginRight: '.3rem' }}>{p}</span>)}
            </p>
          )}
        </div>
      )}

      {msg && <p className={`notice notice-${msg.kind}`}>{msg.text}</p>}

      <div className="card clock-hero">
        <div className="now">{now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</div>
        {!clockedIn && (
          <>
            {locationReady === false && (
              <p className="notice notice-bad" style={{ marginBottom: '.6rem' }}>
                Location access is blocked or unavailable. Please enable location for this app in your device settings — you cannot clock in without it.
              </p>
            )}
            <button className="btn btn-clockin" onClick={clockIn} disabled={busy}>
              {busy ? 'Checking your location…' : '▶ Start visit (clock in)'}
            </button>
            <p className="gps-line muted">Your location is required and checked at clock-in to confirm you're at the client's home.</p>
          </>
        )}
        {clockedIn && !clockedOut && (
          <>
            <p className="pill pill-gold" style={{ marginBottom: '.7rem' }}>Clocked in at {fmtT(clockInAt)}</p>
            <button className="btn btn-clockout" onClick={clockOut} disabled={busy}>■ End visit (clock out)</button>
          </>
        )}
        {clockedOut && (
          <p className="pill pill-ok">Visit complete · {fmtT(clockInAt)} – {fmtT(clockOutAt)}</p>
        )}
      </div>

      {plan && (
        <div className="card">
          <h3>Care plan</h3>
          <p className="muted" style={{ fontSize: '.9rem' }}>{plan.summary || 'No summary provided.'}</p>
          {plan.goals && (
            <>
              <b style={{ fontSize: '.86rem' }}>Goals</b>
              <p className="muted" style={{ fontSize: '.9rem', marginTop: '.2rem' }}>{plan.goals}</p>
            </>
          )}
          {plan.special_instructions && (
            <>
              <b style={{ fontSize: '.86rem' }}>Special instructions</b>
              <p className="notice notice-warn" style={{ fontSize: '.9rem', marginTop: '.2rem' }}>{plan.special_instructions}</p>
            </>
          )}
        </div>
      )}

      {medications.length > 0 && (
        <div className="card">
          <h3>Medications</h3>
          {medications.map((m) => (
            <div key={m.id} style={{ padding: '.5rem 0', borderBottom: '1px solid var(--line)' }}>
              <b>{m.name}</b> — {m.dosage}{m.route && <span className="muted"> · {m.route}</span>}
              {m.schedule_times?.length > 0 && (
                <div className="muted" style={{ fontSize: '.84rem' }}>Times: {m.schedule_times.join(', ')}</div>
              )}
              {m.instructions && <div className="muted" style={{ fontSize: '.84rem' }}>{m.instructions}</div>}
            </div>
          ))}
          <p className="muted" style={{ fontSize: '.8rem', marginTop: '.5rem' }}>
            Reminder only — confirm with the office if you have questions about administration.
          </p>
        </div>
      )}

      {documents.length > 0 && (
        <div className="card">
          <h3>Physician orders & care plan files</h3>
          {documents.map((d) => (
            <button key={d.id} onClick={() => openDocument(d)}
              style={{ display: 'block', width: '100%', textAlign: 'left', background: 'var(--paper)', border: 'none',
                borderRadius: 8, padding: '.6rem .8rem', marginBottom: '.4rem', cursor: 'pointer' }}>
              <span className="pill pill-gold" style={{ marginRight: '.4rem' }}>{d.doc_type.replaceAll('_', ' ')}</span>
              {d.title}
            </button>
          ))}
        </div>
      )}

      {clockedIn && (
        <div className="card">
          <h3>Today's tasks (ADLs)</h3>
          {displayTasks.length === 0 && <p className="muted">No checklist for this client yet.</p>}
          {displayTasks.map((t) => (
            <label className="task" key={t.id}>
              <input type="checkbox" checked={!!t.completed} onChange={() => toggleTask(t)} disabled={clockedOut} />
              <span>
                <span className="t-cat">{t.category}</span>
                <span className="t-label" style={{ display: 'block' }}>{t.label}</span>
                {t.instructions && <span className="t-instr">{t.instructions}</span>}
              </span>
            </label>
          ))}
        </div>
      )}

      {clockedIn && visit && (
        <div className="card">
          <h3>Vitals</h3>
          {vitalsHistory.map((v) => (
            <div key={v.id} style={{ padding: '.4rem 0', borderBottom: '1px solid var(--line)', fontSize: '.88rem' }}>
              {v.blood_pressure && <span>BP {v.blood_pressure} · </span>}
              {v.pulse && <span>Pulse {v.pulse} · </span>}
              {v.temperature && <span>Temp {v.temperature}°F · </span>}
              {v.weight && <span>Weight {v.weight}lb · </span>}
              {v.blood_glucose && <span>Glucose {v.blood_glucose} · </span>}
              <span className="muted">{fmtT(v.recorded_at)}</span>
              {v.notes && <div className="muted">{v.notes}</div>}
            </div>
          ))}
          <div className="form-row-3" style={{ marginTop: '.6rem' }}>
            <div className="field"><label>Blood pressure</label><input value={vitalsForm.blood_pressure} onChange={(e) => setVitalsForm({ ...vitalsForm, blood_pressure: e.target.value })} placeholder="120/80" /></div>
            <div className="field"><label>Pulse</label><input type="number" value={vitalsForm.pulse} onChange={(e) => setVitalsForm({ ...vitalsForm, pulse: e.target.value })} /></div>
            <div className="field"><label>Temp (°F)</label><input type="number" step="0.1" value={vitalsForm.temperature} onChange={(e) => setVitalsForm({ ...vitalsForm, temperature: e.target.value })} /></div>
          </div>
          <div className="form-row-3">
            <div className="field"><label>Weight (lb)</label><input type="number" step="0.1" value={vitalsForm.weight} onChange={(e) => setVitalsForm({ ...vitalsForm, weight: e.target.value })} /></div>
            <div className="field"><label>Blood glucose</label><input type="number" step="0.1" value={vitalsForm.blood_glucose} onChange={(e) => setVitalsForm({ ...vitalsForm, blood_glucose: e.target.value })} /></div>
            <div className="field"><label>Notes</label><input value={vitalsForm.notes} onChange={(e) => setVitalsForm({ ...vitalsForm, notes: e.target.value })} /></div>
          </div>
          <button className="btn btn-primary" onClick={saveVitals}>Record vitals</button>
        </div>
      )}

      {clockedIn && visit && (
        <div className="card">
          <h3>Photos</h3>
          <p className="muted" style={{ fontSize: '.85rem' }}>For wound documentation or anything the office should see.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', marginBottom: '.6rem' }}>
            {photos.map((p) => (
              <button key={p.id} onClick={() => viewPhoto(p)} className="btn btn-outline" style={{ fontSize: '.8rem' }}>
                {new Date(p.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </button>
            ))}
          </div>
          <input type="file" accept="image/*" capture="environment"
            onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])} disabled={uploadingPhoto} />
          {uploadingPhoto && <p className="muted">Uploading…</p>}
        </div>
      )}

      {clockedIn && visit && (
        <div className="card">
          <h3>Mileage</h3>
          <div className="form-row">
            <div className="field"><label>Miles driven for this visit</label>
              <input type="number" step="0.1" value={mileage} onChange={(e) => { setMileage(e.target.value); setMileageSaved(false) }} />
            </div>
            <div className="field"><label>Notes (optional)</label>
              <input value={mileageNotes} onChange={(e) => { setMileageNotes(e.target.value); setMileageSaved(false) }} placeholder="e.g. office to client" />
            </div>
          </div>
          <button className="btn btn-primary" onClick={saveMileage} disabled={mileageSaved || mileage === ''}>
            {mileageSaved ? 'Saved' : 'Save mileage'}
          </button>
        </div>
      )}

      {clockedIn && (
        <div className="card">
          <h3>Visit note</h3>
          {savedNotes.map((n) => (
            <p key={n.id} style={{ background: 'var(--paper)', padding: '.6rem .8rem', borderRadius: 8, fontSize: '.9rem' }}>{n.body}</p>
          ))}
          <div className="field">
            <label htmlFor="note">How did the visit go?</label>
            <textarea id="note" rows={4} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Client's condition, anything unusual, tasks not completed and why…" />
          </div>
          <button className="btn btn-primary" onClick={saveNote}>Save note</button>
        </div>
      )}
    </>
  )
}
