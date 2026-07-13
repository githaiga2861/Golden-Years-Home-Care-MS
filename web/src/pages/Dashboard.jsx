import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fmtTime, fmtDateTime, fullName } from '../lib/format'
import { Pill, Empty } from '../components/Ui'

export default function Dashboard() {
  const [stats, setStats] = useState({ clients: 0, caregivers: 0, todayShifts: 0, unverified: 0 })
  const [alerts, setAlerts] = useState([])
  const [today, setToday] = useState([])

  useEffect(() => {
    const d0 = new Date(); d0.setHours(0, 0, 0, 0)
    const d1 = new Date(d0); d1.setDate(d1.getDate() + 1)
    Promise.all([
      supabase.from('clients').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('caregivers').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('shifts').select('id', { count: 'exact', head: true }).gte('starts_at', d0.toISOString()).lt('starts_at', d1.toISOString()),
      supabase.from('visits').select('id', { count: 'exact', head: true }).eq('verified', false).not('clock_out_at', 'is', null),
      supabase.from('alerts').select('*').eq('resolved', false).order('created_at', { ascending: false }).limit(6),
      supabase.from('shifts').select('*, clients(first_name,last_name), caregivers(first_name,last_name)')
        .gte('starts_at', d0.toISOString()).lt('starts_at', d1.toISOString()).order('starts_at'),
    ]).then(([c1, c2, c3, c4, a, t]) => {
      setStats({ clients: c1.count || 0, caregivers: c2.count || 0, todayShifts: c3.count || 0, unverified: c4.count || 0 })
      setAlerts(a.data || [])
      setToday(t.data || [])
    })
  }, [])

  return (
    <>
      <div className="page-head">
        <div><h1 className="thread">Dashboard</h1><div className="sub">Today at Golden Years, at a glance.</div></div>
      </div>

      <div className="grid grid-4 mb">
        <div className="card card-pad stat"><div className="label">Active clients</div><div className="value">{stats.clients}</div></div>
        <div className="card card-pad stat"><div className="label">Active caregivers</div><div className="value">{stats.caregivers}</div></div>
        <div className="card card-pad stat"><div className="label">Shifts today</div><div className="value">{stats.todayShifts}</div></div>
        <div className="card card-pad stat"><div className="label">Awaiting verification</div><div className="value">{stats.unverified}</div>
          <div className="hint"><Link to="/app/hours">Review hours →</Link></div></div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-pad" style={{ borderBottom: '1px solid var(--line)' }}><h2>Today's shifts</h2></div>
          {today.length === 0 ? <Empty title="No shifts scheduled today" hint="Use the Schedule to add shifts." /> : (
            <table className="data"><tbody>
              {today.map((s) => (
                <tr key={s.id}>
                  <td><b>{fmtTime(s.starts_at)}–{fmtTime(s.ends_at)}</b></td>
                  <td>{fullName(s.clients)}</td>
                  <td>{s.caregiver_id ? fullName(s.caregivers) : <Pill kind="warn">Unassigned</Pill>}</td>
                  <td><Pill kind={{ open: 'warn', assigned: 'info', in_progress: 'gold', completed: 'ok', missed: 'bad', cancelled: 'muted' }[s.status]}>{s.status.replace('_', ' ')}</Pill></td>
                </tr>
              ))}
            </tbody></table>
          )}
        </div>

        <div className="card">
          <div className="card-pad" style={{ borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between' }}>
            <h2>Open alerts</h2><Link to="/app/alerts">View all</Link>
          </div>
          {alerts.length === 0 ? <Empty icon="✓" title="All clear" hint="No unresolved alerts right now." /> : alerts.map((a) => (
            <div className="alert-row" key={a.id}>
              <div className={`alert-dot sev-${a.severity}`} />
              <div>
                <b style={{ textTransform: 'capitalize' }}>{a.alert_type.replaceAll('_', ' ')}</b>
                <div className="muted" style={{ fontSize: '.86rem' }}>{a.message}</div>
                <div className="muted" style={{ fontSize: '.76rem' }}>{fmtDateTime(a.created_at)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
