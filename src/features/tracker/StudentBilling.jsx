import React from 'react';
import { BILLING_STATUS_LABELS, formatMoney, setNextMonthlyFee } from '../billing/billingData.js';
import { captureMonthlyFeeBaseline, monthlyFeeBaselineChanged, monthlyFeeInput } from '../billing/fee-model.js';
import { mayLeaveTrackerEditor } from './CoachingEditors.jsx';
import { adjustStudentPaymentInvoice, createStudentPaymentInvoice, MAX_ADJUSTMENT_REASON, MAX_INVOICE_DESCRIPTION, parseInvoiceAmount } from './studentBillingData.js';
import { todayIST } from './trackerData.js';
import './student-billing.css';

const istDate = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium' });
const istMonth = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', month: 'long', year: 'numeric' });
const istTime = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
function invoiceCaption(invoice) {
  if (invoice.kind === 'one_off') return invoice.description || 'One-time invoice';
  if (invoice.kind === 'late_fee') return 'Historical invoice';
  return istMonth.format(new Date(invoice.periodStart));
}
const activityTitles = {
  invoice_created: 'Invoice created', outstanding_adjusted: 'Outstanding adjusted', monthly_fee_changed: 'Monthly fee changed',
  payment_captured: 'Payment received', refund_recorded: 'Refund recorded',
};
const adjustmentTitles = {
  pending: 'Adjustment processing', applied: 'Outstanding adjusted', payment_received: 'Payment received before adjustment',
  failed: 'Adjustment needs attention', account_closed: 'Adjustment cancelled',
};

function DateValue({ value, format = istDate }) {
  return <time dateTime={value}>{format.format(new Date(value))}</time>;
}

