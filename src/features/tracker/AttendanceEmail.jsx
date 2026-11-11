import React from 'react';
import { coachingEmailStatus, todayIST } from './trackerData.js';

export default function AttendanceEmail({ auth, enabled, date, hasChildren }) {
  const [status, setStatus] = React.useState(null);
  const [notice, setNotice] = React.useState('');
  const [error, setError] = React.useState('');
  const [readFailed, setReadFailed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const flight = React.useRef(false);
  const scope = React.useRef(0);
  const sendSequence = React.useRef(0);
  const { client, verifyGoogleUser, user: { id: userId } } = auth;
  const today = todayIST();
  const current = status?.sessionDate === today ? status : null;

  React.useEffect(() => {
    const generation = ++scope.current;
    setStatus(null); setNotice(''); setError(''); setReadFailed(false); setBusy(false);
    if (!enabled) return;
    let reading = false;
    async function refresh() {
      if (reading || flight.current || document.visibilityState === 'hidden') return;
      reading = true;
      const sequence = sendSequence.current;
      try {
        const next = await coachingEmailStatus({ client, userId, verifyGoogleUser });
        if (generation === scope.current && sequence === sendSequence.current) { setStatus(next); setReadFailed(false); }
      } catch {
        if (generation === scope.current && sequence === sendSequence.current) { setStatus(null); setReadFailed(true); }
      } finally { reading = false; }
    }
    void refresh();
    const interval = window.setInterval(refresh, 10000);
    window.addEventListener('focus', refresh);
    return () => { ++scope.current; window.clearInterval(interval); window.removeEventListener('focus', refresh); };
  }, [client, enabled, userId, verifyGoogleUser]);

  const canSend = enabled && current?.emailEnabled !== false && date === today && hasChildren;
  async function send() {
    if (!canSend || date !== todayIST() || flight.current) return;
    const generation = scope.current;
    ++sendSequence.current; flight.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const result = await coachingEmailStatus({ client, userId, verifyGoogleUser }, { send: true });
      if (generation !== scope.current) return;
      setStatus(result); setReadFailed(false);
      if (result.emailEnabled && !result.queued) {
        setNotice(result.pending || result.sent || result.failed ? 'No additional emails queued for today.' : 'No attendance email was queued.');
      }
    } catch (cause) {
      if (generation === scope.current) setError(cause.message);
    } finally {
      flight.current = false;
      if (generation === scope.current) setBusy(false);
    }
  }

  const paused = !enabled || current?.emailEnabled === false;
  return <section className="adm-card coaching-email-card" aria-labelledby="coaching-email-title">
    <div><h2 id="coaching-email-title">Attendance email</h2>
      <p>Today’s sheet · Approved admins · Daily at 9 PM IST</p>
      {paused ? <p>Email paused until Gmail sender setup is complete.</p> : date !== today ? <p>Select today to send.</p> : !hasChildren ? <p>No approved children to include.</p> : null}
      {!paused && <p role="status">{current ? `${current.pending} queued · ${current.sent} sent${current.failed ? ` · ${current.failed} failed` : ''}` : readFailed ? 'Email status unavailable.' : 'Checking email status…'}{notice && ` ${notice}`}</p>}
      {error && <p className="coaching-email-error" role="alert">{error}</p>}
    </div>
    <button type="button" className="adm-button adm-button-outline" onClick={send} disabled={!canSend || busy}>{busy ? 'Queuing…' : 'Send attendance email'}</button>
  </section>;
}
