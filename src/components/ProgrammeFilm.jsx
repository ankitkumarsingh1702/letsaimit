import * as React from "react";
import { asset } from "../lib/assets.js";
function ProgrammeFilm() {
  let videoRef = React.useRef(null),
    playbackGenerationRef = React.useRef(0),
    [isPlaying, setIsPlaying] = React.useState(false),
    [errorMessage, setErrorMessage] = React.useState("");
  React.useEffect(() => {
    let video = videoRef.current;
    playbackGenerationRef.current += 1;
    let motionPreference = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ),
      pauseWhenHidden = () => {
        document.hidden && video.pause();
      },
      pauseForReducedMotion = () => {
        motionPreference.matches && video.pause();
      };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    motionPreference.addEventListener("change", pauseForReducedMotion);
    return () => {
      playbackGenerationRef.current += 1;
      document.removeEventListener("visibilitychange", pauseWhenHidden);
      motionPreference.removeEventListener("change", pauseForReducedMotion);
      video.pause();
    };
  }, []);
  function syncPlaybackState(event) {
    let video = event.currentTarget;
    setIsPlaying(!video.paused && !video.ended);
  }
  async function playFilm() {
    let video = videoRef.current;
    if (!video) return;
    let generation = playbackGenerationRef.current;
    setErrorMessage("");
    try {
      video.error && video.load();
      await video.play();
    } catch {
      if (playbackGenerationRef.current !== generation) return;
      setErrorMessage("The film could not play. Please try again.");
    }
    playbackGenerationRef.current === generation &&
      setIsPlaying(!video.paused && !video.ended);
  }
  function handleVideoError(event) {
    setErrorMessage("The film could not load. Please try again.");
    syncPlaybackState(event);
  }
  return (
    <figure className="pg-film">
      <div className={`pg-video-frame${isPlaying ? " pg-is-playing" : ""}`}>
        <video
          ref={videoRef}
          id="programme-film"
          data-ready="true"
          controls={true}
          playsInline={true}
          muted={true}
          loop={true}
          preload="metadata"
          poster={asset("football-film-poster.jpg")}
          aria-label="Children practising football; silent stock footage"
          onPlay={syncPlaybackState}
          onPause={syncPlaybackState}
          onEnded={syncPlaybackState}
          onError={handleVideoError}
        >
          <source src={asset("football-film.mp4")} type="video/mp4" />
          {"Your browser does not support this film. "}
          <a href={asset("football-film.mp4")}>Open the football film</a>.
        </video>
        <button
          className="pg-video-play"
          type="button"
          aria-label="Play football film"
          aria-controls="programme-film"
          onClick={playFilm}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m8 5 11 7-11 7Z" fill="currentColor" />
          </svg>
        </button>
        <p className="pg-video-error" role="status" hidden={!errorMessage}>
          {errorMessage}
        </p>
      </div>
      <figcaption>
        {"Stock footage · "}
        <a
          href="https://www.pexels.com/video/little-boys-training-in-a-soccer-football-field-12954458/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Marsel Sharipov / Pexels
        </a>
      </figcaption>
    </figure>
  );
}
export { ProgrammeFilm };
export default ProgrammeFilm;
