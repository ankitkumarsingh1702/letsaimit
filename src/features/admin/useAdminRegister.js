import { useCallback, useEffect, useRef, useState } from "react";
import { fetchSavedRequests, mergeSavedRequests, saveRequestFollowUp, inviteAdminMembership, removeAdminMembership, MEMBER_COLUMNS } from "./adminTransport.js";
import { toAdminMember, validateAdminInvite } from "./admin-model.js";

/** A failed delete response may follow a committed self-removal. Clear local access first. */
export async function settleMembershipFailure({ selfRemovalIssued, checkAccess, signOut }) {
  if (selfRemovalIssued) {
    try { await signOut(); } catch { /* Shared sign-out clears private state before its network request. */ }
  }
  try { await checkAccess(); } catch { /* Keep the original mutation failure visible. */ }
}

/** Private data has the same lifetime as the currently authorised account. */
export function useAdminRegister({ client, user, checkAccess, signOut }) {
  const [rows, setRows] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [liveState, setLiveState] = useState("connecting");
  const [lastSynced, setLastSynced] = useState(null);
  const alive = useRef(false);
  const loadingRef = useRef(false);
  const queued = useRef(false);
  const membershipEpoch = useRef(0);
  const mutationLock = useRef(false);
  const membersRef = useRef(members);
  membersRef.current = members;
  const authRef = useRef({ checkAccess, signOut });
  authRef.current = { checkAccess, signOut };

  const refresh = useCallback(async () => {
    if (!alive.current || document.visibilityState === "hidden") return;
    if (loadingRef.current) { queued.current = true; return; }
    loadingRef.current = true;
    try {
      if (!await authRef.current.checkAccess() || !alive.current) return;
      const teamEpoch = membershipEpoch.current;
      const [savedRows, team] = await Promise.all([
        fetchSavedRequests(client),
        client.from("allowed_admins").select(MEMBER_COLUMNS).order("email"),
      ]);
      if (team.error) throw team.error;
      if (!await authRef.current.checkAccess() || !alive.current) return;
      setRows(current => mergeSavedRequests(current, savedRows));
      if (teamEpoch === membershipEpoch.current) setMembers((team.data || []).map(member => toAdminMember(member, user.email)));
      else queued.current = true;
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

  const changeMembership = useCallback(async (kind, value) => {
    if (mutationLock.current) return { ok: false, error: "Please wait for the current access change." };
    const checked = kind === "invite" ? validateAdminInvite(value, membersRef.current) : null;
    if (checked && !checked.ok) return checked;
    const member = kind === "remove" ? membersRef.current.find(entry => entry.email === value) : null;
    if (kind === "remove" && (!member || member.role === "owner" || membersRef.current.length <= 1)) {
      return { ok: false, error: "This account cannot be removed. Owner access is protected." };
    }
    const self = member?.email === user.email;
    mutationLock.current = true;
    membershipEpoch.current += 1;
    let selfRemovalIssued = false;
    try {
      if (!await authRef.current.checkAccess() || !alive.current) return { ok: false, error: "Admin access is required." };
      selfRemovalIssued = kind === "remove" && self;
      const saved = kind === "invite"
        ? await inviteAdminMembership(client, checked.email, membersRef.current)
        : await removeAdminMembership(client, member, { self });
      if (self) {
        // Known revocation clears private state immediately; no network recheck may delay it.
        await authRef.current.signOut();
        return { ok: true, self: true };
      }
      if (!await authRef.current.checkAccess() || !alive.current) return { ok: false, error: "Your access changed. Please sign in again." };
      setMembers(current => kind === "invite"
        ? [...current.filter(entry => entry.email !== saved.email), { ...saved, isCurrentUser: saved.email === user.email }].sort((a, b) => a.email.localeCompare(b.email))
        : current.filter(entry => entry.email !== saved.email));
      return { ok: true, member: saved };
    } catch (cause) {
      // No access-check result can keep private state after an ambiguous issued self-removal.
      await settleMembershipFailure({ selfRemovalIssued, ...authRef.current });
      if (cause?.code === "23505" || cause?.code === "duplicate") return { ok: false, code: "duplicate", error: "This account already has access. Refresh the team to see it." };
      return { ok: false, error: kind === "invite"
        ? "The invitation could not be confirmed. Your email is kept. Refresh the team before retrying."
        : "Access removal could not be confirmed. Refresh the team before retrying." };
    } finally {
      mutationLock.current = false;
      membershipEpoch.current += 1;
      if (alive.current) void refresh();
    }
  }, [client, user.email, refresh]);

  const inviteMember = useCallback(email => changeMembership("invite", email), [changeMembership]);
  const removeMember = useCallback(email => changeMembership("remove", email), [changeMembership]);

  return { rows, members, loading, error, liveState, lastSynced, refresh, save, inviteMember, removeMember };
}
