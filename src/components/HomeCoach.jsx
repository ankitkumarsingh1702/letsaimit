import { ArrowLink } from './ui.jsx';
import { asset } from '../lib/assets.js';

export default function HomeCoach() {
  return (
    <section className="home-coach coach-feature" aria-labelledby="home-coach-title">
      <div className="wrap home-coach-inner">
        <div className="coach-feature-art">
          <div className="coach-feature-plate" aria-hidden="true" />
          <figure className="coach-feature-photo">
            <img src={asset('coach-and-player-cutout.png')} width="1448" height="1086" alt="Coach Dhiraj speaking with a young goalkeeper" loading="lazy" decoding="async" />
          </figure>
          <div className="coach-feature-badges">
            <span className="coach-feature-chip coach-feature-chip-training">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m12 8 4 3-1.5 4.5h-5L8 11l4-3Z M12 3v5 M20.5 9.2 16 11 M17.3 19.3l-2.8-3.8 M6.7 19.3l2.8-3.8 M3.5 9.2 8 11" /></svg>
              U.S. Soccer trained
            </span>
            <span className="coach-feature-chip coach-feature-chip-personal">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2 M16 5.2a3 3 0 0 1 0 5.6 M17.5 14a5 5 0 0 1 3.5 4.8V20" /></svg>
              Coach. Mentor. Dad.
            </span>
          </div>
        </div>
        <div className="home-coach-copy">
          <h2 className="display" id="home-coach-title">A coach.<br /> <span>A mentor.</span></h2>
          <p>Meet Dhiraj. A youth football coach<br /> and a father of two.</p>
          <ArrowLink href="#/coach">Meet your coach</ArrowLink>
        </div>
      </div>
    </section>
  );
}
