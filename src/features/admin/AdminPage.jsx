import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AllCommunityModule, themeQuartz } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { getSupabaseClient } from "../../lib/supabase.js";
import "./admin.css";
import { mergeSavedRegistrations, normalizeRegistration, safeCsvValue } from "./adminData.js";

const SAFE_COLUMNS = "id,submission_id,full_name,email,phone,metadata,status,notes,assignee,revision,created,updated,updated_by";
const STATUSES = ["new", "contacted", "confirmed", "closed"];
const STATUS_NAMES = { new: "New", contacted: "Contacted", confirmed: "Confirmed", closed: "Closed" };
const EDITABLE = new Set(["status", "notes", "assignee"]);
const MODULES = [AllCommunityModule];
const gridTheme = themeQuartz.withParams({
  accentColor: "#143e35", backgroundColor: "#ffffff", foregroundColor: "#143e35",
  borderColor: "#dce4de", headerBackgroundColor: "#edf3e2", headerTextColor: "#143e35",
  oddRowBackgroundColor: "#f8faf6", fontFamily: "'Plus Jakarta Sans', Arial, sans-serif",
  fontSize: 13, headerFontSize: 12, wrapperBorderRadius: 12, spacing: 8,
});

function label(value) { return STATUS_NAMES[value] || String(value || "—"); }
function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}
function readValue(value) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (value == null || value === "") return "—";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}
function isPermissionError(error) {
  return [401, 403].includes(error?.status) || ["42501", "PGRST301", "PGRST302", "PGRST303"].includes(error?.code);
}
function ArrowIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>;
}
function Notice({ children, error = false }) {
  return <div className={`admin-notice${error ? " admin-notice--error" : ""}`} role={error ? "alert" : "status"}>{children}</div>;
}
function LoginScreen({ session, error, onRetry, onSignIn, onSignOut, loading, signingIn }) {
  const unavailable = session?.configured === false;
  return <main className="admin-page admin-login">
    <a className="admin-brand" href="/">LetsAimIt<span>Team register</span></a>
    <section className="admin-login-card" aria-labelledby="admin-login-title">
      <span className="admin-eyebrow">For the team</span>
      <h1 id="admin-login-title">One shared register.</h1>
      <p>Keep track of enquiries, follow up together, and see the latest updates in one place.</p>
      {loading ? <Notice>Checking your session…</Notice> : unavailable ? <Notice>The team register is being set up. Please check with the site owner.</Notice> : <>
        {error && <Notice error>{error}</Notice>}
        <button className="admin-button admin-button--primary" type="button" disabled={signingIn} onClick={onSignIn}>{signingIn ? "Opening Google…" : "Sign in with Google"} <ArrowIcon /></button>
        <p className="admin-login-help">Use a Gmail account invited by the team.</p>
        {session?.signedIn && <button className="admin-text-button" type="button" onClick={onSignOut}>Sign out of this account</button>}
      </>}
      {!loading && !unavailable && <button className="admin-text-button admin-check-access" type="button" onClick={onRetry}>Check access again</button>}
    </section>
    <p className="admin-private-note">This register is private. Please use it only for programme follow-up.</p>
  </main>;
}
function AccessDialog({ members, loading, error, email, onEmail, onAdd, onRemove, onClose, currentEmail, busy }) {
  const dialog = useRef(null);
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close(); }, []);
  return <dialog className="admin-access-dialog" ref={dialog} aria-labelledby="admin-access-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="admin-access-head"><div><span className="admin-eyebrow">Private team access</span><h2 id="admin-access-title">Admin access</h2></div><button className="admin-text-button" type="button" onClick={onClose} aria-label="Close admin access">Close</button></div>
    <p>Invited Gmail accounts can view enquiries, edit follow-up details, and manage admin access.</p>
    {error && <Notice error>{error}</Notice>}
    <form className="admin-access-form" onSubmit={onAdd}>
      <label>Gmail address<input type="email" required value={email} onChange={(event) => onEmail(event.target.value)} placeholder="name@gmail.com" autoComplete="off" maxLength={254} autoFocus /></label>
      <button className="admin-button admin-button--primary" type="submit" disabled={Boolean(busy)}>{busy === "add" ? "Adding…" : "Add admin"}</button>
    </form>
    {loading ? <Notice>Loading admin access…</Notice> : <ul className="admin-member-list">{members.map((member) => <li key={member.email}><div><strong>{member.email}</strong><span>{member.is_owner ? "Owner" : "Admin"}{member.email === currentEmail ? " · You" : ""}</span></div>{member.is_owner ? <span className="admin-owner-label">Owner access</span> : <button className="admin-text-button" type="button" disabled={Boolean(busy)} onClick={() => onRemove(member.email)}>{busy === member.email ? "Removing…" : member.email === currentEmail ? "Remove my access" : "Remove"}</button>}</li>)}</ul>}
    <p className="admin-access-help">The owner keeps access. Removing an admin blocks new data requests; an open register checks access every 5 seconds.</p>
  </dialog>;
}

