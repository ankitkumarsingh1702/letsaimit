import { Arrow, TrialButton } from '../components/ui.jsx';
import ProgrammeFilm from '../components/ProgrammeFilm.jsx';
import { asset } from '../lib/assets.js';
import { useSiteActions } from '../context/SiteActions.jsx';

const questions = [
  ['Is this suitable for a beginner?', 'Tell the coach your child’s age and experience. They’ll help you find a suitable group.'],
  ['When are the sessions?', 'The coach will confirm the current days and times before you join.'],
  ['What should my child bring?', 'Ask the coach for the kit list before your first session.'],
  ['How does the free trial work?', 'Send a trial enquiry. The coach will help you agree a suitable time.'],
];

export default function Programme() {
  const { openForm } = useSiteActions();

  return (
    <div className="pg-page">
      <section className="pg-hero wrap" aria-labelledby="programme-heading">
        <div className="pg-hero-copy">
          <h1 className="display" id="programme-heading">Football<br /> starts with<br /> play<span className="pg-dot">.</span></h1>
          <p>Learn new skills. Make new friends.<br /> Enjoy the game.</p>
          <TrialButton />
        </div>
        <figure className="pg-hero-photo">
          <img src={asset('Initial_days_of_kids_training.jpg')} alt="Children running together during Coach Dhiraj’s football training" width="1600" height="1200" fetchPriority="high" />
          <figcaption>From Coach Dhiraj’s sessions in Texas.</figcaption>
        </figure>
      </section>

      <section className="pg-facts" aria-label="Programme at a glance">
        <dl className="wrap pg-facts-inner">
          <div><dt>Ages</dt><dd>5–13</dd></div>
          <div><dt>Each week</dt><dd>2 <span>sessions</span></dd></div>
          <div><dt>Each session</dt><dd>45–60 <span>min</span></dd></div>
        </dl>
      </section>

      <section className="section wrap pg-session" aria-labelledby="session-heading">
        <div className="pg-session-head">
          <h2 className="display" id="session-heading">A little practice.<br /> <span>A lot of play.</span></h2>
          <p>Time to move, learn and<br /> play as a team.</p>
        </div>
        <ProgrammeFilm />
        <ol className="pg-session-steps">
          <li><span className="pg-step-no">01</span><h3>Warm up</h3><p>Get moving. Have fun.</p></li>
          <li><span className="pg-step-no">02</span><h3>Learn a skill</h3><p>A little better, every time.</p></li>
          <li><span className="pg-step-no">03</span><h3>Play together</h3><p>One ball. One team.</p></li>
        </ol>
      </section>

      <section className="wrap pg-fees" id="fees" aria-labelledby="fees-heading">
        <div className="pg-fee-panel">
          <h2 id="fees-heading">The programme</h2>
          <p className="pg-price">₹5,000<span>/ month</span></p>
          <p className="pg-fee-location">Nambiar Ellegenza, Bengaluru</p>
          <ul><li>Two sessions a week.</li><li>Coach confirms your batch and timing.</li></ul>
          <TrialButton className="btn-dark">Request a free trial</TrialButton>
          <button className="pg-enroll text-link" type="button" data-action="enroll" onClick={(event) => openForm('enroll', event.currentTarget)}>
            Ready to join? Enroll your child <Arrow />
          </button>
          <p className="pg-payment">UPI · Cash · Bank transfer</p>
        </div>
        <figure className="pg-fee-photo">
          <img src={asset('Game_in_action.jpg')} alt="Young football players enjoying a match on a grass field" width="1024" height="768" loading="lazy" />
        </figure>
      </section>

      <section className="section wrap pg-faq" id="programme-faq" aria-labelledby="faq-heading">
        <div className="pg-faq-intro">
          <h2 className="display" id="faq-heading">Good to <br /> know<span className="pg-dot">.</span></h2>
          <a className="text-link" href="https://letsaimit.com/refund-policy" target="_blank" rel="noopener noreferrer">Fees &amp; cancellations <Arrow /></a>
        </div>
        <div className="pg-questions">
          {questions.map(([question, answer]) => (
            <details key={question}>
              <summary>{question}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
