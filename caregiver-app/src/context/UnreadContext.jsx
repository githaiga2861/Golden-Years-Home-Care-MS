import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

const UnreadContext = createContext(null)

export function UnreadProvider({ children }) {
  const { caregiver } = useAuth()
  const [unreadUpdates, setUnreadUpdates] = useState(0)
  const [unreadMsg, setUnreadMsg] = useState(0)

  const recheckUpdates = useCallback(async () => {
    if (!caregiver) return
    const [a, b] = await Promise.all([
      supabase.from('v_caregiver_unread_updates').select('id', { count: 'exact', head: true }).eq('caregiver_id', caregiver.id),
      supabase.from('caregiver_notifications').select('id', { count: 'exact', head: true }).eq('caregiver_id', caregiver.id).is('read_at', null),
    ])
    setUnreadUpdates((a.count || 0) + (b.count || 0))
  }, [caregiver])

  const recheckMsg = useCallback(async () => {
    if (!caregiver) return
    const { data: th } = await supabase.from('message_threads').select('id').eq('caregiver_id', caregiver.id).maybeSingle()
    if (!th) { setUnreadMsg(0); return }
    const { count } = await supabase.from('messages').select('id', { count: 'exact', head: true })
      .eq('thread_id', th.id).is('read_at', null).neq('sender_id', caregiver.profile_id || '')
    setUnreadMsg(count || 0)
  }, [caregiver])

  useEffect(() => {
    if (!caregiver) return
    recheckUpdates()
    const t = setInterval(recheckUpdates, 60000)
    return () => clearInterval(t)
  }, [caregiver, recheckUpdates])

  useEffect(() => {
    if (!caregiver) return
    recheckMsg()
    const t = setInterval(recheckMsg, 30000)
    return () => clearInterval(t)
  }, [caregiver, recheckMsg])

  return (
    <UnreadContext.Provider value={{ unreadUpdates, unreadMsg, recheckUpdates, recheckMsg }}>
      {children}
    </UnreadContext.Provider>
  )
}

export const useUnread = () => useContext(UnreadContext)
