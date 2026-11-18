import * as React from 'react';
import { formatPracticeResult, practiceLabel, saveCoachingPractice } from './practiceData.js';
import { useCoachingPractice } from './useCoachingPractice.js';

const exercises = [
  ['warm_up', 'Warm-up'],
  ['strength', 'Strength'],
  ['sprint', 'Sprint'],
  ['push_ups', 'Push-ups'],
  ['body_balance', 'Body balance'],
];
const distances = [5, 10, 100];
const dateFormat = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium' });
const timeFormat = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', timeStyle: 'short' });

export function stopwatchText(milliseconds) {
  const centiseconds = Math.floor(milliseconds / 10);
  const minutes = Math.floor(centiseconds / 6000);
  const seconds = String(Math.floor(centiseconds / 100) % 60).padStart(2, '0');
  const fraction = String(centiseconds % 100).padStart(2, '0');
  return `${minutes}:${seconds}.${fraction}`;
}

function RunningClock({ startedAt }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    let frame;
    function draw(now) {
      const display = stopwatchText(Math.max(0, now - startedAt));
      if (ref.current && ref.current.textContent !== display) ref.current.textContent = display;
      frame = window.requestAnimationFrame(draw);
    }
    frame = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(frame);
  }, [startedAt]);
  return <span ref={ref}>0:00.00</span>;
}

