import * as React from "react";
import { Home } from "./pages/Home.jsx";
import { Programme } from "./pages/Programme.jsx";
import { Coach } from "./pages/Coach.jsx";
import { Societies } from "./pages/Societies.jsx";
import SchoolsPage from "./features/schools/SchoolsPage.js";
import EventsPage from "./features/events/EventsPage.js";
import { useHashRoute } from "./hooks/useHashRoute.js";
import { syncPageMeta } from "./lib/routes.js";
import { Privacy, Terms, Refunds } from "./pages/Legal.jsx";
import NotFound from "./pages/NotFound.jsx";
import Admin from "./pages/Admin.jsx";
import SignIn from "./pages/SignIn.jsx";
import { AdminAuthProvider } from "./context/AdminAuth.jsx";
import AnalyticsConsent from "./components/AnalyticsConsent.jsx";
import { SiteActionsProvider } from "./context/SiteActions.jsx";
import { Header } from "./components/Header.jsx";
import { Footer } from "./components/Footer.jsx";
import { ContactDialog } from "./components/ContactDialog.jsx";
import { MediaDialog } from "./components/MediaDialog.jsx";
var pages = {
  home: Home,
  programme: Programme,
  coach: Coach,
  societies: Societies,
  schools: SchoolsPage,
  events: EventsPage,
  privacy: Privacy,
  terms: Terms,
  refunds: Refunds,
  admin: Admin,
  signin: SignIn,
  notfound: NotFound,
};
var formKinds = new Set(["trial", "society", "enroll"]);
function App({ initialPage = "home" } = {}) {
  let page = useHashRoute(initialPage);
  let Page = pages[page];
  let mainRef = React.useRef(null);
  let formOpenerRef = React.useRef(null);
  let mediaOpenerRef = React.useRef(null);
  let [formKind, setFormKind] = React.useState(null);
  let [certificate, setCertificate] = React.useState(null);
  let openForm = React.useCallback((kind, openerElement) => {
    if (formKinds.has(kind)) {
      formOpenerRef.current = openerElement ?? document.activeElement;
      setFormKind(kind);
    }
  }, []);
  let openCertificate = React.useCallback((item, openerElement) => {
    if (
      /^(?:cert-(4v4|9v9|11v11)|safe-soccer-cert)\.webp$/.test(item?.src ?? "")
    ) {
      mediaOpenerRef.current = openerElement ?? document.activeElement;
      setCertificate({
        src: item.src,
        title: item.title || "Coach Dhiraj’s coaching certificate",
      });
    }
  }, []);
  let closeForm = React.useCallback(() => setFormKind(null), []);
  let closeCertificate = React.useCallback(() => setCertificate(null), []);
  let switchFormKind = React.useCallback((kind) => {
    if (formKinds.has(kind)) {
      setFormKind(kind);
    }
  }, []);
  let actions = React.useMemo(
    () => ({
      openForm,
      openCertificate,
    }),
    [openForm, openCertificate],
  );
  React.useLayoutEffect(() => {
    formOpenerRef.current = null;
    mediaOpenerRef.current = null;
    setFormKind(null);
    setCertificate(null);
    syncPageMeta(page);
    document.body.dataset.page = page;
    window.scrollTo({
      top: 0,
      behavior: "instant",
    });
    let main = mainRef.current;
    main.classList.remove("page-enter");
    let frame = window.requestAnimationFrame(() => {
      main.classList.add("page-enter");
      main.focus({
        preventScroll: true,
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [page]);
  React.useEffect(() => {
    if (formKind || !formOpenerRef.current) return;
    let opener = formOpenerRef.current;
    formOpenerRef.current = null;
    let frame = window.requestAnimationFrame(() => {
      if (opener.isConnected) {
        opener.focus({
          preventScroll: true,
        });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [formKind]);
  React.useEffect(() => {
    if (certificate || !mediaOpenerRef.current) return;
    let opener = mediaOpenerRef.current;
    mediaOpenerRef.current = null;
    let frame = window.requestAnimationFrame(() => {
      if (opener.isConnected) {
        opener.focus({
          preventScroll: true,
        });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [certificate]);
  function skipToContent() {
    let main = mainRef.current;
    main.focus({
      preventScroll: true,
    });
    main.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  return (
    <AdminAuthProvider>
    <SiteActionsProvider value={actions}>
      {page !== "admin" && <Header page={page} onSkipToContent={skipToContent} />}
      <main id="main" ref={mainRef} tabIndex={-1}>
        <Page />
      </main>
      {page !== "admin" && <><Footer />
      <ContactDialog
        kind={formKind}
        onClose={closeForm}
        onSwitchKind={switchFormKind}
      />
      <MediaDialog certificate={certificate} onClose={closeCertificate} />
      <AnalyticsConsent /></>}
    </SiteActionsProvider>
    </AdminAuthProvider>
  );
}
export { pages, formKinds, App };
export default App;
