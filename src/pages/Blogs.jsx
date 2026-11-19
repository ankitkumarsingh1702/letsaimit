import { useState } from 'react';
import { Arrow } from '../components/ui.jsx';
import { mediaProps } from '../lib/media.js';
import { blogPosts } from '../features/blog/blog-posts.js';
import '../features/blog/blogs.css';

const profileUrl = 'https://www.linkedin.com/in/dhiraj-mishra-20274717/';
const featured = blogPosts.find(post => post.id === 'making-movement-enjoyable');
const stories = blogPosts.filter(post => post !== featured);
const filters = [['all', 'All'], ['article', 'Articles'], ['post', 'Posts']];
const date = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
const storyImages = {
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

function SourceLink({ href, children = 'Read on LinkedIn' }) {
  return <a className="blog-source-link" href={href} target="_blank" rel="noopener noreferrer">
    {children}<Arrow up /><span className="blog-sr-only"> · opens in a new tab</span>
  </a>;
}

function StoryMeta({ post }) {
  return <p className="blog-story-meta">
    <span>{post.type === 'article' ? 'Article' : 'Post'}</span>
    {post.publishedAt && <><span aria-hidden="true"> · </span><time dateTime={post.publishedAt}>{date.format(new Date(post.publishedAt))}</time></>}
  </p>;
}

function StoryPreview({ post }) {
  const image = storyImages[post.id];
  return <article className="blog-story" aria-labelledby={post.id}>
    <img className="blog-story-image"
      {...mediaProps(image.file, '(max-width: 620px) calc(100vw - 64px), (max-width: 1000px) 180px, 180px')}
      alt={image.alt} loading="lazy" />
    <div className="blog-story-copy">
      <StoryMeta post={post} />
      <h3 id={post.id}><a href={post.url} target="_blank" rel="noopener noreferrer">{post.title}<span className="blog-sr-only"> · on LinkedIn, opens in a new tab</span></a></h3>
      <p className="blog-story-summary">{post.summary}</p>
      <SourceLink href={post.url} />
    </div>
  </article>;
}

export function Blogs() {
  const [filter, setFilter] = useState('all');
  const visible = stories.filter(post => filter === 'all' || post.type === filter);

  return <div className="blogs-page wrap">
    <section className="blog-hero" aria-labelledby="blogs-title">
      <div className="blog-hero-intro">
        <h1 id="blogs-title">Blogs</h1>
        <p>By <a href={profileUrl} target="_blank" rel="noopener noreferrer">Dhiraj Mishra<span className="blog-sr-only"> on LinkedIn, opens in a new tab</span></a></p>
      </div>
      <img className="blog-hero-image"
        {...mediaProps('Coach_Goalie_conversation_before_the_game.jpg', '(max-width: 700px) calc(100vw - 32px), calc(100vw - 96px)')}
        alt="Coach Dhiraj talking with a young goalkeeper before a game in Frisco, Texas"
        fetchPriority="high" />
      <article className="blog-featured" aria-labelledby="blog-featured-title">
        <p className="blog-story-meta">Coaching · Post</p>
        <h2 id="blog-featured-title">{featured.title}</h2>
        <p>{featured.summary}</p>
        <SourceLink href={featured.url} />
      </article>
    </section>

    <section className="blog-collection" aria-labelledby="blog-collection-title">
      <div className="blog-collection-heading">
        <h2 id="blog-collection-title">Posts and articles</h2>
        <div className="blog-filters" role="group" aria-label="Filter posts and articles">
          {filters.map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value}
            aria-controls="blog-stories" onClick={() => setFilter(value)}>{label}</button>)}
        </div>
      </div>
      <p className="blog-sr-only" role="status">{visible.length} {filter === 'all' ? 'posts and articles' : filter === 'article' ? 'articles' : 'posts'}</p>
      <div id="blog-stories" className="blog-stories">
        {visible.map(post => <StoryPreview key={post.id} post={post} />)}
      </div>
      <div className="blog-more">
        <SourceLink href={profileUrl + 'recent-activity/all/'}>More from Dhiraj on LinkedIn</SourceLink>
      </div>
    </section>
  </div>;
}
