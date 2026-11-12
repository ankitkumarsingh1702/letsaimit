import React from 'react';
import { useAdminAuth } from '../../context/AdminAuth.jsx';
import SignIn from '../../pages/SignIn.jsx';
import ProfileAvatar from '../../components/ProfileAvatar.jsx';
import WorkspaceSwitch from '../../components/WorkspaceSwitch.jsx';
import { validateAuthReturnTarget } from '../../lib/authReturn.js';
import { mediaProps } from '../../lib/media.js';
import { useParentTracker } from './useParentTracker.js';
import AttendanceEmail from './AttendanceEmail.jsx';
import { ATTENDANCE_LABELS, saveAttendance, saveWeeklyFeedback, saveCoachAssignment, todayIST } from './trackerData.js';
import '../admin/admin.css';
import './staff-tracker.css';

const weekdays = [1, 2, 3, 4, 5, 6, 7];
function monday(date) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - (value.getUTCDay() + 6) % 7);
  return value.toISOString().slice(0, 10);
}
function stamp(value) { return value ? new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Not synced'; }
const mutationOptions = auth => ({ client: auth.client, userId: auth.user.id, verifyGoogleUser: auth.verifyGoogleUser, checkAccess: auth.checkAccess });
function changed() { window.dispatchEvent(new Event('letsaimit:tracker-changed')); }
export const coachingView = (view, isAdmin) => ['attendance', 'feedback'].includes(view) || view === 'coaches' && isAdmin ? view : 'attendance';
export const mayLeaveTrackerEditor = ({ dirty, busy }, confirmDiscard) => !busy && (!dirty || confirmDiscard());

export function FeedbackEditor({ child, weekStart, saved, auth, onSaved, onDraftState }) {
  // This revision belongs to the displayed draft; silent refresh never replaces it.
  const [draft, setDraft] = React.useState(() => ({ summary: saved?.summary || '', nextStep: saved?.nextStep || '', revision: saved?.revision || 0 }));
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState('');
  const baseline = React.useRef(draft), lock = React.useRef(false);
  const mounted = React.useRef(false);
  const dirty = draft.summary !== baseline.current.summary || draft.nextStep !== baseline.current.nextStep;
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; onDraftState?.({ dirty: false, busy: false }); }; }, [onDraftState]);
  function changeDraft(patch) {
    const next = { ...draft, ...patch }; setDraft(next);
    onDraftState?.({ dirty: next.summary !== baseline.current.summary || next.nextStep !== baseline.current.nextStep, busy: false });
  }
  function loadLatest() {
    const next = { summary: saved?.summary || '', nextStep: saved?.nextStep || '', revision: saved?.revision || 0 };
    baseline.current = next; setDraft(next); setError(''); onDraftState?.({ dirty: false, busy: false });
  }
  async function submit(event) {
    event.preventDefault(); if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); onDraftState?.({ dirty, busy: true });
    let saved = false;
    try {
      const result = await saveWeeklyFeedback({ ...mutationOptions(auth), registrationId: child.registrationId, weekStart, summary: draft.summary, nextStep: draft.nextStep, expectedRevision: draft.revision });
      saved = true;
      if (mounted.current) { const next = { summary: result.summary, nextStep: result.nextStep, revision: result.revision }; baseline.current = next; setDraft(next); onSaved(); }
    } catch (cause) { if (mounted.current) setError(cause.message); }
    finally { lock.current = false; if (mounted.current) { setBusy(false); onDraftState?.({ dirty: saved ? false : dirty, busy: false }); } }
  }
  return <form className="coaching-editor" onSubmit={submit}>
    <h2>Weekly feedback · {child.childName}</h2>
    <p>Week of {weekStart}</p>
    <label>Weekly update<textarea required maxLength={1500} rows={3} value={draft.summary} onChange={event => changeDraft({ summary: event.target.value })} disabled={busy} /></label>
    <label>Next step<textarea maxLength={500} rows={2} value={draft.nextStep} onChange={event => changeDraft({ nextStep: event.target.value })} disabled={busy} /></label>
    {dirty && <p className="coaching-draft">Unsaved changes</p>}
    {error && <p className="coaching-error" role="alert">{error}</p>}
    <div className="coaching-actions"><button className="adm-button adm-button-dark" disabled={busy || !draft.summary.trim()}>{busy ? 'Saving…' : 'Publish feedback'}</button><button type="button" className="adm-button adm-button-outline" disabled={busy} onClick={loadLatest}>Load latest</button></div>
  </form>;
}

