import * as React from "react";
import { asset } from "../lib/assets.js";
function HomeFilm() {
  let videoRef = React.useRef(null),
    playbackGenerationRef = React.useRef(0),
    [isPlaying, setIsPlaying] = React.useState(false),
    [hasError, setHasError] = React.useState(false);
  React.useEffect(() => {
    let video = videoRef.current,
      generation = ++playbackGenerationRef.current,
      motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)"),
      pauseWhenHidden = () => {
        document.hidden && video.pause();
      },
      pauseForReducedMotion = () => {
        motionPreference.matches && video.pause();
      },
      visibilityObserver =
        typeof IntersectionObserver > "u"
          ? null
          : new IntersectionObserver(
              (entries) => {
                entries[0]?.isIntersecting || video.pause();
              },
              {
                threshold: 0.05,
              },
            );
    video.muted = true;
    visibilityObserver?.observe(video);
    document.addEventListener("visibilitychange", pauseWhenHidden);
    motionPreference.addEventListener("change", pauseForReducedMotion);
    !motionPreference.matches &&
      !document.hidden &&
      video.play().catch(() => {
        playbackGenerationRef.current === generation &&
          setIsPlaying(!video.paused);
      });
    return () => {
      playbackGenerationRef.current += 1;
      visibilityObserver?.disconnect();
      document.removeEventListener("visibilitychange", pauseWhenHidden);
      motionPreference.removeEventListener("change", pauseForReducedMotion);
      video.pause();
    };
  }, []);
  async function togglePlayback() {
    let video = videoRef.current;
    if (!video) return;
    if (!video.paused) {
      video.pause();
      return;
    }
    let generation = playbackGenerationRef.current;
    setHasError(false);
    try {
      video.error && video.load();
      await video.play();
    } catch {
      if (playbackGenerationRef.current !== generation) return;
      setIsPlaying(!video.paused);
      setHasError(!!video.error);
    }
  }
  function syncPlaybackState(event) {
    setIsPlaying(!event.currentTarget.paused);
  }
  return (
    <div className="home-film">
      <video
        ref={videoRef}
        id="home-video"
        muted={true}
        loop={true}
        playsInline={true}
        preload="metadata"
        poster={asset("football-film-poster.jpg")}
        aria-label="Stock film of children practising football"
        onPlay={syncPlaybackState}
        onPause={syncPlaybackState}
        onError={() => {
          setHasError(true);
          setIsPlaying(false);
        }}
      >
        <source src={asset("football-film.mp4")} type="video/mp4" />
      </video>
      <button
        type="button"
        className="film-toggle"
        data-action="toggle-home-film"
        aria-label={
          hasError
            ? "Retry football film"
            : isPlaying
              ? "Pause football film"
              : "Play football film"
        }
        onClick={togglePlayback}
      >
        {!hasError && (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d={isPlaying ? "M7 5h4v14H7zM15 5h4v14h-4z" : "m9 5 11 7-11 7Z"}
            />
          </svg>
        )}
        <span>
          {hasError ? "Retry film" : isPlaying ? "Pause film" : "Play film"}
        </span>
      </button>
    </div>
  );
}
export { HomeFilm };
export default HomeFilm;
