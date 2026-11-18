import React from 'react';
import { rpcError, verifyActor } from './trackerData.js';

export default function ParentAttendanceAction({ auth, scope, date, registrationId = null, disabled }) {
  const [notice, setNotice] = React.useState('');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const sending = React.useRef(false);
  const label = registrationId ? 'Email parent' : 'Email parents';

  async function send() {
    if (sending.current || disabled) return;
    sending.current = true;
    setBusy(true);
    setNotice('');
    setError('');
    const actor = { userId: auth.user.id, verifyGoogleUser: auth.verifyGoogleUser };
    try {
      await verifyActor(actor);
      const { data, error } = await auth.client.rpc('queue_students_attendance_email', {
        p_session_date: date, p_scope: scope, p_registration_id: registrationId,
      });
      if (error?.code === 'PT409') throw new Error('Parent attendance email is turned off.');
      if (error) throw rpcError(error, 'Couldn’t queue attendance email. Try again.');
      await verifyActor(actor);
      const { queued, alreadyQueued, eligible } = data ?? {};
      if (![queued, alreadyQueued, eligible].every(count => Number.isSafeInteger(count) && count >= 0)
          || queued + alreadyQueued > eligible) throw new Error('Couldn’t confirm the email request.');
      if (queued) setNotice(queued === 1 ? '1 email queued.' : `${queued} emails queued.`);
      else if (alreadyQueued) setNotice('Attendance emails already requested.');
      else setNotice('No saved attendance to email.');
    } catch (cause) {
      setError(cause.message);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return <div className="students-email-action">
    <button type="button" className="students-button" disabled={busy || disabled} onClick={send}>
      {busy ? 'Queuing…' : label}
    </button>
    {notice && <p role="status">{notice}</p>}
    {error && <p className="students-error" role="alert">{error}</p>}
  </div>;
}
