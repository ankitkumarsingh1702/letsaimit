import * as React from "react";
import { mediaProps } from "../../lib/media.js";
import { useAdminAuth } from "../../context/AdminAuth.jsx";
import SignIn from "../../pages/SignIn.jsx";
import RequestDetail from "./RequestDetail.jsx";
import AdminOverview from "./AdminOverview.jsx";
import { useAdminRegister } from "./useAdminRegister.js";
import { filterRows, paginateRows, deriveSummary, formatIST, formatAge, periodForPreset, defaultFilters, buildRegisterCsv, STATUS_OPTIONS, FORM_LABELS, validateAdminInvite } from "./admin-model.js";
import "./admin.css";

const VIEWS = [
  { id: "overview", label: "Dashboard", icon: "overview" },
  { id: "register", label: "Register", icon: "register" },
  { id: "team", label: "Team", icon: "team" },
];

function AdminIcon({ name, ...props }) {
  const paths = {
    overview: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
    register: <><rect x="4" y="3" width="16" height="18" rx="3" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    team: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5" /></>,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    external: <><path d="M13 4h7v7m0-7L10 14" /><path d="M9 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></>,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    filter: <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="8" cy="6" r="2" /><circle cx="16" cy="12" r="2" /><circle cx="10" cy="18" r="2" /></>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    reset: <><path d="M4 9a8 8 0 1 1 0 7M4 3v6h6" /></>,
    exit: <><path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M13 7l5 5-5 5M8 12h13" /></>,
    shield: <><path d="m12 3 8 3v5c0 5-4 8-8 10-4-2-8-5-8-10V6l8-3Z" /><path d="m8 12 3 3 5-6" /></>,
    ball: <><circle cx="12" cy="12" r="9" /><path d="m12 7 5 4-2 6H9l-2-6 5-4Zm0-4v4M3.5 9l3.5 2M5.5 19l3.5-2m6 0 3.5 2M17 11l3.5-2" /></>,
  };
  return <svg className="adm-icon" viewBox="0 0 24 24" aria-hidden="true" {...props}>{paths[name] || paths.register}</svg>;
}

function StatusBadge({ status }) {
  return <span className={`adm-status adm-status-${status}`}><span aria-hidden="true" />{STATUS_OPTIONS.find(item => item.value === status)?.label || status}</span>;
}

function Avatar({ name, small = false }) {
  const letters = name.split(/\s+/).filter(Boolean).map(word => word[0]).slice(0, 2).join("");
  return <span className={`adm-avatar${small ? " adm-avatar-small" : ""}`} aria-hidden="true">{letters}</span>;
}

function FilterSelect({ label, value, onChange, children }) {
  return <label className="adm-field"><span>{label}</span><select value={value || ""} onChange={event => onChange(event.target.value || null)}>{children}</select></label>;
}

