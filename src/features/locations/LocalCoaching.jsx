import { Arrow, RegisterLink, TrialButton } from '../../components/ui.jsx';
import { YouTubeShortCard } from '../../components/YouTubeShortCard.jsx';
import { mediaProps } from '../../lib/media.js';
import './locations.css';

export function LocalCoaching({ content }) {
  const isCity = content.page === 'local-bengaluru';

  return <div className="local-page wrap">
    <nav className="local-breadcrumbs" aria-label="Breadcrumb">
      <ol>
        <li><a href="/">Home</a></li>
        {!isCity && <li><a href="/bengaluru/">Bengaluru coaching</a></li>}
        <li aria-current="page">{isCity ? 'Bengaluru coaching' : content.society || content.sport}</li>
      </ol>
    </nav>

    <header className={`local-hero${content.image ? '' : ' local-hero-text'}`}>
      <div className="local-hero-copy">
        <p className="local-eyebrow">{content.eyebrow}</p>
        <h1>{content.heading}</h1>
        <p className="local-intro">{content.intro}</p>
        <div className="local-actions">
          <TrialButton />
          <RegisterLink className="local-register-link" />
        </div>
      </div>
      {content.image && <figure className="local-hero-image">
        <img {...mediaProps(content.image.file, '(max-width: 800px) calc(100vw - 40px), (max-width: 1400px) 43vw, 580px')}
          alt={content.image.alt} fetchPriority="high" />
        <figcaption>{content.image.caption}</figcaption>
      </figure>}
    </header>

    <dl className="local-facts" aria-label="Programme at a glance">
      {content.facts.map(fact => <div key={fact.label}>
        <dt>{fact.label}</dt>
        <dd>{fact.value}</dd>
      </div>)}
    </dl>

    {content.location && <section className="local-venue" aria-labelledby="local-venue-title">
      <div>
        <p className="local-eyebrow">Society location</p>
        <h2 id="local-venue-title">{content.society}</h2>
        <address>{content.location.address}</address>
        <p>Confirm your coaching meeting point and community entry with the coach before visiting.</p>
      </div>
      <div className="local-venue-links">
        <a href={content.location.mapUrl} target="_blank" rel="noopener noreferrer">Find the society on Google Maps<Arrow up /><span className="local-sr-only"> · opens in a new tab</span></a>
        <a href={content.location.sourceUrl} target="_blank" rel="noopener noreferrer">{content.location.sourceLabel}<Arrow up /><span className="local-sr-only"> · opens in a new tab</span></a>
      </div>
    </section>}

    <div className="local-reading">
      {content.table && <section className="local-section local-table-section" aria-labelledby="local-table-title">
        <h2 id="local-table-title">{content.table.heading}</h2>
        <div className="local-table-wrap" role="region" aria-label={content.table.caption} tabIndex={0}>
          <table className="local-table">
            <caption>{content.table.caption}</caption>
            <thead><tr>{content.table.headers.map(header => <th scope="col" key={header}>{header}</th>)}</tr></thead>
            <tbody>{content.table.rows.map((row, rowIndex) => <tr key={rowIndex}>
              {row.map((cell, cellIndex) => cellIndex === 0 ? <th scope="row" key={cellIndex}>{cell}</th> : <td key={cellIndex}>{cell}</td>)}
            </tr>)}</tbody>
          </table>
        </div>
      </section>}

      {content.sections.map(section => <section className="local-section" key={section.id} aria-labelledby={section.id}>
        <h2 id={section.id}>{section.heading}</h2>
        {section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        {section.bullets?.length > 0 && <ul>{section.bullets.map(item => <li key={item}>{item}</li>)}</ul>}
      </section>)}

      {content.video && <YouTubeShortCard video={content.video} />}

      <section className="local-faq" aria-labelledby="local-faq-title">
        <h2 id="local-faq-title">Before you join</h2>
        {content.faq.map(item => <details key={item.question}>
          <summary>{item.question}<span aria-hidden="true">+</span></summary>
          <p>{item.answer}</p>
        </details>)}
      </section>
    </div>

    <nav className="local-links" aria-labelledby="local-links-title">
      <h2 id="local-links-title">Find the details you need.</h2>
      <ul>{content.links.map(item => <li key={item.path}>
        <a href={item.path}><span>{item.label}</span><Arrow /></a>
      </li>)}</ul>
    </nav>

    <section className="local-next" aria-labelledby="local-next-title">
      <div>
        <h2 id="local-next-title">Ready to try a session?</h2>
        <p>Choose your sport and community. We’ll confirm the session details with you.</p>
      </div>
      <TrialButton />
    </section>
  </div>;
}

export default LocalCoaching;
