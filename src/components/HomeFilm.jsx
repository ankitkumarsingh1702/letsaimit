import { useEffect, useRef, useState } from 'react';
import { asset } from '../lib/assets.js';

export default function HomeFilm() {
  const videoRef = useRef(null);
  const lifecycleRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    const lifecycle = ++lifecycleRef.current;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pauseWhenHidden = () => {
      if (document.hidden) video.pause();
    };
    const pauseForMotion = () => {
      if (motion.matches) video.pause();
    };
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting) video.pause();
    }, { threshold: 0.05 });

    video.muted = true;
    observer?.observe(video);
    document.addEventListener('visibilitychange', pauseWhenHidden);
    motion.addEventListener('change', pauseForMotion);

    if (!motion.matches && !document.hidden) {
      // A rejected autoplay attempt keeps the original manual play control.
      video.play().catch(() => {
        if (lifecycleRef.current === lifecycle) setPlaying(!video.paused);
      });
    }

    return () => {
      // Invalidate outstanding play promises before StrictMode re-runs the effect.
      lifecycleRef.current += 1;
      observer?.disconnect();
      document.removeEventListener('visibilitychange', pauseWhenHidden);
      motion.removeEventListener('change', pauseForMotion);
      video.pause();
    };
  }, []);

  async function toggleFilm() {
    const video = videoRef.current;
    if (!video) return;
    if (!video.paused) {
      video.pause();
      return;
    }

    const lifecycle = lifecycleRef.current;
    setFailed(false);
    try {
      if (video.error) video.load();
      await video.play();
    } catch {
      if (lifecycleRef.current !== lifecycle) return;
      setPlaying(!video.paused);
      setFailed(Boolean(video.error));
    }
  }

  function syncFilm(event) {
    setPlaying(!event.currentTarget.paused);
  }

  return (
    <div className="home-film">
      <video
        ref={videoRef}
        id="home-video"
        muted
        loop
        playsInline
        preload="metadata"
        poster={asset('football-film-poster.jpg')}
        aria-label="Stock film of children practising football"
        onPlay={syncFilm}
        onPause={syncFilm}
        onError={() => { setFailed(true); setPlaying(false); }}
      >
        <source src={asset('football-film.mp4')} type="video/mp4" />
      </video>
      <button
        type="button"
        className="film-toggle"
        data-action="toggle-home-film"
        aria-label={failed ? 'Retry football film' : playing ? 'Pause football film' : 'Play football film'}
        onClick={toggleFilm}
      >
        {!failed && <svg viewBox="0 0 24 24" aria-hidden="true"><path d={playing ? 'M7 5h4v14H7zM15 5h4v14h-4z' : 'm9 5 11 7-11 7Z'} /></svg>}
        <span>{failed ? 'Retry film' : playing ? 'Pause film' : 'Play film'}</span>
      </button>
    </div>
  );
}