export function AssignmentEditor({ child, auth, onSaved, onDraftState }) {
  const [draft, setDraft] = React.useState(() => ({ email: child.coachEmail, startsOn: child.startsOn || todayIST(), revision: child.assignmentRevision }));
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState('');
  const baseline = React.useRef(draft), lock = React.useRef(false);
  const mounted = React.useRef(false);
  const dirty = draft.email !== baseline.current.email || draft.startsOn !== baseline.current.startsOn;
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; onDraftState?.({ dirty: false, busy: false }); }; }, [onDraftState]);
  function changeDraft(patch) {
    const next = { ...draft, ...patch }; setDraft(next);
    onDraftState?.({ dirty: next.email !== baseline.current.email || next.startsOn !== baseline.current.startsOn, busy: false });
  }
  function loadLatest() {
    const next = { email: child.coachEmail, startsOn: child.startsOn || todayIST(), revision: child.assignmentRevision };
    baseline.current = next; setDraft(next); setError(''); onDraftState?.({ dirty: false, busy: false });
  }
  async function submit(event) {
    event.preventDefault(); if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); onDraftState?.({ dirty, busy: true });
    let confirmed = false;
    try {
      const saved = await saveCoachAssignment({ ...mutationOptions(auth), registrationId: child.registrationId, coachEmail: draft.email, weekdays: child.weekdays.length ? child.weekdays : weekdays, startsOn: draft.startsOn, expectedRevision: draft.revision });
      confirmed = true;
      if (mounted.current) { const next = { email: saved.coachEmail, startsOn: saved.startsOn || todayIST(), revision: saved.assignmentRevision }; baseline.current = next; setDraft(next); onSaved(); }
    } catch (cause) { if (mounted.current) setError(cause.message); }
    finally { lock.current = false; if (mounted.current) { setBusy(false); onDraftState?.({ dirty: confirmed ? false : dirty, busy: false }); } }
  }
  return <form className="coaching-editor" onSubmit={submit}><h2>Coach access · {child.childName}</h2><p>One Google account can also be a parent or admin.</p>
    <label>Coach Google email<input type="email" maxLength={254} value={draft.email} onChange={event => changeDraft({ email: event.target.value })} disabled={busy} /></label>
    <label>Starts on<input type="date" required value={draft.startsOn} onChange={event => changeDraft({ startsOn: event.target.value })} disabled={busy} /></label>
    {dirty && <p className="coaching-draft">Unsaved changes</p>}
    <p>Leave the email empty to remove coach access.</p>{error && <p className="coaching-error" role="alert">{error}</p>}
    <div className="coaching-actions"><button className="adm-button adm-button-dark" disabled={busy}>{busy ? 'Saving…' : 'Save coach'}</button><button type="button" className="adm-button adm-button-outline" disabled={busy} onClick={loadLatest}>Load latest</button></div>
  </form>;
}

function initialAttendanceDate() {
  const today = todayIST();
  if (typeof window === 'undefined') return today;
  const target = validateAuthReturnTarget(window.location.pathname + window.location.search);
  const date = target ? new URL(target, window.location.origin).searchParams.get('date') : null;
  return date && date <= today ? date : today;
}

