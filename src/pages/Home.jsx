import { TrialButton } from "../components/ui.jsx";
import { HomeFilm } from "../components/HomeFilm.jsx";
import { HomeGallery } from "../components/HomeGallery.jsx";
import { HomeCoach } from "../components/HomeCoach.jsx";
import ParentStories from "../features/stories/ParentStories.js";
import { ArrowLink } from "../components/ui.jsx";
function Home() {
  return (
    <>
      <section className="home-hero wrap" aria-labelledby="home-title">
        <div className="home-heading">
          <div className="hero-composition">
            <svg
              className="hero-routes"
              viewBox="0 0 920 316"
              fill="none"
              aria-hidden="true"
            >
              <path d="M178 194v34q0 56 56 56h98 M570 154h190q56 0 56-56V72q0-36 36-36h56" />
              <circle cx="178" cy="194" r="4" />
              <circle cx="570" cy="154" r="4" />
              <path
                className="hero-route-end"
                d="m325 278 8 6-8 6 M901 30l8 6-8 6"
              />
            </svg>
            <h1 className="display home-title" id="home-title">
              <span className="hero-line hero-line-one">
                <span>Let’s</span>
                <span className="hero-ball" aria-hidden="true">
                  <svg viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="32" className="ball-surface" />
                    <path
                      d="m40 27 12 9-4.5 14h-15L28 36l12-9Z"
                      className="ball-patch"
                    />
                    <path
                      d="M40 8v19 M70.4 30.1 52 36 M58.8 65.9 47.5 50 M21.2 65.9 32.5 50 M9.6 30.1 28 36"
                      className="ball-seams"
                    />
                    <path
                      d="m33 9 7 5 7-5 M68 25l-2 9 6 5 M64 62l-9-1-2 8 M27 69l-2-8-9 1 M8 39l6-5-2-9"
                      className="ball-patch"
                    />
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
              </span>{" "}
              <span className="hero-line hero-line-two">
                <span className="hero-players" aria-hidden="true">
                  <span className="hero-player">
                    <svg viewBox="0 0 32 36">
                      <circle cx="16" cy="10" r="6" />
                      <path d="M5 32v-5a11 11 0 0 1 22 0v5Z" />
                    </svg>
                  </span>
                  <span className="hero-player">
                    <svg viewBox="0 0 32 36">
                      <circle cx="16" cy="10" r="6" />
                      <path d="M5 32v-5a11 11 0 0 1 22 0v5Z" />
                    </svg>
                  </span>
                  <span className="hero-player">
                    <svg viewBox="0 0 32 36">
                      <circle cx="16" cy="10" r="6" />
                      <path d="M5 32v-5a11 11 0 0 1 22 0v5Z" />
                    </svg>
                  </span>
                </span>
                <span>play</span>
              </span>{" "}
              <span className="hero-line hero-line-three">
                <span>
                  together<span className="title-dot">.</span>
                </span>
              </span>
            </h1>
          </div>
          <div className="home-intro">
            <div className="hero-intro-copy">
              <p>Helping children build fitness, confidence and character.</p>
              <ul
                className="hero-activities"
                role="list"
                aria-label="Activities"
              >
                <li>Football</li>
                <li>Basketball</li>
                <li>Fitness</li>
              </ul>
            </div>
            <TrialButton />
          </div>
        </div>
        <HomeFilm />
      </section>
      <section
        className="home-facts-section"
        aria-labelledby="home-facts-title"
      >
        <div className="wrap facts-stage">
          <div className="facts-intro">
            <h2 className="display" id="home-facts-title">
              The programme, at a glance.
            </h2>
            <p>Play, learn and grow, close to home.</p>
          </div>
          <div className="facts-orbit" aria-hidden="true">
            <span className="facts-orbit-card facts-orbit-football" />
            <span className="facts-orbit-card facts-orbit-movement" />
            <span className="facts-orbit-card facts-orbit-fitness" />
            <span className="facts-orbit-card facts-orbit-timer" />
            <span className="facts-orbit-card facts-orbit-basketball" />
            <span className="facts-orbit-card facts-orbit-pitch" />
            <span className="facts-orbit-card facts-orbit-whistle" />
            <span className="facts-orbit-card facts-orbit-stretch" />
            <span className="facts-orbit-square facts-square-1" />
            <span className="facts-orbit-square facts-square-2" />
            <span className="facts-orbit-square facts-square-3" />
            <span className="facts-orbit-square facts-square-4" />
            <span className="facts-orbit-square facts-square-5" />
            <span className="facts-orbit-square facts-square-6" />
          </div>
          <div
            className="facts-mobile-activities"
            aria-label="Programme activities"
          >
            <span className="facts-activity-football">Football</span>
            <span className="facts-activity-basketball">Basketball</span>
            <span className="facts-activity-fitness">Fitness</span>
          </div>
          <dl className="facts-grid">
            <div className="fact-card fact-age">
              <dd className="fact-value">5–14</dd>
              <dt className="fact-label">Years old</dt>
            </div>
            <div className="fact-card fact-frequency">
              <dd className="fact-value">2</dd>
              <dt className="fact-label">Sessions each week</dt>
            </div>
            <div className="fact-card fact-duration">
              <dd className="fact-value">45–60</dd>
              <dt className="fact-label">Minutes per session</dt>
            </div>
            <div className="fact-card fact-trial">
              <dd className="fact-value">Free</dd>
              <dt className="fact-label">First session</dt>
            </div>
            <div className="fact-card fact-place">
              <svg viewBox="0 0 40 48" aria-hidden="true">
                <path d="M20 43S5 28 5 18a15 15 0 0 1 30 0c0 10-15 25-15 25Z" />
                <circle cx="20" cy="18" r="5" />
              </svg>
              <dd>
                <span className="fact-location">Nambiar Ellegenza</span>
                <span className="fact-location">Nambiar Bellezea</span>
                <span className="fact-city fact-label">Bengaluru</span>
              </dd>
            </div>
          </dl>
        </div>
      </section>
      <HomeGallery />
      <HomeCoach />
      <ParentStories />
      <section className="home-society lime-band">
        <div className="wrap">
          <h2 className="display">Bring sport home.</h2>
          <ArrowLink href="/societies/">For your society</ArrowLink>
        </div>
      </section>
    </>
  );
}
export { Home };
export default Home;
