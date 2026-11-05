import * as React from "react";

export const SOCIAL_LINKS = [
  {
    id: "linkedin",
    label: "LinkedIn",
    href: "https://www.linkedin.com/in/dhiraj-mishra-20274717/",
    accessibleLabel: "LinkedIn — Dhiraj Mishra (opens in a new tab)",
  },
  {
    id: "instagram",
    label: "Instagram",
    href: "https://www.instagram.com/lets_aimit/",
    accessibleLabel: "Instagram — LetsAimIt (opens in a new tab)",
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    href: "https://api.whatsapp.com/send/?phone=918868886074&text&type=phone_number&app_absent=0",
    accessibleLabel: "WhatsApp — chat with LetsAimIt (opens in a new tab)",
  },
  {
    id: "call",
    label: "Call us",
    detail: "+91 88688 86074",
    href: "tel:+918868886074",
    accessibleLabel: "Call us on +91 88688 86074",
  },
];

function SocialIcon({ kind }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {kind === "linkedin" ? (
        <>
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <path d="M8 10v7M12 17v-7m0 3a2.5 2.5 0 0 1 5 0v4" />
          <circle className="social-solid" cx="8" cy="7" r="1" />
        </>
      ) : kind === "instagram" ? (
        <>
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle className="social-solid" cx="17.4" cy="6.7" r="1" />
        </>
      ) : kind === "whatsapp" ? (
        <>
          <path d="M21 11.7a9 9 0 0 1-13.3 7.9L3 21l1.4-4.6A9 9 0 1 1 21 11.7Z" />
          <path d="m8 7 2 3-1.1 1.1a9 9 0 0 0 4 4L14 14l3 2c-1.1 3.1-5.1 1.1-7.4-1.2C7.3 12.5 5.3 8.5 8 7Z" />
        </>
      ) : (
        <path d="m7 3 3 5-2 2a15 15 0 0 0 6 6l2-2 5 3c0 2.2-1.8 4-4 4C9.3 21 3 14.7 3 7c0-2.2 1.8-4 4-4Z" />
      )}
    </svg>
  );
}

export default function SocialDock({ page, suspended = false }) {
  const [pastFirstScreen, setPastFirstScreen] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);
  const [hasFocus, setHasFocus] = React.useState(false);
  const dockRef = React.useRef(null);
  const triggerRef = React.useRef(null);

  // Keep the initial HTML deterministic for prerendering. The dock appears
  // after one viewport of scrolling, without measuring or moving page content.
  React.useEffect(() => {
    let frame = 0;
    function update() {
      frame = 0;
      setPastFirstScreen(window.scrollY >= window.innerHeight);
    }
    function scheduleUpdate() {
      if (!frame) frame = window.requestAnimationFrame(update);
    }
    update();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      window.cancelAnimationFrame(frame);
    };
  }, [page]);

  React.useEffect(() => {
    setExpanded(false);
    setHasFocus(false);
  }, [page, suspended]);

  React.useEffect(() => {
    if (!expanded) return;
    function closeOutside(event) {
      if (!dockRef.current?.contains(event.target)) setExpanded(false);
    }
    function closeOnEscape(event) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setExpanded(false);
      triggerRef.current?.focus({ preventScroll: true });
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [expanded]);

  function handleBlur(event) {
    if (dockRef.current?.contains(event.relatedTarget)) return;
    setHasFocus(false);
    setExpanded(false);
  }
  function followLink() {
    setExpanded(false);
    triggerRef.current?.focus({ preventScroll: true });
  }

  return (
    <div
      ref={dockRef}
      className="social-dock"
      data-expanded={expanded}
      hidden={suspended || !(pastFirstScreen || expanded || hasFocus)}
      onFocusCapture={() => setHasFocus(true)}
      onBlurCapture={handleBlur}
    >
      <button
        ref={triggerRef}
        className="social-trigger"
        type="button"
        aria-expanded={expanded}
        aria-controls="social-links"
        onClick={() => setExpanded((current) => !current)}
      >
        <svg className="social-connect-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="m8.7 10.5 6.6-4M8.7 13.5l6.6 4" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="5" r="3" />
          <circle cx="18" cy="19" r="3" />
        </svg>
        <span>Socials</span>
        <svg className="social-chevron" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="m4 6 4 4 4-4" />
        </svg>
      </button>
      <nav className="social-panel" id="social-links" aria-label="Social and contact links" hidden={!expanded}>
        <p className="social-panel-title">Let’s connect.</p>
        <ul>
          {SOCIAL_LINKS.map((link, index) => (
            <li key={link.id} style={{ "--social-order": index }}>
              <a
                className="social-link"
                href={link.href}
                aria-label={link.accessibleLabel}
                target={link.id === "call" ? undefined : "_blank"}
                rel={link.id === "call" ? undefined : "noopener noreferrer"}
                onClick={followLink}
              >
                <span className="social-link-icon"><SocialIcon kind={link.id} /></span>
                <span className="social-link-copy">
                  <span>{link.label}</span>
                  {link.detail && <span className="social-link-detail">{link.detail}</span>}
                </span>
                <svg className="social-link-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d={link.id === "call" ? "M5 12h14m-6-6 6 6-6 6" : "M6 18 18 6M6 6h12v12"} />
                </svg>
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
