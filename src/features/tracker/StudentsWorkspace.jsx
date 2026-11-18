import * as React from 'react';
import { COACHING_SOCIETIES } from '../../lib/coachingSocieties.js';
import { ATTENDANCE_LABELS, saveAttendance, todayIST, validTrackerDate } from './trackerData.js';
import { useParentTracker } from './useParentTracker.js';
import { useStudentProfile } from './useStudentProfile.js';
import { StudentOverview, StudentBilling } from './StudentProfileDetails.jsx';
import { AssignmentEditor, FeedbackEditor, mayLeaveTrackerEditor } from './CoachingEditors.jsx';
import AttendanceEmail from './AttendanceEmail.jsx';
import ParentAttendanceAction from './ParentAttendanceAction.jsx';
import StudentPractice from './StudentPractice.jsx';
import './students.css';

const none = [];
const attendanceChoices = ['present', 'absent'];
const sortNames = new Intl.Collator('en-IN', { sensitivity: 'base', numeric: true });
const sessionDate = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium' });
const oldestSessionDate = today => new Date(Date.parse(`${today}T00:00:00Z`) - 364 * 86_400_000).toISOString().slice(0, 10);
const officialSocieties = new Map(COACHING_SOCIETIES.map(society => [society.toLowerCase(), society]));
const societyName = child => {
  const saved = child.community.trim().replace(/\s+/g, ' ');
  return officialSocieties.get(saved.toLowerCase()) ?? (saved || 'Society not set');
};

export function groupStudents(children, query = '', societyFilter = '') {
  const groups = new Map([...officialSocieties].map(([id, society]) => [id, { id, society, children: [] }]));
  const search = query.trim().toLowerCase();
  for (const child of children) {
    const society = societyName(child);
    const id = society.toLowerCase();
    if (!groups.has(id)) groups.set(id, { id, society, children: [] });
    groups.get(id).children.push(child);
  }
  return [...groups.values()]
    .filter(group => !societyFilter || group.id === societyFilter)
    .map(group => ({
      ...group,
      children: group.children.filter(child => !search ||
        [child.childName, group.society, child.sport].some(value => value.toLowerCase().includes(search)))
        .sort((a, b) => sortNames.compare(a.childName, b.childName)),
    }))
    .filter(group => !search || group.children.length > 0)
    .sort((a, b) => sortNames.compare(a.society, b.society));
}

function mondayOf(date) {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
  return day.toISOString().slice(0, 10);
}

