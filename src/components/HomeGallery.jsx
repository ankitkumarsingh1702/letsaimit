import { useState } from 'react';
import { Arrow, ArrowLink } from './ui.jsx';
import PhotoGalleryDialog from './PhotoGalleryDialog.jsx';
import { asset } from '../lib/assets.js';
import { featuredPhotos, galleryPhotos } from '../data/gallery.js';

export default function HomeGallery() {
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  function openGallery(index = 0) {
    setSelectedIndex(index);
    setGalleryOpen(true);
  }

  return (
    <section className="home-play home-gallery wrap section" aria-labelledby="home-play-title">
      <div className="section-head">
        <h2 className="display" id="home-play-title">Learn. Play.<br /> Make friends.</h2>
        <div className="section-aside">
          <p>First touches. New skills.<br /> A team to belong to.</p>
          <ArrowLink href="#/programme">Explore the programme</ArrowLink>
        </div>
      </div>
      <div className="home-moments" id="home-gallery-grid">
        {featuredPhotos.map((photo, index) => (
          <figure className={`photo-moment moment-${index + 1}${photo.chip ? ` moment-chip moment-chip-${photo.chip}` : ''}`} key={photo.src}>
            <button
              type="button"
              className="moment-frame"
              style={{ '--photo-position': photo.position }}
              aria-label={`View photo: ${photo.caption}`}
              aria-haspopup="dialog"
              onClick={() => openGallery(photo.index)}
            >
              <img src={asset(photo.src)} width={photo.width} height={photo.height} alt={photo.alt} loading="lazy" decoding="async" />
              <span className="moment-open" aria-hidden="true"><Arrow up /></span>
            </button>
            <figcaption><span>{photo.caption}</span></figcaption>
          </figure>
        ))}
      </div>
      <div className="home-gallery-footer">
        <p className="media-context">Moments from the LetsAimIt gallery.</p>
        <button className="text-link gallery-all" type="button" aria-haspopup="dialog" onClick={() => openGallery(0)}>
          View all {galleryPhotos.length} photos<Arrow />
        </button>
      </div>
      <PhotoGalleryDialog photos={galleryPhotos} initialIndex={selectedIndex} open={galleryOpen} onClose={() => setGalleryOpen(false)} />
    </section>
  );
}