export function CoachingWorkspace({ auth, embedded = false, headingRef, navigationRef }) {
  const [date, setDate] = React.useState(initialAttendanceDate), [view, setView] = React.useState('attendance');
  const [weekStart, setWeekStart] = React.useState(() => monday(todayIST()));
  const [childId, setChildId] = React.useState(''), [query, setQuery] = React.useState('');
  const [drafts, setDrafts] = React.useState({}), [busy, setBusy] = React.useState(false), [notice, setNotice] = React.useState(''), [saveError, setSaveError] = React.useState('');
  const state = useParentTracker(auth, { staff: true, date, scope: embedded ? 'admin' : 'coach' });
  const children = state.snapshot?.children || [], attendance = state.snapshot?.attendance || [], feedback = state.snapshot?.feedback || [];
  const adminView = embedded && state.snapshot?.isAdmin;
  const selectedChild = children.find(child => child.registrationId === childId) || children[0];
  const filtered = children.filter(child => !query.trim() || [child.childName, child.sport, child.community].some(value => value.toLowerCase().includes(query.trim().toLowerCase())));
  const saved = new Map(attendance.map(row => [row.registrationId, row]));
  const mounted = React.useRef(false);
  const editor = React.useRef({ dirty: false, busy: false });
  const attendanceDrafts = React.useRef(drafts); attendanceDrafts.current = drafts;
  const onDraftState = React.useCallback(next => { editor.current = next; }, []);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  React.useEffect(() => {
    const warn = event => { if (editor.current.dirty || editor.current.busy || Object.keys(attendanceDrafts.current).length) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  const activeView = coachingView(view, adminView);
  function mayLeaveEditor() {
    if (editor.current.busy) { setNotice('Wait for the save to finish.'); return false; }
    return mayLeaveTrackerEditor(editor.current, () => window.confirm('Discard unsaved changes?'));
  }
  function chooseView(next) {
    if (next === activeView || !mayLeaveEditor()) return;
    setView(next);
    setNotice('');
  }
  React.useImperativeHandle(navigationRef, () => ({
    mayLeave() {
      if (busy) { setNotice('Wait for the save to finish.'); return false; }
      if (!mayLeaveEditor()) return false;
      return !Object.keys(drafts).length || window.confirm('Discard unsaved attendance?');
    },
    showAttendance: () => chooseView('attendance'),
  }));
  function chooseChild(next) { if (next !== selectedChild?.registrationId && mayLeaveEditor()) { setChildId(next); setNotice(''); } }
  function chooseWeek(next) { if (next !== weekStart && mayLeaveEditor()) { setWeekStart(next); setNotice(''); } }
  function mark(ids, status) {
    setDrafts(previous => {
      const next = { ...previous };
      for (const id of ids) {
        const current = saved.get(id);
        if (status === 'unmarked') { delete next[id]; continue; }
        next[id] = { registrationId: id, status, revision: previous[id]?.revision ?? current?.revision ?? 0 };
      }
      return next;
    });
    setNotice(''); setSaveError('');
  }
  function chooseDate(next) {
    if (Object.keys(drafts).length && !window.confirm('Discard unsaved attendance?')) return;
    setDate(next); setDrafts({}); setNotice(''); setSaveError('');
  }
  async function submitAttendance() {
    if (busy || !Object.keys(drafts).length) return;
    setBusy(true); setSaveError(''); setNotice('');
    try {
      await saveAttendance({ ...mutationOptions(auth), date, rows: Object.values(drafts) });
      if (mounted.current) { setDrafts({}); setNotice('Attendance saved.'); changed(); await state.refresh(); }
    } catch (cause) { if (mounted.current) setSaveError(cause.message); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function onFeedbackSaved() { setNotice('Feedback published.'); changed(); await state.refresh(); }
  async function onAssignmentSaved() { setNotice('Coach access saved.'); changed(); await state.refresh(); }
  const nav = [['attendance', 'Attendance'], ['feedback', 'Weekly feedback'], ...(adminView ? [['coaches', 'Coach access']] : [])];
  const navigation = nav.map(([key, label]) => <button
    type="button" key={key}
    aria-pressed={embedded ? activeView === key : undefined}
    aria-current={!embedded && activeView === key ? 'page' : undefined}
    onClick={() => chooseView(key)}>{label}</button>);
  const content = <section className={embedded ? undefined : 'adm-content'}>
        <div className="adm-page-heading">
          <div><h1 ref={headingRef} tabIndex={embedded ? -1 : undefined}>{nav.find(([key]) => key === activeView)?.[1] || 'Attendance'}</h1><p className="adm-date">{state.lastSynced ? `Updated ${stamp(state.lastSynced)} IST` : 'Loading tracker'}</p></div>
          <button type="button" className="adm-button adm-button-outline" onClick={state.refresh} disabled={state.loading}>Refresh</button>
        </div>
        {embedded && <nav className="adm-type-tabs coaching-team-tabs" aria-label="Coaching tools">{navigation}</nav>}
        {state.error && <p className="coaching-error" role="alert">{state.error}{state.snapshot ? ' Showing the last saved values.' : ''}</p>}
        {notice && <p className="coaching-notice" role="status">{notice}</p>}
        {!state.snapshot ? <div className="adm-card adm-empty" role="status"><h2>{state.loading ? 'Loading coaching records…' : 'Coaching records unavailable'}</h2><p>Access is limited to admins and assigned coaches.</p></div> : <>
          {activeView === 'attendance' ? <>
            {adminView && <AttendanceEmail auth={auth} date={date} hasChildren={children.length > 0} />}
            <p className="adm-date coaching-roster-summary" id="attendance-roster-summary">{children.length} {children.length === 1 ? 'child' : 'children'} · {embedded ? 'Approved enrolments only' : 'Assigned, approved enrolments only'}</p>
            <div className="coaching-toolbar"><label>Session date<input type="date" required max={todayIST()} value={date} onChange={event => chooseDate(event.target.value)} disabled={busy} /></label><label className="coaching-search">Find child<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, sport or community" /></label><div className="coaching-actions"><button className="adm-button adm-button-outline" type="button" onClick={() => mark(filtered.map(child => child.registrationId), 'present')} disabled={busy || !filtered.length}>Mark shown present</button><button className="adm-button adm-button-outline" type="button" onClick={() => mark(filtered.map(child => child.registrationId), 'no_session')} disabled={busy || !filtered.length}>No session</button></div></div>
            <div className="adm-card coaching-table-wrap" role="region" aria-label="Attendance register, scroll for all columns" aria-describedby="attendance-roster-summary" tabIndex={0}><table className="adm-table coaching-table"><thead><tr><th>Child</th><th>Sport</th><th>Community</th><th>Attendance</th><th>Marked by</th><th>Updated · IST</th></tr></thead><tbody>{filtered.map(child => { const row = saved.get(child.registrationId), draft = drafts[child.registrationId]; return <tr key={child.registrationId}><td>{child.childName}</td><td>{child.sport || '—'}</td><td>{child.community || '—'}</td><td><select aria-label={`Attendance for ${child.childName}`} value={draft?.status || row?.status || 'unmarked'} disabled={busy} onChange={event => mark([child.registrationId], event.target.value)}><option value="unmarked" disabled={Boolean(row)}>Not marked</option>{Object.entries(ATTENDANCE_LABELS).filter(([key]) => key !== 'unmarked').map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>{draft && <span className="coaching-draft">Unsaved</span>}</td><td>{row?.coachName || '—'}</td><td>{row ? stamp(row.updatedAt) : '—'}</td></tr>; })}{!filtered.length && <tr><td colSpan={6} className="coaching-empty">{query.trim() ? 'No matching children' : embedded ? 'No approved children' : 'No assigned children'}</td></tr>}</tbody></table></div>
            <div className="coaching-savebar"><p>{Object.keys(drafts).length ? `${Object.keys(drafts).length} unsaved` : 'Not marked is not counted as absent.'}</p><div className="coaching-actions"><button type="button" className="adm-button adm-button-outline" onClick={() => { setDrafts({}); setSaveError(''); void state.refresh(); }} disabled={busy}>Load latest</button><button type="button" className="adm-button adm-button-dark" onClick={submitAttendance} disabled={busy || !Object.keys(drafts).length}>{busy ? 'Saving…' : 'Save attendance'}</button></div></div>{saveError && <p className="coaching-error" role="alert">{saveError}</p>}
            </> : <>
              <div className="coaching-toolbar"><label>Child<select value={selectedChild?.registrationId || ''} onChange={event => chooseChild(event.target.value)}>{children.map(child => <option key={child.registrationId} value={child.registrationId}>{child.childName} · {child.sport}</option>)}</select></label>{activeView === 'feedback' && <label>Week starts Monday<input type="date" value={weekStart} max={todayIST()} required onChange={event => chooseWeek(event.target.value)} /></label>}</div>
              {selectedChild ? activeView === 'feedback' ? <FeedbackEditor key={`${selectedChild.registrationId}:${weekStart}`} child={selectedChild} weekStart={weekStart} saved={feedback.find(row => row.registrationId === selectedChild.registrationId && row.weekStart === weekStart)} auth={auth} onSaved={onFeedbackSaved} onDraftState={onDraftState} /> : adminView ? <AssignmentEditor key={selectedChild.registrationId} child={selectedChild} auth={auth} onSaved={onAssignmentSaved} onDraftState={onDraftState} /> : null : <p className="coaching-empty">{embedded ? 'No approved children' : 'No assigned children'}</p>}
              {activeView === 'feedback' && <div className="adm-card coaching-table-wrap"><table className="adm-table coaching-table"><caption>Published feedback · last 52 weeks</caption><thead><tr><th>Child</th><th>Week</th><th>Weekly update</th><th>Next step</th><th>Coach</th></tr></thead><tbody>{feedback.filter(row => row.registrationId === selectedChild?.registrationId).map(row => <tr key={row.id}><td>{selectedChild?.childName}</td><td>{row.weekStart}</td><td title={row.summary}>{row.summary}</td><td title={row.nextStep}>{row.nextStep || '—'}</td><td>{row.coachName || '—'}</td></tr>)}</tbody></table></div>}
            </>}
        </>}
  </section>;
  if (embedded) return content;

  return <div className="adm-app coaching-app">
    <aside className="adm-sidebar"><a className="adm-brand" href="/" aria-label="LetsAimIt home"><img {...mediaProps('logo.png', '110px')} alt="LetsAimIt" /></a><p className="adm-sidebar-label">COACHING</p><nav className="adm-nav" aria-label="Coaching navigation">{navigation}</nav><div className="adm-utilities"><a href="/">Website</a><button type="button" onClick={() => { void auth.signOut(); }}>Sign out</button></div></aside>
    <div className="adm-workspace">
      <header className="adm-topbar"><WorkspaceSwitch current="coach" canAdmin={auth.phase === 'authorized'} /><div className="adm-user"><ProfileAvatar name={auth.user.displayName || auth.user.email} src={auth.user.avatarUrl} /><span><strong>{auth.user.displayName || auth.user.email}</strong><span>{auth.user.email}</span></span></div></header>
      {content}
    </div>
  </div>;
}

export default function StaffTracker() {
  const auth = useAdminAuth();
  if (['checking', 'signing_in', 'signing_out'].includes(auth.phase)) return <section className="coaching-gate" role="status"><h1>Coaching tracker</h1><p>Checking your Google account…</p></section>;
  if (!auth.user?.isGoogle) return <SignIn mode="coach" />;
  return <CoachingWorkspace key={`${auth.user.id}:${auth.phase === 'authorized' ? 'admin' : 'coach'}`} auth={auth} />;
}
