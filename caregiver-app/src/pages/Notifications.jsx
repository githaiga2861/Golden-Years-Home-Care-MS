import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const fmtWhen = (d) => {
  const diffMin = Math.round((Date.now() - new Date(d)) / 60000)
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffMin < 1440) return `${Math.round(diffMin / 60)}h ago`
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const TYPE_LABEL = {
  care_plan: 'Care Plan', physician_order: 'Physician Order', medication: 'Medication', adl_task: 'New Task', other: 'Update',
  shift_new: 'New Shift', shift_changed: 'Shift Changed', shift_cancelled: 'Shift Cancelled',
}

export default function Notifications() {
  const { caregiver } = useAuth()
  const [items, setItems] = useState([])

  const load = async () => {
    if (!caregiver) return
    const { data: shiftClients } = await supabase.from('shifts')
      .select('client_id, clients(first_name,last_name)').eq('caregiver_id', caregiver.id)
    const ids = [...new Set((shiftClients || []).map((s) => s.client_id))]
    const names = {}
    ;(shiftClients || []).forEach((s) => { if (s.clients) names[s.client_id] = `${s.clients.first_name} ${s.clients.last_name}` })

    const [updatesRes, readsRes, shiftNotifRes] = await Promise.all([
      ids.length ? supabase.from('client_updates').select('*').in('client_id', ids).order('created_at', { ascending: false }).limit(60)
                 : Promise.resolve({ data: [] }),
      supabase.from('update_reads').select('update_id').eq('caregiver_id', caregiver.id),
      supabase.from('caregiver_notifications').select('*').eq('caregiver_id', caregiver.id).order('created_at', { ascending: false }).limit(60),
    ])
    const readIds = new Set((readsRes.data || []).map((r) => r.update_id))
    const clientItems = (updatesRes.data || []).map((i) => ({
      id: i.id, kind: 'client', update_type: i.update_type, message: i.message, created_at: i.created_at,
      subtitle: names[i.client_id] || 'Client', unread: !readIds.has(i.id),
    }))
    const shiftItems = (shiftNotifRes.data || []).map((i) => ({
      id: i.id, kind: 'shift', update_type: i.notif_type, message: i.message, created_at: i.created_at,
      subtitle: 'Schedule', unread: !i.read_at,
    }))
    const merged = [...clientItems, ...shiftItems].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    setItems(merged)
  }
  useEffect(() => { load() }, [caregiver?.id]) // eslint-disable-line

  const markRead = async (item) => {
    if (!item.unread) return
    if (item.kind === 'client') await supabase.from('update_reads').insert({ update_id: item.id, caregiver_id: caregiver.id })
    else await supabase.from('caregiver_notifications').update({ read_at: new Date().toISOString() }).eq('id', item.id)
    setItems((prev) => prev.map((i) => i.id === item.id && i.kind === item.kind ? { ...i, unread: false } : i))
  }

  const markAllRead = async () => {
    const unread = items.filter((i) => i.unread)
    if (unread.length === 0) return
    const clientIds = unread.filter((i) => i.kind === 'client').map((i) => i.id)
    const shiftIds = unread.filter((i) => i.kind === 'shift').map((i) => i.id)
    if (clientIds.length) await supabase.from('update_reads').insert(clientIds.map((id) => ({ update_id: id, caregiver_id: caregiver.id })))
    if (shiftIds.length) await supabase.from('caregiver_notifications').update({ read_at: new Date().toISOString() }).in('id', shiftIds)
    setItems((prev) => prev.map((i) => ({ ...i, unread: false })))
  }

  if (!caregiver) return null

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ marginBottom: 0 }}>Updates</h1>
        {items.some((i) => i.unread) && (
          <button className="btn btn-quiet" onClick={markAllRead}>Mark all read</button>
        )}
      </div>
      <p className="muted" style={{ marginTop: 0 }}>Care plan changes and schedule updates.</p>

      {items.length === 0 && (
        <div className="empty"><h3>No updates yet</h3><p>You'll see it here when the office changes something for you or your clients.</p></div>
      )}

      {items.map((i) => (
        <div key={`${i.kind}-${i.id}`} className="card" onClick={() => markRead(i)}
          style={{ borderLeft: i.unread ? '4px solid var(--gold)' : '4px solid transparent', cursor: i.unread ? 'pointer' : 'default' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span className={`pill ${i.kind === 'shift' ? 'pill-warn' : 'pill-info'}`}>{TYPE_LABEL[i.update_type] || 'Update'}</span>
            {i.unread && <span className="pill pill-gold">New</span>}
          </div>
          <p style={{ margin: '.5rem 0 .2rem', fontWeight: 600 }}>{i.subtitle}</p>
          <p className="muted" style={{ margin: 0, fontSize: '.9rem' }}>{i.message}</p>
          <p className="muted" style={{ margin: '.4rem 0 0', fontSize: '.78rem' }}>{fmtWhen(i.created_at)}</p>
        </div>
      ))}
    </>
  )
}
