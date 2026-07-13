import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { signIn, isConfigured } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setErr(''); setBusy(true)
    const { error } = await signIn(email.trim(), password)
    setBusy(false)
    if (error) setErr(error.message)
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brandline">
          <div className="brand-mark">GY</div>
          <div>Golden Years<br /><span style={{ fontSize: '.7rem', fontWeight: 500, color: 'var(--muted)' }}>CARE APP</span></div>
        </div>
        {!isConfigured && (
          <p className="notice notice-warn">App not configured yet — the office will finish setup (docs/SETUP.md).</p>
        )}
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="pw">Password</label>
            <input id="pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {err && <p className="notice notice-bad">{err}</p>}
          <button className="btn btn-primary" disabled={busy || !isConfigured}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <p className="muted" style={{ fontSize: '.8rem', marginTop: '1rem' }}>
          Sign in with the account the Golden Years office created for you. Questions? Call the office.
        </p>
      </div>
    </div>
  )
}
