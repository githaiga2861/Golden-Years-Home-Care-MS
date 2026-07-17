import { BrowserRouter, Routes, Route, NavLink, Navigate, Outlet } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { startSyncLoop, pendingCount } from './lib/offline'
import { supabase } from './lib/supabase'
import logo from './assets/logo.png'
import Login from './pages/Login'
import Today from './pages/Today'
import Week from './pages/Week'
import Visit from './pages/Visit'
import Profile from './pages/Profile'
import Notifications from './pages/Notifications'
import Messages from './pages/Messages'

const SunIcon = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
const GridIcon = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
const BellIcon = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
const UserIcon = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
const ChatIcon = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>

function Frame() {
  const { caregiver } = useAuth()
  const [online, setOnline] = useState(navigator.onLine)
  const [pending, setPending] = useState(pendingCount())
  const [unread, setUnread] = useState(0)
  const [unreadMsg, setUnreadMsg] = useState(0)

  useEffect(() => {
    startSyncLoop((left) => setPending(left))
    const on = () => { setOnline(true); setPending(pendingCount()) }
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    const t = setInterval(() => setPending(pendingCount()), 8000)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); clearInterval(t) }
  }, [])

  useEffect(() => {
    if (!caregiver) return
    let live = true
    const check = async () => {
      const [a, b] = await Promise.all([
        supabase.from('v_caregiver_unread_updates').select('id', { count: 'exact', head: true }).eq('caregiver_id', caregiver.id),
        supabase.from('caregiver_notifications').select('id', { count: 'exact', head: true }).eq('caregiver_id', caregiver.id).is('read_at', null),
      ])
      if (live) setUnread((a.count || 0) + (b.count || 0))
    }
    check()
    const t = setInterval(check, 60000)
    return () => { live = false; clearInterval(t) }
  }, [caregiver])

  useEffect(() => {
    if (!caregiver) return
    let live = true
    const check = async () => {
      const { data: th } = await supabase.from('message_threads').select('id').eq('caregiver_id', caregiver.id).maybeSingle()
      if (!th) return
      const { count } = await supabase.from('messages').select('id', { count: 'exact', head: true })
        .eq('thread_id', th.id).is('read_at', null).neq('sender_id', caregiver.profile_id || '')
      if (live) setUnreadMsg(count || 0)
    }
    check()
    const t = setInterval(check, 30000)
    return () => { live = false; clearInterval(t) }
  }, [caregiver])

  return (
    <div className="app">
      <header className="topbar">
        <img className="brand-mark" src={logo} alt="Golden Years" />
        <b>Golden Years Care</b>
        {!online && <span className="offline-pill">Offline — saving on phone</span>}
        {online && pending > 0 && <span className="sync-pill">Syncing {pending}…</span>}
      </header>
      <main className="content"><Outlet /></main>
      <nav className="tabbar">
        <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}><span className="ic">{SunIcon}</span>Today</NavLink>
        <NavLink to="/week" className={({ isActive }) => isActive ? 'active' : ''}><span className="ic">{GridIcon}</span>Schedule</NavLink>
        <NavLink to="/updates" className={({ isActive }) => isActive ? 'active' : ''}>
          <span className="ic">{BellIcon}</span>Updates{unread > 0 && <span className="badge" style={{ marginLeft: 4 }}>{unread}</span>}
        </NavLink>
        <NavLink to="/messages" className={({ isActive }) => isActive ? 'active' : ''}>
          <span className="ic">{ChatIcon}</span>Messages{unreadMsg > 0 && <span className="badge" style={{ marginLeft: 4 }}>{unreadMsg}</span>}
        </NavLink>
        <NavLink to="/profile" className={({ isActive }) => isActive ? 'active' : ''}><span className="ic">{UserIcon}</span>Profile</NavLink>
      </nav>
    </div>
  )
}

function Gate({ children }) {
  const { session, loading } = useAuth()
  if (loading) return <div className="auth-wrap"><p style={{ color: '#fff' }}>Loading…</p></div>
  if (!session) return <Login />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Gate><Frame /></Gate>}>
            <Route path="/" element={<Today />} />
            <Route path="/week" element={<Week />} />
            <Route path="/visit/:shiftId" element={<Visit />} />
            <Route path="/updates" element={<Notifications />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/profile" element={<Profile />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
