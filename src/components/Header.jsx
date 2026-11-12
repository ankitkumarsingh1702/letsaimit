import { mediaProps } from "../lib/media.js";
import * as React from "react";
import { useSiteActions } from "../context/SiteActions.jsx";
import { useAdminAuth } from "../context/AdminAuth.jsx";
import { scrollToNextEvent } from "../features/events/EventsPage.js";
import { scrollToSchoolEnquiry } from "../features/schools/SchoolsPage.js";
import { asset } from "../lib/assets.js";
import { Arrow, RegisterLink } from "./ui.jsx";
import SocialDock from "./SocialDock.jsx";
var navigation = [
  {
    page: "programme",
    href: "/programme/",
    label: "Programme",
  },
  {
    page: "coach",
    href: "/coach/",
    label: "Meet the coach",
  },
  {
    page: "societies",
    href: "/societies/",
    label: "For societies",
  },
  {
    page: "schools",
    href: "/schools/",
    label: "For schools",
  },
  {
    page: "events",
    href: "/events/",
    label: "Events",
  },
  {
    page: "parent",
    href: "/parent/",
    label: "Parent sign in",
  },
];
function Header({ page, onSkipToContent }) {
  let [menuOpen, setMenuOpen] = React.useState(false);
  let headerRef = React.useRef(null);
  let menuToggleRef = React.useRef(null);
  let { openForm } = useSiteActions();
  let { phase, user } = useAdminAuth();
  const registering = page === "register";
  let actionKind =
    page === "events"
      ? "event"
      : page === "schools"
        ? "school"
        : page === "societies"
          ? "society"
          : "register";
  React.useEffect(() => {
    setMenuOpen(false);
  }, [page]);
  React.useEffect(() => {
    let mobileQuery = window.matchMedia("(max-width: 1120px)");
    let closeOnBreakpoint = () => setMenuOpen(false);
    mobileQuery.addEventListener("change", closeOnBreakpoint);
    return () => mobileQuery.removeEventListener("change", closeOnBreakpoint);
  }, []);
  React.useEffect(() => {
    if (!menuOpen) return;
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuToggleRef.current?.focus();
      }
    }
    function handleOutsideClick(event) {
      if (!headerRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("click", handleOutsideClick);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("click", handleOutsideClick);
    };
  }, [menuOpen]);
  let closeMenu = () => setMenuOpen(false);
  function handleSkipToContent(event) {
    event.preventDefault();
    closeMenu();
    onSkipToContent?.();
  }
  function handlePrimaryAction(event) {
    closeMenu();
    if (page === "events") {
      scrollToNextEvent();
    } else if (page === "schools") {
      scrollToSchoolEnquiry();
    } else {
      openForm(actionKind, event.currentTarget);
    }
  }
  function renderNavLink(item) {
    return <React.Fragment key={item.page}>
      <a href={item.href} data-route={item.page} aria-current={page === item.page ? "page" : undefined} onClick={closeMenu}>
        {item.page === "parent" && user?.isGoogle ? "My requests" : item.label}
      </a>
      {item.page === "parent" && phase === "authorized" &&
        <a href="/admin/" data-route="admin" onClick={closeMenu}>Team dashboard</a>}
    </React.Fragment>;
  }
  return (
    <>
      <a className="skip-link" href="#main" onClick={handleSkipToContent}>
        Skip to content
      </a>
      <header className="site-header" ref={headerRef}>
        <div className="header-inner wrap">
          <a
            className="brand"
            href="/"
            aria-label="LetsAimIt home"
            onClick={closeMenu}
          >
            <img
              className="brand-logo"
              {...mediaProps("logo.png", "160px")}
              width="538"
              height="393"
              alt="LetsAimIt"
            />
          </a>
          {registering ? <a className="text-link registration-header-link" href="/parent/">
            {user?.isGoogle ? "My requests" : "Parent sign in"}
          </a> : <>
          <nav className="desktop-nav" aria-label="Main navigation">
            {navigation.map(renderNavLink)}
          </nav>
          <div className="header-actions">
            {actionKind === "register" ? <RegisterLink className="btn-lime header-trial" /> : <button
              className="btn btn-lime header-trial"
              type="button"
              data-action={actionKind}
              onClick={handlePrimaryAction}
            >
              {page === "events" ? "Up next" : "Enquire"}
              <Arrow />
            </button>}
            <button
              ref={menuToggleRef}
              className="menu-toggle"
              type="button"
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen((currentOpen) => !currentOpen)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 8h16M4 16h16" />
              </svg>
            </button>
          </div>
          </>}
        </div>
        {!registering && <nav
          className="mobile-nav"
          id="mobile-menu"
          aria-label="Mobile navigation"
          hidden={!menuOpen}
        >
          <a
            href="/"
            aria-current={page === "home" ? "page" : void 0}
            onClick={closeMenu}
          >
            Home
          </a>
          {navigation.map(renderNavLink)}
        </nav>}
      </header>
      {!registering && <SocialDock page={page} suspended={menuOpen} />}
    </>
  );
}
export { navigation, Header };
export default Header;
