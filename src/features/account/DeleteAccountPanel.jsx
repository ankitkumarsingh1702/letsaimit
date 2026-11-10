import * as React from "react";
import { accountDeletionErrorMessage } from "./accountDeletion.js";
import "./account-deletion.css";

export function AccountDeletionNotice({ status }) {
  if (!["deleted", "deleting"].includes(status)) return null;
  return <p className="account-delete-notice wrap" role="status">{status === "deleted" ? "Account deleted. You’re signed out." : "Account deletion is in progress. You’re signed out."}</p>;
}

export function DeleteAccountConfirmation({ auth, identity, onClose }) {
  const dialog = React.useRef(null);
  const cancel = React.useRef(null);
  const alive = React.useRef(false);
  const lock = React.useRef(false);
  const currentAuth = React.useRef(auth);
  currentAuth.current = auth;
  const [confirmed, setConfirmed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [result, setResult] = React.useState(null);
  const prefix = React.useId();
  const sameIdentity = auth.user?.isGoogle && auth.user.id === identity.id;
  React.useEffect(() => {
    alive.current = true;
    const opener = document.activeElement;
    dialog.current?.showModal();
    cancel.current?.focus();
    return () => {
      alive.current = false;
      dialog.current?.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  async function submit(event) {
    event.preventDefault();
    if (lock.current || !confirmed || !sameIdentity || result) return;
    if (currentAuth.current.user?.id !== identity.id || !currentAuth.current.user?.isGoogle) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const saved = await currentAuth.current.deleteAccount({ expectedUserId: identity.id, confirmPermanent: true, acceptForfeit: true });
      if (!alive.current || currentAuth.current.user?.id !== identity.id) return;
      if (saved?.ok !== true || !["deleted", "deleting"].includes(saved.status) || saved.deletedUserId !== identity.id) throw new Error("invalid_deletion_receipt");
      setResult(saved.status);
    } catch (cause) {
      if (alive.current && currentAuth.current.user?.id === identity.id) setError(accountDeletionErrorMessage(cause));
    } finally {
      lock.current = false;
      if (alive.current && currentAuth.current.user?.id === identity.id) setBusy(false);
    }
  }
  if (!sameIdentity) return null;
  return <dialog ref={dialog} className="account-delete-dialog" aria-labelledby={`${prefix}-title`} aria-describedby={result ? undefined : `${prefix}-scope`} onCancel={event => { event.preventDefault(); if (!lock.current) onClose(); }}>
    <h2 id={`${prefix}-title`}>Delete LetsAimIt account?</h2>
    <p className="account-delete-email">{identity.email}</p>
    {result ? <>
      <p role="status">{result === "deleted" ? "Account deleted." : "Account deletion is in progress. Account access is closed."}</p>
      <div className="account-delete-actions"><button type="button" className="account-delete-button" onClick={onClose}>Close</button></div>
    </> : <form onSubmit={submit}>
      <p id={`${prefix}-scope`}>Removes Parent, Admin and Coach access. Future billing stops. Payment records may be retained.</p>
      <label className="account-delete-consent"><input type="checkbox" checked={confirmed} required disabled={busy} onChange={event => { setConfirmed(event.target.checked); setError(""); }} /><span>I understand deletion is permanent and paid fees are not refunded.</span></label>
      {error && <p className="account-delete-error" role="alert">{error}</p>}
      <div className="account-delete-actions"><button ref={cancel} type="button" className="account-delete-button" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="account-delete-button account-delete-button-danger" disabled={busy || !confirmed}>{busy ? "Deleting…" : "Delete account"}</button></div>
    </form>}
  </dialog>;
}

export default function DeleteAccountPanel({ auth }) {
  const [identity, setIdentity] = React.useState(null);
  const currentId = auth.user?.isGoogle ? auth.user.id : null;
  React.useEffect(() => { setIdentity(null); }, [currentId]);
  if (!currentId || ["checking", "signing_in", "signing_out"].includes(auth.phase)) return null;
  return <section className="account-delete-panel" aria-label="Account settings">
    <div><h2>Account</h2><p>Manage your LetsAimIt account.</p></div>
    <button type="button" className="account-delete-button" onClick={() => setIdentity({ id: currentId, email: auth.user.email })}>Delete account</button>
    {identity?.id === currentId && <DeleteAccountConfirmation key={identity.id} auth={auth} identity={identity} onClose={() => setIdentity(null)} />}
  </section>;
}
