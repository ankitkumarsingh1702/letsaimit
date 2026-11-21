import { useState } from 'react';
import { Arrow } from '../components/ui.jsx';
import { mediaProps } from '../lib/media.js';
import { blogPosts } from '../features/blog/blog-posts.js';
import { articles, categoryTone, estimateReadMinutes } from '../features/blog/articles.js';
import '../features/blog/blogs.css';

const profileUrl = 'https://www.linkedin.com/in/dhiraj-mishra-20274717/';
const featuredGuide = articles[0];
const spotlightGuides = articles.slice(1, 3);
const libraryGuides = articles.slice(3);
const guideCategories = ['All', ...new Set(libraryGuides.map(article => article.category))];
const linkedinFilters = [['all', 'All'], ['article', 'Articles'], ['post', 'Posts']];
const date = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
const storyImages = {
  'making-movement-enjoyable': {
    file: 'Coach_Goalie_conversation_before_the_game.jpg',
    alt: 'Coach Dhiraj talking with a young goalkeeper before a game in Frisco, Texas',
  },
  'the-question-the-doctor-asked': {
    file: 'Parents_Players_Coach_pic_post_Game.jpg',
    alt: 'Parents, players and their coach together after a football game',
  },
  'safe-soccer-and-coaching': {
    file: 'Coaches_training_Pic.webp',
    alt: 'Coaches taking part in a football training session',
  },
  'what-coaching-teaches-the-coach': {
    file: 'Group_Photo_of_5th_Graders.jpg',
    alt: 'Young football players with their coach on the pitch',
  },
  'showing-up-for-young-players': {
    file: 'Defining_Strategy.jpg',
    alt: 'Coach Dhiraj discussing a game with his young players',
  },
};

function CategoryPill({ label, tone = 'soft' }) {
  return <span className={`blog-pill blog-pill--${tone}`}>{label}</span>;
}

function FeaturedHeroCard({ article }) {
  const mins = estimateReadMinutes(article);
  return <article className="blog-bento-lead" aria-labelledby={`guide-${article.id}`}>
    <img className="blog-bento-lead-image"
      {...mediaProps(article.image.file, '(max-width: 900px) calc(100vw - 40px), 740px')}
      alt={article.image.alt} fetchPriority="high" />
    <div className="blog-bento-lead-scrim" aria-hidden="true" />
    <div className="blog-bento-lead-copy">
      <div className="blog-meta-row">
        <CategoryPill label={article.category} tone="hero" />
        <span className="blog-read-time blog-read-time--light">{mins} min read</span>
      </div>
      <h2 id={`guide-${article.id}`}><a className="blog-card-stretch" href={article.path}>{article.title}</a></h2>
      <span className="blog-inline-cta blog-inline-cta--light" aria-hidden="true">Read More<Arrow /></span>
    </div>
  </article>;
}

function SpotlightCard({ article }) {
  const mins = estimateReadMinutes(article);
  return <article className="blog-bento-side" aria-labelledby={`guide-${article.id}`}>
    <div className="blog-bento-side-body">
      <div className="blog-meta-row">
        <CategoryPill label={article.category} tone={categoryTone(article.category)} />
        <span className="blog-read-time">{mins} min read</span>
      </div>
      <h3 id={`guide-${article.id}`}><a className="blog-card-stretch" href={article.path}>{article.title}</a></h3>
    </div>
    <span className="blog-square-arrow" aria-hidden="true"><Arrow /></span>
  </article>;
}

function GuideCard({ article }) {
  const mins = estimateReadMinutes(article);
  return <article className="blog-grid-card" aria-labelledby={`guide-${article.id}`}>
    <div className={`blog-grid-media${article.image.illustration ? ' blog-grid-media--illustration' : ''}`}>
      <img className="blog-grid-image"
        {...mediaProps(article.image.file, '(max-width: 640px) calc(100vw - 64px), (max-width: 1000px) calc((100vw - 96px) / 2), 380px')}
        alt={article.image.alt} loading="lazy" />
    </div>
    <div className="blog-grid-body">
      <div className="blog-meta-row">
        <CategoryPill label={article.category} tone={categoryTone(article.category)} />
        <span className="blog-read-time">{mins} min read</span>
      </div>
      <h3 id={`guide-${article.id}`}><a className="blog-card-stretch" href={article.path}>{article.title}</a></h3>
      <span className="blog-inline-cta" aria-hidden="true">Read More<Arrow /></span>
    </div>
  </article>;
}

