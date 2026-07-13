import { useAuth } from '../context/AuthContext'
import { pendingCount, syncQueue } from '../lib/offline'
import { useState } from 'react'

export default function Profile() {
  const { caregiver, session, signOut } = useAuth()
  const [pending, setPending] = useState(pendingCount())

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
