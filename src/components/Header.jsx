import { useEffect, useRef, useState } from 'react';
import { Arrow } from './ui.jsx';
import { asset } from '../lib/assets.js';
import { useSiteActions } from '../context/SiteActions.jsx';

const navigation = [
  { page: 'programme', href: '#/programme', label: 'Programme' },
  { page: 'coach', href: '#/coach', label: 'Meet the coach' },
  { page: 'societies', href: '#/societies', label: 'For societies' },
];

export default function Header({ page, onSkipToContent }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef(null);
  const menuToggleRef = useRef(null);
  const { openForm } = useSiteActions();
  const action = page === 'societies' ? 'society' : 'trial';

  useEffect(() => {
    setMenuOpen(false);
  }, [page]);

  useEffect(() => {
    const breakpoint = window.matchMedia('(max-width: 700px)');
    const closeOnBreakpoint = () => setMenuOpen(false);
    breakpoint.addEventListener('change', closeOnBreakpoint);
    return () => breakpoint.removeEventListener('change', closeOnBreakpoint);
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuToggleRef.current?.focus();
      }
    }

    function handleOutsideClick(event) {
      if (!headerRef.current?.contains(event.target)) setMenuOpen(false);
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('click', handleOutsideClick);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('click', handleOutsideClick);
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  function handleSkip(event) {
    event.preventDefault();
    closeMenu();
    onSkipToContent?.();
  }

  function handlePrimaryAction(event) {
    closeMenu();
    openForm(action, event.currentTarget);
  }

  function renderNavigationLink(item) {
    return (
      <a
        key={item.page}
        href={item.href}
        data-route={item.page}
        aria-current={page === item.page ? 'page' : undefined}
        onClick={closeMenu}
      >
        {item.label}
      </a>
    );
  }

  return (
    <>
      <a className="skip-link" href="#main" onClick={handleSkip}>Skip to content</a>
      <header className="site-header" ref={headerRef}>
        <div className="header-inner wrap">
          <a className="brand" href="#/" aria-label="LetsAimIt home" onClick={closeMenu}>
            <img src={asset('logo.png')} width="554" height="402" alt="LetsAimIt" />
          </a>
          <nav className="desktop-nav" aria-label="Main navigation">
            {navigation.map(renderNavigationLink)}
          </nav>
          <div className="header-actions">
            <button
              className="btn btn-lime header-trial"
              type="button"
              data-action={action}
              onClick={handlePrimaryAction}
            >
              {page === 'societies' ? 'Enquire' : 'Free trial'}<Arrow />
            </button>
            <button
              ref={menuToggleRef}
              className="menu-toggle"
              type="button"
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h16M4 16h16" /></svg>
            </button>
          </div>
        </div>
        <nav className="mobile-nav" id="mobile-menu" aria-label="Mobile navigation" hidden={!menuOpen}>
          <a href="#/" aria-current={page === 'home' ? 'page' : undefined} onClick={closeMenu}>Home</a>
          {navigation.map(renderNavigationLink)}
        </nav>
      </header>
    </>
  );
}