export function AdminPage() {
  const client = useMemo(() => getSupabaseClient(), []);
  const [session, setSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [rows, setRows] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState({});
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loadingRows, setLoadingRows] = useState(false);
  const [lastSynced, setLastSynced] = useState(null);
  const [liveState, setLiveState] = useState("connecting");
  const [accessOpen, setAccessOpen] = useState(false);
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberError, setMemberError] = useState("");
  const [memberBusy, setMemberBusy] = useState("");
  const mounted = useRef(false);
  const fetching = useRef(false);
  const accessEpoch = useRef(0);
  const signingOut = useRef(false);
  const gridRef = useRef(null);
  const rowsRef = useRef(rows);
  const draftsRef = useRef(drafts);
  const sessionRef = useRef(session);
  rowsRef.current = rows;
  draftsRef.current = drafts;
  sessionRef.current = session;
  const authenticated = session?.authenticated === true;
  const canEdit = authenticated;
  const dirtyCount = Object.keys(drafts).length;

  const clearAccess = useCallback((message = "", signedIn = false) => {
    accessEpoch.current += 1;
    const next = { authenticated: false, signedIn, configured: Boolean(client) };
    sessionRef.current = next;
    rowsRef.current = []; draftsRef.current = {};
    if (!mounted.current) return;
    setSession(next); setRows([]); setDrafts({}); setSaving({}); setMembers([]); setAccessOpen(false); setLastSynced(null); setSessionError(message);
  }, [client]);

  const verifyAccess = useCallback(async () => {
    if (signingOut.current) return null;
    if (!client) { clearAccess(); return null; }
    const epoch = accessEpoch.current;
    const { data, error: authError } = await client.auth.getUser();
    if (epoch !== accessEpoch.current || !mounted.current) return null;
    if (authError) {
      if (isPermissionError(authError) || (authError.status >= 400 && authError.status < 500 && authError.status !== 429) || authError.name === "AuthSessionMissingError") { clearAccess(); return null; }
      throw new Error("Your access could not be checked. Please try again.");
    }
    if (!data.user) { clearAccess(); return null; }
    const { data: allowed, error: accessError } = await client.rpc("is_admin");
    if (epoch !== accessEpoch.current || !mounted.current) return null;
    if (accessError) {
      if (isPermissionError(accessError)) { clearAccess("This account does not have access to the register.", true); return null; }
      throw new Error("Your access could not be checked. Please try again.");
    }
    if (allowed !== true) { clearAccess("This Gmail account has not been invited, or its access has been removed.", true); return null; }
    const next = { authenticated: true, user: { id: data.user.id, email: data.user.email, role: "admin" } };
    sessionRef.current = next; setSession(next); setSessionError("");
    return data.user;
  }, [client, clearAccess]);

  const checkSession = useCallback(async () => {
    setSessionLoading(true); setSessionError("");
    try { await verifyAccess(); }
    catch (cause) { if (mounted.current) setSessionError(cause.message); }
    finally { if (mounted.current) setSessionLoading(false); }
  }, [verifyAccess]);

  const signIn = async () => {
    if (!client) return;
    signingOut.current = false;
    setSigningIn(true); setSessionError("");
    try {
      const { error: authError } = await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/admin/`, queryParams: { prompt: "select_account" } } });
      if (authError) throw authError;
    } catch { setSessionError("Google sign-in could not be opened. Please try again."); setSigningIn(false); }
  };
  const signOut = async () => {
    signingOut.current = true;
    clearAccess();
    try {
      const result = client && await client.auth.signOut({ scope: "local" });
      if (result?.error && mounted.current) setSessionError("The register is closed on this page. Sign-out could not be completed; please try signing in again.");
    } catch { if (mounted.current) setSessionError("The register is closed on this page. Please check your connection before signing in again."); }
  };

  const refreshRows = useCallback(async ({ manual = false } = {}) => {
    if (fetching.current || !sessionRef.current?.authenticated || !client) return;
    fetching.current = true;
    if (manual) setLoadingRows(true);
    try {
      if (!await verifyAccess()) return;
      const epoch = accessEpoch.current;
      const loaded = [];
      let offset = 0;
      let batch;
      do {
        const { data, error: readError } = await client.from("registrations").select(SAFE_COLUMNS).order("created", { ascending: false }).order("id", { ascending: false }).range(offset, offset + 499);
        if (readError) throw readError;
        if (!Array.isArray(data)) throw new Error("invalid-response");
        batch = data; loaded.push(...data.map(normalizeRegistration)); offset += 500;
      } while (batch.length === 500);
      if (epoch !== accessEpoch.current || !mounted.current) return;
      if (!await verifyAccess() || epoch !== accessEpoch.current || !mounted.current) return;
      const unique = [...new Map(loaded.map((row) => [row.id, row])).values()];
      setRows((current) => {
        const merged = mergeSavedRegistrations(current, unique);
        return current.length === merged.length && current.every((row, index) => row.id === merged[index].id && row.revision === merged[index].revision) ? current : merged;
      });
      setLastSynced(new Date()); setError("");
    } catch (cause) {
      if (!mounted.current) return;
      if (isPermissionError(cause)) clearAccess("Your access has ended. Please sign in with an invited account.", true);
      else setError("The register could not be refreshed. Your drafts are safe. Please try again.");
    } finally { fetching.current = false; if (mounted.current) setLoadingRows(false); }
  }, [client, verifyAccess, clearAccess]);

  const loadMembers = useCallback(async ({ quiet = false } = {}) => {
    if (!client) return;
    if (!quiet) setMembersLoading(true);
    setMemberError("");
    try {
      if (!await verifyAccess()) return;
      const epoch = accessEpoch.current;
      const { data, error: readError } = await client.from("allowed_admins").select("email,is_owner,created_at,created_by").order("email");
      if (readError) throw readError;
      if (mounted.current && epoch === accessEpoch.current) setMembers(data || []);
    } catch (cause) {
      if (isPermissionError(cause)) clearAccess("Your access has ended.", true);
      else if (mounted.current) setMemberError("Admin access could not be loaded. Please try again.");
    } finally { if (mounted.current) setMembersLoading(false); }
  }, [client, verifyAccess, clearAccess]);

  const addMember = async (event) => {
    event.preventDefault();
    const email = memberEmail.trim().toLowerCase();
    if (!/^[^\s@]+@gmail\.com$/.test(email)) { setMemberError("Please enter a Gmail address, such as name@gmail.com."); return; }
    setMemberBusy("add"); setMemberError("");
    try {
      if (!await verifyAccess()) return;
      const epoch = accessEpoch.current;
      const { error: writeError } = await client.from("allowed_admins").insert({ email });
      if (writeError) throw writeError;
      if (mounted.current && epoch === accessEpoch.current) { setMemberEmail(""); await loadMembers(); }
    } catch (cause) {
      if (isPermissionError(cause)) clearAccess("Your access has ended.", true);
      else if (mounted.current) setMemberError(cause.code === "23505" ? "This Gmail account already has access." : "The admin could not be added. Please try again.");
    } finally { if (mounted.current) setMemberBusy(""); }
  };
  const removeMember = async (email) => {
    setMemberBusy(email); setMemberError("");
    try {
      if (!await verifyAccess()) return;
      const epoch = accessEpoch.current;
      const { data, error: writeError } = await client.from("allowed_admins").delete().eq("email", email).select("email");
      if (writeError) throw writeError;
      if (epoch !== accessEpoch.current || !mounted.current) return;
      if (!data?.length) throw new Error("no-change");
      if (email === sessionRef.current?.user?.email) { clearAccess("Your admin access has been removed.", true); return; }
      await loadMembers();
    } catch (cause) {
      if (isPermissionError(cause)) {
        try { if (await verifyAccess()) setMemberError("This admin cannot be removed. Owner access is kept."); }
        catch { if (mounted.current) setMemberError("Your access could not be checked. Please try again."); }
      }
      else if (mounted.current) setMemberError("The admin could not be removed. Owner access is kept; please try again for other accounts.");
    } finally { if (mounted.current) setMemberBusy(""); }
  };

  useEffect(() => {
    mounted.current = true;
    checkSession();
    const subscription = client?.auth.onAuthStateChange((event, authSession) => {
      if (event === "SIGNED_OUT" || !authSession?.user) { clearAccess(); setSessionLoading(false); return; }
      if (sessionRef.current?.user?.id && sessionRef.current.user.id !== authSession.user.id) clearAccess();
      // Keep asynchronous Supabase calls outside the auth callback's lock.
      window.setTimeout(() => {
        if (!mounted.current) return;
        if (sessionRef.current?.authenticated) verifyAccess().catch(() => { if (mounted.current) setError("Your access could not be checked. Please try again."); });
        else checkSession();
      }, 0);
    }).data.subscription;
    return () => { mounted.current = false; accessEpoch.current += 1; subscription?.unsubscribe(); };
  }, [client, checkSession, clearAccess, verifyAccess]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Team register — LetsAimIt";
    const oldRobots = document.querySelector('meta[name="robots"]');
    const previousRobots = oldRobots?.getAttribute("content");
    const meta = oldRobots || document.createElement("meta");
    if (!oldRobots) { meta.name = "robots"; document.head.appendChild(meta); }
    meta.content = "noindex, nofollow, noarchive";
    return () => { document.title = previousTitle; if (oldRobots) { if (previousRobots == null) meta.removeAttribute("content"); else meta.content = previousRobots; } else meta.remove(); };
  }, []);

  useEffect(() => {
    if (!authenticated || !client) return undefined;
    let channel;
    let ended = false;
    let fallback;
    const close = () => { if (channel) { client.removeChannel(channel).catch(() => {}); channel = null; } window.clearInterval(fallback); fallback = null; };
    const update = () => {
      if (ended || document.visibilityState === "hidden") return;
      // Membership checks continue even if a row refresh is still in flight.
      verifyAccess().then((user) => { if (user && !ended) { refreshRows(); if (accessOpen) loadMembers({ quiet: true }); } }).catch(() => { if (!ended && mounted.current) setError("Your access could not be checked. Please try again."); });
    };
    const open = () => {
      if (ended || document.visibilityState === "hidden") return;
      close(); refreshRows({ manual: true }); setLiveState("connecting");
      channel = client.channel(`letsaimit-admin-${session.user.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "registrations" }, update)
        .subscribe((status) => { if (!ended) setLiveState(status === "SUBSCRIBED" ? "live" : ["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status) ? "reconnecting" : "connecting"); });
      fallback = window.setInterval(update, 5000);
    };
    const visible = () => { if (document.visibilityState === "hidden") close(); else open(); };
    open(); document.addEventListener("visibilitychange", visible); window.addEventListener("focus", update);
    return () => { ended = true; close(); document.removeEventListener("visibilitychange", visible); window.removeEventListener("focus", update); };
  }, [authenticated, client, session?.user?.id, refreshRows, accessOpen, loadMembers, verifyAccess]);

  useEffect(() => {
    if (!dirtyCount) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirtyCount]);

  const updateDraft = useCallback((id, field, value) => {
    if (!EDITABLE.has(field) || !sessionRef.current?.authenticated || sessionRef.current.user?.role === "viewer") return;
    setNotice("");
    const current = draftsRef.current;
    const source = rowsRef.current.find((row) => row.id === id);
    if (!source) return;
    const existing = current[id];
    const changes = { ...existing?.changes, [field]: value };
    const baseValues = existing?.baseValues || { status: source.status || "new", notes: source.notes || "", assignee: source.assignee || "" };
    for (const key of Object.keys(changes)) if (String(changes[key]) === String(baseValues[key])) delete changes[key];
    const next = { ...current };
    if (!Object.keys(changes).length) delete next[id];
    else next[id] = { ...existing, revision: existing?.revision ?? source.revision, baseValues, changes };
    // A Save click may stop an active cell editor before React's next render.
    draftsRef.current = next;
    setDrafts(next);
  }, []);

  const saveRow = useCallback(async (id) => {
    gridRef.current?.api?.stopEditing();
    const draft = draftsRef.current[id];
    if (!draft || draft.conflict || !sessionRef.current?.authenticated || !client) return;
    setSaving((current) => ({ ...current, [id]: true })); setNotice(""); setError("");
    try {
      if (!await verifyAccess()) return;
      const epoch = accessEpoch.current;
      const changes = Object.fromEntries(Object.entries(draft.changes).filter(([key]) => EDITABLE.has(key)));
      const { data, error: writeError } = await client.from("registrations").update(changes).eq("id", id).eq("revision", draft.revision).select(SAFE_COLUMNS);
      if (writeError) throw writeError;
      if (!mounted.current || epoch !== accessEpoch.current) return;
      if (!data?.length) {
        if (!await verifyAccess()) return;
        setDrafts((current) => ({ ...current, [id]: { ...current[id], conflict: true } }));
        setError("Someone else updated this row. Your draft is safe. Review the latest values before saving again.");
        refreshRows(); return;
      }
      setRows((current) => current.map((row) => row.id === id ? normalizeRegistration(data[0]) : row));
      setDrafts((current) => { const next = { ...current }; delete next[id]; draftsRef.current = next; return next; });
      setNotice("Row saved. The team can see your update."); refreshRows();
    } catch (cause) {
      if (!mounted.current) return;
      if (isPermissionError(cause)) clearAccess("Your access has ended.", true);
      else setError("This row could not be saved. Your draft is safe. Please try again.");
    } finally { if (mounted.current) setSaving((current) => { const next = { ...current }; delete next[id]; return next; }); }
  }, [client, verifyAccess, refreshRows, clearAccess]);

  const discardDraft = useCallback((id) => {
    setDrafts((current) => { const next = { ...current }; delete next[id]; return next; });
    setNotice("Draft discarded. The latest saved row is shown.");
  }, []);
  const rebaseDraft = useCallback((id) => {
    const latest = rowsRef.current.find((row) => row.id === id);
    if (!latest || latest.revision === draftsRef.current[id]?.revision) return;
    setDrafts((current) => current[id] ? { ...current, [id]: { ...current[id], revision: latest.revision, conflict: false, serverRow: undefined, baseValues: { status: latest.status || "new", notes: latest.notes || "", assignee: latest.assignee || "" } } } : current);
    setNotice("Draft kept against the latest row. Review it, then save.");
  }, []);

  const formTypes = useMemo(() => [...new Set(rows.map((row) => row.formType).filter(Boolean))].sort(), [rows]);
  const dataRows = useMemo(() => rows.map((row) => ({
    ...row, ...drafts[row.id]?.changes,
    __dirty: Boolean(drafts[row.id]), __conflict: Boolean(drafts[row.id]?.conflict), __saving: Boolean(saving[row.id]),
  })).filter((row) => (statusFilter === "all" || row.status === statusFilter) && (typeFilter === "all" || row.formType === typeFilter)), [rows, drafts, saving, statusFilter, typeFilter]);

  const columns = useMemo(() => {
    const readOnly = (field, headerName, width = 150, extra = {}) => ({ field, headerName, width, editable: false, valueFormatter: ({ value }) => readValue(value), ...extra });
    const definitions = [
      readOnly("savedAt", "Received", 175, { sort: "desc", valueFormatter: ({ value }) => formatDate(value) }),
      readOnly("formType", "Form", 125),
      { field: "status", headerName: "Status", width: 145, editable: ({ data }) => canEdit && !data.__saving && !data.__conflict, cellEditor: "agSelectCellEditor", cellEditorParams: { values: STATUSES }, valueFormatter: ({ value }) => label(value), cellClass: "admin-workflow-cell" },
      readOnly("parentName", "Parent / contact", 175), readOnly("childName", "Child", 155),
      readOnly("phone", "Phone", 155), readOnly("email", "Email", 215),
      readOnly("age", "Age", 90), readOnly("community", "Community", 190), readOnly("sport", "Sport", 135),
      readOnly("address", "Address", 260), readOnly("note", "Submitted note", 280),
      { field: "assignee", headerName: "Assigned to", width: 185, editable: ({ data }) => canEdit && !data.__saving && !data.__conflict, cellClass: "admin-workflow-cell", cellEditorParams: { maxLength: 254 } },
      { field: "notes", headerName: "Follow-up notes", width: 320, editable: ({ data }) => canEdit && !data.__saving && !data.__conflict, cellClass: "admin-workflow-cell", cellEditor: "agLargeTextCellEditor", cellEditorPopup: true, cellEditorParams: { maxLength: 2000, rows: 7, cols: 45 } },
    ];
    definitions.push(
      readOnly("guardianConsent", "Guardian consent", 165),
      readOnly("termsAccepted", "Terms accepted", 155),
      readOnly("consentVersion", "Consent version", 160),
      readOnly("updated", "Last updated", 175, { valueFormatter: ({ value }) => formatDate(value) }),
      readOnly("updated_by", "Updated by", 215),
      readOnly("phoneCountry", "Phone country", 135),
    );
    definitions.push(readOnly("submissionId", "Submission ID", 255));
    definitions.push({
      headerName: "Row changes", colId: "actions", pinned: "right", width: canEdit ? 160 : 100, sortable: false, filter: false,
      cellRenderer: ({ data }) => !canEdit ? <span className="admin-readonly">Read only</span> : data.__conflict ? <span className="admin-conflict-label">Review conflict</span> : <div className="admin-row-actions">
        <button className="admin-row-save" disabled={!data.__dirty || data.__saving} onClick={() => saveRow(data.id)}>{data.__saving ? "Saving…" : data.__dirty ? "Save" : "Saved"}</button>
        {data.__dirty && !data.__saving && <button className="admin-row-discard" aria-label={`Discard changes for row ${data.submissionId}`} onClick={() => discardDraft(data.id)}>Undo</button>}
      </div>,
    });
    return definitions;
  }, [canEdit, saveRow, discardDraft]);

  const exportCsv = () => {
    if (!gridRef.current?.api || !lastSynced) return;
    const originals = new Map(rows.map((row) => [String(row.id), row]));
    gridRef.current.api.exportDataAsCsv({
      fileName: "letsaimit-register.csv",
      columnKeys: columns.filter((column) => column.field).map((column) => column.field),
      processCellCallback: (params) => safeCsvValue(originals.get(String(params.node?.data?.id))?.[params.column.getColDef().field]),
    });
  };
  const conflicts = Object.entries(drafts).filter(([, draft]) => draft.conflict);
  if (sessionLoading || !authenticated) return <LoginScreen session={session} loading={sessionLoading} signingIn={signingIn} error={sessionError} onRetry={checkSession} onSignIn={signIn} onSignOut={signOut} />;
  return <main className="admin-page">
    {accessOpen && <AccessDialog members={members} loading={membersLoading} error={memberError} email={memberEmail} onEmail={setMemberEmail} onAdd={addMember} onRemove={removeMember} onClose={() => setAccessOpen(false)} currentEmail={session.user?.email} busy={memberBusy} />}
    <header className="admin-topbar">
      <a className="admin-brand" href="/">LetsAimIt<span>Team register</span></a>
      <div className="admin-account"><span>{session.user?.email || "Team member"}<small>{session.user?.role || "admin"}</small></span><button className="admin-text-button" type="button" onClick={() => { setAccessOpen(true); loadMembers(); }}>Admin access</button><button className="admin-text-button" type="button" onClick={signOut}>Sign out</button></div>
    </header>
    <section className="admin-heading" aria-labelledby="admin-title">
      <div><span className="admin-eyebrow">A little more organised</span><h1 id="admin-title">Enquiries, together.</h1><p>One shared view for your team. Personal details and consent records stay read-only.</p></div>
      <div className="admin-sync" role="status"><span className={`admin-live-dot${liveState === "live" ? " is-live" : ""}`} />{liveState === "live" ? "Live updates" : liveState === "reconnecting" ? "Reconnecting · refreshing every 5 seconds" : "Connecting · refreshing every 5 seconds"}<small>{lastSynced ? `Last checked ${lastSynced.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Loading the register…"}</small></div>
    </section>
    {error && <Notice error>{error}</Notice>}
    {notice && <Notice>{notice}</Notice>}
    {dirtyCount > 0 && <Notice>{dirtyCount} {dirtyCount === 1 ? "row has" : "rows have"} unsaved changes. Live updates will keep your drafts.</Notice>}
    {conflicts.map(([id, draft]) => {
      const latest = rows.find((row) => row.id === id) || draft.serverRow;
      return <section className="admin-conflict" aria-label="Review conflicting row" key={id}>
        <h2>Review an updated row</h2><p>Your draft for <strong>{latest?.parentName || id}</strong> has been kept. Another team member saved a newer version.</p>
        <div className="admin-compare"><div><h3>Latest saved</h3><dl>{Object.keys(draft.changes || {}).map((field) => <React.Fragment key={field}><dt>{field === "assignee" ? "Assigned to" : field}</dt><dd>{readValue(latest?.[field])}</dd></React.Fragment>)}</dl></div><div><h3>Your draft</h3><dl>{Object.entries(draft.changes || {}).map(([field, value]) => <React.Fragment key={field}><dt>{field === "assignee" ? "Assigned to" : field}</dt><dd>{readValue(value)}</dd></React.Fragment>)}</dl></div></div>
        <div className="admin-conflict-actions"><button className="admin-button admin-button--primary" disabled={!latest || latest.revision === draft.revision} onClick={() => rebaseDraft(id)}>{latest && latest.revision !== draft.revision ? "Keep my draft for review" : "Loading latest version…"}</button><button className="admin-button" onClick={() => discardDraft(id)}>Use latest saved row</button></div>
      </section>;
    })}
    <section className="admin-register" aria-label="Registration register">
      <div className="admin-toolbar">
        <label className="admin-search">Search the register<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, community, phone…" autoComplete="off" /></label>
        <label>Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{STATUSES.map((status) => <option value={status} key={status}>{label(status)}</option>)}</select></label>
        <label>Form<select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">All forms</option>{formTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
        <button className="admin-button" type="button" disabled={loadingRows} onClick={() => refreshRows({ manual: true })}>{loadingRows ? "Refreshing…" : "Refresh"}</button>
        <button className="admin-button admin-export" type="button" disabled={!lastSynced || loadingRows} onClick={exportCsv}>Export saved view CSV <ArrowIcon /></button>
      </div>
      <div className="admin-register-info"><span>{rows.length} saved {rows.length === 1 ? "enquiry" : "enquiries"}</span><span>{canEdit ? "Double-click Status, Assigned to or Follow-up notes to edit. Save each row when ready." : "You have view-only access."}</span></div>
      <div className="admin-grid" aria-label="Enquiries table">
        <AgGridReact ref={gridRef} modules={MODULES} theme={gridTheme} rowData={dataRows} columnDefs={columns}
          getRowId={({ data }) => String(data.id)} quickFilterText={query}
          defaultColDef={{ sortable: true, resizable: true, filter: "agTextColumnFilter", minWidth: 85 }}
          readOnlyEdit onCellEditRequest={({ data, colDef, newValue }) => updateDraft(data.id, colDef.field, newValue)}
          rowClassRules={{ "admin-row-dirty": ({ data }) => data?.__dirty, "admin-row-conflict": ({ data }) => data?.__conflict }}
          rowHeight={50} headerHeight={46} animateRows={false} pagination paginationPageSize={25} paginationPageSizeSelector={[25, 50, 100]}
          suppressExcelExport stopEditingWhenCellsLoseFocus
          overlayNoRowsTemplate="<span>No enquiries match this view.</span>"
        />
      </div>
    </section>
    <p className="admin-footer-note">Saved updates are shared with everyone who has register access. Exports use saved values for the current filtered view. CSV files contain personal details; share them only with authorised team members.</p>
  </main>;
}

export default AdminPage;
