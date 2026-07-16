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

  useEffect(() => {
    if (!caregiver) return
    supabase.from('caregiver_credentials').select('*').eq('caregiver_id', caregiver.id)
      .order('expiry_date', { nullsFirst: false }).then(({ data }) => setCredentials(data || []))
  }, [caregiver])

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