export function PracticeControls({ navigationRef, onSave }) {
  const [exercise, setExercise] = React.useState('sprint');
  const [distance, setDistance] = React.useState(10);
  const [startedAt, setStartedAt] = React.useState(null);
  const [duration, setDuration] = React.useState(0);
  const [reps, setReps] = React.useState(0);
  const [saving, setSaving] = React.useState(false);
  const [notice, setNotice] = React.useState(null);
  const request = React.useRef(null);
  const inFlight = React.useRef(false);
  const running = startedAt !== null;
  const timed = exercise === 'sprint' || exercise === 'body_balance';
  const counting = exercise === 'push_ups';
  const dirty = running || duration > 0 || reps > 0 || Boolean(request.current);
  const label = exercises.find(([id]) => id === exercise)[1];

  function mayLeave() {
    return !inFlight.current && (!dirty || window.confirm('Discard this practice attempt?'));
  }
  React.useImperativeHandle(navigationRef, () => ({ mayLeave }));
  React.useEffect(() => {
    if (!dirty && !saving) return undefined;
    const onUnload = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty, saving]);

  function reset() {
    request.current = null;
    setStartedAt(null);
    setDuration(0);
    setReps(0);
    setNotice(null);
  }
  function choose(next) {
    if (next === exercise || !mayLeave()) return;
    reset();
    setExercise(next);
  }
  function start() {
    request.current = null;
    setNotice(null);
    setStartedAt(performance.now());
  }
  function stop() {
    if (startedAt === null) return;
    setDuration(Math.max(1, Math.round(performance.now() - startedAt)));
    setStartedAt(null);
  }
  function count(delta) {
    request.current = null;
    setNotice(null);
    setReps(total => Math.max(0, total + delta));
  }
  async function save() {
    if (inFlight.current || running || (timed && !duration) || (counting && !reps)) return;
    const attempt = request.current ?? {
      attemptId: crypto.randomUUID(),
      exercise,
      durationMs: timed ? duration : null,
      reps: counting ? reps : null,
      distanceMeters: exercise === 'sprint' ? distance : null,
    };
    request.current = attempt;
    inFlight.current = true;
    setSaving(true);
    setNotice(null);
    try {
      await onSave(attempt);
      reset();
      setNotice({ text: 'Saved' });
    } catch (error) {
      setNotice({ text: error.message || 'Couldn’t save. Try again.', error: true });
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return <section className="students-practice">
    <h2>Practice</h2>
    <div className="students-drills" role="group" aria-label="Exercise">
      {exercises.map(([id, title]) => (
        <button type="button" className="students-button students-drill" key={id} aria-pressed={exercise === id} onClick={() => choose(id)} disabled={saving}>
          {title}
        </button>
      ))}
    </div>
    <div className="students-exercise" role="group" aria-label={label}>
      {exercise === 'sprint' && <div className="students-distance" role="group" aria-label="Sprint distance">
        {distances.map(value => <button type="button" key={value} className="students-button" aria-pressed={distance === value} disabled={running || duration > 0 || saving} onClick={() => setDistance(value)}>{value} m</button>)}
      </div>}
      {timed && <div className="students-stopwatch" aria-label={running ? 'Timer running' : undefined}>
        {running ? <RunningClock startedAt={startedAt} /> : stopwatchText(duration)}
      </div>}
      {counting && <p className="students-reps" aria-live="polite"><strong>{reps}</strong> {reps === 1 ? 'rep' : 'reps'}</p>}
      <div className="students-exercise-actions">
        {counting && <>
          <button type="button" className="students-button" onClick={() => count(-1)} disabled={!reps || saving}>Undo</button>
          <button type="button" className="students-button students-primary" onClick={() => count(1)} disabled={saving || reps === 2_147_483_647}>+1 rep</button>
        </>}
        {timed && (running || !duration
          ? <button type="button" className="students-button students-primary" onClick={running ? stop : start}>{running ? 'Stop' : 'Start'}</button>
          : <button type="button" className="students-button" onClick={reset} disabled={saving}>Reset</button>)}
        {(!timed || duration > 0) && <button type="button" className={counting ? 'students-button' : 'students-button students-primary'} onClick={() => void save()} disabled={saving || (counting && !reps)}>
          {saving ? 'Saving…' : counting ? 'Save set' : 'Save'}
        </button>}
      </div>
      {notice && <p className={notice.error ? 'students-error' : 'students-saved'} role={notice.error ? 'alert' : 'status'}>{notice.text}</p>}
    </div>
  </section>;
}

function PracticeHistory({ history }) {
  const { attempts, loading, error, canOlder, canNewer, older, newer, refresh } = history;
  const groups = new Map();
  for (const attempt of attempts) {
    if (!groups.has(attempt.sessionDate)) groups.set(attempt.sessionDate, []);
    groups.get(attempt.sessionDate).push(attempt);
  }
  return <section className="students-history" aria-busy={loading}>
    <h2>Practice history</h2>
    {error && <div className="students-error" role="alert">{error} <button type="button" className="adm-text-button" onClick={refresh}>Try again</button></div>}
    {loading && !attempts.length && <p role="status">Loading…</p>}
    {!loading && !error && !attempts.length && <p>No practice saved yet.</p>}
    {Array.from(groups, ([date, rows]) => <div className="students-history-day" key={date}>
      <h3><time dateTime={date}>{dateFormat.format(new Date(`${date}T00:00:00+05:30`))} · IST</time></h3>
      <ul>{rows.map(attempt => <li key={attempt.id}>
        <time dateTime={attempt.recordedAt}>{timeFormat.format(new Date(attempt.recordedAt))}</time>
        <span>{practiceLabel(attempt)}</span>
        <strong>{formatPracticeResult(attempt)}</strong>
      </li>)}</ul>
    </div>)}
    {(canNewer || canOlder) && <div className="students-history-pages">
      <button type="button" className="students-button" disabled={loading || !canNewer} onClick={newer}>Newer</button>
      <button type="button" className="students-button" disabled={loading || !canOlder} onClick={older}>Older</button>
    </div>}
  </section>;
}

export default function StudentPractice({ auth, registrationId, scope, navigationRef }) {
  const history = useCoachingPractice(auth, { registrationId, scope });
  async function save(attempt) {
    await saveCoachingPractice({ ...attempt, registrationId, client: auth.client, userId: auth.user.id, verifyGoogleUser: auth.verifyGoogleUser });
    window.dispatchEvent(new Event('letsaimit:tracker-changed'));
    void history.refreshLatest();
  }
  return <>
    <PracticeControls navigationRef={navigationRef} onSave={save} />
    <PracticeHistory history={history} />
  </>;
}
