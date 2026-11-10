import * as React from "react";
import { BILLING_STATUS_LABELS, billingCsv, filterBillingInvoices, formatMoney, groupParentInvoices, setNextMonthlyFee, stopMonthlyBilling } from "./billingData.js";
import { captureMonthlyFeeBaseline, monthlyFeeBaselineChanged, monthlyFeeInput, parseMonthlyFeeInput } from "./fee-model.js";
import { useBilling } from "./useBilling.js";
import "./billing.css";

const date = value => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }).format(new Date(value)) : "—";
const month = value => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", month: "short", year: "numeric" }).format(new Date(value)) : "—";
const payable = invoice => ["pending", "overdue"].includes(invoice.status) && invoice.paymentUrl && invoice.paidPaise < invoice.amountPaise;

function InvoiceLink({ href, children, primary = false }) {
  return href ? <a className={`billing-button${primary ? " billing-button-primary" : ""}`} href={href} target="_blank" rel="noopener noreferrer">{children}<span className="billing-sr-only"> · opens Razorpay in a new tab</span></a> : null;
}

function BillingDialog({ title, onClose, children }) {
  const ref = React.useRef(null);
  const heading = React.useId();
  React.useEffect(() => {
    const opener = document.activeElement;
    ref.current?.showModal();
    return () => { ref.current?.close(); if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={ref} className="billing-dialog" aria-labelledby={heading} onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="billing-dialog-heading"><h2 id={heading}>{title}</h2><button className="billing-close" type="button" aria-label="Close billing details" onClick={onClose}>×</button></div>
    {children}
  </dialog>;
}

function InvoiceDetails({ invoice, admin, onClose, onOpenRequest }) {
  return <BillingDialog title={invoice.number} onClose={onClose}>
    <div className="billing-invoice-heading"><strong>{formatMoney(invoice.amountPaise)}</strong><span className="billing-status" data-status={invoice.status}>{BILLING_STATUS_LABELS[invoice.status]}</span></div>
    <dl className="billing-facts">
      <dt>Child</dt><dd>{invoice.childName || "—"}</dd>
      {admin && <><dt>Parent</dt><dd>{invoice.parentName || "—"}</dd><dt>Email</dt><dd>{invoice.parentEmail || "—"}</dd></>}
      <dt>Month</dt><dd>{month(invoice.periodStart)}</dd>
      <dt>Type</dt><dd>{invoice.kind === "late_fee" ? "Late fee" : "Monthly programme"}</dd>
      <dt>Community</dt><dd>{invoice.community || "—"}</dd>
      <dt>Sport</dt><dd>{invoice.sport || "—"}</dd>
      <dt>Due</dt><dd>{date(invoice.dueDate)} · IST</dd>
      <dt>Programme</dt><dd>{formatMoney(invoice.baseAmountPaise)}</dd>
      <dt>Late fee</dt><dd>{formatMoney(invoice.lateFeePaise)}</dd>
      {invoice.teamTesting && <><dt>Late fee preview</dt><dd>{formatMoney(invoice.lateFeePreviewPaise)} · not charged</dd></>}
      <dt>Paid</dt><dd>{formatMoney(invoice.paidPaise)}</dd>
      <dt>Refunded</dt><dd>{formatMoney(invoice.refundedPaise)}</dd>
      <dt>Paid on</dt><dd>{date(invoice.paidAt)}</dd>
    </dl>
    <div className="billing-dialog-actions">
      {payable(invoice) && <InvoiceLink href={invoice.paymentUrl} primary>Pay {formatMoney(invoice.amountPaise - invoice.paidPaise)}</InvoiceLink>}
      <InvoiceLink href={invoice.invoiceUrl}>View invoice</InvoiceLink>
      {admin && onOpenRequest && <button type="button" className="billing-button" onClick={() => { onClose(); onOpenRequest(invoice.registrationId); }}>View request</button>}
    </div>
    <p className="billing-note">Payment updates after Razorpay confirmation.</p>
  </BillingDialog>;
}

function EditMonthlyFee({ account, auth, onClose, onSaved }) {
  const [baseline, setBaseline] = React.useState(() => captureMonthlyFeeBaseline(account));
  const [fee, setFee] = React.useState(() => monthlyFeeInput(account.nextMonthAmountPaise));
  const [touched, setTouched] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const alive = React.useRef(true);
  const lock = React.useRef(false);
  const input = React.useRef(null);
  const prefix = React.useId();
  const changed = monthlyFeeBaselineChanged(baseline, account);
  let amountPaise = null;
  let validation = "";
  try { amountPaise = parseMonthlyFeeInput(fee); } catch (cause) { validation = cause.message; }
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function save(event) {
    event.preventDefault();
    if (lock.current) return;
    setTouched(true); setError("");
    if (validation || changed) { input.current?.focus(); return; }
    lock.current = true; setBusy(true);
    try {
      const saved = await setNextMonthlyFee({ client: auth.client, verifyGoogleUser: auth.verifyGoogleUser, checkAccess: auth.checkAccess, userId: auth.user.id, account: baseline, amountPaise });
      if (alive.current) onSaved(saved);
    } catch (cause) { if (alive.current) setError(cause.message || "Couldn’t save. Try again."); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  return <BillingDialog title="Next month’s fee" onClose={() => { if (!busy) onClose(); }}>
    <form onSubmit={save} noValidate>
      <p className="billing-dialog-copy">{account.childName || account.parentName || "Monthly coaching"}</p>
      <label className="billing-fee-field" htmlFor={`${prefix}-fee`}><span>Monthly fee · INR</span><div><span aria-hidden="true">₹</span><input ref={input} id={`${prefix}-fee`} inputMode="decimal" autoComplete="off" value={fee} maxLength={9} disabled={busy} aria-invalid={touched && validation ? true : undefined} aria-describedby={`${prefix}-hint${touched && validation ? ` ${prefix}-error` : ""}`} onBlur={() => setTouched(true)} onChange={event => { setFee(event.target.value); setTouched(true); setError(""); }} /></div></label>
      <p className="billing-note" id={`${prefix}-hint`}>From {month(baseline.nextEffectiveMonth)}. Existing invoices stay unchanged.</p>
      {touched && validation && <p className="billing-error" id={`${prefix}-error`} role="alert">{validation}</p>}
      {changed && <p className="billing-error" role="status">Fee changed. Your draft is kept.<button className="billing-text-button" type="button" disabled={busy} onClick={() => { setBaseline(captureMonthlyFeeBaseline(account)); setFee(monthlyFeeInput(account.nextMonthAmountPaise)); setTouched(false); setError(""); }}>Use latest fee</button></p>}
      {error && <p className="billing-error" role="alert">{error}</p>}
      <div className="billing-dialog-actions"><button type="button" className="billing-button" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="billing-button billing-button-primary" disabled={busy || changed || Boolean(validation) || amountPaise === baseline.nextMonthAmountPaise || baseline.status !== "active"}>{busy ? "Saving…" : amountPaise === null ? "Save fee" : `Save · ${formatMoney(amountPaise)}/month`}</button></div>
    </form>
  </BillingDialog>;
}

export function UpcomingMonth({ upcoming }) {
  if (!upcoming) return <p className="billing-note">Next month’s fees are unavailable.</p>;
  return <details className="billing-upcoming" open>
    <summary><strong>Next month · {month(upcoming.month)}</strong><span>{formatMoney(upcoming.totalPaise)}</span></summary>
    <div className="billing-table-scroll" role="region" aria-label="Next month’s coaching fees" tabIndex={0}><table className="billing-table billing-upcoming-table"><caption className="billing-sr-only">Planned coaching fees. Older unpaid invoices are separate.</caption><thead><tr><th scope="col">Child</th><th scope="col">Parent</th><th scope="col">Monthly fee</th></tr></thead><tbody>{upcoming.children.length ? upcoming.children.map(row => <tr key={row.registrationId}><td>{row.childName || "—"}</td><td>{row.parentName || "—"}</td><td className="billing-numeric">{formatMoney(row.monthlyFeePaise)}</td></tr>) : <tr><td colSpan={3} className="billing-empty">No active enrolments</td></tr>}</tbody><tfoot><tr><th scope="row" colSpan={2}>Next month total</th><td className="billing-numeric">{formatMoney(upcoming.totalPaise)}</td></tr></tfoot></table></div>
    <p className="billing-old-pending">Older unpaid invoices <span>{upcoming.oldPendingCount} · {formatMoney(upcoming.oldPendingPaise)}</span></p>
  </details>;
}

export function InvoiceRows({ invoices, admin, onSelect }) {
  const headers = ["Child", ...(admin ? ["Parent"] : []), "Month", "Fees", "Due", "Late fee", "Total", "Status", "Pay", "Invoice"];
  return <div className="billing-table-scroll" tabIndex={0} role="region" aria-label="Saved invoices, scroll for all columns"><table className={`billing-table${admin ? " billing-table-admin" : ""}`}><caption className="billing-sr-only">Monthly invoices. Indian rupees; dates in IST.</caption><thead><tr>{headers.map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>
    {invoices.map(invoice => <tr key={invoice.id}>
      <td><button className="billing-text-button billing-ellipsis" type="button" title={invoice.childName || invoice.number} onClick={() => onSelect(invoice.id)}>{invoice.childName || "Details"}</button></td>
      {admin && <td title={invoice.parentName}>{invoice.parentName || "—"}</td>}
      <td>{month(invoice.periodStart)}</td><td className="billing-numeric">{formatMoney(invoice.baseAmountPaise)}</td><td>{date(invoice.dueDate)}</td><td className="billing-numeric">{formatMoney(invoice.lateFeePaise)}</td><td className="billing-numeric">{formatMoney(invoice.amountPaise)}</td>
      <td><span className="billing-status" data-status={invoice.status}>{BILLING_STATUS_LABELS[invoice.status]}</span></td>
      <td>{payable(invoice) ? <InvoiceLink href={invoice.paymentUrl} primary>Pay {formatMoney(invoice.amountPaise - invoice.paidPaise)}</InvoiceLink> : "—"}</td>
      <td>{invoice.invoiceUrl ? <InvoiceLink href={invoice.invoiceUrl}>View invoice</InvoiceLink> : <button type="button" className="billing-text-button" onClick={() => onSelect(invoice.id)}>Details</button>}</td>
    </tr>)}
    {!invoices.length && <tr><td colSpan={headers.length} className="billing-empty">No invoices</td></tr>}
  </tbody></table></div>;
}

export function MonthDetails({ group, onClose }) {
  return <BillingDialog title={`${group.childName || "Coaching"} · ${month(group.periodStart)}`} onClose={onClose}>
    <dl className="billing-facts billing-month-totals"><dt>Fees</dt><dd>{formatMoney(group.feesPaise)}</dd><dt>Late fee</dt><dd>{formatMoney(group.lateFeePaise)}</dd><dt>Total</dt><dd>{formatMoney(group.totalPaise)}</dd><dt>Paid</dt><dd>{formatMoney(group.paidPaise)}</dd><dt>Pending</dt><dd>{formatMoney(group.pendingPaise)}</dd>{group.refundedPaise > 0 && <><dt>Refunded</dt><dd>{formatMoney(group.refundedPaise)}</dd></>}</dl>
    <div className="billing-month-items">{group.invoices.map(invoice => <div className="billing-month-item" key={invoice.id}>
      <div><strong>{invoice.kind === "late_fee" ? "Late fee" : "Monthly fee"} · {formatMoney(invoice.amountPaise)}</strong><span className="billing-status" data-status={invoice.status}>{BILLING_STATUS_LABELS[invoice.status]}</span></div>
      <p className="billing-note">{invoice.number} · Due {date(invoice.dueDate)}</p>
      <div className="billing-row-actions">{payable(invoice) && <InvoiceLink href={invoice.paymentUrl} primary>Pay {formatMoney(invoice.amountPaise - invoice.paidPaise)}</InvoiceLink>}<InvoiceLink href={invoice.invoiceUrl}>View invoice</InvoiceLink></div>
    </div>)}</div>
    <p className="billing-note">Each link pays its listed invoice. No automatic debit.</p>
  </BillingDialog>;
}

export function ParentMonthRows({ groups, onSelect }) {
  return <div className="billing-table-scroll" tabIndex={0} role="region" aria-label="Monthly coaching payments, scroll for all columns"><table className="billing-table billing-parent-table"><caption className="billing-sr-only">One row per child and month. Separate invoices retain their own payment links.</caption><thead><tr>{["Child", "Month", "Fees", "Due", "Late fee", "Total", "Status", "Pay", "Invoice"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{groups.map(group => {
    const payables = group.invoices.filter(payable);
    return <tr key={group.id}><td><button className="billing-text-button billing-ellipsis" type="button" title={group.childName} onClick={() => onSelect(group.id)}>{group.childName || "Details"}</button></td><td>{month(group.periodStart)}</td><td className="billing-numeric">{formatMoney(group.feesPaise)}</td><td>{date(group.dueDate)}</td><td className="billing-numeric">{formatMoney(group.lateFeePaise)}</td><td className="billing-numeric">{formatMoney(group.totalPaise)}</td><td><span className="billing-status" data-status={group.status}>{BILLING_STATUS_LABELS[group.status]}</span></td><td>{payables.length === 1 && group.pendingPaise === payables[0].amountPaise - payables[0].paidPaise ? <InvoiceLink href={payables[0].paymentUrl} primary>Pay {formatMoney(group.pendingPaise)}</InvoiceLink> : payables.length ? <button type="button" className="billing-button billing-button-primary" onClick={() => onSelect(group.id)}>View payments</button> : "—"}</td><td><button type="button" className="billing-text-button" onClick={() => onSelect(group.id)}>View</button></td></tr>;
  })}{!groups.length && <tr><td colSpan={9} className="billing-empty">No invoices</td></tr>}</tbody></table></div>;
}

function StopBilling({ account, auth, onClose, onSaved }) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const alive = React.useRef(true);
  const lock = React.useRef(false);
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function stop() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      await stopMonthlyBilling({ client: auth.client, verifyGoogleUser: auth.verifyGoogleUser, checkAccess: auth.checkAccess, userId: auth.user.id, account });
      if (alive.current) onSaved();
    } catch (cause) { if (alive.current) setError(cause.message || "Could not stop monthly billing. Please retry."); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  return <BillingDialog title="Stop monthly billing?" onClose={() => { if (!busy) onClose(); }}>
    <p className="billing-dialog-copy">{account.childName || account.parentName || "This enrolment"}</p>
    <p className="billing-note">Stops future invoices. Existing invoices stay payable.</p>
    {error && <p className="billing-error" role="alert">{error}</p>}
    <div className="billing-dialog-actions"><button className="billing-button" type="button" disabled={busy} onClick={onClose}>Keep billing</button><button className="billing-button billing-button-primary" type="button" disabled={busy} onClick={stop}>{busy ? "Saving…" : "Stop monthly billing"}</button></div>
  </BillingDialog>;
}

/** Invoice and revenue status comes only from a saved, ownership-checked snapshot. */
export default function BillingPanel({ auth, admin = false, onOpenRequest }) {
  const { snapshot, loading, error, lastSynced, refresh } = useBilling(auth, { admin });
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState(null);
  const [stopping, setStopping] = React.useState(null);
  const [editingFee, setEditingFee] = React.useState(null);
  const [selectedMonth, setSelectedMonth] = React.useState(null);
  const [exporting, setExporting] = React.useState(false);
  const [exportError, setExportError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const alive = React.useRef(true);
  const titleId = React.useId();
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const invoices = snapshot?.invoices || [];
  const filtered = React.useMemo(() => filterBillingInvoices(invoices, { query, status }), [invoices, query, status]);
  const parentGroups = React.useMemo(() => groupParentInvoices(invoices), [invoices]);
  const filteredGroups = React.useMemo(() => parentGroups.filter(group => (!status || group.status === status) && (!query.trim() || [group.childName, month(group.periodStart)].some(value => value.toLocaleLowerCase("en-IN").includes(query.trim().toLocaleLowerCase("en-IN"))))), [parentGroups, query, status]);
  const rawInvoiceRows = admin || snapshot?.hasMore === true;
  const listCount = rawInvoiceRows ? filtered.length : filteredGroups.length;
  const totalPages = Math.max(1, Math.ceil(listCount / 25));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * 25, currentPage * 25);
  const visibleGroups = filteredGroups.slice((currentPage - 1) * 25, currentPage * 25);
  const selectedInvoice = invoices.find(invoice => invoice.id === selected);
  const stopAccount = snapshot?.accounts.find(account => account.id === stopping);
  const editAccount = snapshot?.accounts.find(account => account.id === editingFee);
  const selectedGroup = parentGroups.find(group => group.id === selectedMonth);
  async function exportSaved() {
    if (!snapshot || !filtered.length || exporting) return;
    setExporting(true); setExportError("");
    try {
      const before = await auth.verifyGoogleUser();
      if (before?.id !== auth.user.id || !before?.isGoogle || !await auth.checkAccess() || !alive.current) throw new Error("Admin access is required.");
      const contents = billingCsv(filtered);
      const after = await auth.verifyGoogleUser();
      if (after?.id !== auth.user.id || !after?.isGoogle || !await auth.checkAccess() || !alive.current) return;
      const url = URL.createObjectURL(new Blob([contents], { type: "text/csv;charset=utf-8;" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `letsaimit-invoices-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(`${filtered.length} saved ${filtered.length === 1 ? "invoice" : "invoices"} exported.`);
    } catch (cause) { if (alive.current) setExportError(cause.message || "Could not export. Please retry."); }
    finally { if (alive.current) setExporting(false); }
  }
  const summary = snapshot?.summary;
  return <section className={`billing-panel${admin ? "" : " billing-parent"}`} aria-labelledby={titleId}>
    <div className="billing-heading"><h2 id={titleId}>Invoices</h2><span className="billing-sync" role="status">{lastSynced ? `Updated ${new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }).format(new Date(lastSynced))} IST` : loading ? "Loading…" : "Not synced"}</span></div>
    {snapshot && !snapshot.settings.enabled && <p className="billing-note">Payment setup pending.</p>}
    {error && <div className="billing-error" role="alert">{error}{snapshot && " Showing the last saved snapshot."}<button className="billing-text-button" type="button" onClick={refresh}>Retry</button></div>}
    {exportError && <p className="billing-error" role="alert">{exportError}</p>}
    {notice && <p className="billing-notice" role="status">{notice}</p>}
    {!snapshot ? <div className="billing-empty" role="status">{loading ? "Loading saved invoices…" : "Invoices are not loaded."}</div> : <>
      {admin && summary && <dl className="billing-metrics">
        <div><dt>Collected</dt><dd>{formatMoney(summary.capturedPaise)}</dd></div>
        <div><dt>Refunded</dt><dd>{formatMoney(summary.refundedPaise)}</dd></div>
        <div><dt>Outstanding</dt><dd>{formatMoney(summary.outstandingPaise)}</dd></div>
        <div><dt>Paid invoices</dt><dd>{summary.paidCount}</dd></div>
        <div><dt>Unpaid / overdue</dt><dd>{summary.pendingCount} / {summary.overdueCount}</dd></div>
      </dl>}
      {admin && summary && <p className="billing-note">All-time totals. Filters apply to rows.</p>}
      {admin && <UpcomingMonth upcoming={snapshot.upcomingMonth} />}
      {snapshot.hasMore && <p className="billing-note" role="status">{admin ? `Latest ${invoices.length.toLocaleString("en-IN")} invoices shown. CSV includes these rows; totals include all invoices.` : "Recent invoices shown individually. Monthly totals are unavailable."}</p>}
      <div className="billing-toolbar"><div className="billing-filters"><label><span className="billing-sr-only">Search invoices</span><input type="search" placeholder="Search invoices" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label><label><span className="billing-sr-only">Invoice status</span><select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">All invoices</option>{Object.entries(BILLING_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><div className="billing-actions"><button type="button" className="billing-button" disabled={loading} onClick={refresh}>{loading ? "Loading…" : "Refresh"}</button>{admin && <button type="button" className="billing-button" disabled={exporting || !filtered.length} onClick={exportSaved}>{exporting ? "Exporting…" : "Export CSV"}</button>}</div></div>
      <div className="billing-table-card">{rawInvoiceRows ? <InvoiceRows invoices={visible} admin={admin} onSelect={setSelected} /> : <ParentMonthRows groups={visibleGroups} onSelect={setSelectedMonth} />}<div className="billing-pagination"><span>{listCount} {rawInvoiceRows ? listCount === 1 ? "invoice" : "invoices" : listCount === 1 ? "row" : "rows"}</span><div><button type="button" className="billing-button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous</button><span>{currentPage} / {totalPages}</span><button type="button" className="billing-button" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>Next</button></div></div></div>
      {admin && snapshot.accounts.length > 0 && <details className="billing-accounts"><summary>Monthly fees · {snapshot.accounts.filter(account => account.status === "active").length} active</summary><div className="billing-table-scroll" tabIndex={0} role="region" aria-label="Monthly coaching fees"><table className="billing-table billing-accounts-table"><thead><tr><th scope="col">Child</th><th scope="col">Parent</th><th scope="col">Current fee</th><th scope="col">Next month</th><th scope="col">Effective</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead><tbody>{snapshot.accounts.map(account => <tr key={account.id}><td>{account.childName || "—"}</td><td>{account.parentName || "—"}</td><td className="billing-numeric">{formatMoney(account.monthlyAmountPaise)}</td><td className="billing-numeric">{formatMoney(account.nextMonthAmountPaise)}</td><td>{month(account.nextEffectiveMonth)}</td><td>{account.status === "active" ? "Active" : "Stopped"}</td><td>{account.status === "active" ? <div className="billing-row-actions">{account.pricingModel === "custom_quote" ? <button className="billing-text-button" type="button" onClick={() => setEditingFee(account.id)}>Edit fee</button> : <span className="billing-note">Legacy fee</span>}<button className="billing-text-button" type="button" onClick={() => setStopping(account.id)}>Stop billing</button></div> : "—"}</td></tr>)}</tbody></table></div></details>}
      <p className="billing-note">Payment updates after Razorpay confirmation. No automatic debit.</p>
    </>}
    {selectedInvoice && <InvoiceDetails key={selectedInvoice.id} invoice={selectedInvoice} admin={admin} onClose={() => setSelected(null)} onOpenRequest={onOpenRequest} />}
    {selectedGroup && !snapshot?.hasMore && <MonthDetails key={selectedGroup.id} group={selectedGroup} onClose={() => setSelectedMonth(null)} />}
    {stopAccount && <StopBilling key={stopAccount.id} account={stopAccount} auth={auth} onClose={() => setStopping(null)} onSaved={() => { setStopping(null); setNotice("Future monthly invoices stopped."); void refresh(); }} />}
    {editAccount && <EditMonthlyFee key={editAccount.id} account={editAccount} auth={auth} onClose={() => setEditingFee(null)} onSaved={saved => { setEditingFee(null); setNotice(`${formatMoney(saved.nextMonthAmountPaise)}/month from ${month(saved.nextEffectiveMonth)}. Existing invoices unchanged.`); void refresh(); }} />}
  </section>;
}
