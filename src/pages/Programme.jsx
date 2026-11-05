import { useSiteActions } from "../context/SiteActions.jsx";
import { TrialButton } from "../components/ui.jsx";
import { mediaProps } from "../lib/media.js";
import { ProgrammeFilm } from "../components/ProgrammeFilm.jsx";
import { Arrow } from "../components/ui.jsx";
var questions = [
  [
    "Which sports are available?",
    "Football and basketball at both communities, with fitness activities in each session.",
  ],
  [
    "Is this suitable for a beginner?",
    "Start with a free trial. Share your child’s age and experience so the coach can match them to a suitable group.",
  ],
  [
    "When are the sessions?",
    "Two sessions each week, 45–60 minutes each, for ages 5–14. Days and times vary by community and age group. Your batch timing is confirmed before you join.",
  ],
  [
    "What should my child bring?",
    "Comfortable sports clothes, trainers and water. For football, bring shin guards and footwear suited to the playing surface.",
  ],
  [
    "How does the free trial work?",
    "Your first session is free. Request a trial with your sport and community, then wait for your session confirmation before arriving.",
  ],
  [
    "What if we miss a session or leave?",
    "Missed sessions and voluntary withdrawal are non-refundable after paid enrolment.",
    true,
  ],
];
function Programme() {
  let { openForm } = useSiteActions();
  return (
    <div className="pg-page">
      <section className="pg-hero wrap" aria-labelledby="programme-heading">
        <div className="pg-hero-copy">
          <h1 className="display" id="programme-heading">
            Move.
            <br />
            {" Learn."}
            <br />
            {" Play"}
            <span className="pg-dot">.</span>
          </h1>
          <p>
            Football. Basketball.
            <br />
            {" Build fitness through play."}
          </p>
          <TrialButton />
        </div>
        <figure className="pg-hero-photo">
          <img
            {...mediaProps("Initial_days_of_kids_training.jpg", "(max-width: 700px) calc(100vw - 40px), (max-width: 1400px) 48vw, 640px")}
            alt="Children running together during Coach Dhiraj’s football training"
            width="1600"
            height="1200"
            fetchPriority="high"
          />
          <figcaption>From Coach Dhiraj’s sessions in Frisco, Texas.</figcaption>
        </figure>
      </section>
      <section className="pg-facts" aria-label="Programme at a glance">
        <dl className="wrap pg-facts-inner">
          <div>
            <dt>Ages</dt>
            <dd>5–14</dd>
          </div>
          <div>
            <dt>Each week</dt>
            <dd>
              {"2 "}
              <span>sessions</span>
            </dd>
          </div>
          <div>
            <dt>Each session</dt>
            <dd>
              {"45–60 "}
              <span>min</span>
            </dd>
          </div>
        </dl>
      </section>
      <section
        className="section wrap pg-session"
        aria-labelledby="session-heading"
      >
        <div className="pg-session-head">
          <h2 className="display" id="session-heading">
            A little practice.
            <br /> <span>A lot of play.</span>
          </h2>
          <p>
            Every session helps children
            <br />
            {" move, learn and play together."}
          </p>
        </div>
        <ProgrammeFilm />
        <ol className="pg-session-steps">
          <li>
            <span className="pg-step-no">01</span>
            <h3>Warm up</h3>
            <p>Get moving. Have fun.</p>
          </li>
          <li>
            <span className="pg-step-no">02</span>
            <h3>Learn a skill</h3>
            <p>A little better, every time.</p>
          </li>
          <li>
            <span className="pg-step-no">03</span>
            <h3>Play together</h3>
            <p>One ball. One team.</p>
          </li>
        </ol>
      </section>
      <section
        className="wrap pg-fees"
        id="communities"
        aria-labelledby="communities-heading"
      >
        <div className="pg-fee-panel">
          <h2 id="communities-heading">Our communities</h2>
          <h3 className="pg-community-heading">Play, close to home.</h3>
          <p className="pg-fee-location">Bengaluru</p>
          <ul
            className="pg-community-list"
            role="list"
            aria-label="Active communities"
          >
            <li>Nambiar Ellegenza</li>
            <li>Nambiar Bellezea</li>
          </ul>
          <p className="pg-community-note">
            Football and basketball at both.
          </p>
          <TrialButton className="btn-dark">Request a free trial</TrialButton>
          <button
            className="pg-enroll text-link"
            type="button"
            data-action="enroll"
            onClick={(event) => openForm("enroll", event.currentTarget)}
          >
            {"Ready to join? Enrol your child "}
            <Arrow />
          </button>
        </div>
        <figure className="pg-fee-photo">
          <img
            {...mediaProps("Game_in_action.jpg", "(max-width: 700px) calc(100vw - 40px), (max-width: 1400px) 48vw, 640px")}
            alt="Young football players enjoying a match on a grass field"
            width="1024"
            height="768"
            loading="lazy"
          />
        </figure>
      </section>
      <section
        className="section wrap pg-faq"
        id="programme-faq"
        aria-labelledby="faq-heading"
      >
        <div className="pg-faq-intro">
          <h2 className="display" id="faq-heading">
            {"Good to "}
            <br />
            {" know"}
            <span className="pg-dot">.</span>
          </h2>
          <a
            className="text-link"
            href="/refunds/"
          >
            {"Cancellations "}
            <Arrow />
          </a>
        </div>
        <div className="pg-questions">
          {questions.map(([question, answer, policyLink]) => (
            <details key={question}>
              <summary>
                {question}
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="m6 9 6 6 6-6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </summary>
              <p>
                {answer}
                {policyLink && <>{" "}<a href="/refunds/" style={{ textDecoration: "underline" }}>Read the policy and exceptions.</a></>}
              </p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
export { questions, Programme };
export default Programme;
