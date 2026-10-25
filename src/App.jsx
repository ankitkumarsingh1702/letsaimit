import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import ContactDialog from './components/ContactDialog.jsx';
import MediaDialog from './components/MediaDialog.jsx';
import Home from './pages/Home.jsx';
import Programme from './pages/Programme.jsx';
import Coach from './pages/Coach.jsx';
import Societies from './pages/Societies.jsx';
import { SiteActionsProvider } from './context/SiteActions.jsx';
import useHashRoute from './hooks/useHashRoute.js';
import { PAGE_TITLES } from './lib/routes.js';

const pages = { home: Home, programme: Programme, coach: Coach, societies: Societies };
const formKinds = new Set(['trial', 'society', 'enroll']);

export default function App() {
  const page = useHashRoute();
  const Page = pages[page];
  const mainRef = useRef(null);
  const formOpenerRef = useRef(null);
  const mediaOpenerRef = useRef(null);
  const [formKind, setFormKind] = useState(null);
  const [certificate, setCertificate] = useState(null);

  const openForm = useCallback((kind, openerElement) => {
    if (!formKinds.has(kind)) return;
    formOpenerRef.current = openerElement ?? document.activeElement;
    setFormKind(kind);
  }, []);

  const openCertificate = useCallback((item, openerElement) => {
    if (!/^cert-(4v4|9v9|11v11)\.webp$/.test(item?.src ?? '')) return;
    mediaOpenerRef.current = openerElement ?? document.activeElement;
    setCertificate({ src: item.src, title: item.title || 'Coach Dhiraj’s coaching certificate' });
  }, []);

  const closeForm = useCallback(() => setFormKind(null), []);
  const closeCertificate = useCallback(() => setCertificate(null), []);
  const switchFormKind = useCallback((kind) => {
    if (formKinds.has(kind)) setFormKind(kind);
  }, []);
  const actions = useMemo(() => ({ openForm, openCertificate }), [openForm, openCertificate]);

  useLayoutEffect(() => {
    // Route changes close overlays without focusing a control on the old page.
    formOpenerRef.current = null;
    mediaOpenerRef.current = null;
    setFormKind(null);
    setCertificate(null);
    document.title = `${PAGE_TITLES[page]} — LetsAimIt`;
    document.body.dataset.page = page;
    window.scrollTo({ top: 0, behavior: 'instant' });
    const main = mainRef.current;
    main.classList.remove('page-enter');
    const frame = window.requestAnimationFrame(() => {
      main.classList.add('page-enter');
      main.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [page]);

  useEffect(() => {
    if (formKind || !formOpenerRef.current) return undefined;
    const opener = formOpenerRef.current;
    formOpenerRef.current = null;
    const frame = window.requestAnimationFrame(() => {
      if (opener.isConnected) opener.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [formKind]);

  useEffect(() => {
    if (certificate || !mediaOpenerRef.current) return undefined;
    const opener = mediaOpenerRef.current;
    mediaOpenerRef.current = null;
    const frame = window.requestAnimationFrame(() => {
      if (opener.isConnected) opener.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [certificate]);

  function skipToContent() {
    const main = mainRef.current;
    main.focus({ preventScroll: true });
    main.scrollIntoView({
      block: 'start',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  }

  return (
    <SiteActionsProvider value={actions}>
      <Header page={page} onSkipToContent={skipToContent} />
      <main id="main" ref={mainRef} tabIndex={-1}><Page /></main>
      <Footer />
      <ContactDialog kind={formKind} onClose={closeForm} onSwitchKind={switchFormKind} />
      <MediaDialog certificate={certificate} onClose={closeCertificate} />
    </SiteActionsProvider>
  );
}
