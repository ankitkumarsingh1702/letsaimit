import '../styles/facts.css';

const iconPaths = {
  football: <>
    <circle cx="32" cy="32" r="24" />
    <path d="m32 22 10 7-4 12H26l-4-12Z" fill="currentColor" />
    <path d="M32 8v14m23 2-13 5m5 22-9-10M17 51l9-10M9 24l13 5" />
  </>,
  pitch: <>
    <rect x="6" y="13" width="52" height="38" rx="3" />
    <path d="M32 13v38M6 23h10v18H6m52-18H48v18h10" />
    <circle cx="32" cy="32" r="8" />
  </>,
  basketball: <>
    <circle cx="32" cy="32" r="24" fill="var(--lime)" />
    <path d="M15 15l34 34M15 49l34-34M10 24c15 8 26 20 30 30M24 10c8 15 20 26 30 30" />
  </>,
  hoop: <>
    <rect x="9" y="10" width="46" height="28" rx="4" />
    <path d="M24 34V22h16v12M17 34h30L41 54H23Zm7 0 5 20m11-20-5 20M21 45h22" />
  </>,
  dumbbell: <>
    <path d="M23 32h18M6 32h5m42 0h5" strokeWidth="5" />
    <rect x="11" y="20" width="12" height="24" rx="4" fill="currentColor" />
    <rect x="41" y="20" width="12" height="24" rx="4" fill="currentColor" />
  </>,
  stopwatch: <>
    <path d="M32 13V7m-6 0h12m10 11 4-5M32 36l10-10" />
    <circle cx="32" cy="36" r="21" />
    <circle cx="32" cy="36" r="2" fill="currentColor" />
  </>,
};

function FactDecoration() {
  return (
    <div className="programme-facts-decor" aria-hidden="true">
      {Object.entries(iconPaths).map(([sportIcon, paths]) => (
        <span className={`programme-facts-tile programme-facts-tile--${sportIcon}`} key={sportIcon}>
          <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            {paths}
          </svg>
        </span>
      ))}
    </div>
  );
}

export default function HomeFacts() {
  return (
    <section className="programme-facts" aria-labelledby="home-facts-title">
      <div className="programme-facts-inner wrap">
        <FactDecoration />
        <div className="programme-facts-content">
          <h2 className="display" id="home-facts-title">The programme, at a glance.</h2>
          <p className="programme-facts-intro">Football, basketball and fitness sessions that help kids move, learn and play together.</p>
          <dl className="programme-facts-grid">
            <div className="programme-facts-card"><dt className="fact-label">Years old</dt><dd className="fact-value">5–13</dd></div>
            <div className="programme-facts-card"><dt className="fact-label">Sessions each week</dt><dd className="fact-value">2</dd></div>
            <div className="programme-facts-card programme-facts-card--dark"><dt className="fact-label">Minutes per session</dt><dd className="fact-value">45–60</dd></div>
            <div className="programme-facts-card programme-facts-card--dark programme-facts-card--fee"><dt className="fact-label">Per month</dt><dd className="fact-value">₹5,000</dd></div>
            <div className="programme-facts-card programme-facts-card--location">
              <dt className="fact-label">Find us at</dt>
              <dd>
                <svg viewBox="0 0 40 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 43S5 28 5 18a15 15 0 0 1 30 0c0 10-15 25-15 25Z" /><circle cx="20" cy="18" r="5" /></svg>
                <span className="fact-location">Nambiar Ellegenza</span>
                <span className="fact-label">Bengaluru</span>
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}
