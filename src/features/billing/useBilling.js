import { useCallback, useEffect, useRef, useState } from "react";
import { fetchBilling } from "./billingData.js";

/** Private billing snapshots belong to one verified identity, never a shared cache. */
export function useBilling(auth, { admin = false } = {}) {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastSynced, setLastSynced] = useState(null);
  const authRef = useRef(auth);
  authRef.current = auth;
  const alive = useRef(false);
  const sequence = useRef(0);
  const flight = useRef(null);
  const queued = useRef(false);
  const loaded = useRef(false);
  const userId = auth.user.id;
  const client = auth.client;
  const refresh = useCallback(() => {
    if (!alive.current || document.visibilityState === "hidden") return Promise.resolve();
    if (flight.current) { queued.current = true; return flight.current; }
    const ticket = ++sequence.current;
    if (!loaded.current) setLoading(true);
    const work = (async () => {
      try {
        const result = await fetchBilling({ client, userId, admin, verifyGoogleUser: authRef.current.verifyGoogleUser, checkAccess: authRef.current.checkAccess });
        if (!alive.current || ticket !== sequence.current || authRef.current.user?.id !== userId) return;
        setSnapshot(result); setError(""); setLastSynced(new Date().toISOString()); loaded.current = true;
      } catch (cause) {
        if (!alive.current || ticket !== sequence.current) return;
        if (["identity_changed", "access_denied"].includes(cause.code)) { setSnapshot(null); setLastSynced(null); loaded.current = false; }
        setError(cause.message || "Billing could not load. Please retry.");
      } finally {
        flight.current = null;
        if (alive.current && ticket === sequence.current) setLoading(false);
        if (alive.current && queued.current) { queued.current = false; queueMicrotask(() => { void refresh(); }); }
      }
    })();
    flight.current = work;
    return work;
  }, [admin, client, userId]);
  useEffect(() => {
    alive.current = true; void refresh();
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    const interval = window.setInterval(onVisible, 5000);
    window.addEventListener("focus", onVisible);
    window.addEventListener("letsaimit:billing-changed", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive.current = false; ++sequence.current; queued.current = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("letsaimit:billing-changed", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);
  return { snapshot, loading, error, lastSynced, refresh };
}
