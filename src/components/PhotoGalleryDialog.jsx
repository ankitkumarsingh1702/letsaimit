import * as React from "react";
import { mediaProps, thumbnailSource } from "../lib/media.js";
function safeIndex(index, photoCount) {
  return Number.isInteger(index) && index >= 0 && index < photoCount
    ? index
    : 0;
}
function GalleryArrow({ previous = false }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={previous ? "M19 12H5m6 6-6-6 6-6" : "M5 12h14m-6-6 6 6-6 6"}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function PhotoGalleryDialog({
  photos = [],
  initialIndex = 0,
  open = false,
  onClose,
}) {
  let dialogRef = React.useRef(null),
    openerRef = React.useRef(null),
    restoreFocusFrameRef = React.useRef(null),
    wasOpenRef = React.useRef(false),
    thumbnailRailRef = React.useRef(null),
    thumbnailRefs = React.useRef([]),
    [selectedIndex, setSelectedIndex] = React.useState(() =>
      safeIndex(initialIndex, photos.length),
    ),
    isOpen = open && photos.length > 0,
    currentIndex = safeIndex(selectedIndex, photos.length),
    currentPhoto = photos[currentIndex];
  React.useLayoutEffect(() => {
    let dialog = dialogRef.current;
    restoreFocusFrameRef.current !== null &&
      (cancelAnimationFrame(restoreFocusFrameRef.current),
      (restoreFocusFrameRef.current = null));
    function restoreOpenerFocus() {
      let opener = openerRef.current;
      restoreFocusFrameRef.current = requestAnimationFrame(() => {
        restoreFocusFrameRef.current = null;
        opener?.isConnected &&
          opener.focus({
            preventScroll: true,
          });
        openerRef.current === opener && (openerRef.current = null);
      });
    }
    isOpen
      ? (wasOpenRef.current ||
          ((openerRef.current = document.activeElement),
          setSelectedIndex(safeIndex(initialIndex, photos.length))),
        (wasOpenRef.current = true),
        document.body.classList.add("photo-gallery-open"),
        dialog.open || dialog.showModal())
      : (dialog.open && dialog.close(),
        document.body.classList.remove("photo-gallery-open"),
        wasOpenRef.current && restoreOpenerFocus(),
        (wasOpenRef.current = false));
    return () => {
      document.body.classList.remove("photo-gallery-open");
      dialog.open && dialog.close();
      wasOpenRef.current && restoreOpenerFocus();
    };
  }, [isOpen, initialIndex, photos.length]);
  React.useEffect(() => {
    if (!isOpen) return;
    let frame = requestAnimationFrame(() => {
      let rail = thumbnailRailRef.current,
        thumbnail = thumbnailRefs.current[currentIndex];
      if (!dialogRef.current?.open || !rail || !thumbnail) return;
      let railBounds = rail.getBoundingClientRect(),
        thumbnailBounds = thumbnail.getBoundingClientRect(),
        centeredScrollLeft =
          rail.scrollLeft +
          thumbnailBounds.left -
          railBounds.left -
          rail.clientLeft -
          (rail.clientWidth - thumbnailBounds.width) / 2;
      rail.scrollTo({
        left: Math.max(
          0,
          Math.min(centeredScrollLeft, rail.scrollWidth - rail.clientWidth),
        ),
        behavior: "instant",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [currentIndex, isOpen]);
  function movePhoto(direction) {
    photos.length < 2 ||
      setSelectedIndex(
        (previousIndex) =>
          (safeIndex(previousIndex, photos.length) +
            direction +
            photos.length) %
          photos.length,
      );
  }
  function handleKeyDown(event) {
    if (
      !(!isOpen || event.altKey || event.ctrlKey || event.metaKey) &&
      (event.key === "ArrowLeft" || event.key === "ArrowRight")
    ) {
      event.preventDefault();
      let direction = event.key === "ArrowLeft" ? -1 : 1;
      if (
        (movePhoto(direction), event.target.closest(".photo-gallery-thumb"))
      ) {
        let nextIndex =
          (currentIndex + direction + photos.length) % photos.length;
        thumbnailRefs.current[nextIndex]?.focus({
          preventScroll: true,
        });
      }
    }
  }
  function handleBackdropClick(event) {
    if (event.target !== event.currentTarget) return;
    let dialogBounds = event.currentTarget.getBoundingClientRect();
    (event.clientX < dialogBounds.left ||
      event.clientX > dialogBounds.right ||
      event.clientY < dialogBounds.top ||
      event.clientY > dialogBounds.bottom) &&
      onClose();
  }
  return (
    <dialog
      ref={dialogRef}
      className="photo-gallery-dialog"
      id="photo-gallery-dialog"
      aria-labelledby="photo-gallery-title"
      onKeyDown={handleKeyDown}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        !dialogRef.current?.open && open && onClose();
      }}
      onClick={handleBackdropClick}
    >
      <div className="photo-gallery-shell">
        <div className="photo-gallery-header">
          <p id="photo-gallery-title" className="photo-gallery-title">
            Our gallery
          </p>
          <p
            className="photo-gallery-count"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {photos.length > 0
              ? `Photo ${currentIndex + 1} of ${photos.length}`
              : "No photos"}
          </p>
          <button
            className="photo-gallery-close"
            type="button"
            aria-label="Close photo gallery"
            onClick={onClose}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="m6 6 12 12M6 18 18 6"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        {isOpen && currentPhoto && (
          <>
            <div className="photo-gallery-stage">
              <button
                className="photo-gallery-nav photo-gallery-previous"
                type="button"
                aria-label="Previous photo"
                disabled={photos.length < 2}
                onClick={() => movePhoto(-1)}
              >
                <GalleryArrow previous={true} />
              </button>
              <figure className="photo-gallery-figure">
                {isOpen && (
                  <img
                    className="photo-gallery-image"
                    {...mediaProps(currentPhoto.src, "(max-width: 700px) calc(100vw - 52px), (max-width: 1440px) calc(100vw - 180px), 1260px")}
                    alt={currentPhoto.alt}
                    decoding="async"
                    key={currentPhoto.src}
                  />
                )}
                <figcaption className="photo-gallery-caption">
                  <span>{currentPhoto.caption || currentPhoto.alt}</span>
                  {currentPhoto.location && (
                    <span className="photo-gallery-location">
                      {currentPhoto.location}
                    </span>
                  )}
                </figcaption>
              </figure>
              <button
                className="photo-gallery-nav photo-gallery-next"
                type="button"
                aria-label="Next photo"
                disabled={photos.length < 2}
                onClick={() => movePhoto(1)}
              >
                <GalleryArrow />
              </button>
            </div>
            {photos.length > 1 && (
              <div
                ref={thumbnailRailRef}
                className="photo-gallery-thumbnails"
                role="group"
                aria-label="Choose a photo"
              >
                {photos.map((photo, index) => (
                  <button
                    ref={(element) => {
                      thumbnailRefs.current[index] = element;
                    }}
                    type="button"
                    className="photo-gallery-thumb"
                    aria-label={`View photo ${index + 1}: ${photo.alt}`}
                    aria-current={index === currentIndex ? "true" : void 0}
                    tabIndex={index === currentIndex ? 0 : -1}
                    onClick={() => setSelectedIndex(index)}
                    key={photo.src}
                  >
                    <img
                      src={thumbnailSource(photo.src)}
                      alt={photo.alt}
                      width={photo.width}
                      height={photo.height}
                      loading="lazy"
                      decoding="async"
                    />
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </dialog>
  );
}
export { safeIndex, GalleryArrow, PhotoGalleryDialog };
export default PhotoGalleryDialog;
