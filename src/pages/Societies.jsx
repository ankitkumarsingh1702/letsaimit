import { Arrow } from '../components/ui.jsx';
import { asset } from '../lib/assets.js';
import { useSiteActions } from '../context/SiteActions.jsx';

function PitchIcon() {
  return <svg viewBox="0 0 48 36" fill="none" aria-hidden="true"><rect x="3" y="3" width="42" height="30" rx="2" /><path d="M24 3v30M3 11h8v14H3m42-14h-8v14h8" /><circle cx="24" cy="18" r="6" /></svg>;
}

function WhistleIcon() {
  return <svg viewBox="0 0 48 40" fill="none" aria-hidden="true"><path d="M28 12h14v8H31a12 12 0 1 1-6-10l3 2Z" /><circle cx="19" cy="22" r="5" /><path d="m34 5 3-3M40 8l4-2M8 31l-5 5" /></svg>;
}

export default function Societies() {
  const { openForm } = useSiteActions();
  const enquire = (event) => openForm('society', event.currentTarget);

  return (
    <div className="so-page">
      <section className="wrap so-hero" aria-labelledby="society-heading">
        <div className="so-hero-copy">
          <h1 className="display so-title" id="society-heading" tabIndex={-1}>Bring<br /> football<br /> home<span className="so-dot">.</span></h1>
          <p>Football coaching for children,<br className="so-desktop-break" /> inside your society.</p>
          <button className="btn btn-lime" type="button" data-action="society" onClick={enquire}>Enquire for your society <Arrow /></button>
        </div>
        <figure className="so-hero-media">
          <img src={asset('image2.jpeg')} alt="Children practising football at the Nambiar Ellegenza community ground" width="2048" height="1536" fetchPriority="high" />
          <figcaption>Nambiar Ellegenza, Bengaluru</figcaption>
        </figure>
      </section>

      <section className="so-responsibilities" aria-labelledby="so-responsibilities-title">
        <div className="wrap so-role-grid">
          <h2 className="display" id="so-responsibilities-title">Your space.<br /> <span>Our coaching.</span></h2>
          <div className="so-role">
            <span className="so-role-icon"><PitchIcon /></span>
            <h3>Your society</h3>
            <p>You provide the<br /> playing space.</p>
          </div>
          <div className="so-role">
            <span className="so-role-icon"><WhistleIcon /></span>
            <h3>LetsAimIt</h3>
            <p>We bring the coach<br /> and session plan.</p>
          </div>
        </div>
      </section>

      <section className="section wrap so-community" aria-labelledby="so-community-title">
        <div className="so-community-top">
          <h2 className="display" id="so-community-title">Already playing<br /> close to home.</h2>
          <div className="so-community-info">
            <p>Now at Nambiar Ellegenza,<br /> Bengaluru.</p>
            <a className="text-link" href="#/programme">Explore the programme <Arrow /></a>
          </div>
        </div>
        <div className="so-community-images">
          <figure className="so-building">
            <img src={asset('image1.jpeg')} alt="Nambiar Ellegenza community clubhouse" width="640" height="640" loading="lazy" decoding="async" />
          </figure>
          <figure className="so-training">
            <img src={asset('image3.jpeg')} alt="Coach and children training together on the Nambiar Ellegenza football court" width="2048" height="1536" loading="lazy" decoding="async" />
          </figure>
        </div>
      </section>

      <section className="wrap so-process" aria-labelledby="so-process-title">
        <h2 className="display" id="so-process-title">Three steps.<br className="so-mobile-break" /> One team.</h2>
        <ol className="so-steps">
          <li><span className="so-step-number" aria-hidden="true">01</span><h3>Tell us about<br /> your society.</h3><p>Share your location and interest.</p></li>
          <li><span className="so-step-number" aria-hidden="true">02</span><h3>Discuss the space<br /> and timing.</h3><p>Find out what could work.</p></li>
          <li><span className="so-step-number" aria-hidden="true">03</span><h3>Agree the plan<br /> together.</h3><p>Start when the details are in place.</p></li>
        </ol>
      </section>

      <section className="so-enquire" aria-labelledby="so-enquire-title">
        <div className="wrap so-enquire-inner">
          <h2 className="display" id="so-enquire-title">Let’s get the<br /> ball rolling.</h2>
          <button className="btn btn-dark" type="button" data-action="society" onClick={enquire}>Enquire for your society <Arrow /></button>
        </div>
      </section>
    </div>
  );
}
