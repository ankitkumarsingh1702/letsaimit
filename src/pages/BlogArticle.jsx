import { Arrow } from '../components/ui.jsx';
import { YouTubeShortCard } from '../components/YouTubeShortCard.jsx';
import { asset } from '../lib/assets.js';
import { mediaProps } from '../lib/media.js';
import { articles, categoryTone, estimateReadMinutes } from '../features/blog/articles.js';
import '../features/blog/blogs.css';

const date = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric',
});

function ShareIcons() {
  return <div className="blog-author-links" aria-label="LetsAimIt links">
    <a href="/coach/" aria-label="Meet Coach Dhiraj" title="Meet Coach Dhiraj">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 20c1.6-3.8 4.8-5.5 8-5.5s6.4 1.7 8 5.5" /></svg>
    </a>
    <a href="https://www.instagram.com/lets_aimit/" target="_blank" rel="noopener noreferrer" aria-label="LetsAimIt on Instagram" title="Instagram">
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg>
    </a>
    <a href="https://wa.me/918868886074" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp LetsAimIt" title="WhatsApp">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 0 0-7.7 13.7L3 21l4.5-1.2A9 9 0 1 0 12 3Z" /><path d="M9.5 9.2c.3-.5.6-.5.9-.5h.5c.2 0 .4.1.5.4l.7 1.6c.1.3.1.5-.1.7l-.5.6c-.1.2-.2.3-.1.5.4.8 1.2 1.6 2 2 .2.1.4.1.5-.1l.6-.7c.2-.2.4-.2.7-.1l1.5.7c.3.1.4.3.4.5 0 .7-.4 1.4-1.2 1.7-.7.2-1.7.1-3-.5-1.5-.7-2.8-2-3.5-3.5-.6-1.3-.7-2.3-.4-3Z" /></svg>
    </a>
  </div>;
}

export function BlogArticle({ article }) {
  const related = article.related
    .map(id => articles.find(item => item.id === id))
    .filter(Boolean);
  const mins = estimateReadMinutes(article);

  return <div className="blogs-surface">
    <div className="blog-article-page wrap">
      <nav className="blog-breadcrumbs" aria-label="Breadcrumb">
        <ol>
          <li><a href="/">Home</a></li>
          <li><a href="/blogs/">Blogs</a></li>
          <li aria-current="page">{article.title}</li>
        </ol>
      </nav>

      <article className="blog-article" aria-labelledby="article-title">
        <figure className={`blog-article-banner${article.image.illustration ? ' blog-article-banner--illustration' : ''}`}>
          <img {...mediaProps(article.image.file, '(max-width: 700px) calc(100vw - 40px), (max-width: 1200px) calc(100vw - 64px), 1180px')}
            alt={article.image.alt} fetchPriority="high" />
          <figcaption className="blog-banner-caption">{article.image.caption}</figcaption>
        </figure>

        <header className="blog-article-card">
          <div className="blog-author-pill">
            <div className="blog-author-identity">
              <span className="blog-author-avatar" aria-hidden="true">
                <img src={asset('favicon.svg')} alt="" width="36" height="36" />
              </span>
              <div className="blog-author-meta">
                <strong className="blog-author-name">By {article.author}</strong>
                <time className="blog-author-date" dateTime={article.publishedAt}>{date.format(new Date(article.publishedAt))}</time>
              </div>
            </div>
            <ShareIcons />
          </div>

          <div className="blog-article-card-body">
            <div className="blog-meta-row">
              <span className={`blog-pill blog-pill--${categoryTone(article.category)}`}>{article.category}</span>
              <span className="blog-read-time">{mins} min read</span>
            </div>
            <h1 id="article-title">{article.title}</h1>
            <p className="blog-article-description">{article.description}</p>
          </div>
        </header>

        <div className="blog-article-body">
          <p className="blog-article-intro">{article.intro}</p>

          <nav className="blog-article-contents" aria-label="On this page">
            <p>In this guide</p>
            <ol>{article.sections.map(section => <li key={section.id}>
              <a href={`#${section.id}`}>{section.heading}</a>
            </li>)}</ol>
          </nav>

          {article.sections.map(section => <section className="blog-article-section" key={section.id} aria-labelledby={section.id}>
            <h2 id={section.id}>{section.heading}</h2>
            {section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
            {section.bullets?.length > 0 && <ul>{section.bullets.map(item => <li key={item}>{item}</li>)}</ul>}
            {section.table && <div className="blog-table-wrap" role="region" aria-label={section.table.caption} tabIndex={0}>
              <table className="blog-table">
                <caption>{section.table.caption}</caption>
                <thead><tr>{section.table.headers.map(header => <th scope="col" key={header}>{header}</th>)}</tr></thead>
                <tbody>{section.table.rows.map((row, rowIndex) => <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => cellIndex === 0 ? <th scope="row" key={cellIndex}>{cell}</th> : <td key={cellIndex}>{cell}</td>)}
                </tr>)}</tbody>
              </table>
            </div>}
            {section.image && <figure className="blog-article-section-figure">
              <img {...mediaProps(section.image.file, '(max-width: 700px) calc(100vw - 40px), 720px')}
                alt={section.image.alt} loading="lazy" />
              <figcaption>{section.image.caption}</figcaption>
            </figure>}
          </section>)}

          {article.video && <YouTubeShortCard video={article.video} />}

          {article.faq?.length > 0 && <section className="blog-article-faq" aria-labelledby="article-faq-title">
            <h2 id="article-faq-title">Common parent questions</h2>
            {article.faq.map(item => <details key={item.question}>
              <summary>{item.question}<span aria-hidden="true">+</span></summary>
              <p>{item.answer}</p>
            </details>)}
          </section>}

          {article.reading.length > 0 && <section className="blog-further-reading" aria-labelledby="further-reading-title">
            <h2 id="further-reading-title">Further reading</h2>
            <ul>{article.reading.map(item => <li key={item.url}>
              <a href={item.url} {...(item.url.startsWith('/') ? {} : { target: '_blank', rel: 'noopener noreferrer' })}>
                {item.label}<Arrow up={!item.url.startsWith('/')} />
                {!item.url.startsWith('/') && <span className="blog-sr-only"> · opens in a new tab</span>}
              </a>
            </li>)}</ul>
          </section>}

          <a className="blog-back-pill" href="/blogs/">← Back to all guides</a>
        </div>
      </article>

      {related.length > 0 && <nav className="blog-article-related" aria-labelledby="related-guides-title">
        <h2 id="related-guides-title">Keep reading</h2>
        <div className="blog-cards-grid">
          {related.map(item => {
            const itemMins = estimateReadMinutes(item);
            return <article className="blog-grid-card" key={item.id}>
              <div className={`blog-grid-media${item.image.illustration ? ' blog-grid-media--illustration' : ''}`}>
                <img className="blog-grid-image"
                  {...mediaProps(item.image.file, '(max-width: 640px) calc(100vw - 64px), (max-width: 1000px) calc((100vw - 96px) / 2), 380px')}
                  alt={item.image.alt} loading="lazy" />
              </div>
              <div className="blog-grid-body">
                <div className="blog-meta-row">
                  <span className={`blog-pill blog-pill--${categoryTone(item.category)}`}>{item.category}</span>
                  <span className="blog-read-time">{itemMins} min read</span>
                </div>
                <h3><a className="blog-card-stretch" href={item.path}>{item.title}</a></h3>
                <span className="blog-inline-cta" aria-hidden="true">Read More<Arrow /></span>
              </div>
            </article>;
          })}
        </div>
      </nav>}
    </div>
  </div>;
}

export default BlogArticle;