function LinkedInCard({ post }) {
  const image = storyImages[post.id];
  return <article className="blog-grid-card blog-grid-card--linkedin" aria-labelledby={post.id}>
    <div className="blog-grid-media">
      <img className="blog-grid-image"
        {...mediaProps(image.file, '(max-width: 640px) calc(100vw - 64px), (max-width: 1000px) calc((100vw - 96px) / 2), 380px')}
        alt={image.alt} loading="lazy" />
    </div>
    <div className="blog-grid-body">
      <p className="blog-meta-row">
        <CategoryPill label={post.type === 'article' ? 'Article' : 'Post'} tone={post.type === 'article' ? 'dark' : 'sage'} />
        {post.publishedAt && <span className="blog-read-time"> · <time dateTime={post.publishedAt}>{date.format(new Date(post.publishedAt))}</time></span>}
      </p>
      <h3 id={post.id}>
        <a className="blog-card-stretch" href={post.url} target="_blank" rel="noopener noreferrer">
          {post.title}
          <span className="blog-sr-only"> · on LinkedIn, opens in a new tab</span>
        </a>
      </h3>
      <p className="blog-grid-summary">{post.summary}</p>
      <span className="blog-inline-cta" aria-hidden="true">Read on LinkedIn<Arrow up /></span>
    </div>
  </article>;
}

export function Blogs() {
  const [guideCategory, setGuideCategory] = useState('All');
  const [linkedinFilter, setLinkedinFilter] = useState('all');

  const visibleGuides = libraryGuides.filter(article => guideCategory === 'All' || article.category === guideCategory);
  const visibleStories = blogPosts.filter(post => linkedinFilter === 'all' || post.type === linkedinFilter);

  return <div className="blogs-surface">
    <div className="blogs-page wrap">
      <header className="blog-hub-head">
        <h1 id="blogs-title">Coaching Guides &amp;<br />Parent Insights</h1>
        <p className="blog-hub-subtitle">Practical football and basketball guides from the LetsAimIt team, alongside selected writing by <a href="/coach/">Coach Dhiraj Mishra</a> on LinkedIn.</p>
      </header>

      <section className="blog-bento" aria-label="Featured coaching guides">
        <FeaturedHeroCard article={featuredGuide} />
        <div className="blog-bento-stack">
          {spotlightGuides.map(article => <SpotlightCard key={article.id} article={article} />)}
        </div>
      </section>

      <section className="blog-library" aria-labelledby="blog-guides-title">
        <div className="blog-section-head">
          <h2 id="blog-guides-title">Resources for<br />Sports Parents</h2>
          <div className="blog-filters" role="group" aria-label="Filter coaching guides by topic">
            {guideCategories.map(category => <button key={category} type="button"
              aria-pressed={guideCategory === category}
              aria-controls="blog-guides-grid"
              onClick={() => setGuideCategory(category)}>{category}</button>)}
          </div>
        </div>
        <p className="blog-sr-only" role="status">{visibleGuides.length} guides shown</p>
        <div id="blog-guides-grid" className="blog-cards-grid">
          {visibleGuides.map(article => <GuideCard key={article.id} article={article} />)}
        </div>
      </section>

      <section className="blog-reading" aria-labelledby="blog-reading-title">
        <div className="blog-section-head">
          <p className="blog-eyebrow">From Coach Dhiraj</p>
          <h2 id="blog-reading-title">A Coach’s<br />Reading List</h2>
          <p className="blog-section-subtitle">Short previews of <a href={profileUrl} target="_blank" rel="noopener noreferrer">Dhiraj Mishra’s writing<span className="blog-sr-only"> on LinkedIn, opens in a new tab</span></a>. The complete posts and articles are published on LinkedIn.</p>
          <div className="blog-filters" role="group" aria-label="Filter posts and articles">
            {linkedinFilters.map(([value, label]) => <button key={value} type="button"
              aria-pressed={linkedinFilter === value}
              aria-controls="blog-stories"
              onClick={() => setLinkedinFilter(value)}>{label}</button>)}
          </div>
        </div>
        <p className="blog-sr-only" role="status">{visibleStories.length} {linkedinFilter === 'all' ? 'posts and articles' : linkedinFilter === 'article' ? 'articles' : 'posts'}</p>
        <div id="blog-stories" className="blog-cards-grid">
          {visibleStories.map(post => <LinkedInCard key={post.id} post={post} />)}
        </div>
        <div className="blog-more">
          <a className="blog-more-link" href={profileUrl + 'recent-activity/all/'} target="_blank" rel="noopener noreferrer">
            More from Dhiraj on LinkedIn<Arrow up />
            <span className="blog-sr-only"> · opens in a new tab</span>
          </a>
        </div>
      </section>
    </div>
  </div>;
}
