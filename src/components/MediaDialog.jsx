import { useEffect, useRef } from 'react';
import { asset } from '../lib/assets.js';

export default function MediaDialog({ certificate, onClose }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (certificate) {
      document.body.classList.add('media-open');
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
      document.body.classList.remove('media-open');
    }
    return () => {
      document.body.classList.remove('media-open');
      if (dialog.open) dialog.close();
    };
  }, [certificate]);

  function handleCancel(event) {
    event.preventDefault();
    onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      id="media-dialog"
      className="media-dialog"
      aria-label="Media viewer"
      onCancel={handleCancel}
      onClose={() => { if (!dialogRef.current?.open && certificate) onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <button type="button" className="media-close" aria-label="Close media viewer" onClick={onClose}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg>
      </button>
      <div id="media-content">
        {certificate && <><img src={asset(certificate.src)} alt={certificate.title} /><p className="media-caption">{certificate.title}</p></>}
      </div>
    </dialog>
  );
}
