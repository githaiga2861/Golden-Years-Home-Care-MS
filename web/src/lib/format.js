export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

export const fmtTime = (d) =>
  d ? new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—'

export const fmtDateTime = (d) => (d ? `${fmtDate(d)} · ${fmtTime(d)}` : '—')

export const fmtMoney = (n) =>
  (n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

export const fmtHours = (n) => (n == null ? '—' : `${Number(n).toFixed(2)} h`)

export const fullName = (r) => (r ? `${r.first_name} ${r.last_name}` : '—')

export const WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

/** Local YYYY-MM-DD for <input type=date> and range math. */
export const toISODate = (d) => {
  const x = new Date(d)
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset())
  return x.toISOString().slice(0, 10)
}

export const startOfWeek = (d) => {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  x.setDate(x.getDate() - x.getDay()) // Sunday
  return x
}

export const addDays = (d, n) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