function PaymentEditor({ editor, auth, registrationId, account, onSaved, onClose, onDraftState }) {
  const { mode, invoice, baseline } = editor;
  const create = mode === 'create';
  const retry = mode === 'retry';
  const adjust = mode === 'adjust' || retry;
  const expectedAmount = editor.event?.previousAmountPaise ?? invoice?.amountPaise;
  const initialAmount = create ? '' : monthlyFeeInput(editor.event?.amountPaise ?? invoice?.amountPaise ?? baseline?.nextMonthAmountPaise) || '0';
  const initialReason = editor.event?.reason ?? '';
  const [initialDate] = React.useState(todayIST);
  const [fields, setFields] = React.useState({ amount: initialAmount, dueDate: initialDate, description: '', reason: initialReason });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const formTitle = React.useRef(null);
  const requestId = React.useRef(editor.event?.id ?? null);
  const inFlight = React.useRef(false);
  const mounted = React.useRef(false);
  const uncertain = error?.code === 'request_uncertain';
  const feeChanged = baseline && (!account || monthlyFeeBaselineChanged(baseline, account));
  function hasChanges(values) {
    return values.amount !== initialAmount || values.dueDate !== initialDate || Boolean(values.description) || values.reason !== initialReason;
  }
  const dirty = hasChanges(fields) || uncertain;

  React.useEffect(() => {
    mounted.current = true;
    formTitle.current?.focus();
    return () => { mounted.current = false; onDraftState?.({ dirty: false, busy: false }); };
  }, [onDraftState]);

  function update(event) {
    const { name, value } = event.target;
    const next = { ...fields, [name]: value };
    setFields(next);
    setError(null);
    requestId.current = null;
    onDraftState?.({ dirty: hasChanges(next), busy: false });
  }

  async function submit(event) {
    event.preventDefault();
    if (inFlight.current || feeChanged) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    onDraftState?.({ dirty, busy: true });
    let saved = false;
    let requestUncertain = uncertain;
    try {
      const amountPaise = parseInvoiceAmount(fields.amount, { allowZero: adjust });
      const actor = { client: auth.client, userId: auth.user.id, verifyGoogleUser: auth.verifyGoogleUser, checkAccess: auth.checkAccess };
      let receipt;
      if (baseline) {
        if (amountPaise === baseline.nextMonthAmountPaise) throw new Error('Enter a different monthly fee.');
        await setNextMonthlyFee({ ...actor, account: baseline, amountPaise });
      } else {
        requestId.current ??= globalThis.crypto.randomUUID();
        const options = { ...actor, ...fields, registrationId, amountPaise, requestId: requestId.current };
        receipt = create ? await createStudentPaymentInvoice(options)
          : await adjustStudentPaymentInvoice({ ...options, invoiceId: editor.event?.invoiceId ?? invoice.id, expectedAmountPaise: expectedAmount });
      }
      saved = true;
      if (mounted.current) onSaved(receipt);
    } catch (cause) {
      requestUncertain ||= cause.code === 'request_uncertain';
      if (mounted.current) setError(requestUncertain ? { code: 'request_uncertain', message: cause.message } : cause);
    } finally {
      inFlight.current = false;
      if (mounted.current) {
        setBusy(false);
        onDraftState?.({ dirty: !saved && (dirty || requestUncertain), busy: false });
      }
    }
  }

  const disabled = busy || uncertain;
  const saveBlocked = busy || feeChanged || error?.code === 'conflict' || error?.code === 'access_denied' || !fields.amount.trim()
    || (adjust && !fields.reason.trim()) || (create && !fields.dueDate);
  const title = retry ? 'Retry adjustment' : create ? 'Create invoice' : adjust ? 'Adjust outstanding' : 'Change monthly fee';
  return <form className="student-billing-editor" onSubmit={submit}>
    <h3 ref={formTitle} tabIndex={-1}>{title}</h3>
    {baseline && <p>Applies from <DateValue value={baseline.nextEffectiveMonth} format={istMonth} />.</p>}
    {invoice && <p>{invoiceCaption(invoice)} · {formatMoney(invoice.amountPaise)} outstanding</p>}
    {!retry && <label>{adjust ? 'New outstanding amount (₹)' : 'Amount (₹)'}
      <input name="amount" inputMode="decimal" required maxLength={9} value={fields.amount} onChange={update} disabled={disabled} />
      {adjust && <small>Enter ₹0 to waive this invoice.</small>}
    </label>}
    {create && <>
      <label>Due date<input type="date" name="dueDate" min={todayIST()} value={fields.dueDate} onChange={update} required disabled={disabled} /></label>
      <label><span>Description <small>(optional)</small></span><input name="description" maxLength={MAX_INVOICE_DESCRIPTION} value={fields.description} onChange={update} disabled={disabled} /></label>
      <p>The registered parent is emailed when the payment link is ready.</p>
    </>}
    {adjust && !retry && <label>Reason<input name="reason" maxLength={MAX_ADJUSTMENT_REASON} value={fields.reason} onChange={update} required disabled={disabled} /></label>}
    {feeChanged && <p className="student-billing-error" role="alert">The monthly fee changed. Reopen this form to use the latest amount.</p>}
    {error && <p className="student-billing-error" role="alert">{error.message}</p>}
    <div className="student-billing-buttons">
      <button type="submit" className="students-button students-button-primary" disabled={saveBlocked}>
        {busy ? 'Saving…' : uncertain || retry ? 'Retry request' : create ? 'Create invoice' : adjust ? 'Save adjustment' : 'Save monthly fee'}
      </button>
      <button type="button" className="students-button" disabled={busy} onClick={() => {
        if (mayLeaveTrackerEditor({ dirty, busy }, () => window.confirm(uncertain ? 'Close this request? Check the refreshed invoices before creating another.' : 'Discard unsaved payment changes?'))) {
          onClose(uncertain || error?.code === 'conflict');
        }
      }}>Cancel</button>
    </div>
  </form>;
}

