import { useEffect, useRef, useState } from 'react';
import { asset } from '../lib/assets.js';

export default function ProgrammeFilm() {
  const videoRef = useRef(null);
  const lifecycleRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const video = videoRef.current;
    lifecycleRef.current += 1;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pauseWhenHidden = () => {
      if (document.hidden) video.pause();
    };
    const pauseForMotion = () => {
      if (motion.matches) video.pause();
    };
    document.addEventListener('visibilitychange', pauseWhenHidden);
    motion.addEventListener('change', pauseForMotion);

    return () => {
      lifecycleRef.current += 1;
      document.removeEventListener('visibilitychange', pauseWhenHidden);
      motion.removeEventListener('change', pauseForMotion);
      video.pause();
    };
  }, []);

  function syncPlayback(event) {
    const video = event.currentTarget;
    setPlaying(!video.paused && !video.ended);
  }

  async function playFilm() {
    const video = videoRef.current;
    if (!video) return;
    const lifecycle = lifecycleRef.current;
    setError('');
    try {
      if (video.error) video.load();
      await video.play();
    } catch {
      if (lifecycleRef.current !== lifecycle) return;
      setError('The film could not play. Please try again.');
    }
    if (lifecycleRef.current === lifecycle) setPlaying(!video.paused && !video.ended);
  }

  function handleError(event) {
    setError('The film could not load. Please try again.');
    syncPlayback(event);
  }

  return (
    <figure className="pg-film">
      <div className={`pg-video-frame${playing ? ' pg-is-playing' : ''}`}>
        <video
          ref={videoRef}
          id="programme-film"
          data-ready="true"
          controls
          playsInline
          muted
          loop
          preload="metadata"
          poster={asset('football-film-poster.jpg')}
          aria-label="Children practising football; silent stock footage"
          onPlay={syncPlayback}
          onPause={syncPlayback}
          onEnded={syncPlayback}
          onError={handleError}
        >
          <source src={asset('football-film.mp4')} type="video/mp4" />
          Your browser does not support this film. <a href={asset('football-film.mp4')}>Open the football film</a>.
        </video>
        <button className="pg-video-play" type="button" aria-label="Play football film" aria-controls="programme-film" onClick={playFilm}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7Z" fill="currentColor" /></svg>
        </button>
        <p className="pg-video-error" role="status" hidden={!error}>{error}</p>
      </div>
      <figcaption>Stock footage · <a href="https://www.pexels.com/video/little-boys-training-in-a-soccer-football-field-12954458/" target="_blank" rel="noopener noreferrer">Marsel Sharipov / Pexels</a></figcaption>
    </figure>
  );
}
