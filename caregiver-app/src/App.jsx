import { BrowserRouter, Routes, Route, NavLink, Navigate, Outlet } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { RefreshProvider, useRefresh } from './context/RefreshContext'
import { UnreadProvider, useUnread } from './context/UnreadContext'
import { UpdateProvider, useUpdate } from './context/UpdateContext'
import { startSyncLoop, syncQueue, pendingCount } from './lib/offline'
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
const SyncIcon = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg>

function SyncButton() {
  const { tick, refresh } = useRefresh()
  const { available: updateAvailable, recheck: recheckUpdate } = useUpdate()
  const [pending, setPending] = useState(pendingCount())
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState('')

  useEffect(() => {
    const t = setInterval(() => setPending(pendingCount()), 4000)
    return () => clearInterval(t)
  }, [])

  const onClick = async () => {
    if (busy) return
    setBusy(true)
    refresh()
    if (navigator.onLine) {
      const before = pendingCount()
      await syncQueue(setPending)
      const after = pendingCount()
      await recheckUpdate()
      setFlash(before > after ? `Synced ${before - after} item${before - after === 1 ? '' : 's'}` : 'Up to date')
    } else {
      setFlash("You're offline")
    }
    setTimeout(() => setBusy(false), 650)
    setTimeout(() => setFlash(''), 2200)
  }

  return (
    <div style={{ position: 'relative', marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
      {flash && (
        <span style={{
          position: 'absolute', right: 42, top: '50%', transform: 'translateY(-50%)',
          background: 'rgba(0,0,0,.75)', color: '#fff', fontSize: '.72rem', padding: '.25rem .55rem',
          borderRadius: 6, whiteSpace: 'nowrap',
        }}>{flash}</span>
      )}
      <button onClick={onClick} aria-label="Sync now" title="Sync now"
        style={{
          position: 'relative', width: 34, height: 34, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,.5)',
          background: 'rgba(255,255,255,.12)', color: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center',
        }}>
        <span style={{ display: 'block', transition: 'transform .6s ease', transform: `rotate(${tick * 360}deg)` }}>
          {SyncIcon}
        </span>
        {pending > 0 && (
          <span style={{
            position: 'absolute', top: -3, right: -3, minWidth: 16, height: 16, padding: '0 3px',
            display: 'grid', placeItems: 'center', fontSize: '.62rem', fontWeight: 700, lineHeight: 1,
            background: 'var(--gold)', color: 'var(--blue-ink)', borderRadius: '50%', border: '1.5px solid var(--blue-ink)',
          }}>{pending}</span>
        )}
        {pending === 0 && updateAvailable && (
          <span style={{
            position: 'absolute', top: -3, right: -3, width: 12, height: 12,
            background: '#e8b13b', borderRadius: '50%', border: '1.5px solid var(--blue-ink)',
          }} title="Update available" />
        )}
      </button>
    </div>
  )
}

function Frame() {
  const { caregiver } = useAuth()
  const { tick } = useRefresh()
  const { unreadUpdates: unread, unreadMsg } = useUnread()
  const [online, setOnline] = useState(navigator.onLine)
  const [pending, setPending] = useState(pendingCount())

  useEffect(() => {
    startSyncLoop((left) => setPending(left))
    const on = () => { setOnline(true); setPending(pendingCount()) }
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    const t = setInterval(() => setPending(pendingCount()), 8000)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); clearInterval(t) }
  }, [])

  return (
    <div className="app">
      <header className="topbar">
        <img className="brand-mark" src={logo} alt="Golden Years" />
        <b>Golden Years Care</b>
        {!online && <span className="offline-pill">Offline — {pending} task{pending === 1 ? '' : 's'} waiting to sync</span>}
        <SyncButton />
      </header>
      <main className="content"><Outlet key={tick} /></main>
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
      <UnreadProvider>
      <UpdateProvider>
      <RefreshProvider>
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
      </RefreshProvider>
      </UpdateProvider>
      </UnreadProvider>
    </AuthProvider>
  )
}
