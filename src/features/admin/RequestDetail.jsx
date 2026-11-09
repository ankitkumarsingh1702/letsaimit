import * as React from "react";
import { ADMIN_NOTE_LIMIT, formatAge } from "./admin-model.js";
import "./request-detail.css";

const STATUS_OPTIONS = [
  ["new", "New"],
  ["contacted", "Contacted"],
  ["confirmed", "Confirmed"],
  ["closed", "Closed"],
];

function followUpOf(row) {
  return {
    status: row?.status || "new",
    assignee: row?.assignee || "",
    adminNotes: row?.adminNotes || "",
  };
}

function draftOf(row) {
  if (!row) return null;
  const values = followUpOf(row);
  return {
    id: row.id,
    revision: row.revision,
    baseline: values,
    values: { ...values },
  };
}

function isDirty(edit) {
  return Boolean(
    edit &&
      ["status", "assignee", "adminNotes"].some(
        (key) => edit.values[key] !== edit.baseline[key],
      ),
  );
}

function displayTime(value) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "Not recorded";
  return `${new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value))} IST`;
}

function errorMessage(error) {
  const message = typeof error === "string" ? error : error?.message;
  const code = typeof error === "object" ? error?.code : "";
  if (/conflict|revision|changed/i.test(`${code || ""} ${message || ""}`)) {
    return "This request changed. Your draft is still here.";
  }
  return message || "Could not save. Your draft is still here. Try again.";
}

