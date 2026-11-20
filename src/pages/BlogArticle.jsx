import { Arrow } from '../components/ui.jsx';
import { mediaProps } from '../lib/media.js';
import { articles } from '../features/blog/articles.js';
import '../features/blog/blogs.css';

const date = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric',
});

export function BlogArticle({ article }) {
  const related = article.related
    .map(id => articles.find(item => item.id === id))
    .filter(Boolean);

  return <div className="blog-article-page wrap">
    <nav className="blog-breadcrumbs" aria-label="Breadcrumb">
      <ol>
        <li><a href="/">Home</a></li>
        <li><a href="/blogs/">Blogs</a></li>
        <li aria-current="page">{article.title}</li>
      </ol>
    </nav>

    <article className="blog-article" aria-labelledby="article-title">
      <header className="blog-article-header">
        <p className="blog-eyebrow">{article.category}</p>
        <h1 id="article-title">{article.title}</h1>
        <p className="blog-article-description">{article.description}</p>
        <p className="blog-article-byline">
          <span>By {article.author}</span>
          <span> · </span>
          <time dateTime={article.publishedAt}>{date.format(new Date(article.publishedAt))}</time>
        </p>
      </header>

      <figure className={`blog-article-figure${article.image.illustration ? ' blog-article-figure-illustration' : ''}`}>
        <img {...mediaProps(article.image.file, '(max-width: 700px) calc(100vw - 40px), (max-width: 1100px) calc(100vw - 64px), 1040px')}
          alt={article.image.alt} fetchPriority="high" />
        <figcaption>{article.image.caption}</figcaption>
      </figure>

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
            <img {...mediaProps(section.image.file, '(max-width: 700px) calc(100vw - 40px), 680px')}
              alt={section.image.alt} loading="lazy" />
            <figcaption>{section.image.caption}</figcaption>
          </figure>}
        </section>)}

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

        <a className="blog-source-link blog-back-link" href="/blogs/">Back to all guides<Arrow /></a>
      </div>
    </article>

    {related.length > 0 && <nav className="blog-article-related" aria-labelledby="related-guides-title">
      <h2 id="related-guides-title">Keep reading.</h2>
      <ul>{related.map(item => <li key={item.id}>
        <a href={item.path}><span>{item.title}</span><Arrow /></a>
      </li>)}</ul>
    </nav>}
  </div>;
}

export default BlogArticle;
