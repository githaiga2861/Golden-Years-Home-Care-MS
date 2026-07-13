import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const fmtT = (d) => new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

export default function Week() {
  const { caregiver } = useAuth()
  const [shifts, setShifts] = useState([])

  useEffect(() => {
    if (!caregiver) return
    const d0 = new Date(); d0.setHours(0, 0, 0, 0)
    const d1 = new Date(d0); d1.setDate(d1.getDate() + 14)
    supabase.from('shifts')
      .select('*, clients(first_name,last_name,city)')
      .eq('caregiver_id', caregiver.id)
      .gte('starts_at', d0.toISOString()).lt('starts_at', d1.toISOString())
      .order('starts_at')
      .then(({ data }) => setShifts(data || []))
  }, [caregiver])

  const groups = shifts.reduce((acc, s) => {
    const k = new Date(s.starts_at).toDateString()
    ;(acc[k] = acc[k] || []).push(s)
    return acc
  }, {})

  return (
    <>
      <h1>Your schedule</h1>
      <p className="muted" style={{ marginTop: 0 }}>Next two weeks, exactly as the office set it up.</p>
      {Object.keys(groups).length === 0 && (
        <div className="empty"><h3>No upcoming visits</h3><p>New shifts will appear here when the office schedules you.</p></div>
      )}
      {Object.entries(groups).map(([day, list]) => (
        <div key={day} className="card">
          <h3>{new Date(day).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</h3>
          {list.map((s) => (
            <Link key={s.id} to={`/visit/${s.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="shift-line">
                <div className="timebox"><b>{fmtT(s.starts_at)}</b><span>to {fmtT(s.ends_at)}</span></div>
                <div style={{ flex: 1 }}>
                  <b>{s.clients.first_name} {s.clients.last_name}</b>
                  <div className="muted" style={{ fontSize: '.82rem' }}>{s.service_type}{s.clients.city ? ` · ${s.clients.city}` : ''}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ))}
    </>
  )
}
