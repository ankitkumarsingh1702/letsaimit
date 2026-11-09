import { useCallback, useEffect, useRef, useState } from "react";
import { fetchSavedRequests, mergeSavedRequests, saveRequestFollowUp } from "./adminTransport.js";

/** Private data has the same lifetime as the currently authorised account. */
export function useAdminRegister({ client, user, checkAccess }) {
  const [rows, setRows] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [liveState, setLiveState] = useState("connecting");
  const [lastSynced, setLastSynced] = useState(null);
  const alive = useRef(false);
  const loadingRef = useRef(false);
  const queued = useRef(false);
  const authRef = useRef({ checkAccess });
  authRef.current = { checkAccess };

  const refresh = useCallback(async () => {
    if (!alive.current || document.visibilityState === "hidden") return;
    if (loadingRef.current) { queued.current = true; return; }
    loadingRef.current = true;
    try {
      if (!await authRef.current.checkAccess() || !alive.current) return;
      const [savedRows, team] = await Promise.all([
        fetchSavedRequests(client),
        client.from("allowed_admins").select("email,is_owner,created_at,created_by").order("email"),
      ]);
      if (team.error) throw team.error;
      if (!await authRef.current.checkAccess() || !alive.current) return;
      setRows(current => mergeSavedRequests(current, savedRows));
      setMembers((team.data || []).map(member => ({
        email: member.email, role: member.is_owner ? "owner" : "admin",
        addedAt: member.created_at, addedBy: member.created_by,
        isCurrentUser: member.email === user.email,
      })));
      setLastSynced(new Date().toISOString());
      setError("");
    } catch {
      if (alive.current) setError("The latest register could not load. Check your connection and retry.");
    } finally {
      loadingRef.current = false;
      if (alive.current) setLoading(false);
      if (queued.current && alive.current) {
        queued.current = false;
        queueMicrotask(() => refresh());
      }
    }
  }, [client, user.email]);

  useEffect(() => {
    alive.current = true;
    let channel = null;
    let timer = null;
    const close = () => {
      if (timer) window.clearInterval(timer);
      timer = null;
      if (channel) client.removeChannel(channel);
      channel = null;
    };
    const open = () => {
      close();
      if (document.visibilityState === "hidden") { setLiveState("paused"); return; }
      refresh();
      channel = client.channel(`registration-register-${user.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "registrations" }, () => refresh())
        .subscribe(status => {
          if (alive.current) setLiveState(status === "SUBSCRIBED" ? "live" : ["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status) ? "reconnecting" : "connecting");
        });
      timer = window.setInterval(refresh, 5000);
    };
    open();
    document.addEventListener("visibilitychange", open);
    return () => {
      alive.current = false;
      queued.current = false;
      close();
      document.removeEventListener("visibilitychange", open);
    };
  }, [client, user.id, refresh]);

  const save = useCallback(async (id, patch, expectedRevision) => {
    try {
      if (!await authRef.current.checkAccess() || !alive.current) return { ok: false, error: "Admin access is required." };
      const result = await saveRequestFollowUp(client, id, patch, expectedRevision);
      if (!await authRef.current.checkAccess() || !alive.current) return { ok: false, error: "Your access changed. Please sign in again." };
      if (result.ok) {
        setRows(current => current.map(row => row.id === id ? (row.revision > result.row.revision ? row : result.row) : row));
        setLastSynced(new Date().toISOString());
      } else if (result.latest) {
        setRows(current => current.map(row => row.id === id && row.revision < result.latest.revision ? result.latest : row));
      }
      return result;
    } catch {
      return { ok: false, error: "Could not save. Your draft is still here. Check your connection and try again." };
    }
  }, [client]);

  return { rows, members, loading, error, liveState, lastSynced, refresh, save };
}
