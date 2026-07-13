import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtTime, fullName, startOfWeek, addDays, toISODate, WEEKDAYS } from '../lib/format'
import { Modal, Field, Pill } from '../components/Ui'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function Schedule() {
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()))
  const [shifts, setShifts] = useState([])
  const [clients, setClients] = useState([])
  const [caregivers, setCaregivers] = useState([])
  const [availability, setAvailability] = useState([])
  const [editing, setEditing] = useState(null) // null | {} (new) | shift row
  const [filterCg, setFilterCg] = useState('')

  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart])

  const load = () => {
    supabase.from('shifts')
      .select('*, clients(first_name,last_name), caregivers(first_name,last_name)')
      .gte('starts_at', weekStart.toISOString()).lt('starts_at', weekEnd.toISOString())
      .order('starts_at')
      .then(({ data }) => setShifts(data || []))
  }

  useEffect(load, [weekStart]) // eslint-disable-line
  useEffect(() => {
    supabase.from('clients').select('id,first_name,last_name,bill_rate').eq('is_active', true).order('last_name')
      .then(({ data }) => setClients(data || []))
    supabase.from('caregivers').select('id,first_name,last_name,hourly_rate').eq('is_active', true).order('last_name')
      .then(({ data }) => setCaregivers(data || []))
    supabase.from('caregiver_availability').select('*').then(({ data }) => setAvailability(data || []))
  }, [])

  const days = [...Array(7)].map((_, i) => addDays(weekStart, i))
  const byDay = (d) =>
    shifts.filter((s) => new Date(s.starts_at).toDateString() === d.toDateString())
      .filter((s) => !filterCg || s.caregiver_id === filterCg)

  return (
    <>
      <div className="page-head">
        <div><h1 className="thread">Schedule</h1><div className="sub">Assign caregivers, manage shifts, spot gaps early.</div></div>
        <button className="btn btn-primary" onClick={() => setEditing({})}>+ New shift</button>
      </div>

      <div className="cal-toolbar mb">
        <button className="btn btn-outline" onClick={() => setWeekStart(addDays(weekStart, -7))}>← Prev</button>
        <button className="btn btn-quiet" onClick={() => setWeekStart(startOfWeek(new Date()))}>This week</button>
        <button className="btn btn-outline" onClick={() => setWeekStart(addDays(weekStart, 7))}>Next →</button>
        <b style={{ marginLeft: '.4rem' }}>
          {weekStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} – {addDays(weekStart, 6).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </b>
        <select className="searchbox right" value={filterCg} onChange={(e) => setFilterCg(e.target.value)}>
          <option value="">All caregivers</option>
          {caregivers.map((c) => <option key={c.id} value={c.id}>{fullName(c)}</option>)}
        </select>
      </div>

      <div className="cal-grid">
        {days.map((d, i) => (
          <div key={i} className={`cal-day ${d.toDateString() === new Date().toDateString() ? 'today' : ''}`}>
            <div className="d-head"><span>{DAY_LABELS[d.getDay()]}</span><span>{d.getDate()}</span></div>
            {byDay(d).map((s) => (
              <button key={s.id} className={`shift-chip ${s.status}`} onClick={() => setEditing(s)}>
                <span className="t">{fmtTime(s.starts_at)}–{fmtTime(s.ends_at)}</span><br />
                {fullName(s.clients)}<br />
                <span style={{ opacity: .8 }}>{s.caregiver_id ? fullName(s.caregivers) : '⚠ Unassigned'}</span>
              </button>
            ))}
          </div>
        ))}
      </div>

      <p className="muted" style={{ fontSize: '.82rem', marginTop: '.6rem' }}>
        <Pill kind="info">Assigned</Pill> <Pill kind="warn">Open</Pill> <Pill kind="gold">In progress</Pill> <Pill kind="ok">Completed</Pill>
      </p>

      {editing !== null && (
        <ShiftModal
          shift={editing.id ? editing : null}
          clients={clients} caregivers={caregivers} availability={availability}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </>
  )
}

function ShiftModal({ shift, clients, caregivers, availability, onClose, onSaved }) {
  const isNew = !shift
  const [form, setForm] = useState(() => ({
    client_id: shift?.client_id || '',
    caregiver_id: shift?.caregiver_id || '',
    date: toISODate(shift?.starts_at || new Date()),
    start: shift ? new Date(shift.starts_at).toTimeString().slice(0, 5) : '09:00',
    end: shift ? new Date(shift.ends_at).toTimeString().slice(0, 5) : '13:00',
    service_type: shift?.service_type || 'Personal Care',
    notes: shift?.notes || '',
    repeat: false, repeatDays: [], repeatUntil: toISODate(addDays(new Date(), 28)),
  }))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const weekday = new Date(form.date + 'T00:00').getDay()

  // Availability-aware ordering: caregivers available on this weekday first.
  const availableIds = new Set(
    availability.filter((a) => a.weekday === weekday).map((a) => a.caregiver_id)
  )
  const sortedCg = [...caregivers].sort((a, b) =>
    (availableIds.has(b.id) ? 1 : 0) - (availableIds.has(a.id) ? 1 : 0)
  )

  const save = async () => {
    setErr('')
    if (!form.client_id) return setErr('Choose a client.')
    if (form.end <= form.start) return setErr('End time must be after start time.')
    setBusy(true)
    try {
      if (form.repeat && isNew) {
        if (form.repeatDays.length === 0) throw new Error('Pick at least one weekday to repeat on.')
        const { error } = await supabase.rpc('create_recurring_shifts', {
          p_client_id: form.client_id,
          p_caregiver_id: form.caregiver_id || null,
          p_first_date: form.date,
          p_until: form.repeatUntil,
          p_start_time: form.start,
          p_end_time: form.end,
          p_days: form.repeatDays,
          p_service_type: form.service_type,
        })
        if (error) throw error
      } else {
        const row = {
          client_id: form.client_id,
          caregiver_id: form.caregiver_id || null,
          starts_at: new Date(`${form.date}T${form.start}`).toISOString(),
          ends_at: new Date(`${form.date}T${form.end}`).toISOString(),
          status: form.caregiver_id ? 'assigned' : 'open',
          service_type: form.service_type,
          notes: form.notes || null,
        }
        const q = isNew
          ? supabase.from('shifts').insert(row)
          : supabase.from('shifts').update(row).eq('id', shift.id)
        const { error } = await q
        if (error) throw error
      }
      onSaved()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  const remove = async () => {
    if (!confirm('Delete this shift?')) return
    await supabase.from('shifts').delete().eq('id', shift.id)
    onSaved()
  }

  const toggleDay = (d) => setForm((f) => ({
    ...f,
    repeatDays: f.repeatDays.includes(d) ? f.repeatDays.filter((x) => x !== d) : [...f.repeatDays, d],
  }))

  return (
    <Modal title={isNew ? 'New shift' : 'Edit shift'} onClose={onClose} wide footer={
      <>
        {!isNew && <button className="btn btn-danger" onClick={remove} style={{ marginRight: 'auto' }}>Delete</button>}
        <button className="btn btn-quiet" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save shift'}</button>
      </>
    }>
      {err && <p className="notice notice-bad">{err}</p>}
      <div className="form-row">
        <Field label="Client">
          <select value={form.client_id} onChange={set('client_id')}>
            <option value="">Select client…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{fullName(c)}</option>)}
          </select>
        </Field>
        <Field label="Caregiver" help={`★ = available on ${WEEKDAYS[weekday]}s. Leave empty to post as an open shift.`}>
          <select value={form.caregiver_id} onChange={set('caregiver_id')}>
            <option value="">— Open shift (unassigned) —</option>
            {sortedCg.map((c) => (
              <option key={c.id} value={c.id}>{availableIds.has(c.id) ? '★ ' : ''}{fullName(c)}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="form-row-3">
        <Field label="Date"><input type="date" value={form.date} onChange={set('date')} /></Field>
        <Field label="Start"><input type="time" value={form.start} onChange={set('start')} /></Field>
        <Field label="End"><input type="time" value={form.end} onChange={set('end')} /></Field>
      </div>
      <div className="form-row">
        <Field label="Service type">
          <select value={form.service_type} onChange={set('service_type')}>
            {['Personal Care', 'Companion Care', 'Respite Care', 'Supported Living', 'Other'].map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Shift notes (optional)"><input value={form.notes} onChange={set('notes')} placeholder="Anything the caregiver should know" /></Field>
      </div>

      {isNew && (
        <>
          <label style={{ display: 'flex', gap: '.5rem', alignItems: 'center', fontWeight: 600, fontSize: '.9rem', margin: '.4rem 0 .7rem' }}>
            <input type="checkbox" checked={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.target.checked })} />
            Repeat weekly
          </label>
          {form.repeat && (
            <div className="form-row">
              <Field label="On these days">
                <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
                  {DAY_LABELS.map((l, d) => (
                    <button key={d} type="button"
                      className={`btn ${form.repeatDays.includes(d) ? 'btn-primary' : 'btn-outline'}`}
                      style={{ padding: '.3rem .6rem', fontSize: '.8rem' }}
                      onClick={() => toggleDay(d)}>{l}</button>
                  ))}
                </div>
              </Field>
              <Field label="Repeat until"><input type="date" value={form.repeatUntil} onChange={set('repeatUntil')} /></Field>
            </div>
          )}
        </>
      )}
    </Modal>
  )
}
