import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import logo from '../assets/logo.png'

const Eye = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" /><circle cx="12" cy="12" r="3" />
  </svg>
)
const EyeOff = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.06 21.06 0 0 1 5.06-6.06M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.15 21.15 0 0 1-4.06 5.06M14.12 14.12a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
)

export default function Login() {
  const { signIn, isConfigured } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
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
          <img className="brand-mark" src={logo} alt="Golden Years" />
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
            <div style={{ position: 'relative' }}>
              <input id="pw" type={showPw ? 'text' : 'password'} autoComplete="current-password"
                value={password} onChange={(e) => setPassword(e.target.value)} required
                style={{ paddingRight: '2.8rem', width: '100%' }} />
              <button type="button" onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
                style={{ position: 'absolute', right: '.6rem', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', padding: '.25rem', color: 'var(--muted)', display: 'flex' }}>
                {showPw ? EyeOff : Eye}
              </button>
            </div>
          </div>
          {err && <p className="notice notice-bad">{err}</p>}
          <button className="btn btn-primary" disabled={busy || !isConfigured}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <p className="muted" style={{ fontSize: '.8rem', marginTop: '1rem' }}>
          Sign in with the account the Golden Years office created for you.
        </p>
        <div className="card" style={{ marginTop: '1.1rem' }}>
          <h3 style={{ marginBottom: '.4rem' }}>Need help signing in?</h3>
          <p className="muted" style={{ fontSize: '.86rem', margin: 0 }}>Call the Golden Years office:</p>
          <p style={{ margin: '.2rem 0 .6rem' }}><a href="tel:+12067171234">(206) 717-1234</a></p>
          <p className="muted" style={{ fontSize: '.86rem', margin: 0 }}>Or email:</p>
          <p style={{ margin: '.2rem 0 0' }}><a href="mailto:contact@goldenyearshomehealthllc.com">contact@goldenyearshomehealthllc.com</a></p>
        </div>
      </div>
    </div>
  )
}
