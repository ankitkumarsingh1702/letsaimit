import * as React from 'react';
import { formatPracticeResult, MAX_SPRINT_DISTANCE, practiceLabel, saveCoachingPractice } from './practiceData.js';
import { useCoachingPractice } from './useCoachingPractice.js';
import './student-practice.css';

const distances = [10, 100, 500];
const maxResult = 2_147_483_647;
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

function useStopwatch() {
  const [startedAt, setStartedAt] = React.useState(null);
  const [duration, setDuration] = React.useState(0);
  return {
    startedAt,
    duration,
    running: startedAt !== null,
    start() {
      setStartedAt(performance.now());
    },
    stop() {
      if (startedAt === null) return;
      setDuration(Math.min(maxResult, Math.max(1, Math.round(performance.now() - startedAt))));
      setStartedAt(null);
    },
    reset() {
      setStartedAt(null);
      setDuration(0);
    },
  };
}

function usePracticeSaves(onSave) {
  const [saving, setSaving] = React.useState('');
  const [notices, setNotices] = React.useState({});
  const requests = React.useRef(new Map());
  const inFlight = React.useRef(false);

  function clear(exercise) {
    requests.current.delete(exercise);
    setNotices(current => current[exercise] ? { ...current, [exercise]: null } : current);
  }

  async function save(exercise, result, onSaved) {
    if (inFlight.current) return;
    const attempt = requests.current.get(exercise) ?? {
      attemptId: crypto.randomUUID(),
      exercise,
      durationMs: null,
      reps: null,
      distanceMeters: null,
      ...result,
    };
    requests.current.set(exercise, attempt);
    inFlight.current = true;
    setSaving(exercise);
    setNotices(current => ({ ...current, [exercise]: null }));
    try {
      await onSave(attempt);
      requests.current.delete(exercise);
      onSaved?.();
      setNotices(current => ({ ...current, [exercise]: { text: 'Saved' } }));
    } catch (error) {
      setNotices(current => ({
        ...current,
        [exercise]: { text: error?.message || 'Couldn’t save. Try again.', error: true },
      }));
    } finally {
      inFlight.current = false;
      setSaving('');
    }
  }
  return { saving, notices, clear, save, isBusy: () => inFlight.current, hasDrafts: requests.current.size > 0 };
}

function Notice({ notice }) {
  if (!notice) return null;
  return <p className={notice.error ? 'students-error' : 'students-saved'} role={notice.error ? 'alert' : 'status'}>{notice.text}</p>;
}

function TimedResult({ name, timer, duration, onStart, onReset, onSave, canStart = true, saving, busy, saveLabel }) {
  return <div className="practice-timing">
    <div className="practice-stopwatch" role="timer" aria-label={`${name} stopwatch`}>
      {timer.running ? <RunningClock startedAt={timer.startedAt} /> : stopwatchText(duration)}
    </div>
    <div className="practice-actions">
      {timer.running || !duration
        ? <button type="button" className="students-button students-primary" onClick={timer.running ? timer.stop : onStart} disabled={!timer.running && !canStart}>{timer.running ? 'Stop' : 'Start'}</button>
        : <>
          <button type="button" className="students-button" onClick={onReset} disabled={saving}>Reset</button>
          <button type="button" className="students-button students-primary" onClick={onSave} disabled={busy}>{saving ? 'Saving…' : saveLabel}</button>
        </>}
    </div>
  </div>;
}

function wholeNumber(value, maximum) {
  if (!/^\d+$/.test(value)) return null;
  const number = Number(value);
  return number <= maximum ? number : null;
}

function durationFromSeconds(value) {
  if (!/^(?:\d+(?:\.\d{0,3})?|\.\d{1,3})$/.test(value)) return null;
  const duration = Math.round(Number(value) * 1000);
  return duration > 0 && duration <= maxResult ? duration : null;
}

