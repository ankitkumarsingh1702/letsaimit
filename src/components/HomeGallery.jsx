import * as React from "react";
import { ArrowLink } from "./ui.jsx";
import { galleryPreview } from "../data/gallery.js";
import { mediaProps } from "../lib/media.js";
import { Arrow } from "./ui.jsx";
import { galleryPhotos } from "../data/gallery.js";
import { PhotoGalleryDialog } from "./PhotoGalleryDialog.jsx";
function HomeGallery() {
  let [galleryOpen, setGalleryOpen] = React.useState(false),
    [initialPhotoIndex, setInitialPhotoIndex] = React.useState(0);
  function openGallery(photoIndex = 0) {
    setInitialPhotoIndex(photoIndex);
    setGalleryOpen(true);
  }
  return (
    <section
      className="home-play home-gallery wrap section"
      aria-labelledby="home-play-title"
    >
      <div className="section-head">
        <h2 className="display" id="home-play-title">
          Learn. Play.
          <br />
          {" Make friends."}
        </h2>
        <div className="section-aside">
          <p>
            First touches. New skills.
            <br />
            {" A team to belong to."}
          </p>
          <ArrowLink href="/programme/">Explore the programme</ArrowLink>
        </div>
      </div>
      <div className="home-moments" id="home-gallery-grid">
        {galleryPreview.map((photo, index) => (
          <figure
            className={`photo-moment moment-${index + 1}${photo.chip ? ` moment-chip moment-chip-${photo.chip}` : ""}`}
            key={photo.src}
          >
            <button
              type="button"
              className="moment-frame"
              style={{
                "--photo-position": photo.position,
              }}
              aria-label={`View photo: ${photo.alt}`}
              aria-haspopup="dialog"
              onClick={() => openGallery(photo.index)}
            >
              <img
                {...mediaProps(
                  photo.src,
                  `(max-width: 700px) ${index === 0 || index === 5 ? "calc(100vw - 40px)" : "calc((100vw - 54px) / 2)"}, (max-width: 1440px) calc((100vw - 128px) / 3), 424px`,
                )}
                width={photo.width}
                height={photo.height}
                alt={photo.alt}
                loading="lazy"
                decoding="async"
              />
              <span className="moment-open" aria-hidden="true">
                <Arrow up={true} />
              </span>
            </button>
            <figcaption>
              <span>{photo.caption}</span>
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="home-gallery-footer">
        <p className="media-context">Moments from the LetsAimIt gallery.</p>
        <button
          className="text-link gallery-all"
          type="button"
          aria-haspopup="dialog"
          onClick={() => openGallery(0)}
        >
          {"View all "}
          {galleryPhotos.length}
          {" photos"}
          <Arrow />
        </button>
      </div>
      <PhotoGalleryDialog
        photos={galleryPhotos}
        initialIndex={initialPhotoIndex}
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
      />
    </section>
  );
}
export { HomeGallery };
export default HomeGallery;
