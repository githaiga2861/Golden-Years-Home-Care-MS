import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useUnread } from '../context/UnreadContext'

const fmtWhen = (d) => new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export default function Messages() {
  const { caregiver, session } = useAuth()
  const { recheckMsg } = useUnread()
  const [thread, setThread] = useState(null)
  const [messages, setMessages] = useState([])
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef(null)

  const load = async () => {
    if (!caregiver) return
    let { data: t } = await supabase.from('message_threads').select('*').eq('caregiver_id', caregiver.id).maybeSingle()
    if (!t) {
      const ins = await supabase.from('message_threads')
        .insert({ caregiver_id: caregiver.id, subject: 'Office chat' }).select().single()
      t = ins.data
    }
    setThread(t)
    if (t) {
      const { data: m } = await supabase.from('messages').select('*, profiles(full_name)')
        .eq('thread_id', t.id).order('created_at')
      setMessages(m || [])
      // Mark office messages as read
      const unread = (m || []).filter((x) => x.sender_id !== session.user.id && !x.read_at)
      if (unread.length) {
        await supabase.from('messages').update({ read_at: new Date().toISOString() }).in('id', unread.map((x) => x.id))
        recheckMsg()
      }
    }
  }
  useEffect(() => { load() }, [caregiver?.id]) // eslint-disable-line

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length])

  const send = async () => {
    const text = body.trim()
    if (!text || !thread) return
    setSending(true)
    const { error } = await supabase.from('messages').insert({
      thread_id: thread.id, sender_id: session.user.id, body: text,
    })
    setSending(false)
    if (!error) { setBody(''); load() }
  }

  if (!caregiver) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 130px)' }}>
      <h1 style={{ marginBottom: '.2rem' }}>Messages</h1>
      <p className="muted" style={{ marginTop: 0, marginBottom: '.8rem' }}>Chat directly with the Golden Years office.</p>

      <div style={{ flex: 1, overflowY: 'auto', marginBottom: '.8rem' }}>
        {messages.length === 0 && (
          <div className="empty"><h3>No messages yet</h3><p>Send a note to the office below — they'll see it right away.</p></div>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === session.user.id
          return (
            <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', marginBottom: '.6rem' }}>
              <div style={{
                maxWidth: '78%', padding: '.6rem .8rem', borderRadius: 12,
                background: mine ? 'var(--blue)' : '#fff', color: mine ? '#fff' : 'var(--ink)',
                border: mine ? 'none' : '1px solid var(--line)',
              }}>
                <div style={{ fontSize: '.95rem' }}>{m.body}</div>
                <div style={{ fontSize: '.7rem', marginTop: '.25rem', opacity: .75 }}>
                  {mine ? 'You' : (m.profiles?.full_name || 'Office')} · {fmtWhen(m.created_at)}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <div style={{ display: 'flex', gap: '.5rem' }}>
        <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type a message…"
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), send())}
          style={{ flex: 1, padding: '.7rem .8rem', border: '1px solid var(--line)', borderRadius: 10 }} />
        <button className="btn btn-primary" style={{ width: 'auto', padding: '.7rem 1.1rem' }} onClick={send} disabled={sending || !body.trim()}>
          Send
        </button>
      </div>
    </div>
  )
}