export function PracticeControls({ navigationRef, onSave }) {
  const sprint = useStopwatch();
  const balance = useStopwatch();
  const saves = usePracticeSaves(onSave);
  const [distanceChoice, setDistanceChoice] = React.useState(10);
  const [customDistance, setCustomDistance] = React.useState('');
  const [repsInput, setRepsInput] = React.useState('0');
  const [balanceSeconds, setBalanceSeconds] = React.useState('');
  const distance = distanceChoice === 'custom' ? wholeNumber(customDistance, MAX_SPRINT_DISTANCE) : distanceChoice;
  const reps = wholeNumber(repsInput, maxResult);
  const balanceDuration = balanceSeconds === '' ? balance.duration : durationFromSeconds(balanceSeconds);
  const dirty = sprint.running || balance.running || sprint.duration > 0 || balance.duration > 0
    || Boolean(balanceSeconds) || (repsInput !== '0' && repsInput !== '') || saves.hasDrafts;

  React.useImperativeHandle(navigationRef, () => ({
    mayLeave: () => !saves.isBusy() && (!dirty || window.confirm('Discard unsaved practice?')),
  }));
  React.useEffect(() => {
    if (!dirty && !saves.saving) return undefined;
    const onUnload = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty, saves.saving]);

  function setReps(value) {
    saves.clear('push_ups');
    setRepsInput(value);
  }
  function changeReps(delta) {
    saves.clear('push_ups');
    setRepsInput(current => String(Math.min(maxResult, Math.max(0, (wholeNumber(current, maxResult) ?? 0) + delta))));
  }
  function clearBalance() {
    balance.reset();
    setBalanceSeconds('');
  }

  const sprintId = React.useId();
  const pushupsId = React.useId();
  const balanceId = React.useId();
  const sprintLocked = sprint.running || Boolean(sprint.duration) || saves.saving === 'sprint';

  return <section className="students-practice practice-sections" aria-label="Practice">
    <h2 className="practice-title">Practice</h2>

    <section className="practice-card" aria-labelledby={sprintId}>
      <h3 id={sprintId}>Sprint</h3>
      <div className="practice-layout">
        <div className="practice-options">
          <fieldset className="practice-distance">
            <legend>Distance</legend>
            <div className="practice-presets">
              {distances.map(value => <button type="button" key={value} className="students-button" aria-pressed={distanceChoice === value} disabled={sprintLocked} onClick={() => setDistanceChoice(value)}>{value} m</button>)}
              <button type="button" className="students-button" aria-pressed={distanceChoice === 'custom'} disabled={sprintLocked} onClick={() => setDistanceChoice('custom')}>Custom</button>
            </div>
          </fieldset>
          {distanceChoice === 'custom' && <label className="practice-field">
            <span>Distance in metres</span>
            <input type="number" min="1" max={MAX_SPRINT_DISTANCE} step="1" inputMode="numeric" value={customDistance} onChange={event => setCustomDistance(event.target.value)} disabled={sprintLocked} aria-invalid={Boolean(customDistance) && !distance} />
          </label>}
        </div>
        <TimedResult name="Sprint" timer={sprint} duration={sprint.duration} canStart={Boolean(distance)}
          onStart={() => { saves.clear('sprint'); sprint.start(); }} onReset={() => { saves.clear('sprint'); sprint.reset(); }}
          onSave={() => void saves.save('sprint', { durationMs: sprint.duration, distanceMeters: distance }, sprint.reset)}
          saving={saves.saving === 'sprint'} busy={Boolean(saves.saving)} saveLabel="Save lap" />
      </div>
      <Notice notice={saves.notices.sprint} />
    </section>

    <section className="practice-card" aria-labelledby={pushupsId}>
      <h3 id={pushupsId}>Push-ups</h3>
      <div className="practice-layout">
        <div className="practice-rep-controls">
          <div className="practice-counter">
            <button type="button" className="students-button" aria-label="Remove 1 rep" onClick={() => changeReps(-1)} disabled={!reps || saves.saving === 'push_ups'}>−</button>
            <label className="practice-field">
              <span>Reps</span>
              <input type="number" min="0" max={maxResult} step="1" inputMode="numeric" value={repsInput} onChange={event => setReps(event.target.value)} disabled={saves.saving === 'push_ups'} aria-invalid={Boolean(repsInput) && reps === null} />
            </label>
            <button type="button" className="students-button" aria-label="Add 1 rep" onClick={() => changeReps(1)} disabled={reps === maxResult || saves.saving === 'push_ups'}>+</button>
          </div>
          <button type="button" className="students-button" onClick={() => changeReps(10)} disabled={reps === maxResult || saves.saving === 'push_ups'} aria-label="Add 10 reps">+10</button>
        </div>
        <div className="practice-actions practice-set-save">
          <button type="button" className="students-button students-primary" disabled={!reps || Boolean(saves.saving)} onClick={() => void saves.save('push_ups', { reps }, () => setRepsInput('0'))}>
            {saves.saving === 'push_ups' ? 'Saving…' : 'Save set'}
          </button>
        </div>
      </div>
      <Notice notice={saves.notices.push_ups} />
    </section>

    <section className="practice-card" aria-labelledby={balanceId}>
      <h3 id={balanceId}>Body balance</h3>
      <div className="practice-layout">
        <label className="practice-field">
          <span>Time in seconds</span>
          <input type="number" min="0.001" max={maxResult / 1000} step="0.001" inputMode="decimal"
            value={balanceSeconds || (balance.duration ? String(balance.duration / 1000) : '')}
            onChange={event => { saves.clear('body_balance'); balance.reset(); setBalanceSeconds(event.target.value); }}
            disabled={balance.running || saves.saving === 'body_balance'} aria-invalid={Boolean(balanceSeconds) && !balanceDuration} />
        </label>
        <TimedResult name="Body balance" timer={balance} duration={balanceDuration ?? 0}
          onStart={() => { saves.clear('body_balance'); setBalanceSeconds(''); balance.start(); }}
          onReset={() => { saves.clear('body_balance'); clearBalance(); }}
          onSave={() => void saves.save('body_balance', { durationMs: balanceDuration }, clearBalance)}
          saving={saves.saving === 'body_balance'} busy={Boolean(saves.saving)} saveLabel="Save time" />
      </div>
      <Notice notice={saves.notices.body_balance} />
    </section>

    <details className="practice-extras">
      <summary>Warm-up and strength</summary>
      <div className="practice-extra-actions">
        {[['warm_up', 'Log warm-up'], ['strength', 'Log strength']].map(([exercise, label]) => (
          <div key={exercise}>
            <button type="button" className="students-button" disabled={Boolean(saves.saving)} onClick={() => void saves.save(exercise)}>
              {saves.saving === exercise ? 'Saving…' : label}
            </button>
            <Notice notice={saves.notices[exercise]} />
          </div>
        ))}
      </div>
    </details>
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
