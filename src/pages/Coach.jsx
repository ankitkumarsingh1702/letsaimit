import { Arrow, TrialButton } from '../components/ui.jsx';
import { asset } from '../lib/assets.js';
import { useSiteActions } from '../context/SiteActions.jsx';

const credentials = [
  { name: 'U.S. Soccer 4v4', file: 'cert-4v4.webp', title: 'U.S. Soccer Grassroots 4v4 License' },
  { name: 'U.S. Soccer 9v9', file: 'cert-9v9.webp', title: 'U.S. Soccer Grassroots 9v9 License' },
  { name: 'U.S. Soccer 11v11', file: 'cert-11v11.webp', title: 'U.S. Soccer Grassroots 11v11 License' },
];

export default function Coach() {
  const { openCertificate } = useSiteActions();

  return (
    <div className="co-page">
      <section className="co-hero wrap" aria-labelledby="co-title">
        <div className="co-hero-copy">
          <h1 className="display co-title" id="co-title">Meet <br /> Coach<br /> Dhiraj<span>.</span></h1>
          <p className="co-intro">Youth football coach.<br /> Father of two.</p>
          <p className="co-description">Helping children learn the game<br /> and enjoy every session.</p>
          <TrialButton />
        </div>
        <figure className="co-hero-photo">
          <img src={asset('Coach_Goalie_conversation_before_the_game.jpg')} width="1600" height="1200" alt="Coach Dhiraj talking with a young goalkeeper before a game in Texas" decoding="async" fetchPriority="high" />
          <figcaption>Coach Dhiraj with a young player · Frisco, Texas</figcaption>
        </figure>
      </section>

      <section className="co-experience" aria-labelledby="co-experience-title">
        <div className="wrap co-experience-inner">
          <h2 className="display" id="co-experience-title">From Dallas.<br /> <span>To your community.</span></h2>
          <p>Former Head Coach at Frisco Soccer Association, Texas.<br /> <br /> Now coaching at Nambiar Ellegenza, Bengaluru.</p>
        </div>
      </section>

      <section className="co-credentials wrap section" aria-labelledby="co-credentials-title">
        <div className="co-credential-intro">
          <h2 className="display" id="co-credentials-title">Training<br /> that matters.</h2>
          <p>Explore the coach’s<br /> U.S. Soccer qualifications.</p>
        </div>
        <div className="co-credential-list">
          {credentials.map((certificate) => (
            <button
              key={certificate.file}
              type="button"
              className="co-credential"
              data-action="certificate"
              data-src={asset(certificate.file)}
              data-title={certificate.title}
              aria-label={`View ${certificate.title}`}
              onClick={(event) => openCertificate({ src: certificate.file, title: certificate.title }, event.currentTarget)}
            >
              <span className="co-credential-thumb">
                <img src={asset(certificate.file)} width="1584" height="1224" alt="" loading="lazy" decoding="async" />
              </span>
              <span className="co-credential-copy"><strong>{certificate.name}</strong><span>Grassroots coaching · View certificate</span></span>
              <Arrow up />
            </button>
          ))}
        </div>
      </section>

      <section className="co-teaching wrap" aria-label="The coaching approach">
        <figure className="co-teaching-photo">
          <img src={asset('Defining_Strategy.jpg')} width="1024" height="768" alt="Coach Dhiraj explaining a game to his young players in Texas" loading="lazy" decoding="async" />
          <figcaption>A moment from Coach Dhiraj’s sessions in Frisco, Texas.</figcaption>
        </figure>
        <div className="co-principles">
          <h3 className="display">Learn the basics.</h3>
          <h3 className="display">Build confidence.</h3>
          <h3 className="display">Enjoy the game.</h3>
        </div>
      </section>

      <section className="co-closing wrap" aria-labelledby="co-closing-title">
        <h2 className="display" id="co-closing-title">Come meet<br /> your coach.</h2>
        <TrialButton />
      </section>
    </div>
  );
}