function InvoiceHistory({ invoices, editable, disabled, editor, onEdit, renderEditor, onRefresh }) {
  return <section className="student-billing-section" aria-label="Invoices">
    <header className="student-billing-section-heading"><h3>Invoices</h3>
      <button type="button" className="adm-text-button" disabled={disabled} onClick={onRefresh} aria-label="Refresh payments">Refresh</button>
    </header>
    {invoices.length === 0 ? <p>No invoices yet.</p> : <ul className="student-billing-list">
      {invoices.map(invoice => <li key={invoice.id} id={`student-invoice-${invoice.id}`}>
        <details>
          <summary>
            <span className="student-billing-list-title">
              <strong>{invoiceCaption(invoice)}</strong>
              <span>{invoice.paidAt ? <>Paid <DateValue value={invoice.paidAt} /></>
                : <>Due <DateValue value={invoice.dueAt} /></>}</span>
            </span>
            <span className="student-billing-invoice-total"><strong>{formatMoney(invoice.amountPaise)}</strong>
              <span className="student-billing-badge" data-status={invoice.adjustmentPending ? 'processing' : invoice.status}>
                {invoice.adjustmentPending ? 'Adjustment processing' : BILLING_STATUS_LABELS[invoice.status]}
              </span>
            </span>
          </summary>
          <div className="student-billing-invoice-details">
            <dl>
              {invoice.createdAt && <div><dt>Created</dt><dd><DateValue value={invoice.createdAt} /></dd></div>}
              {invoice.paidAt && <div><dt>Due date</dt><dd><DateValue value={invoice.dueAt} /></dd></div>}
              {invoice.paidPaise > 0 && <div><dt>Paid</dt><dd>{formatMoney(invoice.paidPaise)}</dd></div>}
              {invoice.refundedPaise > 0 && <div><dt>Refunded</dt><dd>{formatMoney(invoice.refundedPaise)}</dd></div>}
            </dl>
            {invoice.invoiceUrl && <a href={invoice.invoiceUrl} target="_blank" rel="noreferrer">View invoice</a>}
            {invoice.paymentUrl && invoice.paymentUrl !== invoice.invoiceUrl && ['pending', 'overdue'].includes(invoice.status)
              && <a href={invoice.paymentUrl} target="_blank" rel="noreferrer">Open payment link</a>}
            {editable && invoice.canAdjust && <button type="button" className="students-button" disabled={disabled}
              onClick={event => onEdit(event, { mode: 'adjust', invoice })}>Adjust outstanding</button>}
          </div>
        </details>
        {editor?.invoice?.id === invoice.id && renderEditor()}
      </li>)}
    </ul>}
  </section>;
}

function PaymentActivity({ events, invoices, adminEmail, editable, disabled, editor, onEdit, renderEditor }) {
  if (!events.length) return null;
  const invoicesById = new Map(invoices.map(invoice => [invoice.id, invoice]));
  return <section className="student-billing-section" aria-label="Payment activity">
    <h3>Payment activity</h3>
    <ol className="student-billing-activity">
      {events.map(event => {
        const invoice = invoicesById.get(event.invoiceId);
        const canRetry = editable && event.type === 'outstanding_adjusted' && event.status === 'failed'
          && event.actorEmail.toLowerCase() === adminEmail && event.invoiceId && event.reason
          && event.amountPaise != null && event.previousAmountPaise > 0;
        return <li key={event.id}>
          <div className="student-billing-list-title">
            <strong>{event.type === 'outstanding_adjusted' ? adjustmentTitles[event.status] : activityTitles[event.type]}</strong>
            {event.amountPaise != null && <span className="student-billing-activity-value">{event.previousAmountPaise != null && <>{formatMoney(event.previousAmountPaise)} → </>}{formatMoney(event.amountPaise)}</span>}
          </div>
          <p><DateValue value={event.occurredAt} format={istTime} /> IST{event.actorEmail && <> · {event.actorEmail}</>}</p>
          {event.effectiveMonth && <p>Effective <DateValue value={event.effectiveMonth} format={istMonth} /></p>}
          {invoice && event.type !== 'invoice_created' && <p>{invoiceCaption(invoice)}</p>}
          {event.reason && <p>{event.reason}</p>}
          {canRetry && <button type="button" className="students-button" disabled={disabled}
            onClick={click => onEdit(click, { mode: 'retry', event })}>Retry adjustment</button>}
          {editor?.event?.id === event.id && renderEditor()}
        </li>;
      })}
    </ol>
  </section>;
}

