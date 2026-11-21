import { useState } from 'react';
import { Arrow } from './ui.jsx';
import { mediaProps } from '../lib/media.js';
import './youtube-short-card.css';

export function YouTubeShortCard({ video }) {
  const [playing, setPlaying] = useState(false);
  if (!video) return null;

  return <section className="yt-short-card" aria-labelledby="yt-short-title">
    <div className="yt-short-stage">
      {playing ? (
        <iframe
          className="yt-short-iframe"
          src={video.privacyEmbedUrl}
          title={video.name}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          className="yt-short-poster"
          onClick={() => setPlaying(true)}
          aria-label={`Play ${video.durationLabel} video: ${video.name}`}
        >
          <img
            className="yt-short-poster-img"
            {...mediaProps(video.posterFile, '(max-width: 680px) 260px, 240px')}
            alt={video.posterAlt}
            loading="lazy"
          />
          <span className="yt-short-poster-scrim" aria-hidden="true" />
          <span className="yt-short-badge" aria-hidden="true">YouTube Short · {video.durationLabel}</span>
          <span className="yt-short-play" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <polygon points="8,5 20,12 8,19" fill="currentColor" />
            </svg>
          </span>
          <span className="yt-short-tap-label" aria-hidden="true">Play video</span>
        </button>
      )}
    </div>

    <div className="yt-short-copy">
      <p className="yt-short-eyebrow">Quick video overview · {video.durationLabel}</p>
      <h2 id="yt-short-title">{video.heading}</h2>
      <p className="yt-short-summary">{video.description}</p>
      {video.highlights?.length > 0 && (
        <ul className="yt-short-highlights">
          {video.highlights.map(item => <li key={item}>{item}</li>)}
        </ul>
      )}
      <div className="yt-short-actions">
        {!playing && (
          <button type="button" className="yt-short-btn-play" onClick={() => setPlaying(true)}>
            Play here ({video.durationLabel})
          </button>
        )}
        <a
          className="yt-short-link"
          href={video.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Watch on YouTube Shorts
          <Arrow up />
          <span className="yt-short-sr-only"> · opens in a new tab</span>
        </a>
      </div>
      <p className="yt-short-credit">{video.credit}</p>
    </div>
  </section>;
}

export default YouTubeShortCard;
