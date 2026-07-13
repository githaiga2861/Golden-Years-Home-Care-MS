import { BrowserRouter, Routes, Route, NavLink, Navigate, Outlet } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { startSyncLoop, pendingCount } from './lib/offline'
import Login from './pages/Login'
import Today from './pages/Today'
import Week from './pages/Week'
import Visit from './pages/Visit'
import Profile from './pages/Profile'

function Frame() {
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
        <div className="brand-mark">GY</div>
        <b>Golden Years Care</b>
        {!online && <span className="offline-pill">Offline — saving on phone</span>}
        {online && pending > 0 && <span className="sync-pill">Syncing {pending}…</span>}
      </header>
      <main className="content"><Outlet /></main>
      <nav className="tabbar">
        <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}><span className="ic">☀</span>Today</NavLink>
        <NavLink to="/week" className={({ isActive }) => isActive ? 'active' : ''}><span className="ic">▦</span>Schedule</NavLink>
        <NavLink to="/profile" className={({ isActive }) => isActive ? 'active' : ''}><span className="ic">✦</span>Profile</NavLink>
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
            <Route path="/profile" element={<Profile />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
