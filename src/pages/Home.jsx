import { TrialButton, ArrowLink } from '../components/ui.jsx';
import HomeFilm from '../components/HomeFilm.jsx';
import HomeGallery from '../components/HomeGallery.jsx';
import HomeCoach from '../components/HomeCoach.jsx';

export default function Home() {
  return (
    <>
      <section className="home-hero wrap" aria-labelledby="home-title">
        <div className="home-heading">
          <div className="hero-composition">
            <svg className="hero-routes" viewBox="0 0 920 316" fill="none" aria-hidden="true">
              <path d="M178 194v34q0 56 56 56h98 M570 154h190q56 0 56-56V72q0-36 36-36h56" />
              <circle cx="178" cy="194" r="4" />
              <circle cx="570" cy="154" r="4" />
              <path className="hero-route-end" d="m325 278 8 6-8 6 M901 30l8 6-8 6" />
            </svg>
            <h1 className="display home-title" id="home-title">
              <span className="hero-line hero-line-one">
                <span>Let’s</span>
                <span className="hero-ball" aria-hidden="true">
                  <svg viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="32" className="ball-surface" />
                    <path d="m40 27 12 9-4.5 14h-15L28 36l12-9Z" className="ball-patch" />
                    <path d="M40 8v19 M70.4 30.1 52 36 M58.8 65.9 47.5 50 M21.2 65.9 32.5 50 M9.6 30.1 28 36" className="ball-seams" />
                    <path d="m33 9 7 5 7-5 M68 25l-2 9 6 5 M64 62l-9-1-2 8 M27 69l-2-8-9 1 M8 39l6-5-2-9" className="ball-patch" />
                  </svg>
                </span>
                <span className="hero-pitch" aria-hidden="true">
                  <svg viewBox="0 0 220 92" fill="none">
                    <rect x="23" y="14" width="174" height="64" rx="2" />
                    <path d="M110 14v64 M23 32h20v28H23 M197 32h-20v28h20" />
                    <circle cx="110" cy="46" r="18" />
                    <circle className="pitch-dot" cx="110" cy="46" r="3" />
                    <circle className="pitch-player" cx="72" cy="31" r="5" />
                    <circle className="pitch-player" cx="150" cy="61" r="5" />
                  </svg>
                </span>
              </span>{' '}
              <span className="hero-line hero-line-two">
                <span className="hero-players" aria-hidden="true">
                  <span className="hero-player"><svg viewBox="0 0 32 36"><circle cx="16" cy="10" r="6" /><path d="M5 32v-5a11 11 0 0 1 22 0v5Z" /></svg></span>
                  <span className="hero-player"><svg viewBox="0 0 32 36"><circle cx="16" cy="10" r="6" /><path d="M5 32v-5a11 11 0 0 1 22 0v5Z" /></svg></span>
                  <span className="hero-player"><svg viewBox="0 0 32 36"><circle cx="16" cy="10" r="6" /><path d="M5 32v-5a11 11 0 0 1 22 0v5Z" /></svg></span>
                </span>
                <span>play</span>
              </span>{' '}
              <span className="hero-line hero-line-three"><span>together<span className="title-dot">.</span></span></span>
            </h1>
          </div>
          <div className="home-intro">
            <p>Football coaching for kids, inside your community.</p>
            <TrialButton />
          </div>
        </div>
        <HomeFilm />
      </section>

      <section className="home-facts-section wrap" aria-labelledby="home-facts-title">
        <h2 className="display" id="home-facts-title">The programme, at a glance.</h2>
        <dl className="facts-grid">
          <div className="fact-card fact-age"><dt className="fact-label">Years old</dt><dd className="fact-value">5–13</dd></div>
          <div className="fact-card fact-frequency"><dt className="fact-label">Sessions each week</dt><dd className="fact-value">2</dd></div>
          <div className="fact-card fact-duration"><dt className="fact-label">Minutes per session</dt><dd className="fact-value">45–60</dd></div>
          <div className="fact-card fact-fee"><dt className="fact-label">Per month</dt><dd className="fact-value">₹5,000</dd></div>
          <div className="fact-card fact-place">
            <dt className="fact-label">Find us at</dt>
            <dd><span className="fact-location">Nambiar<br /> Ellegenza</span><span className="fact-city fact-label">Bengaluru</span></dd>
            <svg viewBox="0 0 40 48" aria-hidden="true"><path d="M20 43S5 28 5 18a15 15 0 0 1 30 0c0 10-15 25-15 25Z" /><circle cx="20" cy="18" r="5" /></svg>
          </div>
        </dl>
      </section>

      <HomeGallery />

      <HomeCoach />

      <section className="home-quote" aria-label="A parent’s experience">
        <div className="quote-stage wrap">
          <div className="quote-atmosphere" aria-hidden="true">
            <div className="quote-card quote-note quote-note-skills"><span>On the pitch</span><strong>New skills.</strong></div>
            <div className="quote-card quote-chip quote-chip-play">
              <span className="quote-card-icon"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" /><path d="m12 8 4 3-1.5 4.5h-5L8 11l4-3Z M12 3v5 M20.5 9.2 16 11 M17.3 19.3l-2.8-3.8 M6.7 19.3l2.8-3.8 M3.5 9.2 8 11" /></svg></span>
              <strong>One ball. One team.</strong>
            </div>
            <div className="quote-card quote-chip quote-chip-team">
              <span className="quote-card-icon"><svg viewBox="0 0 24 24" fill="none"><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2 M16 5.2a3 3 0 0 1 0 5.6 M17.5 14a5 5 0 0 1 3.5 4.8V20" /></svg></span>
              <strong>A team to belong to.</strong>
            </div>
            <div className="quote-card quote-note quote-note-friends"><span>Beyond the game</span><strong>New friendships.</strong></div>
          </div>
          <figure className="quote-content">
            <p className="quote-eyebrow">A parent’s experience</p>
            <blockquote>Ali is loving soccer,<br className="quote-line-break" /> enjoying every class, and<br className="quote-line-break" /> <span>developing very well.</span></blockquote>
            <figcaption className="quote-credit"><strong>Hayder, Ali’s father</strong><span>Frisco, Texas</span></figcaption>
          </figure>
        </div>
      </section>

      <section className="home-society lime-band">
        <div className="wrap"><h2 className="display">Bring the game home.</h2><ArrowLink href="#/societies">For your society</ArrowLink></div>
      </section>
    </>
  );
}
