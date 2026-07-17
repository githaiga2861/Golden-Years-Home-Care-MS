// Small shared UI primitives kept in one file for easy maintenance.

export function Modal({ title, header, onClose, children, footer, wide, xwide }) {
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''} ${xwide ? 'modal-xwide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className={`modal-head ${header ? 'modal-head-rich' : ''}`}>
          {header || <h2>{title}</h2>}
          <button className="btn btn-quiet modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Field({ label, help, children }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {help && <span className="help">{help}</span>}
    </div>
  )
}

export function Empty({ icon = '◌', title, hint }) {
  return (
    <div className="empty">
      <div className="big">{icon}</div>
      <h3>{title}</h3>
      {hint && <p className="muted">{hint}</p>}
    </div>
  )
}

export function ProfileHeader({ name, subtitle, initials, children }) {
  return (
    <div className="profile-header">
      <div className="profile-avatar">{initials}</div>
      <div className="profile-header-text">
        <h2>{name}</h2>
        {subtitle && <div className="profile-subtitle">{subtitle}</div>}
        {children && <div className="profile-header-pills">{children}</div>}
      </div>
    </div>
  )
}

export function Pill({ kind = 'muted', children }) {
  return <span className={`pill pill-${kind}`}>{children}</span>
}

export const STATUS_PILL = {
  open: ['warn', 'Open'], assigned: ['info', 'Assigned'], in_progress: ['gold', 'In progress'],
  completed: ['ok', 'Completed'], missed: ['bad', 'Missed'], cancelled: ['muted', 'Cancelled'],
}