function safeContactLink(kind, value) {
  if (typeof value !== "string") return null;
  if (kind === "call") return /^tel:\+?[\d ()-]+$/.test(value) ? value : null;
  if (kind === "email") {
    return /^mailto:[^\s?]+@[^\s?]+$/.test(value) ? value : null;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      ["wa.me", "api.whatsapp.com", "web.whatsapp.com"].includes(url.hostname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function DrawerIcon({ name }) {
  const paths = {
    close: <path d="m6 6 12 12M18 6 6 18" />,
    call: (
      <path d="m7 3 3 5-2.2 2.2a15 15 0 0 0 6 6L16 14l5 3v3a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1Z" />
    ),
    email: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="m4 7 8 6 8-6" />
      </>
    ),
    whatsapp: (
      <>
        <path d="M21 11.5a9 9 0 0 1-13.4 7.9L3 21l1.6-4.6A9 9 0 1 1 21 11.5Z" />
        <path d="m9 7 1.5 2-1 1a8 8 0 0 0 3.5 3.5l1-1 2 1.5c-.3 1.5-1.4 2-2.8 1.5A10.4 10.4 0 0 1 8 10.3C7.5 8.8 7.8 7.6 9 7Z" />
      </>
    ),
    chevron: <path d="m8 10 4 4 4-4" />,
    check: <path d="m5 12 4 4L19 6" />,
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  );
}

function Fact({ label, children, wide = false }) {
  return (
    <div className={`adm-detail-fact${wide ? " adm-detail-fact--wide" : ""}`}>
      <dt>{label}</dt>
      <dd>{children || "Not provided"}</dd>
    </div>
  );
}

/**
 * A local draft editor for one saved request. onSave must acknowledge a saved
 * row; failed saves never replace the draft or advance its expected revision.
 */
export default function RequestDetail({
  row,
  open,
  onClose,
  onSave,
  assignees = [],
  canEdit = true,
  onDraftChange,
}) {
  const dialogRef = React.useRef(null);
  const titleRef = React.useRef(null);
  const keepEditingRef = React.useRef(null);
  const previousFocusRef = React.useRef(null);
  const editingFocusRef = React.useRef(null);
  const outsidePointerRef = React.useRef(false);
  const saveSequenceRef = React.useRef(0);
  const savingRef = React.useRef(false);
  const onDraftChangeRef = React.useRef(onDraftChange);
  onDraftChangeRef.current = onDraftChange;

  const [edit, setEdit] = React.useState(() => draftOf(row));
  const [phase, setPhase] = React.useState("idle");
  const [error, setError] = React.useState("");
  const [savedMessage, setSavedMessage] = React.useState("");
  const [conflictLatest, setConflictLatest] = React.useState(null);
  const [confirmDiscard, setConfirmDiscard] = React.useState(false);
  const prefix = React.useId();
  const titleId = `${prefix}-title`;
  const formId = `${prefix}-follow-up`;
  const showing = Boolean(open && row);
  const currentEdit = edit?.id === row?.id ? edit : draftOf(row);
  const dirty = isDirty(currentEdit);
  const saving = phase === "saving";

  React.useEffect(() => {
    saveSequenceRef.current += 1;
    if (!open || !row) return;
    setEdit(draftOf(row));
    setPhase("idle");
    setError("");
    setSavedMessage("");
    setConfirmDiscard(false);
    setConflictLatest(null);
    // Same-row updates are handled separately to preserve an unsaved draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row?.id]);

  React.useEffect(() => {
    if (!open || !row || saving) return;
    setEdit((previous) => {
      if (
        previous?.id === row.id &&
        !isDirty(previous) &&
        row.revision > previous.revision
      ) {
        return draftOf(row);
      }
      return previous;
    });
  }, [open, row, saving]);

  React.useEffect(() => {
    if (!open || !edit || edit.id !== row?.id) return;
    onDraftChangeRef.current?.(edit.id, {
      state: saving ? "saving" : error ? "error" : isDirty(edit) ? "dirty" : "clean",
      draft: { ...edit.values },
      expectedRevision: edit.revision,
      error: error || null,
    });
  }, [open, edit, saving, error, row?.id]);

  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (!showing || !dialog) return;
    previousFocusRef.current = document.activeElement;
    document.body.classList.add("adm-detail-open");
    if (!dialog.open) dialog.showModal();
    const focusFrame = window.requestAnimationFrame(() => {
      titleRef.current?.focus({ preventScroll: true });
    });
    return () => {
      window.cancelAnimationFrame(focusFrame);
      saveSequenceRef.current += 1;
      if (dialog.open) dialog.close();
      document.body.classList.remove("adm-detail-open");
      if (previousFocusRef.current?.isConnected) {
        previousFocusRef.current.focus({ preventScroll: true });
      }
    };
  }, [showing]);

  React.useEffect(() => {
    if (confirmDiscard) keepEditingRef.current?.focus({ preventScroll: true });
  }, [confirmDiscard]);

  function changeField(key, value) {
    setEdit((previous) => {
      const draft = previous?.id === row?.id ? previous : draftOf(row);
      return { ...draft, values: { ...draft.values, [key]: value } };
    });
    setError("");
    setSavedMessage("");
    setConfirmDiscard(false);
  }

  function requestClose() {
    if (saving) return;
    if (dirty) {
      if (!confirmDiscard) editingFocusRef.current = document.activeElement;
      setConfirmDiscard(true);
      return;
    }
    onClose?.();
  }

  function keepEditing() {
    setConfirmDiscard(false);
    if (editingFocusRef.current?.isConnected) {
      editingFocusRef.current.focus({ preventScroll: true });
    }
  }

  function discardAndClose() {
    const savedDraft = draftOf(row);
    setEdit(savedDraft);
    setError("");
    setConfirmDiscard(false);
    onDraftChangeRef.current?.(row.id, {
      state: "clean",
      draft: { ...savedDraft.values },
      expectedRevision: savedDraft.revision,
      error: null,
    });
    onClose?.();
  }

  async function saveFollowUp(event) {
    event.preventDefault();
    if (!canEdit || savingRef.current || saving || !dirty || !currentEdit || !onSave) return;
    savingRef.current = true;
    const requestSequence = ++saveSequenceRef.current;
    const submittedDraft = { ...currentEdit.values };
    setPhase("saving");
    setError("");
    setSavedMessage("");
    try {
      const result = await onSave(row.id, submittedDraft, currentEdit.revision);
      if (saveSequenceRef.current !== requestSequence) return;
      if (result?.ok && result.row?.id === row.id) {
        setEdit(draftOf(result.row));
        setSavedMessage("Changes saved.");
        setConflictLatest(null);
        setConfirmDiscard(false);
      } else {
        setError(errorMessage(result?.error));
        if (result?.code === "conflict" && result.latest) setConflictLatest(result.latest);
      }
    } catch (saveError) {
      if (saveSequenceRef.current === requestSequence) {
        setError(errorMessage(saveError));
      }
    } finally {
      savingRef.current = false;
      if (saveSequenceRef.current === requestSequence) setPhase("idle");
    }
  }

  const assigneeOptions = [{ value: "", label: "Unassigned" }];
  const seenAssignees = new Set([""]);
  const candidateAssignees = [...assignees, currentEdit?.values.assignee || ""];
  candidateAssignees.forEach((candidate) => {
    const value =
      typeof candidate === "string"
        ? candidate
        : candidate?.value || candidate?.displayName || candidate?.name || candidate?.email;
    if (!value || seenAssignees.has(value)) return;
    seenAssignees.add(value);
    assigneeOptions.push({
      value,
      label: typeof candidate === "string" ? candidate : candidate.label || value,
    });
  });

  function pointerIsOutside(event) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    );
  }

  return (
    <dialog
      ref={dialogRef}
      className="adm-drawer"
      aria-labelledby={titleId}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        if (confirmDiscard) keepEditing();
        else requestClose();
      }}
      onPointerDown={(event) => {
        outsidePointerRef.current =
          event.target === event.currentTarget && pointerIsOutside(event);
      }}
      onClick={(event) => {
        if (
          event.target === event.currentTarget &&
          outsidePointerRef.current &&
          pointerIsOutside(event)
        ) {
          requestClose();
        }
        outsidePointerRef.current = false;
      }}
    >
      {row && currentEdit && (
        <>
          <header className="adm-detail-header">
            <div>
              <div className="adm-detail-eyebrow">
                <span>{row.formType === "enrol" ? "Enrolment request" : "Trial request"}</span>
              </div>
              <h2 ref={titleRef} id={titleId} tabIndex={-1}>
                {row.parentName}
              </h2>
              <p className="adm-detail-submitted">{displayTime(row.submittedAt)}</p>
            </div>
            <button
              type="button"
              className="adm-detail-close"
              aria-label="Close request"
              onClick={requestClose}
              disabled={saving}
            >
              <DrawerIcon name="close" />
            </button>
          </header>

          <div className="adm-detail-body">
            <section className="adm-detail-section" aria-label="Request details">
              <dl className="adm-detail-facts">
                <Fact label="Child">{row.childName}</Fact>
                <Fact label="Age">{formatAge(row.age)}</Fact>
                <Fact label="Sport">{row.sport}</Fact>
                <Fact label="Community">{row.community}</Fact>
              </dl>

              <div className="adm-detail-contact">
                <div className="adm-detail-contact-values">
                  <span>{row.phone || "No phone provided"}</span>
                  <span>{row.email || "No email provided"}</span>
                </div>
                <div className="adm-detail-contact-actions" >
                  {[
                    ["call", "Call"],
                    ["email", "Email"],
                    ["whatsapp", "WhatsApp"],
                  ].map(([kind, label]) => {
                    const href = safeContactLink(kind, row.links?.[kind]);
                    return href ? (
                      <a
                        key={kind}
                        className="adm-detail-contact-button"
                        href={href}
                        target={kind === "whatsapp" ? "_blank" : undefined}
                        rel={kind === "whatsapp" ? "noopener noreferrer" : undefined}
                      >
                        <DrawerIcon name={kind} />
                        {label}
                      </a>
                    ) : (
                      <button key={kind} type="button" className="adm-detail-contact-button" disabled>
                        <DrawerIcon name={kind} />
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {row.parentNote && (
                <div className="adm-detail-parent-note">
                  <h3>Parent note</h3>
                  <p>{row.parentNote}</p>
                </div>
              )}
            </section>

            <section className="adm-detail-section adm-detail-follow-up" aria-labelledby={`${prefix}-follow-up-title`}>
              <div className="adm-detail-section-heading">
                <h3 id={`${prefix}-follow-up-title`}>Follow-up</h3>
                <span className="adm-detail-edit-state">
                  {!canEdit ? "View only" : saving ? "Saving…" : dirty ? "Unsaved" : "Saved"}
                </span>
              </div>
              <form id={formId} onSubmit={saveFollowUp}>
                <fieldset disabled={!canEdit || saving}>
                  <div className="adm-detail-fields">
                    <label htmlFor={`${prefix}-status`}>
                      Status
                      <select
                        id={`${prefix}-status`}
                        value={currentEdit.values.status}
                        onChange={(event) => changeField("status", event.target.value)}
                      >
                        {STATUS_OPTIONS.map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </label>
                    <label htmlFor={`${prefix}-assignee`}>
                      Assigned to
                      <select
                        id={`${prefix}-assignee`}
                        value={currentEdit.values.assignee}
                        onChange={(event) => changeField("assignee", event.target.value)}
                      >
                        {assigneeOptions.map(({ value, label }) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="adm-detail-note-label" htmlFor={`${prefix}-notes`}>
                    Team note
                    <textarea
                      id={`${prefix}-notes`}
                      value={currentEdit.values.adminNotes}
                      rows={3}
                      maxLength={ADMIN_NOTE_LIMIT}
                      placeholder="Add a note…"
                      onChange={(event) => changeField("adminNotes", event.target.value)}
                    />
                  </label>
                </fieldset>
              </form>
            </section>

            <details className="adm-detail-more">
              <summary>
                More details
                <DrawerIcon name="chevron" />
              </summary>
              <dl className="adm-detail-facts adm-detail-audit">
                <Fact label="Guardian consent">{row.consent?.guardianConsent ? "Given" : "Not given"}</Fact>
                <Fact label="Terms accepted">{row.consent?.termsAccepted ? "Yes" : "No"}</Fact>
                <Fact label="Consent version">{row.consent?.consentVersion}</Fact>
                <Fact label="Terms version">{row.consent?.termsVersion || "Not recorded"}</Fact>
                <Fact label="Address" wide>{row.address}</Fact>
                <Fact label="Last saved" wide>{displayTime(row.updatedAt)}</Fact>
                <Fact label="Saved by">{row.updatedBy || "Not recorded"}</Fact>
                <Fact label="Revision">{String(row.revision ?? "—")}</Fact>
                <Fact label="Submission ID" wide>{row.submissionId}</Fact>
              </dl>
            </details>
          </div>

          <footer className="adm-detail-footer">
            {confirmDiscard ? (
              <div className="adm-detail-discard" role="alert">
                <p>Discard changes?</p>
                <div className="adm-detail-footer-actions">
                  <button ref={keepEditingRef} type="button" className="adm-detail-button adm-detail-button--primary" onClick={keepEditing}>
                    Keep editing
                  </button>
                  <button type="button" className="adm-detail-button adm-detail-button--quiet" onClick={discardAndClose}>
                    Discard
                  </button>
                </div>
              </div>
            ) : (
              <>
                {error && <p className="adm-detail-error" role="alert">{error}</p>}
                {conflictLatest && <section className="adm-detail-conflict" aria-label="Review another team edit">
                  <p><strong>Latest saved</strong> · {displayTime(conflictLatest.updatedAt)}</p>
                  <dl><dt>Status</dt><dd>{conflictLatest.status}</dd><dt>Assigned to</dt><dd>{conflictLatest.assignee || "Unassigned"}</dd><dt>Team note</dt><dd>{conflictLatest.adminNotes || "No note"}</dd></dl>
                  <p>Your fields above still hold your draft. Review both before saving.</p>
                  <div className="adm-detail-footer-actions">
                    <button type="button" className="adm-detail-button adm-detail-button--quiet" onClick={() => { setEdit(draftOf(conflictLatest)); setConflictLatest(null); setError(""); }}>Use latest saved</button>
                    <button type="button" className="adm-detail-button adm-detail-button--primary" onClick={() => { setEdit(previous => ({ ...previous, revision: conflictLatest.revision, baseline: followUpOf(conflictLatest) })); setConflictLatest(null); setError(""); setSavedMessage("Draft kept. Review your changes, then save."); }}>Keep my draft for review</button>
                  </div>
                </section>}
                <div className="adm-detail-save-message" role="status" aria-live="polite">
                  {savedMessage && <DrawerIcon name="check" />}
                  <span>
                    {saving
                      ? "Saving changes…"
                      : savedMessage || (dirty ? "Unsaved changes" : "Saved request")}
                  </span>
                </div>
                <div className="adm-detail-footer-actions">
                  <button type="button" className="adm-detail-button adm-detail-button--quiet" onClick={requestClose} disabled={saving}>
                    {dirty ? "Cancel" : "Close"}
                  </button>
                  {canEdit && (
                    <button
                      type="submit"
                      form={formId}
                      className="adm-detail-button adm-detail-button--primary"
                      disabled={!dirty || saving || !onSave || Boolean(conflictLatest)}
                      aria-busy={saving}
                    >
                      {saving ? "Saving…" : "Save changes"}
                    </button>
                  )}
                </div>
              </>
            )}
          </footer>
        </>
      )}
    </dialog>
  );
}
