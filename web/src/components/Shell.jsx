import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import logo from '../assets/logo.png'

const NAV = [
  ['/app', 'Dashboard', '⌂', true],
  ['/app/schedule', 'Schedule', '▦'],
  ['/app/clients', 'Clients', '♥'],
  ['/app/caregivers', 'Caregivers', '✦'],
  ['/app/hours', 'Verified Hours', '✓'],
  ['/app/invoices', 'Invoices', '¤'],
  ['/app/alerts', 'Alerts', '!'],
  ['/app/team', 'Team & Roles', '⚑'],
  ['/app/settings', 'Settings', '⚙'],
]

export default function Shell() {
  const { profile, signOut } = useAuth()
  const nav = useNavigate()
  const [openAlerts, setOpenAlerts] = useState(0)

  useEffect(() => {
    let live = true
    const load = () =>
      supabase.from('alerts').select('id', { count: 'exact', head: true }).eq('resolved', false)
        .then(({ count }) => live && setOpenAlerts(count || 0))
    load()
    const t = setInterval(load, 60000)
    return () => { live = false; clearInterval(t) }
  }, [])

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-mark" src={logo} alt="Golden Years" />
          <div>Golden Years<br /><span style={{ fontWeight: 500, fontSize: '.72rem', opacity: .8 }}>Home Care Management</span></div>
        </div>
        <nav>
          {NAV.map(([to, label, icon, end]) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <span aria-hidden="true">{icon}</span> {label}
              {label === 'Alerts' && openAlerts > 0 && <span className="badge">{openAlerts}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="foot">
          <div style={{ color: '#fff', fontWeight: 600 }}>{profile?.full_name}</div>
          <div style={{ opacity: .75, textTransform: 'capitalize' }}>{profile?.role}</div>
          <button className="btn btn-quiet" style={{ padding: '.3rem .5rem', marginTop: '.4rem', color: '#b9cde2' }}
            onClick={async () => { await signOut(); nav('/') }}>Sign out</button>
        </div>
      </aside>
      <main className="main"><Outlet /></main>
    </div>
  )
}