export function StudentBilling({ details, auth, onOpenBilling, onDraftState }) {
  const [editor, setEditor] = React.useState(null);
  const [notice, setNotice] = React.useState('');
  const action = React.useRef(null);
  const heading = React.useRef(null);
  const { profile, refresh, loading, error } = details;
  const billing = profile?.billing;
  const canEditFee = Boolean(auth && billing?.account?.status === 'active' && billing.account.pricingModel === 'custom_quote');
  const canManageInvoices = Boolean(auth && billing?.canManageInvoices);

  function openEditor(event, next) {
    action.current = event.currentTarget;
    setNotice('');
    setEditor(next);
  }

  function closeEditor(reload) {
    setEditor(null);
    if (reload) refresh();
    requestAnimationFrame(() => {
      const openedBy = action.current;
      if (openedBy?.isConnected && !openedBy.disabled) openedBy.focus();
      else heading.current?.focus();
    });
  }

  function onSaved(receipt) {
    if (editor.mode === 'fee') setNotice('Monthly fee saved.');
    else if (editor.mode === 'create') setNotice('Invoice saved. The payment link is being prepared.');
    else setNotice(adjustmentTitles[receipt.status] + '.');
    closeEditor(true);
  }

  const renderEditor = () => <PaymentEditor editor={editor} auth={auth} registrationId={profile.registrationId}
    account={billing.account} onSaved={onSaved} onClose={closeEditor} onDraftState={onDraftState} />;
  const controlsDisabled = Boolean(editor || loading);
  return <section className="student-billing" aria-label="Payments">
    <header className="student-billing-heading">
      <h2 ref={heading} tabIndex={-1}>Payments</h2>
      {profile && <a href="/admin/?view=billing" onClick={event => {
        if (!onOpenBilling || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        onOpenBilling();
      }}>Open Billing</a>}
    </header>
    {!profile ? <div className="student-billing-section">
      {error ? <><p role="alert">{error}</p><button type="button" className="students-button" onClick={refresh}>Try again</button></>
        : <p role="status">{loading ? 'Loading payments…' : 'Payment details are unavailable.'}</p>}
    </div> : !billing ? <div className="student-billing-section"><p>No billing account yet.</p></div> : <>
      <section className="student-billing-section student-billing-summary" aria-label="Balance and monthly fee">
        <h3>Outstanding</h3>
        <p className="student-billing-balance">{formatMoney(billing.outstandingPaise)}</p>
        {billing.nextDueAt && <p>Earliest due <DateValue value={billing.nextDueAt} /></p>}
        <p className="student-billing-fee">Monthly fee <strong>{formatMoney(billing.monthlyAmountPaise)}</strong></p>
        {billing.nextMonth ? <p>From <DateValue value={billing.nextMonth} format={istMonth} /> · <strong>{formatMoney(billing.nextMonthAmountPaise)}</strong></p>
          : <p>Monthly billing stopped.</p>}
        {(canManageInvoices || canEditFee) && <div className="student-billing-buttons">
          {canManageInvoices && <button type="button" className="students-button students-button-primary" disabled={controlsDisabled}
            onClick={event => openEditor(event, { mode: 'create' })}>Create invoice</button>}
          {canEditFee && <button type="button" className="students-button" disabled={controlsDisabled}
            onClick={event => openEditor(event, { mode: 'fee', baseline: captureMonthlyFeeBaseline(billing.account) })}>Change monthly fee</button>}
        </div>}
      </section>
      {notice && <p className="student-billing-notice" role="status">{notice}</p>}
      {editor && ['create', 'fee'].includes(editor.mode) && renderEditor()}
      <InvoiceHistory invoices={billing.invoices} editable={canManageInvoices} disabled={controlsDisabled} editor={editor}
        onEdit={openEditor} onRefresh={refresh} renderEditor={renderEditor} />
      <PaymentActivity events={billing.activity} invoices={billing.invoices} adminEmail={auth?.user?.email?.toLowerCase()}
        editable={canManageInvoices} disabled={controlsDisabled} editor={editor} onEdit={openEditor} renderEditor={renderEditor} />
    </>}
  </section>;
}