function Register({ rows, filtered, pagination, filters, setFilter, resetFilters, onOpen, onExport, canExport, assignees, datePreset, onDatePreset }) {
  const activeFilters = [filters.status, filters.community, filters.sport, filters.assignee, filters.onlyUnassigned, datePreset !== "all"].filter(Boolean).length;
  const hasFilters = Boolean(filters.query || filters.formType || activeFilters);
  const unique = key => [...new Set(rows.map(row => row[key]).filter(Boolean))];
  return <section className="adm-register" aria-label="Saved request register">
    <div className="adm-register-top">
      <details className="adm-filters">
        <summary className="adm-button adm-button-white"><AdminIcon name="filter" />Filters {activeFilters > 0 && <span className="adm-count">{activeFilters}</span>}</summary>
        <div className="adm-filter-panel">
          <div className="adm-filter-heading"><strong>Filter requests</strong><button className="adm-text-button" type="button" onClick={resetFilters}>Reset</button></div>
          <div className="adm-filter-grid">
            <FilterSelect label="Period" value={datePreset} onChange={onDatePreset}><option value="today">Today</option><option value="last7">Last 7 days</option><option value="all">All dates</option></FilterSelect>
            <FilterSelect label="Status" value={filters.status} onChange={value => setFilter("status", value)}><option value="">All statuses</option>{STATUS_OPTIONS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</FilterSelect>
            <FilterSelect label="Community" value={filters.community} onChange={value => setFilter("community", value)}><option value="">All communities</option>{unique("community").map(value => <option key={value}>{value}</option>)}</FilterSelect>
            <FilterSelect label="Sport" value={filters.sport} onChange={value => setFilter("sport", value)}><option value="">All sports</option>{[...new Set([...unique("sport"), "Not sure"])].map(value => <option key={value}>{value}</option>)}</FilterSelect>
            <FilterSelect label="Assigned to" value={filters.assignee} onChange={value => setFilter("assignee", value)}><option value="">Anyone</option>{assignees.map(value => <option key={value}>{value}</option>)}</FilterSelect>
            <FilterSelect label="Sort" value={filters.sort.direction} onChange={value => setFilter("sort", { field: "submittedAt", direction: value })}><option value="desc">Newest first</option><option value="asc">Oldest first</option></FilterSelect>
          </div>
          <label className="adm-check-label"><input type="checkbox" checked={filters.onlyUnassigned} onChange={event => setFilter("onlyUnassigned", event.target.checked)} />Unassigned only</label>
          <p className="adm-filter-note">India time (IST)</p>
        </div>
      </details>
      <button className="adm-button adm-button-dark" type="button" onClick={onExport} disabled={!canExport || !filtered.length}><AdminIcon name="download" />Export CSV</button>
    </div>
    <div className="adm-register-subhead">
      <div className="adm-type-tabs" role="group" aria-label="Request type">{[[null, "All"], ["trial", "Trial"], ["enrol", "Enrolment"]].map(([value, label]) => <button type="button" key={label} aria-pressed={filters.formType === value} onClick={() => setFilter("formType", value)}>{label}</button>)}</div>
      <p aria-live="polite">{filtered.length} of {rows.length} requests{hasFilters && <button type="button" className="adm-text-button" onClick={resetFilters}>Clear filters</button>}</p>
    </div>
    <div className="adm-card adm-register-card">
      {filtered.length === 0 ? <div className="adm-empty"><span className="adm-empty-icon"><AdminIcon name="search" /></span><h2>No matches</h2><p>Try another search.</p><button className="adm-button adm-button-dark" type="button" onClick={resetFilters}>Clear filters</button></div> : <>
        <div className="adm-table-wrap"><table className="adm-table">
          <caption className="adm-sr-only">Saved requests. Select a parent to open their details.</caption>
          <thead><tr><th scope="col">Parent</th><th scope="col">Programme</th><th scope="col">Status</th><th scope="col">Assigned</th><th scope="col">Received</th><th scope="col"><span className="adm-sr-only">Details</span></th></tr></thead>
          <tbody>{pagination.rows.map(row => <tr key={row.id}>
            <td><button className="adm-parent-button" type="button" onClick={() => onOpen(row.id)}><strong>{row.parentName}</strong><span>{FORM_LABELS[row.formType]} · {formatAge(row.age)}</span></button></td>
            <td><strong className="adm-cell-title">{row.sport}</strong><span className="adm-cell-sub">{row.community}</span></td>
            <td><StatusBadge status={row.status} /></td>
            <td><span className={`adm-assignee${row.assignee ? "" : " adm-unassigned"}`}>{row.assignee || "Unassigned"}</span></td>
            <td><span className="adm-cell-title adm-nowrap">{formatIST(row.submittedAt, "time")}</span><span className="adm-cell-sub">{formatIST(row.submittedAt, "date")} · IST</span></td>
            <td><button className="adm-icon-button" type="button" aria-label={`View ${row.parentName} details`} onClick={() => onOpen(row.id)}><AdminIcon name="arrow" /></button></td>
          </tr>)}</tbody>
        </table></div>
        <div className="adm-request-cards">{pagination.rows.map(row => <article key={row.id} className="adm-request-card">
          <div className="adm-request-card-top"><strong>{row.parentName}</strong><StatusBadge status={row.status} /></div>
          <p>{FORM_LABELS[row.formType]} · {formatAge(row.age)} · {row.sport}</p><p>{row.community}</p>
          <div className="adm-request-card-bottom"><span>{row.assignee || "Unassigned"}<span>{formatIST(row.submittedAt)} IST</span></span><button className="adm-text-button" type="button" onClick={() => onOpen(row.id)} aria-label={`View ${row.parentName} details`}>View <AdminIcon name="arrow" /></button></div>
        </article>)}</div>
        <div className="adm-pagination"><span>{filtered.length} saved {filtered.length === 1 ? "request" : "requests"}</span><div><label><span className="adm-sr-only">Rows per page</span><select value={filters.pageSize} onChange={event => setFilter("pageSize", Number(event.target.value))}><option value="10">10 per page</option><option value="25">25 per page</option><option value="50">50 per page</option></select></label><button className="adm-icon-button" type="button" aria-label="Previous page" disabled={pagination.page <= 1} onClick={() => setFilter("page", pagination.page - 1)}><AdminIcon name="arrow" style={{ transform: "rotate(180deg)" }} /></button><span>{pagination.page} / {pagination.totalPages || 1}</span><button className="adm-icon-button" type="button" aria-label="Next page" disabled={!pagination.hasNextPage} onClick={() => setFilter("page", pagination.page + 1)}><AdminIcon name="arrow" /></button></div></div>
      </>}
    </div>
    <p className="adm-register-note"><AdminIcon name="download" />Filtered saved requests.</p>
  </section>;
}

function RemoveAccessDialog({ member, self, busy, error, onClose, onConfirm }) {
  const ref = React.useRef(null);
  const heading = React.useId();
  React.useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement;
    dialog.showModal();
    return () => { dialog.close(); if (opener?.isConnected) opener.focus(); };
  }, []);
  return <dialog ref={ref} className="adm-dialog" aria-labelledby={heading} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="adm-dialog-inner"><div className="adm-dialog-head"><h2 id={heading}>Remove admin access?</h2><button type="button" className="adm-icon-button" aria-label="Close access removal" disabled={busy} onClick={onClose}><AdminIcon name="close" /></button></div>
      <p className="adm-dialog-copy">{member.email}</p><p className="adm-dialog-note">{self ? "Your admin access will be removed and you will be signed out." : "This account will no longer be able to open the private register."}</p>
      {error && <p className="adm-error" role="alert">{error}</p>}
      <div className="adm-dialog-actions"><button type="button" className="adm-button adm-button-white" disabled={busy} onClick={onClose}>Keep access</button><button type="button" className="adm-button adm-button-dark" disabled={busy} onClick={onConfirm}>{busy ? "Removing…" : "Remove access"}</button></div>
    </div>
  </dialog>;
}

