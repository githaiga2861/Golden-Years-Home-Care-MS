import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const fmtT = (d) => new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

export default function Today() {
  const { caregiver } = useAuth()
  const [shifts, setShifts] = useState([])
  const [visits, setVisits] = useState({})

  useEffect(() => {
    if (!caregiver) return
    const d0 = new Date(); d0.setHours(0, 0, 0, 0)
    const d1 = new Date(d0); d1.setDate(d1.getDate() + 1)
    supabase.from('shifts')
      .select('*, clients(first_name,last_name,address,city)')
      .eq('caregiver_id', caregiver.id)
      .gte('starts_at', d0.toISOString()).lt('starts_at', d1.toISOString())
      .order('starts_at')
      .then(async ({ data }) => {
        setShifts(data || [])
        if (data?.length) {
          const { data: v } = await supabase.from('visits')
            .select('id,shift_id,clock_in_at,clock_out_at').in('shift_id', data.map((s) => s.id))
          setVisits(Object.fromEntries((v || []).map((x) => [x.shift_id, x])))
        }
      })
  }, [caregiver])

  if (!caregiver) {
    return (
      <div className="card">
        <h2>Almost there</h2>
        <p className="muted">Your login isn't linked to a caregiver record yet. Please contact the office so they can link your account.</p>
      </div>
    )
  }

  return (
    <>
      <h1>Hi {caregiver.first_name} 👋</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
      </p>
      {shifts.length === 0 ? (
        <div className="empty"><h3>No visits today</h3><p>Enjoy your day — check Schedule for the week ahead.</p></div>
      ) : shifts.map((s) => {
        const v = visits[s.id]
        const state = v?.clock_out_at ? 'done' : v?.clock_in_at ? 'active' : 'upcoming'
        return (
          <Link key={s.id} to={`/visit/${s.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="card">
              <div className="shift-line" style={{ border: 'none', padding: 0 }}>
                <div className="timebox"><b>{fmtT(s.starts_at)}</b><span>to {fmtT(s.ends_at)}</span></div>
                <div style={{ flex: 1 }}>
                  <b>{s.clients.first_name} {s.clients.last_name}</b>
                  <div className="muted" style={{ fontSize: '.85rem' }}>{s.clients.address}{s.clients.city ? `, ${s.clients.city}` : ''}</div>
                  <div className="muted" style={{ fontSize: '.8rem' }}>{s.service_type}</div>
                </div>
                {state === 'done' && <span className="pill pill-ok">Completed</span>}
                {state === 'active' && <span className="pill pill-gold">Clocked in</span>}
                {state === 'upcoming' && <span className="pill pill-info">Tap to start</span>}
              </div>
            </div>
          </Link>
        )
      })}
    </>
  )
}
