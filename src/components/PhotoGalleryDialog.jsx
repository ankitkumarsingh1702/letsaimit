import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { asset } from '../lib/assets.js';

function validIndex(value, count) {
  return Number.isInteger(value) && value >= 0 && value < count ? value : 0;
}

function GalleryArrow({ previous = false }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={previous ? 'M19 12H5m6 6-6-6 6-6' : 'M5 12h14m-6-6 6 6-6 6'}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A shared viewer for the original photographs. No crop is applied in the viewer. */
export default function PhotoGalleryDialog({ photos = [], initialIndex = 0, open = false, onClose }) {
  const dialogRef = useRef(null);
  const openerRef = useRef(null);
  const focusFrameRef = useRef(null);
  const wasOpenRef = useRef(false);
  const thumbnailRailRef = useRef(null);
  const thumbnailRefs = useRef([]);
  const [index, setIndex] = useState(() => validIndex(initialIndex, photos.length));
  const isOpen = open && photos.length > 0;
  const activeIndex = validIndex(index, photos.length);
  const photo = photos[activeIndex];

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (focusFrameRef.current !== null) {
      cancelAnimationFrame(focusFrameRef.current);
      focusFrameRef.current = null;
    }

    function restoreFocus() {
      const opener = openerRef.current;
      focusFrameRef.current = requestAnimationFrame(() => {
        focusFrameRef.current = null;
        if (opener?.isConnected) opener.focus({ preventScroll: true });
        if (openerRef.current === opener) openerRef.current = null;
      });
    }

    if (isOpen) {
      if (!wasOpenRef.current) {
        openerRef.current = document.activeElement;
        setIndex(validIndex(initialIndex, photos.length));
      }
      wasOpenRef.current = true;
      document.body.classList.add('photo-gallery-open');
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
      document.body.classList.remove('photo-gallery-open');
      if (wasOpenRef.current) restoreFocus();
      wasOpenRef.current = false;
    }

    return () => {
      document.body.classList.remove('photo-gallery-open');
      if (dialog.open) dialog.close();
      // A StrictMode re-run cancels this restoration before reopening the dialog.
      // A real unmount can still return focus to an opener that remains connected.
      if (wasOpenRef.current) restoreFocus();
    };
  }, [isOpen, initialIndex, photos.length]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const frame = requestAnimationFrame(() => {
      const rail = thumbnailRailRef.current;
      const thumbnail = thumbnailRefs.current[activeIndex];
      if (!dialogRef.current?.open || !rail || !thumbnail) return;
      const railBounds = rail.getBoundingClientRect();
      const thumbnailBounds = thumbnail.getBoundingClientRect();
      const centeredLeft = rail.scrollLeft + thumbnailBounds.left - railBounds.left - rail.clientLeft
        - (rail.clientWidth - thumbnailBounds.width) / 2;
      // Move only the horizontal thumbnail rail; never scroll the dialog/page.
      rail.scrollTo({
        left: Math.max(0, Math.min(centeredLeft, rail.scrollWidth - rail.clientWidth)),
        behavior: 'instant',
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeIndex, isOpen]);

  function movePhoto(direction) {
    if (photos.length < 2) return;
    setIndex((current) => (validIndex(current, photos.length) + direction + photos.length) % photos.length);
  }

  function handleKeyDown(event) {
    if (!isOpen || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const direction = event.key === 'ArrowLeft' ? -1 : 1;
      movePhoto(direction);
      if (event.target.closest('.photo-gallery-thumb')) {
        const nextIndex = (activeIndex + direction + photos.length) % photos.length;
        thumbnailRefs.current[nextIndex]?.focus({ preventScroll: true });
      }
    }
  }

  function handleBackdropClick(event) {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
      onClose();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="photo-gallery-dialog"
      id="photo-gallery-dialog"
      aria-labelledby="photo-gallery-title"
      onKeyDown={handleKeyDown}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClose={() => {
        // Ignore native close events queued before a StrictMode reopen.
        if (!dialogRef.current?.open && open) onClose();
      }}
      onClick={handleBackdropClick}
    >
      <div className="photo-gallery-shell">
        <div className="photo-gallery-header">
          <p id="photo-gallery-title" className="photo-gallery-title">Our gallery</p>
          <p className="photo-gallery-count" role="status" aria-live="polite" aria-atomic="true">
            {photos.length > 0 ? `Photo ${activeIndex + 1} of ${photos.length}` : 'No photos'}
          </p>
          <button className="photo-gallery-close" type="button" aria-label="Close photo gallery" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="m6 6 12 12M6 18 18 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {photo && <>
          <div className="photo-gallery-stage">
            <button className="photo-gallery-nav photo-gallery-previous" type="button" aria-label="Previous photo" disabled={photos.length < 2} onClick={() => movePhoto(-1)}>
              <GalleryArrow previous />
            </button>
            <figure className="photo-gallery-figure">
              {isOpen && <img key={photo.src} className="photo-gallery-image" src={asset(photo.src)} alt={photo.alt} decoding="async" />}
              <figcaption className="photo-gallery-caption">
                <span>{photo.caption || photo.alt}</span>
                {photo.location && <span className="photo-gallery-location">{photo.location}</span>}
              </figcaption>
            </figure>
            <button className="photo-gallery-nav photo-gallery-next" type="button" aria-label="Next photo" disabled={photos.length < 2} onClick={() => movePhoto(1)}>
              <GalleryArrow />
            </button>
          </div>

          {photos.length > 1 && <div ref={thumbnailRailRef} className="photo-gallery-thumbnails" role="group" aria-label="Choose a photo">
            {photos.map((item, photoIndex) => (
              <button
                key={item.src}
                ref={(node) => { thumbnailRefs.current[photoIndex] = node; }}
                type="button"
                className="photo-gallery-thumb"
                aria-label={`View photo ${photoIndex + 1}: ${item.caption || item.alt}`}
                aria-current={photoIndex === activeIndex ? 'true' : undefined}
                tabIndex={photoIndex === activeIndex ? 0 : -1}
                onClick={() => setIndex(photoIndex)}
              >
                <img src={asset(item.src)} alt="" loading="lazy" decoding="async" />
              </button>
            ))}
          </div>}
        </>}
      </div>
    </dialog>
  );
}
