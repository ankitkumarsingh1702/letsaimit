import { useSiteActions } from '../context/SiteActions.jsx';

export function Arrow({ up = false }) {
  return (
    <svg className="arrow-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={up ? 'M6 18 18 6M6 6h12v12' : 'M5 12h14m-6-6 6 6-6 6'} />
    </svg>
  );
}

export function TrialButton({ className = 'btn-lime', children = 'Request a free trial' }) {
  const { openForm } = useSiteActions();
  return (
    <button type="button" className={`btn ${className}`} data-action="trial" onClick={(event) => openForm('trial', event.currentTarget)}>
      {children}<Arrow />
    </button>
  );
}

export function ArrowLink({ href, className = '', children }) {
  return <a className={`text-link ${className}`.trim()} href={href}>{children}<Arrow /></a>;
}
