import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { signIn, isConfigured } = useAuth()
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setErr(''); setBusy(true)
    const { error } = await signIn(email.trim(), password)
    setBusy(false)
    if (error) { setErr(error.message); return }
    nav('/app')
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brandline">
          <div className="brand-mark">GY</div>
          <div>Golden Years<br /><span style={{ fontWeight: 500, fontSize: '.72rem', color: 'var(--muted)' }}>HOME CARE MANAGEMENT SYSTEM</span></div>
        </div>
        {!isConfigured && (
          <p className="notice notice-warn">
            Not connected to a database yet. Copy <code>.env.example</code> to <code>.env</code> and add your
            Supabase URL and anon key, then restart the app. See <code>docs/SETUP.md</code>.
          </p>
        )}
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="pw">Password</label>
            <input id="pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {err && <p className="notice notice-bad">{err}</p>}
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={busy || !isConfigured}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="muted" style={{ fontSize: '.82rem', marginTop: '1.1rem' }}>
          Caregiver? Please use the <b>Golden Years Care App</b> instead — <Link to="/">get it here</Link>.
        </p>
      </div>
    </div>
  )
}
