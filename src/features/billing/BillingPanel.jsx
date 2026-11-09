import * as React from "react";
import { BILLING_STATUS_LABELS, billingCsv, filterBillingInvoices, formatMoney, stopMonthlyBilling } from "./billingData.js";
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
    <p className="billing-note">Razorpay confirms payment. Returning here alone does not mark an invoice paid.</p>
  </BillingDialog>;
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
  const [exporting, setExporting] = React.useState(false);
  const [exportError, setExportError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const alive = React.useRef(true);
  const titleId = React.useId();
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const invoices = snapshot?.invoices || [];
  const filtered = React.useMemo(() => filterBillingInvoices(invoices, { query, status }), [invoices, query, status]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / 25));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * 25, currentPage * 25);
  const selectedInvoice = invoices.find(invoice => invoice.id === selected);
  const stopAccount = snapshot?.accounts.find(account => account.id === stopping);
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
    <div className="billing-heading"><div><h2 id={titleId}>{admin ? "Monthly payments" : "My invoices"}</h2><p>First invoice due in four days. Later months: pay by the 5th.</p></div><span className="billing-sync" role="status">{lastSynced ? `Updated ${new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }).format(new Date(lastSynced))} IST` : loading ? "Loading…" : "Not synced"}</span></div>
    {snapshot && (!snapshot.settings.enabled ? <p className="billing-test-note">Payment setup pending. New enrolments are not billed.</p> : snapshot.settings.teamTesting ? <p className="billing-test-note"><strong>Team payment · {formatMoney(snapshot.settings.chargeAmountPaise)}</strong><span>Regular monthly price: {formatMoney(snapshot.settings.regularAmountPaise)}. No automatic debit.</span></p> : null)}
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
      {snapshot.hasMore && <p className="billing-note" role="status">Latest {invoices.length.toLocaleString("en-IN")} invoices shown. CSV includes these rows. Totals include all invoices.</p>}
      <div className="billing-toolbar"><div className="billing-filters"><label><span className="billing-sr-only">Search invoices</span><input type="search" placeholder="Search invoices" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label><label><span className="billing-sr-only">Invoice status</span><select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">All invoices</option>{Object.entries(BILLING_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><div className="billing-actions"><button type="button" className="billing-button" disabled={loading} onClick={refresh}>{loading ? "Loading…" : "Refresh"}</button>{admin && <button type="button" className="billing-button" disabled={exporting || !filtered.length} onClick={exportSaved}>{exporting ? "Exporting…" : "Export CSV"}</button>}</div></div>
      <div className="billing-table-card"><div className="billing-table-scroll" tabIndex={0} role="region" aria-label="Saved invoices, scroll for all columns"><table className={`billing-table${admin ? " billing-table-admin" : ""}`}><caption className="billing-sr-only">Saved monthly invoices. Amounts are in Indian rupees. Dates are in India Standard Time.</caption><thead><tr><th scope="col">Invoice</th>{admin && <th scope="col">Parent</th>}<th scope="col">Child</th><th scope="col">Month</th><th scope="col">Due</th><th scope="col">Amount</th><th scope="col">Status</th><th scope="col">Paid</th><th scope="col">Actions</th></tr></thead><tbody>
        {visible.map(invoice => <tr key={invoice.id}><td><button className="billing-text-button billing-ellipsis" type="button" title={invoice.number} onClick={() => setSelected(invoice.id)}>{invoice.number}</button></td>{admin && <td title={invoice.parentName}>{invoice.parentName || "—"}</td>}<td title={invoice.childName}>{invoice.childName || "—"}</td><td>{month(invoice.periodStart)}</td><td>{date(invoice.dueDate)}</td><td className="billing-numeric">{formatMoney(invoice.amountPaise)}</td><td><span className="billing-status" data-status={invoice.status}>{BILLING_STATUS_LABELS[invoice.status]}</span></td><td className="billing-numeric">{formatMoney(invoice.paidPaise)}</td><td><div className="billing-row-actions"><button type="button" className="billing-text-button" onClick={() => setSelected(invoice.id)}>Details</button>{!admin && payable(invoice) && <InvoiceLink href={invoice.paymentUrl}>Pay {formatMoney(invoice.amountPaise - invoice.paidPaise)}</InvoiceLink>}</div></td></tr>)}
        {!visible.length && <tr><td colSpan={admin ? 9 : 8} className="billing-empty">{invoices.length ? "No matching invoices." : "No invoices yet. Free trials have no charge."}</td></tr>}
      </tbody></table></div><div className="billing-pagination"><span>{filtered.length} of {invoices.length} saved invoices</span><div><button type="button" className="billing-button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous</button><span>{currentPage} / {totalPages}</span><button type="button" className="billing-button" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>Next</button></div></div></div>
      {admin && snapshot.accounts.length > 0 && <details className="billing-accounts"><summary>Monthly billing · {snapshot.accounts.filter(account => account.status === "active").length} active</summary><div className="billing-table-scroll" tabIndex={0} role="region" aria-label="Monthly billing accounts"><table className="billing-table billing-accounts-table"><thead><tr><th scope="col">Parent</th><th scope="col">Child</th><th scope="col">Status</th><th scope="col">Started</th><th scope="col">Action</th></tr></thead><tbody>{snapshot.accounts.map(account => <tr key={account.id}><td>{account.parentName || "—"}</td><td>{account.childName || "—"}</td><td>{account.status === "active" ? "Active" : "Stopped"}</td><td>{date(account.createdAt)}</td><td>{account.status === "active" ? <button className="billing-text-button" type="button" onClick={() => setStopping(account.id)}>Stop monthly billing</button> : "—"}</td></tr>)}</tbody></table></div></details>}
      <p className="billing-note">Payments update after Razorpay verification. {snapshot.settings.teamTesting ? "Late fees are a preview during team testing." : !snapshot.settings.lateFeesEnabled || snapshot.settings.lateFeePolicy === "disabled" || snapshot.settings.lateFeePolicy === "pending" ? "Late fees are not enabled." : `${formatMoney(snapshot.settings.lateFeePaise || 0)} late fee ${snapshot.settings.lateFeePolicy === "daily" ? "per overdue day" : "per unpaid month"} after the due date.`}</p>
    </>}
    {selectedInvoice && <InvoiceDetails key={selectedInvoice.id} invoice={selectedInvoice} admin={admin} onClose={() => setSelected(null)} onOpenRequest={onOpenRequest} />}
    {stopAccount && <StopBilling key={stopAccount.id} account={stopAccount} auth={auth} onClose={() => setStopping(null)} onSaved={() => { setStopping(null); setNotice("Future monthly invoices stopped."); void refresh(); }} />}
  </section>;
}
