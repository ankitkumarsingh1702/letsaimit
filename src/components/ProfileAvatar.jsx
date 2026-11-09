import { useState } from "react";
import { googleAvatarUrl, profileInitials } from "../lib/adminAuth.js";
import "./profile-avatar.css";

/** Decorative next to the account's visible name/email; failed photos retain initials. */
export default function ProfileAvatar({ name, src = null, className = "" }) {
  const [failedSource, setFailedSource] = useState(null);
  const safeSource = googleAvatarUrl(src);
  return <span className={`profile-avatar ${className}`.trim()} aria-hidden="true">
    {safeSource && failedSource !== safeSource
      ? <img key={safeSource} src={safeSource} alt="" width="40" height="40" referrerPolicy="no-referrer" onError={() => setFailedSource(safeSource)} />
      : profileInitials(name)}
  </span>;
}
