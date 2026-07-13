import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtDate, fmtMoney, fullName, toISODate, addDays } from '../lib/format'
import { Modal, Field, Empty, Pill } from '../components/Ui'

export default function Invoices() {
  const [rows, setRows] = useState([])
  const [clients, setClients] = useState([])
  const [creating, setCreating] = useState(false)
  const [viewing, setViewing] = useState(null)

  const load = () =>
    supabase.from('invoices').select('*, clients(first_name,last_name)')
      .order('created_at', { ascending: false }).then(({ data }) => setRows(data || []))
  useEffect(() => {
    load()
    supabase.from('clients').select('id,first_name,last_name').eq('is_active', true).order('last_name')
      .then(({ data }) => setClients(data || []))
  }, [])

  const setStatus = async (id, status) => {
    await supabase.from('invoices').update({ status }).eq('id', id)
    load()
  }

  return (
    <>
      <div className="page-head">
        <div><h1 className="thread">Invoices</h1><div className="sub">Generated from verified hours. Private-pay only.</div></div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Generate invoice</button>
      </div>

      <div className="card">
        {rows.length === 0 ? <Empty title="No invoices yet" hint="Verify some hours, then generate your first invoice." /> : (
          <table className="data">
            <thead><tr><th>Invoice</th><th>Client</th><th>Period</th><th className="num">Total</th><th>Status</th><th>QuickBooks</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><b>{r.invoice_number}</b></td>
                  <td>{fullName(r.clients)}</td>
                  <td className="muted">{fmtDate(r.period_start)} – {fmtDate(r.period_end)}</td>
                  <td className="num"><b>{fmtMoney(r.total)}</b></td>
                  <td>
                    <select value={r.status} onChange={(e) => setStatus(r.id, e.target.value)}
                      style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '.25rem .4rem' }}>
                      {['draft', 'sent', 'paid', 'void'].map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td>{r.qb_synced ? <Pill kind="ok">Synced</Pill> : <Pill kind="muted">Not synced</Pill>}</td>
                  <td><button className="btn btn-quiet" onClick={() => setViewing(r)}>Open</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {creating && <GenerateModal clients={clients} onClose={() => setCreating(false)} onDone={() => { setCreating(false); load() }} />}
      {viewing && <InvoiceView invoice={viewing} onClose={() => setViewing(null)} />}
    </>
  )
}

function GenerateModal({ clients, onClose, onDone }) {
  const [f, setF] = useState({
    client_id: '', start: toISODate(addDays(new Date(), -7)), end: toISODate(new Date()),
  })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async () => {
    setErr('')
    if (!f.client_id) return setErr('Choose a client.')
    setBusy(true)
    const { error } = await supabase.rpc('generate_invoice', {
      p_client_id: f.client_id, p_start: f.start, p_end: f.end,
    })
    setBusy(false)
    if (error) return setErr(error.message)
    onDone()
  }

  return (
    <Modal title="Generate invoice" onClose={onClose} footer={
      <><button className="btn btn-quiet" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={run} disabled={busy}>{busy ? 'Generating…' : 'Generate'}</button></>
    }>
      <p className="muted" style={{ fontSize: '.88rem' }}>
        Pulls every <b>verified, unbilled</b> visit for the client in the period into a numbered invoice.
      </p>
      {err && <p className="notice notice-bad">{err}</p>}
      <Field label="Client">
        <select value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })}>
          <option value="">Select client…</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{fullName(c)}</option>)}
        </select>
      </Field>
      <div className="form-row">
        <Field label="Period start"><input type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
        <Field label="Period end"><input type="date" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
      </div>
    </Modal>
  )
}

function InvoiceView({ invoice, onClose }) {
  const [items, setItems] = useState([])
  useEffect(() => {
    supabase.from('invoice_items').select('*').eq('invoice_id', invoice.id)
      .order('service_date').then(({ data }) => setItems(data || []))
  }, [invoice.id])

  return (
    <Modal title={invoice.invoice_number} onClose={onClose} wide footer={
      <>
        <button className="btn btn-outline" onClick={() => window.print()}>Print / Save PDF</button>
        <button className="btn btn-quiet" onClick={onClose}>Close</button>
      </>
    }>
      <p className="muted">{fmtDate(invoice.period_start)} – {fmtDate(invoice.period_end)} · Status: <b style={{ textTransform: 'capitalize' }}>{invoice.status}</b></p>
      <table className="data mb">
        <thead><tr><th>Date</th><th>Service</th><th className="num">Hours</th><th className="num">Rate</th><th className="num">Amount</th></tr></thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id}>
              <td>{fmtDate(i.service_date)}</td><td>{i.description}</td>
              <td className="num">{Number(i.hours).toFixed(2)}</td>
              <td className="num">{fmtMoney(i.rate)}</td>
              <td className="num">{fmtMoney(i.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2 style={{ textAlign: 'right' }}>Total {fmtMoney(invoice.total)}</h2>
      <p className="muted" style={{ fontSize: '.82rem' }}>
        QuickBooks sync: {invoice.qb_synced ? 'synced' : 'not yet connected — Phase 2 (see Settings).'}
      </p>
    </Modal>
  )
}
