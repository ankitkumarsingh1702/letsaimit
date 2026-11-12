import * as React from "react";
import "./parent-tracker.css";

const attendanceLabels = { present: "Present", absent: "Absent", no_session: "No session", unmarked: "Not marked" };
const PAGE_SIZE = 10;
const calendarDate = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+05:30` : value;
const date = value => value && Number.isFinite(Date.parse(calendarDate(value))) ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }).format(new Date(calendarDate(value))) : "—";
const syncedTime = value => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : null;

function TrackerPagination({ count, page, onPage, label }) {
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  if (pages === 1) return null;
  return <div className="parent-tracker-pagination"><span>{count} records</span><div><button type="button" className="parent-dashboard-button" aria-label={`Previous ${label} page`} disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button><span>{page} / {pages}</span><button type="button" className="parent-dashboard-button" aria-label={`Next ${label} page`} disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button></div></div>;
}

function FeedbackDetails({ feedback, childName, onClose }) {
  const dialog = React.useRef(null);
  const title = React.useId();
  React.useEffect(() => {
    const opener = document.activeElement;
    dialog.current?.showModal();
    return () => { dialog.current?.close(); if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={dialog} className="parent-feedback-dialog" aria-labelledby={title} onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="parent-feedback-dialog-heading"><h2 id={title}>Weekly feedback</h2><button type="button" className="parent-dashboard-icon-button" aria-label="Close weekly feedback" onClick={onClose}>×</button></div>
    <dl className="parent-feedback-facts"><dt>Child</dt><dd>{childName || "—"}</dd><dt>Week of</dt><dd>{date(feedback.weekStart)}</dd><dt>Shared by</dt><dd>{feedback.coachName || "—"}</dd><dt>Shared</dt><dd>{date(feedback.publishedAt)}</dd></dl>
    <section><h3>Feedback</h3><p>{feedback.summary}</p></section>
    {feedback.nextStep && <section><h3>Next step</h3><p>{feedback.nextStep}</p></section>}
  </dialog>;
}

/** Parent-only saved snapshot. Ownership and identity checks belong to the data hook/RPC. */
export default function ParentTracker({ tracker }) {
  const { snapshot, loading, error, lastSynced, refresh } = tracker;
  const [child, setChild] = React.useState("");
  const [month, setMonth] = React.useState("");
  const [attendancePage, setAttendancePage] = React.useState(1);
  const [feedbackPage, setFeedbackPage] = React.useState(1);
  const [selectedFeedback, setSelectedFeedback] = React.useState(null);
  const children = snapshot?.children || [];
  const selectedChild = children.some(item => item.registrationId === child) ? child : "";
  const childById = new Map(children.map(item => [item.registrationId, item]));
  const attendance = (snapshot?.attendance || []).filter(item => (!selectedChild || item.registrationId === selectedChild) && (!month || item.sessionDate?.startsWith(month))).toSorted((a, b) => b.sessionDate.localeCompare(a.sessionDate) || a.id.localeCompare(b.id));
  const feedback = (snapshot?.feedback || []).filter(item => (!selectedChild || item.registrationId === selectedChild) && (!month || item.weekStart?.startsWith(month))).toSorted((a, b) => b.weekStart.localeCompare(a.weekStart) || a.id.localeCompare(b.id));
  const currentAttendancePage = Math.min(attendancePage, Math.max(1, Math.ceil(attendance.length / PAGE_SIZE)));
  const currentFeedbackPage = Math.min(feedbackPage, Math.max(1, Math.ceil(feedback.length / PAGE_SIZE)));
  const selected = feedback.find(item => item.id === selectedFeedback);
  const present = attendance.filter(item => item.status === "present").length;
  const absent = attendance.filter(item => item.status === "absent").length;
  const updated = syncedTime(lastSynced);
  function changeFilter(setter, value) { setter(value); setAttendancePage(1); setFeedbackPage(1); setSelectedFeedback(null); }
  return <section className="parent-tracker" aria-label="Attendance and feedback" aria-busy={loading}>
    {error && <div className="parent-tracker-error" role="alert">
      <span>{error}{snapshot ? " Showing the last saved tracker." : ""}</span>
      <button type="button" className="parent-dashboard-text-button" onClick={refresh} disabled={loading}>Try again</button>
    </div>}
    {loading && !snapshot && <div className="parent-tracker-empty" role="status">Loading your tracker…</div>}
    {snapshot && !children.length && <div className="parent-tracker-empty">
      <h2>Attendance and feedback</h2>
      <p>Tracking starts after your child’s registration is approved.</p>
    </div>}
    {snapshot && children.length > 0 && <>
      <div className="parent-tracker-toolbar">
        <div className="parent-tracker-filters">
          {children.length > 1 && <label><span>Child</span><select value={selectedChild} onChange={event => changeFilter(setChild, event.target.value)}>
            <option value="">All children</option>{children.map(item => <option key={item.registrationId} value={item.registrationId}>{item.childName || "Child"}</option>)}
          </select></label>}
          <label><span>Month</span><input type="month" value={month} onChange={event => changeFilter(setMonth, event.target.value)} /></label>
          {month && <button type="button" className="parent-dashboard-text-button" onClick={() => changeFilter(setMonth, "")}>All dates</button>}
        </div>
        <div className="parent-tracker-sync">
          {updated && <span>Updated {updated} IST</span>}
          <button type="button" className="parent-dashboard-button" onClick={refresh} disabled={loading}>Refresh</button>
        </div>
      </div>
      {snapshot.range && <p className="parent-tracker-range">Attendance · {date(snapshot.range.from)} – {date(snapshot.range.to)}<span>Feedback since {date(snapshot.range.feedbackFrom)}</span></p>}
      <dl className="parent-tracker-counts">
        <div><dt>Present</dt><dd>{present}</dd></div>
        <div><dt>Absent</dt><dd>{absent}</dd></div>
        <div><dt>Attendance</dt><dd>{present + absent ? `${Math.round(present / (present + absent) * 100)}%` : "—"}</dd></div>
      </dl>
      <section className="parent-tracker-card" aria-labelledby="parent-attendance-heading">
        <div className="parent-tracker-card-heading"><h2 id="parent-attendance-heading">Attendance</h2></div>
        <div className="parent-tracker-scroll" tabIndex={0} role="region" aria-label="Attendance records">
          <table className="parent-tracker-table parent-attendance-table">
            <caption className="parent-dashboard-sr-only">Saved attendance. An unmarked session is not counted as an absence.</caption>
            <thead><tr><th scope="col">Date</th><th scope="col">Child</th><th scope="col">Attendance</th><th scope="col">Sport</th><th scope="col">Community</th><th scope="col">Marked by</th></tr></thead>
            <tbody>{attendance.length ? attendance.slice((currentAttendancePage - 1) * PAGE_SIZE, currentAttendancePage * PAGE_SIZE).map(item => {
              const pupil = childById.get(item.registrationId);
              return <tr key={item.id}>
                <td><time dateTime={item.sessionDate}>{date(item.sessionDate)}</time></td>
                <td title={pupil?.childName}>{pupil?.childName || "—"}</td>
                <td><span className="parent-attendance-status" data-status={item.status}>{attendanceLabels[item.status] || "Not marked"}</span></td>
                <td>{pupil?.sport || "—"}</td><td title={pupil?.community}>{pupil?.community || "—"}</td><td title={item.coachName || undefined}>{item.coachName || "—"}</td>
              </tr>;
            }) : <tr><td className="parent-tracker-empty-cell" colSpan={6}>{selectedChild || month ? "No attendance for this filter." : "No attendance recorded yet."}</td></tr>}</tbody>
          </table>
        </div>
        <TrackerPagination count={attendance.length} page={currentAttendancePage} onPage={setAttendancePage} label="attendance" />
      </section>
      <section className="parent-tracker-card" aria-labelledby="parent-feedback-heading">
        <div className="parent-tracker-card-heading"><h2 id="parent-feedback-heading">Weekly feedback</h2></div>
        <div className="parent-tracker-scroll" tabIndex={0} role="region" aria-label="Weekly feedback">
          <table className="parent-tracker-table parent-feedback-table">
            <thead><tr><th scope="col">Week of</th><th scope="col">Child</th><th scope="col">Feedback</th><th scope="col">Shared by</th><th scope="col">Shared</th><th scope="col"><span className="parent-dashboard-sr-only">Details</span></th></tr></thead>
            <tbody>{feedback.length ? feedback.slice((currentFeedbackPage - 1) * PAGE_SIZE, currentFeedbackPage * PAGE_SIZE).map(item => {
              const name = childById.get(item.registrationId)?.childName;
              return <tr key={item.id}>
                <td><time dateTime={item.weekStart}>{date(item.weekStart)}</time></td>
                <td title={name}>{name || "—"}</td><td title={item.summary}>{item.summary}</td>
                <td title={item.coachName || undefined}>{item.coachName || "—"}</td><td><time dateTime={item.publishedAt}>{date(item.publishedAt)}</time></td>
                <td><button type="button" className="parent-dashboard-text-button" aria-label={`View feedback for ${name || "child"}, week of ${date(item.weekStart)}`} onClick={() => setSelectedFeedback(item.id)}>View</button></td>
              </tr>;
            }) : <tr><td className="parent-tracker-empty-cell" colSpan={6}>{selectedChild || month ? "No feedback for this filter." : "No weekly feedback shared yet."}</td></tr>}</tbody>
          </table>
        </div>
        <TrackerPagination count={feedback.length} page={currentFeedbackPage} onPage={setFeedbackPage} label="feedback" />
      </section>
    </>}
    {selected && <FeedbackDetails feedback={selected} childName={childById.get(selected.registrationId)?.childName} onClose={() => setSelectedFeedback(null)} />}
  </section>;
}
