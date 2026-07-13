import { Link } from 'react-router-dom'

/**
 * Public homepage ("hero"). Two doors:
 *  - Sign In -> Main System (office staff)
 *  - Download Caregiver App -> the Golden Years Care App (separate PWA)
 * Caregivers never sign in here.
 */
export default function Landing() {
  return (
    <div className="landing">
      <header className="land-top">
        <div className="brandline">
          <div className="brand-mark">GY</div>
          <div>Golden Years<small>HOME CARE MANAGEMENT SYSTEM</small></div>
        </div>
        <Link to="/login" className="btn btn-primary">Sign in</Link>
      </header>

      <section className="hero">
        <div>
          <h1 className="thread">
            Compassionate care,<br />
            <span className="goldword">verified</span> to the minute.
          </h1>
          <p className="lede">
            The operations home of Golden Years Home Health Supported Living —
            scheduling, care plans, clock-verified hours, and invoicing, all in one
            calm, connected place.
          </p>
          <div className="hero-actions">
            <Link to="/login" className="btn btn-primary">Sign in to the Main System</Link>
            <a href="#caregiver-app" className="btn btn-outline">Download the Caregiver App</a>
          </div>
        </div>
        <div className="hero-panel">
          <div className="row"><div className="ic">▦</div><div><b>Scheduling that fits</b><span>Assign caregivers by real availability, with recurring shifts and open-shift alerts.</span></div></div>
          <div className="row"><div className="ic">✓</div><div><b>Hours you can trust</b><span>GPS-verified clock in and out. Only actual worked hours become billable.</span></div></div>
          <div className="row"><div className="ic">♥</div><div><b>Care plans, live</b><span>Update a client's ADLs once — every caregiver sees it on their next visit.</span></div></div>
          <div className="row"><div className="ic">¤</div><div><b>Clean invoicing</b><span>Verified hours flow into invoices, ready for QuickBooks. No retyping.</span></div></div>
        </div>
      </section>

      <section className="land-apps" id="caregiver-app">
        <div className="land-apps-inner">
          <div className="app-card">
            <h2 className="thread">Main System</h2>
            <p>For the office team — registration, scheduling, care plans, verified hours, alerts, and invoicing. Sign in with the account the administrator created for you.</p>
            <Link to="/login" className="btn btn-primary mt">Sign in</Link>
          </div>
          <div className="app-card">
            <h2 className="thread">Golden Years Care App</h2>
            <p>For caregivers — clock in and out, see your schedule and each client's care plan, complete ADL checklists, and write visit notes. Install it on your phone and sign in only inside the app, with instructions from the office.</p>
            <a className="btn btn-gold mt" href="/care-app/" onClick={(e) => { /* becomes the deployed Care App URL */ }}>
              Open &amp; install the Care App
            </a>
            <p className="muted" style={{ fontSize: '.8rem', marginTop: '.7rem' }}>
              On your phone: open the link, then choose “Add to Home Screen” to install.
            </p>
          </div>
        </div>
      </section>

      <footer className="land-foot">
        Golden Years Home Health Supported Living LLC · Sumner, WA · (206) 717-1234<br />
        Compassionate Care, Dignified Living, Trusted Support.
      </footer>
    </div>
  )
}