function Team({ members, user, onInvite, onRemove }) {
  const [email, setEmail] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const [inviteError, setInviteError] = React.useState("");
  const [removeError, setRemoveError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [busy, setBusy] = React.useState("");
  const [removing, setRemoving] = React.useState(null);
  const field = React.useRef(null);
  const alive = React.useRef(true);
  const prefix = React.useId();
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const validation = validateAdminInvite(email, members);
  const fieldError = touched ? (!validation.ok ? validation.error : inviteError) : "";
  async function invite(event) {
    event.preventDefault();
    if (busy) return;
    setTouched(true); setInviteError(""); setNotice("");
    if (!validation.ok) { field.current?.focus(); return; }
    setBusy("invite");
    try {
      const result = await onInvite(validation.email);
      if (!alive.current) return;
      if (result.ok) { setEmail(""); setTouched(false); setNotice(`Access added for ${validation.email}. They can now sign in with Google.`); }
      else { setInviteError(result.error); field.current?.focus(); }
    } catch { if (alive.current) setInviteError("The invitation could not be confirmed. Your email is kept. Please retry."); }
    finally { if (alive.current) setBusy(""); }
  }
  async function remove() {
    if (busy || !removing) return;
    setBusy(removing.email); setRemoveError(""); setNotice("");
    try {
      const result = await onRemove(removing.email);
      if (!alive.current) return;
      if (result.ok) { setNotice(`Access removed for ${removing.email}.`); setRemoving(null); }
      else setRemoveError(result.error);
    } catch { if (alive.current) setRemoveError("Access removal could not be confirmed. Please retry."); }
    finally { if (alive.current) setBusy(""); }
  }
  return <section className="adm-card adm-team-card" aria-labelledby="adm-team-heading">
    <div className="adm-card-heading"><div><h2 id="adm-team-heading">Team access</h2><p>{members.length} approved accounts</p></div></div>
    <form className="adm-invite-form" onSubmit={invite} noValidate aria-label="Invite an admin">
      <div className="adm-field"><label htmlFor={`${prefix}-email`}>Invite a Gmail account</label><input ref={field} id={`${prefix}-email`} name="admin-email" type="email" autoComplete="off" required maxLength={254} placeholder="name@gmail.com" value={email} disabled={Boolean(busy)} aria-invalid={fieldError ? true : undefined} aria-describedby={`${prefix}-hint${fieldError ? ` ${prefix}-error` : ""}`} onBlur={() => setTouched(true)} onChange={event => { setEmail(event.target.value); setInviteError(""); setNotice(""); }} /><p className="adm-dialog-note" id={`${prefix}-hint`}>They can sign in with Google after access is saved.</p>{fieldError && <p className="adm-error" id={`${prefix}-error`} role="alert">{fieldError}</p>}</div>
      <button type="submit" className="adm-button adm-button-dark" disabled={Boolean(busy)}>{busy === "invite" ? "Adding…" : "Add admin"}</button>
    </form>
    {notice && <p className="adm-team-notice" role="status">{notice}</p>}
    <div className="adm-team-list">{members.map(member => <div className="adm-team-row" key={member.email}>
      <Avatar name={member.email === user.email ? user.displayName : member.email.split("@")[0].replaceAll(".", " ")} />
      <div className="adm-team-person"><strong>{member.email}</strong><span>{member.email === user.email ? "You" : "Approved account"}</span><span>Added {formatIST(member.addedAt)} IST{member.addedBy ? ` by ${member.addedBy}` : ""}</span></div>
      <span className="adm-role-badge">{member.role === "owner" ? "Owner" : "Admin"}</span>
      <button type="button" className="adm-text-button adm-danger-text" disabled={Boolean(busy) || member.role === "owner" || members.length <= 1} aria-label={member.role === "owner" ? `Owner access protected for ${member.email}` : `Remove admin access for ${member.email}`} onClick={() => { setRemoveError(""); setRemoving(member); }}>{member.role === "owner" ? "Owner protected" : member.email === user.email ? "Remove my access" : "Remove"}</button>
    </div>)}</div>
    <div className="adm-team-note"><AdminIcon name="shield" /><p>Approved admins can add Gmail accounts and remove admin access. The owner keeps access.</p></div>
    {removing && <RemoveAccessDialog member={removing} self={removing.email === user.email} busy={busy === removing.email} error={removeError} onClose={() => { setRemoving(null); setRemoveError(""); }} onConfirm={remove} />}
  </section>;
}

function AuthorizedAdmin({ auth }) {
  const { rows, members, loading, error, liveState, lastSynced, refresh, save, inviteMember, removeMember } = useAdminRegister(auth);
  const [filters, setFilters] = React.useState(defaultFilters);
  const [datePreset, setDatePreset] = React.useState("all");
  const [referenceIso, setReferenceIso] = React.useState(() => new Date().toISOString());
  const [view, setView] = React.useState("overview");
  const [selectedDetailId, setSelectedDetailId] = React.useState(null);
  const [selectedSnapshot, setSelectedSnapshot] = React.useState(null);
  const [editsById, setEditsById] = React.useState({});
  const [toast, setToast] = React.useState("");
  const [exporting, setExporting] = React.useState(false);
  const hasLoaded = lastSynced !== null;
  const headingRef = React.useRef(null);
  const alive = React.useRef(true);
  const filtered = React.useMemo(() => filterRows(rows, filters), [rows, filters]);
  const pagination = React.useMemo(() => paginateRows(filtered, filters.page, filters.pageSize), [filtered, filters.page, filters.pageSize]);
  const overviewRows = React.useMemo(() => filterRows(rows, { period: filters.period }), [rows, filters.period]);
  const summary = React.useMemo(() => deriveSummary(overviewRows), [overviewRows]);
  const selectedRow = rows.find(row => row.id === selectedDetailId) || selectedSnapshot;
  const assignees = React.useMemo(() => [...new Set([...members.map(member => member.email), ...rows.map(row => row.assignee).filter(Boolean)])], [rows, members]);
  const hasDraft = Object.values(editsById).some(edit => ["dirty", "saving", "error"].includes(edit.state));
  const uiAuth = React.useMemo(() => ({ user: auth.user, permissions: { readRegister: true, editFollowUp: true, exportCsv: true, manageAdmins: true } }), [auth.user]);

  React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  React.useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);
  React.useEffect(() => {
    const timer = window.setInterval(() => setReferenceIso(new Date().toISOString()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  // Today/last-seven-day windows follow IST midnight while the register stays open.
  React.useEffect(() => {
    const next = periodForPreset(datePreset, referenceIso);
    setFilters(previous => previous.period.startInclusiveUtc === next.startInclusiveUtc && previous.period.endExclusiveUtc === next.endExclusiveUtc
      ? previous : { ...previous, period: next, page: 1 });
  }, [datePreset, referenceIso]);
  React.useEffect(() => {
    if (!hasDraft) return;
    const warn = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasDraft]);

  function changeView(next) {
    setView(next);
    window.requestAnimationFrame(() => { headingRef.current?.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: "instant" }); });
  }
  function setFilter(key, value) { setFilters(previous => ({ ...previous, [key]: value, page: key === "page" ? value : 1 })); }
  function setPeriod(preset) {
    const now = new Date().toISOString();
    setReferenceIso(now); setDatePreset(preset);
    setFilters(previous => ({ ...previous, period: periodForPreset(preset, now), page: 1 }));
  }
  function resetFilters() {
    setDatePreset("all"); setFilters(defaultFilters());
  }
  function viewRegister(overrides = {}) {
    setFilters(previous => ({ ...defaultFilters(), period: previous.period, ...overrides }));
    changeView("register");
  }
  function searchRequests(query) {
    if (view !== "register") {
      setFilters(previous => ({ ...defaultFilters(), period: previous.period, query }));
      setView("register");
    } else setFilter("query", query);
  }
  function openRequest(id) {
    const row = rows.find(item => item.id === id);
    if (row) { setSelectedSnapshot(row); setSelectedDetailId(id); }
  }
  function closeRequest() { setSelectedDetailId(null); setSelectedSnapshot(null); }
  async function saveFollowUp(id, patch, expectedRevision) {
    const result = await save(id, patch, expectedRevision);
    if (alive.current && result.ok) setToast("Changes saved. The team can see your update.");
    return result;
  }
  async function exportCsv(exportFilters) {
    if (!hasLoaded) return;
    setExporting(true);
    try {
      if (!await auth.checkAccess() || !alive.current) return;
      // Export saved values from the full loaded collection, never drawer drafts or the current page only.
      const result = buildRegisterCsv(rows, exportFilters, { referenceIso: new Date().toISOString() });
      if (!await auth.checkAccess() || !alive.current) return;
      const url = URL.createObjectURL(new Blob([result.text], { type: "text/csv;charset=utf-8;" }));
      const link = document.createElement("a"); link.href = url; link.download = result.filename; document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setToast(`${result.rowCount} saved ${result.rowCount === 1 ? "request" : "requests"} exported.`);
    } catch { if (alive.current) setToast("Could not export. Please check your connection and retry."); }
    finally { if (alive.current) setExporting(false); }
  }
  const onDraftChange = React.useCallback((id, draft) => setEditsById(previous => ({ ...previous, [id]: draft })), []);
  const title = view === "overview" ? "Dashboard" : view === "register" ? "Register" : "Team";
  const periodLabel = datePreset === "today" ? "Today" : datePreset === "last7" ? "Last 7 days" : "All dates";

  return <div className="adm-app">
    <aside className="adm-sidebar">
      <a className="adm-brand" href="/" aria-label="LetsAimIt home"><img {...mediaProps("logo.png", "110px")} alt="LetsAimIt" /></a>
      <p className="adm-sidebar-label">MENU</p>
      <nav className="adm-nav" aria-label="Admin navigation">{VIEWS.map(item => <button key={item.id} type="button" aria-current={view === item.id ? "page" : undefined} onClick={() => changeView(item.id)}><AdminIcon name={item.icon} /><span>{item.label}</span>{item.id === "register" && hasLoaded && <span className="adm-nav-count">{rows.length}</span>}</button>)}</nav>
      <div className="adm-utilities"><p className="adm-sidebar-label">GENERAL</p><a href="/"><AdminIcon name="external" />Website</a><button type="button" onClick={refresh}><AdminIcon name="reset" />Refresh register</button><button type="button" onClick={auth.signOut}><AdminIcon name="exit" />Sign out</button></div>
    </aside>
    <div className="adm-workspace">
      <header className="adm-topbar">
        <label className="adm-search adm-global-search"><AdminIcon name="search" /><span className="adm-sr-only">Search requests</span><input type="search" placeholder="Search requests" value={filters.query} onChange={event => searchRequests(event.target.value)} /></label>
        <div className="adm-topbar-right"><span className="adm-live-state" role="status">{!hasLoaded ? "Not synced" : liveState === "live" ? "Live" : liveState === "paused" ? "Paused" : liveState === "reconnecting" ? "Reconnecting" : "Connecting"}</span><div className="adm-user"><Avatar name={auth.user.displayName || auth.user.email} small /><span><strong>{auth.user.displayName || auth.user.email}</strong><span>{auth.user.email}</span></span></div><details className="adm-mobile-tools"><summary aria-label="Workspace actions"><AdminIcon name="more" /></summary><div className="adm-tools-popup"><a href="/"><AdminIcon name="external" />Website</a><button type="button" onClick={refresh}><AdminIcon name="reset" />Refresh register</button><button type="button" onClick={auth.signOut}><AdminIcon name="exit" />Sign out</button></div></details></div>
      </header>
      <div className="adm-content">
        <div className="adm-page-heading"><div><h1 ref={headingRef} tabIndex={-1}>{title}</h1><p className="adm-date">{formatIST(referenceIso, "date")} · IST{hasDraft && <span>Unsaved changes</span>}</p></div><div className="adm-page-actions">{view !== "team" && <FilterSelect label="Period" value={datePreset} onChange={setPeriod}><option value="all">All dates</option><option value="today">Today</option><option value="last7">Last 7 days</option></FilterSelect>}{view === "overview" && hasLoaded && <button className="adm-button adm-button-outline" type="button" onClick={() => exportCsv({ period: filters.period })} disabled={!hasLoaded || exporting || loading}>Export CSV</button>}</div></div>
        {error && <div className="adm-notice adm-notice-error" role="alert"><p>{error}{hasLoaded && ` Showing the last saved snapshot from ${formatIST(lastSynced)} IST.`}</p><button className="adm-text-button" type="button" onClick={refresh}>Retry</button></div>}
        {auth.error && <div className="adm-notice" role="status">{auth.error}</div>}
        {!hasLoaded ? <div className="adm-card adm-empty" role="status"><h2>{loading ? "Loading saved requests…" : "Register not loaded"}</h2>{!loading && <p>Saved requests and team details will appear when the connection is restored.</p>}</div> : view === "overview" ? <AdminOverview rows={overviewRows} summary={summary} members={members} auth={uiAuth} onOpen={openRequest} onViewRegister={viewRegister} onTeam={() => changeView("team")} Icon={AdminIcon} Avatar={Avatar} StatusBadge={StatusBadge} /> : view === "register" ? <Register rows={rows} filtered={filtered} pagination={pagination} filters={filters} setFilter={setFilter} resetFilters={resetFilters} onOpen={openRequest} onExport={() => exportCsv(filters)} canExport={!exporting} assignees={assignees} datePreset={datePreset} onDatePreset={setPeriod} /> : <Team members={members} user={auth.user} onInvite={inviteMember} onRemove={removeMember} />}
        <footer className="adm-footer">{hasLoaded ? <><span>Counts include all saved requests, including any test submissions.</span><span>{periodLabel} · Synced {formatIST(lastSynced, "time")} IST</span></> : <><span>Waiting for the saved register.</span><span>Asia/Kolkata</span></>}</footer>
      </div>
    </div>
    <RequestDetail row={selectedRow} open={Boolean(selectedRow)} onClose={closeRequest} onSave={saveFollowUp} assignees={assignees} canEdit onDraftChange={onDraftChange} />
    {toast && <div className="adm-toast" role="status"><AdminIcon name="check" /><span>{toast}</span><button type="button" className="adm-icon-button" aria-label="Dismiss message" onClick={() => setToast("")}><AdminIcon name="close" /></button></div>}
  </div>;
}

export function AdminPage() {
  const auth = useAdminAuth();
  // Unmounting destroys private rows and drafts immediately on sign-out/revocation.
  if (auth.phase !== "authorized" || !auth.user) return <SignIn />;
  return <AuthorizedAdmin key={auth.user.id} auth={auth} />;
}

export default AdminPage;
