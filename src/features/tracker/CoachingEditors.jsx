import React from 'react';
import { saveWeeklyFeedback, saveCoachAssignment, todayIST } from './trackerData.js';
import './staff-tracker.css';

const weekdays = [1, 2, 3, 4, 5, 6, 7];
const mutationOptions = auth => ({ client: auth.client, userId: auth.user.id, verifyGoogleUser: auth.verifyGoogleUser, checkAccess: auth.checkAccess });
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
    <label>Weekly update<textarea aria-label="Weekly update" required maxLength={1500} rows={3} value={draft.summary} onChange={event => changeDraft({ summary: event.target.value })} disabled={busy} /></label>
    <label>Next step<textarea aria-label="Next step" maxLength={500} rows={2} value={draft.nextStep} onChange={event => changeDraft({ nextStep: event.target.value })} disabled={busy} /></label>
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
  return <form className="coaching-editor" onSubmit={submit}><h2>Coach assignment</h2>
    <label>Coach Google email<input type="email" maxLength={254} value={draft.email} onChange={event => changeDraft({ email: event.target.value })} disabled={busy} /></label>
    <label>Starts on<input type="date" required value={draft.startsOn} onChange={event => changeDraft({ startsOn: event.target.value })} disabled={busy} /></label>
    {dirty && <p className="coaching-draft">Unsaved changes</p>}
    <p>Leave the email empty to remove coach access.</p>{error && <p className="coaching-error" role="alert">{error}</p>}
    <div className="coaching-actions"><button className="adm-button adm-button-dark" disabled={busy}>{busy ? 'Saving…' : 'Save coach'}</button><button type="button" className="adm-button adm-button-outline" disabled={busy} onClick={loadLatest}>Load latest</button></div>
  </form>;
}
