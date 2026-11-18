import * as React from 'react';
import { ATTENDANCE_LABELS, saveAttendance, todayIST, validTrackerDate } from './trackerData.js';
import { useParentTracker } from './useParentTracker.js';
import StudentPractice from './StudentPractice.jsx';
import './students.css';

const none = [];
const attendanceChoices = ['present', 'absent'];
const sortNames = new Intl.Collator('en-IN', { sensitivity: 'base', numeric: true });
const sessionDate = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium' });
const societyName = child => child.community.trim().replace(/\s+/g, ' ') || 'Society not set';

export function groupStudents(children, query = '') {
  const groups = new Map();
  const search = query.trim().toLowerCase();
  for (const child of children) {
    const society = societyName(child);
    if (search && ![child.childName, society, child.sport].some(value => value.toLowerCase().includes(search))) continue;
    const id = society.toLowerCase();
    if (!groups.has(id)) groups.set(id, { id, society, children: [] });
    groups.get(id).children.push(child);
  }
  return Array.from(groups.values(), group => ({
    ...group,
    children: group.children.sort((a, b) => sortNames.compare(a.childName, b.childName)),
  })).sort((a, b) => sortNames.compare(a.society, b.society));
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

export function StudentsPanel({ auth, scope, date, onDateChange, tracker, headingRef, navigationRef }) {
  const [studentId, selectStudent] = React.useState('');
  const [query, setQuery] = React.useState('');
  const [confirmed, setConfirmed] = React.useState({});
  const [pending, setPending] = React.useState({});
  const [errors, setErrors] = React.useState({});
  const pendingIds = React.useRef(new Set());
  const practiceNavigation = React.useRef(null);
  const openedBy = React.useRef(null);
  const profileHeading = React.useRef(null);
  const mounted = React.useRef(false);
  const search = React.useDeferredValue(query);
  const children = tracker.snapshot?.children ?? none;
  const attendance = tracker.snapshot?.attendance ?? none;
  const groups = React.useMemo(() => groupStudents(children, search), [children, search]);
  const saved = React.useMemo(() => new Map(attendance.map(row => [row.registrationId, row])), [attendance]);
  const selected = children.find(child => child.registrationId === studentId);
  const today = todayIST();
  const firstDate = new Date(Date.parse(`${today}T00:00:00Z`) - 364 * 86_400_000).toISOString().slice(0, 10);
  React.useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  React.useEffect(() => { if (selected) profileHeading.current?.focus(); }, [selected?.registrationId]);
  React.useImperativeHandle(navigationRef, () => ({
    mayLeave: () => !pendingIds.current.size && practiceNavigation.current?.mayLeave() !== false,
  }));

  function recordFor(id) {
    const local = confirmed[id];
    const row = saved.get(id);
    return local?.sessionDate === date && (!row || row.revision < local.revision) ? local : row;
  }
  async function mark(id, status) {
    const existing = recordFor(id);
    if (pendingIds.current.has(id) || existing?.status === status) return;
    pendingIds.current.add(id);
    setPending(previous => ({ ...previous, [id]: status }));
    setErrors(previous => ({ ...previous, [id]: '' }));
    try {
      const [record] = await saveAttendance({
        client: auth.client, userId: auth.user.id, verifyGoogleUser: auth.verifyGoogleUser,
        date, rows: [{ registrationId: id, status, revision: existing?.revision ?? 0 }],
      });
      if (mounted.current) setConfirmed(previous => ({ ...previous, [id]: record }));
      window.dispatchEvent(new Event('letsaimit:tracker-changed'));
    } catch (error) {
      if (mounted.current) {
        setErrors(previous => ({ ...previous, [id]: error.code === 'conflict' ? 'Attendance changed. Choose again.' : error.message }));
        void tracker.refresh();
      }
    } finally {
      pendingIds.current.delete(id);
      if (mounted.current) setPending(previous => {
        const next = { ...previous };
        delete next[id];
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
    if (practiceNavigation.current?.mayLeave() === false) return;
    selectStudent('');
    window.requestAnimationFrame(() => {
      const button = document.getElementById(openedBy.current);
      button?.focus();
    });
  }
  function actions(child, showUnmarked) {
    return <AttendanceActions child={child} record={recordFor(child.registrationId)}
      pending={pending[child.registrationId]} message={errors[child.registrationId]}
      disabled={scope === 'coach' && Boolean(child.startsOn && date < child.startsOn)} onMark={mark} showUnmarked={showUnmarked} />;
  }

  return <section className="students-workspace" aria-busy={tracker.loading}>
    {selected ? <div className="students-profile">
      <button type="button" className="students-back" onClick={closeStudent}>← Students</button>
      <header className="students-profile-header">
        <h1 ref={profileHeading} tabIndex={-1}>{selected.childName}</h1>
        <p>{[societyName(selected), selected.sport].filter(Boolean).join(' · ')}</p>
      </header>
      <section className="students-profile-attendance">
        <div><h2>Attendance</h2><time dateTime={date}>{sessionDate.format(new Date(`${date}T00:00:00+05:30`))} · IST</time></div>
        {actions(selected, true)}
      </section>
      <StudentPractice key={selected.registrationId} auth={auth} registrationId={selected.registrationId} scope={scope} navigationRef={practiceNavigation} />
    </div> : <>
      <div className="adm-page-heading"><h1 ref={headingRef} tabIndex={-1}>Students</h1></div>
      {tracker.error && <div className="students-error" role="alert">{tracker.error} <button type="button" className="adm-text-button" onClick={tracker.refresh}>Try again</button></div>}
      {tracker.loading && !tracker.snapshot && <p className="students-empty" role="status">Loading students…</p>}
      {tracker.snapshot && <>
        <div className="students-toolbar">
          <label className="adm-field">Session date · IST<input type="date" min={firstDate} max={today} value={date} disabled={Object.keys(pending).length > 0} onChange={event => chooseDate(event.target.value)} /></label>
          {children.length > 0 && <label className="adm-field">Find a student<input type="search" value={query} placeholder="Name or society" onChange={event => setQuery(event.target.value)} /></label>}
        </div>
        {groups.map(group => <section className="students-society" key={group.id}>
          <h2>{group.society} <span>· {group.children.length} {group.children.length === 1 ? 'student' : 'students'}</span></h2>
          <ul>{group.children.map(child => {
            const linkId = `student-${child.registrationId}`;
            return <li className="students-row" key={child.registrationId}>
              <button type="button" id={linkId} className="students-name" onClick={() => openStudent(child.registrationId, linkId)}>
                <span><strong>{child.childName}</strong>{child.sport && <small>{child.sport}</small>}</span><span aria-hidden="true">›</span>
              </button>
              {actions(child)}
            </li>;
          })}</ul>
        </section>)}
        {!groups.length && <div className="students-empty">
          {query.trim() ? 'No matching students.' : scope === 'coach' ? 'No students assigned yet.' : 'No confirmed students yet.'}
        </div>}
      </>}
    </>}
  </section>;
}

export default function StudentsWorkspace({ auth, headingRef, navigationRef }) {
  const [date, setDate] = React.useState(todayIST);
  const tracker = useParentTracker(auth, { staff: true, date, scope: 'admin', students: true });
  return <StudentsPanel auth={auth} scope="admin" date={date} onDateChange={setDate} tracker={tracker}
    headingRef={headingRef} navigationRef={navigationRef} />;
}