function StudentProfile({ auth, scope, date, student, actions, canEmail, onClose, onOpenBilling, refreshRoster, navigationRef }) {
  const [section, setSection] = React.useState('overview');
  const [week, setWeek] = React.useState(() => mondayOf(date));
  const [notice, setNotice] = React.useState('');
  const heading = React.useRef(null);
  const practiceNavigation = React.useRef(null);
  const draft = React.useRef({ dirty: false, busy: false });
  const details = useStudentProfile(auth, { registrationId: student.registrationId, scope, enabled: true });
  const feedback = details.profile?.feedback ?? none;
  const sections = [['overview', 'Overview'], ['training', 'Training'], ['feedback', 'Weekly feedback']];
  if (scope === 'admin') sections.push(['coach', 'Coach'], ['billing', 'Payments']);
  const onDraftState = React.useCallback(next => { draft.current = next; }, []);

  React.useEffect(() => { heading.current?.focus(); }, []);
  React.useEffect(() => {
    function guard(event) {
      if (draft.current.dirty || draft.current.busy) { event.preventDefault(); event.returnValue = ''; }
    }
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, []);

  function mayLeave() {
    return practiceNavigation.current?.mayLeave() !== false
      && mayLeaveTrackerEditor(draft.current, () => window.confirm('Discard unsaved changes?'));
  }
  React.useImperativeHandle(navigationRef, () => ({ mayLeave }));

  function switchSection(next) {
    if (section === next || !mayLeave()) return;
    setNotice('');
    setSection(next);
  }
  async function feedbackSaved() {
    setNotice('Feedback published.');
    await details.refresh();
  }
  async function coachSaved() {
    setNotice('Coach assignment saved.');
    await refreshRoster();
  }

  return <div className="students-profile">
    <button type="button" className="students-back" onClick={onClose}>← Students</button>
    <header className="students-profile-header">
      <h1 ref={heading} tabIndex={-1}>{student.childName}</h1>
      <p>{[societyName(student), student.sport].filter(Boolean).join(' · ')}</p>
    </header>
    <section className="students-profile-attendance" aria-label="Session attendance">
      <div><h2>Attendance</h2><time dateTime={date}>{sessionDate.format(new Date(`${date}T00:00:00+05:30`))} · IST</time></div>
      <div className="students-profile-actions">{actions}
        <ParentAttendanceAction key={date} auth={auth} scope={scope} date={date} registrationId={student.registrationId} disabled={!canEmail} />
      </div>
    </section>
    <nav className="students-profile-nav" aria-label="Student profile">
      {sections.map(([id, label]) => <button type="button" key={id} aria-current={section === id ? 'page' : undefined}
        onClick={() => switchSection(id)}>{label}</button>)}
    </nav>
    {notice && <p role="status" className="students-saved">{notice}</p>}
    {section === 'overview' && <StudentOverview details={details} />}
    {section === 'training' && <StudentPractice auth={auth} registrationId={student.registrationId} scope={scope} navigationRef={practiceNavigation} />}
    {section === 'feedback' && <section className="students-profile-section" aria-label="Weekly feedback">
      <div className="students-feedback-head"><h2>Weekly feedback</h2>
        <label className="adm-field">Week of<input type="date" value={week} max={todayIST()} onChange={event => {
          const next = event.target.value;
          if (validTrackerDate(next) && next <= todayIST() && mayLeave()) setWeek(mondayOf(next));
        }} /></label>
      </div>
      {details.error && !details.profile ? <p className="students-error" role="alert">{details.error} <button type="button" className="adm-text-button" onClick={details.refresh}>Try again</button></p>
        : details.loading ? <p role="status">Loading feedback…</p>
          : <FeedbackEditor key={week} child={student} weekStart={week} saved={feedback.find(row => row.weekStart === week)}
            auth={auth} onSaved={feedbackSaved} onDraftState={onDraftState} />}
      {feedback.length > 0 && <div className="students-feedback-history">
        <h3>Published feedback</h3>
        <ul>{feedback.map(row => <li key={row.id}>
          <time dateTime={row.weekStart}>{sessionDate.format(new Date(`${row.weekStart}T00:00:00+05:30`))}</time>
          <p>{row.summary}</p>{row.nextStep && <p><strong>Next step</strong> {row.nextStep}</p>}
          {row.coachName && <small>{row.coachName}</small>}
        </li>)}</ul>
      </div>}
    </section>}
    {section === 'coach' && scope === 'admin' && <section className="students-profile-section" aria-label="Coach">
      <AssignmentEditor child={student} auth={auth} onSaved={coachSaved} onDraftState={onDraftState} />
    </section>}
    {section === 'billing' && scope === 'admin' && <StudentBilling details={details} onOpenBilling={onOpenBilling} />}
  </div>;
}

function AttendanceActions({ child, record, pending, message, disabled, onMark, showUnmarked = false }) {
  const current = pending || record?.status || 'unmarked';
  return <div className="students-attendance">
    <div className={pending || current === 'no_session' || (showUnmarked && current === 'unmarked') ? 'students-attendance-state' : 'adm-sr-only'} role="status">
      {pending ? 'Saving…' : current === 'unmarked' || current === 'no_session' ? ATTENDANCE_LABELS[current] : `${ATTENDANCE_LABELS[current]} saved`}
    </div>
    <div className="students-attendance-buttons" role="group" aria-label={`Attendance for ${child.childName}`}>
      {attendanceChoices.map(status => (
        <button type="button" className="students-button" key={status} aria-pressed={status === current} data-attendance={status}
          disabled={Boolean(pending) || disabled} onClick={() => onMark(child.registrationId, status)}>
          {ATTENDANCE_LABELS[status]}
        </button>
      ))}
    </div>
    {message && <p className="students-error" role="alert">{message}</p>}
    {disabled && <p className="students-attendance-state">Before this assignment</p>}
  </div>;
}

export function StudentsPanel({ auth, scope, date, onDateChange, tracker, headingRef, navigationRef, onOpenBilling }) {
  const [studentId, selectStudent] = React.useState('');
  const [query, setQuery] = React.useState('');
  const [society, setSociety] = React.useState('');
  const [toolsOpen, setToolsOpen] = React.useState(false);
  const [confirmed, setConfirmed] = React.useState({});
  const [pending, setPending] = React.useState({});
  const [errors, setErrors] = React.useState({});
  const pendingIds = React.useRef(new Set());
  const profileNavigation = React.useRef(null);
  const openedBy = React.useRef(null);
  const mounted = React.useRef(false);
  const search = React.useDeferredValue(query);
  const children = tracker.snapshot?.children ?? none;
  const attendance = tracker.snapshot?.attendance ?? none;
  const societies = React.useMemo(() => groupStudents(children), [children]);
  const groups = React.useMemo(() => groupStudents(children, search, society), [children, search, society]);
  const saved = React.useMemo(() => new Map(attendance.map(row => [row.registrationId, row])), [attendance]);
  const selected = children.find(child => child.registrationId === studentId);
  const today = todayIST();
  const firstDate = oldestSessionDate(today);
  React.useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  React.useImperativeHandle(navigationRef, () => ({
    mayLeave: () => !pendingIds.current.size && profileNavigation.current?.mayLeave() !== false,
    showRoster: closeStudent,
  }));

  function recordFor(id) {
    const local = confirmed[id];
    const row = saved.get(id);
    return local?.sessionDate === date && (!row || row.revision < local.revision) ? local : row;
  }
  function canMark(child) { return scope === 'admin' || !child.startsOn || child.startsOn <= date; }
  function canEmail(child) {
    return canMark(child) && !pending[child.registrationId] && attendanceChoices.includes(recordFor(child.registrationId)?.status);
  }
  async function markStudents(targets, status) {
    const rows = targets.filter(canMark).flatMap(({ registrationId }) => {
      const existing = recordFor(registrationId);
      return pendingIds.current.has(registrationId) || existing?.status === status
        ? [] : [{ registrationId, status, revision: existing?.revision ?? 0 }];
    });
    if (!rows.length) return;
    const ids = rows.map(row => row.registrationId);
    ids.forEach(id => pendingIds.current.add(id));
    setPending(previous => ({ ...previous, ...Object.fromEntries(ids.map(id => [id, status])) }));
    setErrors(previous => ({ ...previous, ...Object.fromEntries(ids.map(id => [id, ''])) }));
    const savedRows = [];
    try {
      for (let offset = 0; offset < rows.length; offset += 100) {
        savedRows.push(...await saveAttendance({
          client: auth.client, userId: auth.user.id, verifyGoogleUser: auth.verifyGoogleUser,
          date, rows: rows.slice(offset, offset + 100),
        }));
      }
    } catch (error) {
      if (mounted.current) {
        const failed = ids.slice(savedRows.length);
        const message = error.code === 'conflict' ? 'Attendance changed. Choose again.' : error.message;
        setErrors(previous => ({ ...previous, ...Object.fromEntries(failed.map(id => [id, message])) }));
        void tracker.refresh();
      }
    } finally {
      if (savedRows.length) {
        if (mounted.current) setConfirmed(previous => ({ ...previous, ...Object.fromEntries(savedRows.map(row => [row.registrationId, row])) }));
        window.dispatchEvent(new Event('letsaimit:tracker-changed'));
      }
      ids.forEach(id => pendingIds.current.delete(id));
      if (mounted.current) setPending(previous => {
        const next = { ...previous };
        ids.forEach(id => delete next[id]);
        return next;
      });
    }
  }
  function chooseDate(next) {
    if (!validTrackerDate(next) || next < firstDate || next > today || pendingIds.current.size) return;
    setConfirmed({});
    setErrors({});
    selectStudent('');
    onDateChange(next);
  }
  function openStudent(id, opener) {
    openedBy.current = opener;
    selectStudent(id);
  }
  function closeStudent() {
    if (profileNavigation.current?.mayLeave() === false) return;
    selectStudent('');
    window.requestAnimationFrame(() => {
      const button = document.getElementById(openedBy.current);
      button?.focus();
    });
  }
  function actions(child, showUnmarked) {
    return <AttendanceActions child={child} record={recordFor(child.registrationId)}
      pending={pending[child.registrationId]} message={errors[child.registrationId]}
      disabled={!canMark(child)} onMark={(_, status) => markStudents([child], status)} showUnmarked={showUnmarked} />;
  }

  return <section className="students-workspace" aria-busy={tracker.loading}>
    {selected ? <StudentProfile key={selected.registrationId} auth={auth} scope={scope} date={date} student={selected}
      actions={actions(selected, true)} canEmail={canEmail(selected)} onClose={closeStudent} onOpenBilling={onOpenBilling}
      refreshRoster={tracker.refresh} navigationRef={profileNavigation} /> : <>
      <div className="adm-page-heading"><h1 ref={headingRef} tabIndex={-1}>Students</h1></div>
      {tracker.error && <div className="students-error" role="alert">{tracker.error} <button type="button" className="adm-text-button" onClick={tracker.refresh}>Try again</button></div>}
      {tracker.loading && !tracker.snapshot && <p className="students-empty" role="status">Loading students…</p>}
      {tracker.snapshot && <>
        <div className="students-toolbar">
          <label className="adm-field">Session date · IST<input type="date" min={firstDate} max={today} value={date} disabled={Object.keys(pending).length > 0} onChange={event => chooseDate(event.target.value)} /></label>
          <label className="adm-field">Society<select value={society} onChange={event => setSociety(event.target.value)}>
            <option value="">All societies</option>
            {societies.map(group => <option key={group.id} value={group.id}>{group.society}</option>)}
          </select></label>
          <label className="adm-field students-search">Find a student<input type="search" value={query} placeholder="Name or society" onChange={event => setQuery(event.target.value)} /></label>
        </div>
        <details className="students-session-tools" open={toolsOpen} onToggle={event => setToolsOpen(event.currentTarget.open)}>
          <summary>Attendance tools</summary>
          <div className="students-session-options">
            <div className="students-bulk-actions">
              <button type="button" className="students-button" disabled={Boolean(pendingIds.current.size) || !groups.some(group => group.children.some(canMark))}
                onClick={() => markStudents(groups.flatMap(group => group.children), 'present')}>Mark shown present</button>
              <button type="button" className="students-button" disabled={Boolean(pendingIds.current.size) || !groups.some(group => group.children.some(canMark))}
                onClick={() => markStudents(groups.flatMap(group => group.children), 'no_session')}>No session for shown</button>
              <ParentAttendanceAction key={date} auth={auth} scope={scope} date={date} disabled={Boolean(pendingIds.current.size) || !children.some(canEmail)} />
            </div>
            {scope === 'admin' && <AttendanceEmail auth={auth} date={date} hasChildren={children.length > 0} active={toolsOpen} />}
          </div>
        </details>
        {groups.map(group => <section className="students-society" key={group.id}>
          <h2>{group.society} <span>· {group.children.length} {group.children.length === 1 ? 'student' : 'students'}</span></h2>
          {group.children.length > 0 ? <ul>{group.children.map(child => {
            const linkId = `student-${child.registrationId}`;
            return <li className="students-row" key={child.registrationId}>
              <button type="button" id={linkId} className="students-name" onClick={() => openStudent(child.registrationId, linkId)}>
                <span><strong>{child.childName}</strong>{child.sport && <small>{child.sport}</small>}</span><span aria-hidden="true">›</span>
              </button>
              {actions(child)}
            </li>;
          })}</ul> : <p className="students-society-empty">No enrolled students.</p>}
        </section>)}
        {!groups.length && <div className="students-empty">
          {query.trim() ? 'No matching students.' : scope === 'coach' ? 'No students assigned yet.' : 'No confirmed students yet.'}
        </div>}
      </>}
    </>}
  </section>;
}

export default function StudentsWorkspace({ auth, scope = 'admin', headingRef, navigationRef, onOpenBilling }) {
  const [date, setDate] = React.useState(() => {
    const today = todayIST();
    if (typeof window === 'undefined') return today;
    const requested = new URLSearchParams(window.location.search).get('date');
    return validTrackerDate(requested) && requested >= oldestSessionDate(today) && requested <= today ? requested : today;
  });
  const tracker = useParentTracker(auth, { staff: true, date, scope, students: true });
  return <StudentsPanel auth={auth} scope={scope} date={date} onDateChange={setDate} tracker={tracker}
    headingRef={headingRef} navigationRef={navigationRef} onOpenBilling={onOpenBilling} />;
}
