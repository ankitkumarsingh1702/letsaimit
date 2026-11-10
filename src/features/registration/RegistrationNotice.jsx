import { useEffect } from "react";
import { useAdminAuth } from "../../context/AdminAuth.jsx";

/** A save confirmation survives modal closure without retaining submitted details. */
export default function RegistrationNotice({ notice, onDismiss }) {
  const auth = useAdminAuth();
  const userId = auth.user?.isGoogle ? auth.user.id : null;
  useEffect(() => {
    if (!notice) return;
    if (notice.userId !== userId) { onDismiss(); return; }
    const timer = window.setTimeout(onDismiss, 10000);
    return () => window.clearTimeout(timer);
  }, [notice, userId, onDismiss]);
  if (!notice || notice.userId !== userId) return null;
  return <div className="registration-notice" role="status">
    <span>{notice.mode === "enroll" ? "Registration received." : "Trial request received."}</span>
    <a href="/parent/">My requests</a>
    <button type="button" aria-label="Dismiss confirmation" onClick={onDismiss}>×</button>
  </div>;
}
