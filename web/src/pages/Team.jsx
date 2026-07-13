import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Empty, Pill } from '../components/Ui'

const ROLES = ['admin', 'scheduler', 'coordinator', 'caregiver']

export default function Team() {
  const { profile } = useAuth()
  const [rows, setRows] = useState([])
  const isAdmin = profile?.role === 'admin'

  const load = () =>
    supabase.from('profiles').select('*').order('full_name').then(({ data }) => setRows(data || []))
  useEffect(() => { load() }, [])

  const setRole = async (id, role) => {
    await supabase.from('profiles').update({ role }).eq('id', id)
    load()
  }

  return (
    <>
      <div className="page-head">
        <div><h1 className="thread">Team & Roles</h1>
          <div className="sub">Who can sign in, and what they can do. Accounts are created in Supabase → Authentication.</div></div>
      </div>
      {!isAdmin && <p className="notice notice-warn mb">Only administrators can change roles.</p>}
      <div className="card">
        {rows.length === 0 ? <Empty title="No accounts yet" /> : (
          <table className="data">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><b>{r.full_name}</b></td>
                  <td className="muted">{r.email}</td>
                  <td>
                    {isAdmin ? (
                      <select value={r.role} onChange={(e) => setRole(r.id, e.target.value)}
                        style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '.25rem .4rem', textTransform: 'capitalize' }}>
                        {ROLES.map((x) => <option key={x} value={x}>{x}</option>)}
                      </select>
                    ) : <span style={{ textTransform: 'capitalize' }}>{r.role}</span>}
                  </td>
                  <td>{r.is_active ? <Pill kind="ok">Active</Pill> : <Pill kind="muted">Inactive</Pill>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="muted mt" style={{ fontSize: '.85rem' }}>
        Roles: <b>Admin</b> — everything, including roles & settings. <b>Scheduler</b> — scheduling and registration.
        <b> Coordinator</b> — care plans and visit review. <b>Caregiver</b> — Care App only (cannot open this system).
      </p>
    </>
  )
}
