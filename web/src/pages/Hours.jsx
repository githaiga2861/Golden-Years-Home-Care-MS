import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtDate, fmtTime, fmtHours, fmtMoney } from '../lib/format'
import { Empty, Pill, Modal } from '../components/Ui'

/**
 * Verified Hours — the heart of the billing pipeline.
 * Office reviews clocked visits, checks GPS status and notes, then
 * verifies them. Only verified visits can be invoiced or exported
 * to payroll.
 */
export default function Hours() {
  const [rows, setRows] = useState([])
  const [filter, setFilter] = useState('pending') // pending | verified | all
  const [detail, setDetail] = useState(null)

  const load = () => {
    let q = supabase.from('v_visit_ledger').select('*').not('clock_out_at', 'is', null)
      .order('clock_in_at', { ascending: false }).limit(300)
    if (filter === 'pending') q = q.eq('verified', false)
    if (filter === 'verified') q = q.eq('verified', true)
    q.then(({ data }) => setRows(data || []))
  }
  useEffect(load, [filter]) // eslint-disable-line

  const verify = async (visitId) => {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('visits').update({
      verified: true, verified_by: user.id, verified_at: new Date().toISOString(),
    }).eq('id', visitId)
    load()
  }

  const exportPayrollCsv = () => {
    const verified = rows.filter((r) => r.verified)
    const head = 'Caregiver,Client,Date,Clock in,Clock out,Hours,Pay rate,Pay amount\n'
    const body = verified.map((r) => [
      r.caregiver_name, r.client_name, fmtDate(r.clock_in_at), fmtTime(r.clock_in_at), fmtTime(r.clock_out_at),
      r.worked_hours, r.pay_rate, (r.worked_hours * r.pay_rate).toFixed(2),
    ].join(',')).join('\n')
    const blob = new Blob([head + body], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `gy-payroll-hours-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  return (
    <>
      <div className="page-head">
        <div><h1 className="thread">Verified Hours</h1>
          <div className="sub">Review clocked visits, verify them, and feed invoicing & payroll.</div></div>
        <button className="btn btn-outline" onClick={exportPayrollCsv}>Export payroll CSV</button>
      </div>

      <div className="toolbar mb">
        {['pending', 'verified', 'all'].map((fk) => (
          <button key={fk} className={`btn ${filter === fk ? 'btn-primary' : 'btn-outline'}`}
            style={{ padding: '.4rem .9rem', textTransform: 'capitalize' }} onClick={() => setFilter(fk)}>{fk}</button>
        ))}
      </div>

      <div className="card">
        {rows.length === 0 ? <Empty icon="✓" title="Nothing here" hint={filter === 'pending' ? 'No visits waiting for verification.' : 'No visits match this filter.'} /> : (
          <table className="data">
            <thead><tr><th>Date</th><th>Client</th><th>Caregiver</th><th>Clocked</th><th className="num">Hours</th><th>GPS</th><th></th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.visit_id}>
                  <td>{fmtDate(r.clock_in_at)}</td>
                  <td><b>{r.client_name}</b></td>
                  <td>{r.caregiver_name}</td>
                  <td className="muted">{fmtTime(r.clock_in_at)} – {fmtTime(r.clock_out_at)}</td>
                  <td className="num"><b>{fmtHours(r.worked_hours)}</b></td>
                  <td>{r.location_ok === true ? <Pill kind="ok">On site</Pill> : r.location_ok === false ? <Pill kind="bad">Mismatch</Pill> : <Pill kind="muted">No GPS check</Pill>}</td>
                  <td><button className="btn btn-quiet" onClick={() => setDetail(r)}>Details</button></td>
                  <td>{r.verified
                    ? (r.billed ? <Pill kind="gold">Billed</Pill> : <Pill kind="ok">Verified</Pill>)
                    : <button className="btn btn-primary" style={{ padding: '.35rem .8rem' }} onClick={() => verify(r.visit_id)}>Verify</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {detail && <VisitDetail row={detail} onClose={() => setDetail(null)} />}
    </>
  )
}

function VisitDetail({ row, onClose }) {
  const [tasks, setTasks] = useState([])
  const [notes, setNotes] = useState([])

  useEffect(() => {
    supabase.from('visit_tasks').select('*').eq('visit_id', row.visit_id).then(({ data }) => setTasks(data || []))
    supabase.from('visit_notes').select('*, profiles(full_name)').eq('visit_id', row.visit_id)
      .order('created_at').then(({ data }) => setNotes(data || []))
  }, [row.visit_id])

  return (
    <Modal title={`Visit — ${row.client_name}`} onClose={onClose} wide footer={<button className="btn btn-quiet" onClick={onClose}>Close</button>}>
      <p><b>{row.caregiver_name}</b> · {fmtDate(row.clock_in_at)} · {fmtTime(row.clock_in_at)}–{fmtTime(row.clock_out_at)} · {fmtHours(row.worked_hours)}</p>
      <p>Billable at {fmtMoney(row.bill_rate)}/h → <b>{fmtMoney(row.worked_hours * row.bill_rate)}</b></p>
      <h3 className="thread">ADLs & tasks</h3>
      {tasks.length === 0 ? <p className="muted">No checklist recorded for this visit.</p> : (
        <ul style={{ paddingLeft: '1.2rem' }}>
          {tasks.map((t) => (
            <li key={t.id} style={{ marginBottom: '.25rem' }}>
              {t.completed ? '✅' : '⬜'} {t.label}
              {t.skipped_reason && <span className="muted"> — skipped: {t.skipped_reason}</span>}
            </li>
          ))}
        </ul>
      )}
      <h3 className="thread mt">Visit notes</h3>
      {notes.length === 0 ? <p className="muted">No notes written for this visit.</p> : notes.map((n) => (
        <p key={n.id} style={{ background: 'var(--paper)', padding: '.7rem .9rem', borderRadius: 8 }}>
          {n.body}<br /><span className="muted" style={{ fontSize: '.78rem' }}>— {n.profiles?.full_name}</span>
        </p>
      ))}
    </Modal>
  )
}
