import * as React from "react";
import { asset } from "../lib/assets.js";
function MediaDialog({ certificate, onClose }) {
  let dialogRef = React.useRef(null);
  React.useEffect(() => {
    let dialog = dialogRef.current;
    certificate
      ? (document.body.classList.add("media-open"),
        dialog.open || dialog.showModal())
      : (dialog.open && dialog.close(),
        document.body.classList.remove("media-open"));
    return () => {
      document.body.classList.remove("media-open");
      dialog.open && dialog.close();
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
      onClose={() => {
        !dialogRef.current?.open && certificate && onClose();
      }}
      onClick={(event) => {
        event.target === event.currentTarget && onClose();
      }}
    >
      <button
        type="button"
        className="media-close"
        aria-label="Close media viewer"
        onClick={onClose}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m6 6 12 12M6 18 18 6" />
        </svg>
      </button>
      <div id="media-content">
        {certificate && (
          <>
            <img src={asset(certificate.src)} alt={certificate.title} />
            <p className="media-caption">{certificate.title}</p>
          </>
        )}
      </div>
    </dialog>
  );
}
export { MediaDialog };
export default MediaDialog;
