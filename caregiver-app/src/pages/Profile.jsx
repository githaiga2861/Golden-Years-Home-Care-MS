import { useAuth } from '../context/AuthContext'
import { pendingCount, syncQueue } from '../lib/offline'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const statusPill = (expiry) => {
  if (!expiry) return null
  const days = Math.floor((new Date(expiry) - new Date()) / 86400000)
  if (days < 0) return <span className="pill pill-bad">Expired</span>
  if (days <= 30) return <span className="pill pill-warn">Expires in {days}d</span>
  return <span className="pill pill-ok">Valid</span>
}

export default function Profile() {
  const { caregiver, session, signOut } = useAuth()
  const [pending, setPending] = useState(pendingCount())
  const [credentials, setCredentials] = useState([])
  const [timeOff, setTimeOff] = useState([])
  const [showRequest, setShowRequest] = useState(false)
  const [req, setReq] = useState({ starts_at: '', ends_at: '', reason: '' })
  const [reqErr, setReqErr] = useState('')

  useEffect(() => {
    if (!caregiver) return
    supabase.from('caregiver_credentials').select('*').eq('caregiver_id', caregiver.id)
      .order('expiry_date', { nullsFirst: false }).then(({ data }) => setCredentials(data || []))
    loadTimeOff()
  }, [caregiver]) // eslint-disable-line

  const loadTimeOff = () => {
    if (!caregiver) return
    supabase.from('caregiver_time_off').select('*').eq('caregiver_id', caregiver.id)
      .order('starts_at', { ascending: false }).then(({ data }) => setTimeOff(data || []))
  }

  const submitRequest = async () => {
    setReqErr('')
    if (!req.starts_at || !req.ends_at) return setReqErr('Start and end are required.')
    const { error } = await supabase.from('caregiver_time_off').insert({
      caregiver_id: caregiver.id, starts_at: req.starts_at, ends_at: req.ends_at, reason: req.reason, status: 'pending',
    })
    if (error) return setReqErr(error.message)
    setReq({ starts_at: '', ends_at: '', reason: '' }); setShowRequest(false)
    loadTimeOff()
  }

  const STATUS_KIND = { pending: 'warn', approved: 'ok', denied: 'bad' }

  return (
    <>
      <h1>Profile</h1>
      <div className="card">
        <h3>{caregiver ? `${caregiver.first_name} ${caregiver.last_name}` : session?.user?.email}</h3>
        <p className="muted" style={{ fontSize: '.9rem' }}>{session?.user?.email}</p>
        {caregiver?.mileage_rate && (
          <p className="muted" style={{ fontSize: '.86rem' }}>Mileage reimbursed at ${Number(caregiver.mileage_rate).toFixed(2)}/mile between clients.</p>
        )}
      </div>

      {credentials.length > 0 && (
        <div className="card">
          <h3>My credentials</h3>
          {credentials.map((c) => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '.5rem 0', borderBottom: '1px solid var(--line)' }}>
              <div>
                <b>{c.credential_type}</b>
                <div className="muted" style={{ fontSize: '.82rem' }}>
                  {c.expiry_date ? `Expires ${c.expiry_date}` : 'No expiry'}
                </div>
              </div>
              {statusPill(c.expiry_date)}
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Time off</h3>
          <button className="btn btn-outline" onClick={() => setShowRequest((v) => !v)}>
            {showRequest ? 'Cancel' : '+ Request'}
          </button>
        </div>
        {showRequest && (
          <div style={{ marginTop: '.7rem' }}>
            {reqErr && <p className="notice notice-bad">{reqErr}</p>}
            <label style={{ fontSize: '.85rem', fontWeight: 600 }}>Starts</label>
            <input type="datetime-local" value={req.starts_at} onChange={(e) => setReq({ ...req, starts_at: e.target.value })} style={{ width: '100%', marginBottom: '.5rem' }} />
            <label style={{ fontSize: '.85rem', fontWeight: 600 }}>Ends</label>
            <input type="datetime-local" value={req.ends_at} onChange={(e) => setReq({ ...req, ends_at: e.target.value })} style={{ width: '100%', marginBottom: '.5rem' }} />
            <label style={{ fontSize: '.85rem', fontWeight: 600 }}>Reason (optional)</label>
            <input value={req.reason} onChange={(e) => setReq({ ...req, reason: e.target.value })} style={{ width: '100%', marginBottom: '.6rem' }} />
            <button className="btn btn-primary" onClick={submitRequest}>Submit request</button>
          </div>
        )}
        {timeOff.length === 0 && !showRequest && <p className="muted" style={{ fontSize: '.9rem', marginTop: '.4rem' }}>No time off requested yet.</p>}
        {timeOff.map((t) => (
          <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '.5rem 0', borderTop: '1px solid var(--line)', marginTop: '.5rem' }}>
            <div>
              <b style={{ fontSize: '.9rem' }}>{new Date(t.starts_at).toLocaleDateString()} → {new Date(t.ends_at).toLocaleDateString()}</b>
              {t.reason && <div className="muted" style={{ fontSize: '.8rem' }}>{t.reason}</div>}
            </div>
            <span className={`pill pill-${STATUS_KIND[t.status] || 'muted'}`}>{t.status}</span>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>Offline uploads</h3>
        <p className="muted" style={{ fontSize: '.9rem' }}>
          {pending === 0 ? 'Everything is synced. ✓' : `${pending} action${pending > 1 ? 's' : ''} waiting to upload.`}
        </p>
        {pending > 0 && (
          <button className="btn btn-outline" onClick={async () => { await syncQueue(setPending); setPending(pendingCount()) }}>
            Try syncing now
          </button>
        )}
      </div>
      <div className="card">
        <h3>Need help?</h3>
        <p className="muted" style={{ fontSize: '.9rem' }}>Call the Golden Years office: <a href="tel:+12067171234">(206) 717-1234</a></p>
      </div>
      <button className="btn btn-outline" onClick={signOut}>Sign out</button>
    </>
  )
}
