import { useSiteActions } from '../context/SiteActions.jsx';
import { asset } from '../lib/assets.js';

export default function Footer() {
  const { openForm } = useSiteActions();

  function scrollToTop() {
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  }

  return (
    <footer className="site-footer football-footer">
      <div className="footer-scene">
        <img className="footer-scene-image" src={asset('football-footer-scene.png')} width="2172" height="724" alt="" aria-hidden="true" loading="lazy" decoding="async" />
        <div className="wrap footer-scene-inner">
          <p className="footer-tagline footer-scene-heading">A little football.<br /> A lot to look forward to.</p>
          <button className="btn btn-lime footer-trial" data-action="trial" type="button" onClick={(event) => openForm('trial', event.currentTarget)}>
            Request a free trial<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
          </button>
        </div>
      </div>
      <div className="wrap footer-content">
        <div className="footer-top">
          <div className="footer-intro">
            <a className="footer-brand" href="#/" aria-label="LetsAimIt home">LetsAimIt</a>
            <a className="footer-phone" href="tel:+918868886074">+91 88688 86074</a>
          </div>
          <div className="footer-col">
            <h2>Explore</h2>
            <a href="#/">Home</a>
            <a href="#/programme">Programme</a>
            <a href="#/coach">Meet the coach</a>
            <a href="#/societies">For societies</a>
          </div>
          <div className="footer-col">
            <h2>Let’s talk</h2>
            <button data-action="enroll" type="button" onClick={(event) => openForm('enroll', event.currentTarget)}>Enroll your child</button>
            <a href="https://wa.me/918868886074" target="_blank" rel="noopener noreferrer">WhatsApp the coach</a>
            <p>Nambiar Ellegenza<br /> Bengaluru, India</p>
          </div>
          <div className="footer-col">
            <h2>Good to know</h2>
            <a href="https://letsaimit.com/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy</a>
            <a href="https://letsaimit.com/terms-and-conditions" target="_blank" rel="noopener noreferrer">Terms</a>
            <a href="https://letsaimit.com/refund-policy" target="_blank" rel="noopener noreferrer">Refunds</a>
            <a href="https://www.instagram.com/lets_aimit/" target="_blank" rel="noopener noreferrer">Instagram</a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 LetsAimIt.</span>
          <button type="button" className="back-top" data-action="top" aria-label="Back to top" onClick={scrollToTop}>
            Back to top <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6" /></svg>
          </button>
        </div>
      </div>
    </footer>
  );
}
