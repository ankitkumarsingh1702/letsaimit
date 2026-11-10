import { safeRazorpayUrl } from "./razorpay-billing.js";

const escape = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
function text(value, max = 80) { if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) throw new TypeError("Invalid billing email."); return value.trim(); }
function amount(value) { if (!Number.isSafeInteger(value) || value < 0) throw new TypeError("Invalid billing amount."); return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: value % 100 ? 2 : 0 }).format(value / 100); }
function date(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?$/.test(value)) throw new TypeError("Invalid billing date.");
  const calendar = value.slice(0, 10), day = new Date(`${calendar}T00:00:00Z`);
  const instant = value.length === 10 ? day : new Date(value);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== calendar || !Number.isFinite(instant.getTime())) throw new TypeError("Invalid billing date.");
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }).format(instant);
}
const titles = { send_invoice: "Monthly fee", send_reminder: "Payment reminder", send_receipt: "Payment received", send_refund: "Refund update" };

function month(value) {
  date(value);
  if (!/^\d{4}-\d{2}-01$/.test(value)) throw new TypeError("Invalid billing month.");
  return new Intl.DateTimeFormat("en-IN", {timeZone:"Asia/Kolkata",month:"long",year:"numeric"}).format(new Date(`${value}T12:00:00Z`));
}
function origin(value) {
  if (!["https://uat.letsaimit.com", "https://letsaimit.com"].includes(value)) throw new TypeError("Invalid billing origin.");
  return value;
}
function render({title,intro,rows,links,notes=[],detailHtml="",detailText=[]}) {
  const htmlRows=rows.map(([label,value])=>`<tr><th scope="row" style="padding:8px 0;text-align:left;font-weight:400;color:#60736c;border-bottom:1px solid #e4e9e6">${escape(label)}</th><td style="padding:8px 0 8px 16px;border-bottom:1px solid #e4e9e6">${escape(value)}</td></tr>`).join("");
  return {
    subject:`LetsAimIt: ${title}`,
    text:["LetsAimIt",title,"",...intro,"",...rows.map(([label,value])=>`${label}: ${value}`),...detailText,...notes.flatMap(note=>["",note]),"",...links.map(([label,url])=>`${label}: ${url}`)].join("\n"),
    html:`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title></head><body style="margin:0;padding:24px 12px;background:#f5f7f5;color:#143e35;font-family:Arial,Helvetica,sans-serif"><main style="max-width:640px;margin:0 auto;padding:24px;background:#fff;border:1px solid #e4e9e6;border-radius:8px"><p style="margin:0 0 20px;font-size:14px;font-weight:700">LetsAimIt</p><h1 style="margin:0 0 16px;font-size:21px">${escape(title)}</h1><p style="font-size:14px;line-height:1.6">${intro.map(escape).join("<br>")}</p><table style="width:100%;border-collapse:collapse;font-size:14px">${htmlRows}</table>${detailHtml}${notes.map(note=>`<p style="font-size:12px;color:#60736c;line-height:1.6">${escape(note)}</p>`).join("")}<div style="margin-top:20px">${links.map(([label,url],index)=>`<a href="${escape(url)}" style="display:inline-block;margin:0 8px 8px 0;padding:9px 14px;border:1px solid #143e35;border-radius:5px;text-decoration:none;font-size:13px;color:${index===0?"#fff":"#143e35"};background:${index===0?"#143e35":"#fff"}">${escape(label)}</a>`).join("")}</div></main></body></html>`,
  };
}

export function buildFeeChangeEmail({invoice,dashboardOrigin}={}) {
  if (!invoice||invoice.currency!=="INR"||!Number.isSafeInteger(invoice.amount_paise)||invoice.amount_paise<100) throw new TypeError("Invalid fee change.");
  const parent=text(invoice.parent_name),child=text(invoice.child_name);
  month(invoice.effective_month);
  return render({title:"Monthly fee updated",intro:[`Hi ${parent},`,"Your child's fee changes next month."],rows:[["Child",child],["From",date(invoice.effective_month)],["Monthly fee",amount(invoice.amount_paise)]],links:[["Your payments",`${origin(dashboardOrigin)}/parent/`]]});
}

/** Summary data is prepared only for a current admin. Planned fees and older unpaid bills stay separate. */
export function buildMonthSummaryEmail({summary,dashboardOrigin}={}) {
  if (!summary||!Array.isArray(summary.children)||summary.children.length>1000) throw new TypeError("Invalid month summary.");
  const label=month(summary.month);
  let total=0;
  const children=summary.children.map(child=>{
    const childName=text(child.child_name),parentName=text(child.parent_name);
    if(!Number.isSafeInteger(child.monthly_fee_paise)||child.monthly_fee_paise<100) throw new TypeError("Invalid planned fee.");
    total+=child.monthly_fee_paise;
    return {child:childName,parent:parentName,fee:amount(child.monthly_fee_paise)};
  });
  if(!Number.isSafeInteger(total)||total!==summary.total_paise||!Number.isSafeInteger(summary.old_pending_count)||summary.old_pending_count<0) throw new TypeError("Invalid month totals.");
  const pending=amount(summary.old_pending_paise);
  const detailHtml=`<table style="width:100%;margin-top:20px;border-collapse:collapse;font-size:13px"><caption style="text-align:left;padding:0 0 8px;font-weight:600">Planned fees</caption><thead><tr>${["Child","Parent","Monthly fee"].map(value=>`<th style="text-align:left;padding:7px 5px;border-bottom:1px solid #e4e9e6">${value}</th>`).join("")}</tr></thead><tbody>${children.map(child=>`<tr>${[child.child,child.parent,child.fee].map(value=>`<td style="padding:7px 5px;border-bottom:1px solid #e4e9e6">${escape(value)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  return render({title:"Next month's fees",intro:[label],rows:[["Children",children.length],["Planned total",amount(total)],["Older unpaid bills",summary.old_pending_count],["Older unpaid balance",pending]],detailHtml,detailText:["","Planned fees",...children.map(child=>`${child.child} · ${child.parent} · ${child.fee}`)],links:[["Open billing",`${origin(dashboardOrigin)}/admin/`]]});
}

/** One reminder for a verified parent, including every child's payable balance. */
export function buildBillingReminderEmail({reminder,dashboardOrigin}={}) {
  if(!reminder||!Array.isArray(reminder.invoices)||reminder.invoices.length<1||reminder.invoices.length>100||!Number.isSafeInteger(reminder.invoice_count)||reminder.invoice_count<reminder.invoices.length||reminder.preflight_remaining!==0) throw new TypeError("Invalid payment reminder.");
  const parent=text(reminder.parent_name),seen=new Set();let displayedTotal=0;
  const invoices=reminder.invoices.map(invoice=>{
    if(!invoice||invoice.currency!=="INR"||typeof invoice.id!=="string"||!invoice.id||seen.has(invoice.id)) throw new TypeError("Invalid reminder invoice.");
    seen.add(invoice.id);
    if(!Number.isSafeInteger(invoice.amount_paise)||!Number.isSafeInteger(invoice.paid_paise??0)||invoice.amount_paise<100||(invoice.paid_paise??0)!==0) throw new TypeError("Invalid pending balance.");
    displayedTotal+=invoice.amount_paise;
    return {child:text(invoice.child_name),period:month(invoice.period_start),kind:invoice.kind==="late_fee"?"Late fee":"Monthly fee",fee:amount(invoice.amount_paise),url:safeRazorpayUrl(invoice.payment_url)};
  });
  if(!Number.isSafeInteger(displayedTotal)||!Number.isSafeInteger(reminder.total_paise)||reminder.total_paise<displayedTotal||reminder.invoices_truncated!==true&&(reminder.total_paise!==displayedTotal||reminder.invoice_count!==invoices.length)||reminder.invoices_truncated===true&&reminder.invoice_count<=invoices.length) throw new TypeError("Invalid reminder totals.");
  const detailHtml=`<table style="width:100%;margin-top:20px;border-collapse:collapse;font-size:13px"><thead><tr>${["Child","Month","Fee","Pay"].map(value=>`<th style="text-align:left;padding:7px 5px;border-bottom:1px solid #e4e9e6">${value}</th>`).join("")}</tr></thead><tbody>${invoices.map(invoice=>`<tr><td style="padding:7px 5px;border-bottom:1px solid #e4e9e6">${escape(invoice.child)}</td><td style="padding:7px 5px;border-bottom:1px solid #e4e9e6">${escape(invoice.period)}<br><span style="color:#60736c">${invoice.kind}</span></td><td style="padding:7px 5px;border-bottom:1px solid #e4e9e6">${escape(invoice.fee)}</td><td style="padding:7px 5px;border-bottom:1px solid #e4e9e6"><a href="${escape(invoice.url)}" style="color:#143e35">Pay</a></td></tr>`).join("")}</tbody></table>`;
  const notes=reminder.invoices_truncated===true?[`Showing ${invoices.length} of ${reminder.invoice_count} bills. The total includes all bills.`]:[];
  return render({title:"Payment reminder",intro:[`Hi ${parent},`,"Your fees are pending."],rows:[["Total pending",amount(reminder.total_paise)],["Unpaid bills",reminder.invoice_count]],detailHtml,detailText:["",...invoices.flatMap(invoice=>[`${invoice.child} · ${invoice.period} · ${invoice.kind} · ${invoice.fee}`,`Pay: ${invoice.url}`])],notes,links:[["View all payments",`${origin(dashboardOrigin)}/parent/`]]});
}

/** Content only. The queue chooses one saved parent address; no recipients come from a request body. */
export function buildBillingEmail({ kind, invoice, summary, dashboardOrigin, teamTesting = false } = {}) {
  if (kind === "send_fee_change") return buildFeeChangeEmail({invoice,dashboardOrigin});
  if (kind === "send_month_summary") return buildMonthSummaryEmail({summary,dashboardOrigin});
  if (!titles[kind] || !invoice || typeof invoice !== "object" || invoice.currency !== "INR") throw new TypeError("Invalid billing email.");
  if (!["https://uat.letsaimit.com", "https://letsaimit.com"].includes(dashboardOrigin)) throw new TypeError("Invalid billing origin.");
  const isLateFee = invoice.kind === "late_fee";
  const initial=invoice.pricing_model==="custom_quote"&&invoice.initial_invoice===true;
  const title = isLateFee && kind === "send_invoice" ? "Late fee" : initial&&kind==="send_invoice"?"Enrolment approved":titles[kind];
  const parent = text(invoice.parent_name), reference = text(invoice.receipt, 40);
  const isReceipt = kind === "send_receipt", isRefund = kind === "send_refund";
  const billed = amount(invoice.amount_paise);
  const paid = amount(invoice.paid_paise ?? 0), refunded = amount(invoice.refunded_paise ?? 0);
  const due = date(invoice.due_date), period = date(invoice.period_start);
  const rows = [["Reference", reference], ...(invoice.child_name?[["Child",text(invoice.child_name)]]:[]), ["Month", period], [isRefund ? "Refunded" : isReceipt ? "Paid" : "Amount", isRefund ? refunded : isReceipt ? paid : billed], ...(!isReceipt && !isRefund ? [["Due by", initial?"Now":due]] : [])];
  const payUrl = !isReceipt && !isRefund ? safeRazorpayUrl(invoice.payment_url) : null;
  const invoiceUrl = invoice.invoice_url ? safeRazorpayUrl(invoice.invoice_url) : null;
  const parentUrl = `${dashboardOrigin}/parent/`;
  const message = isRefund ? "Your refund status is updated." : isReceipt ? "Thank you. Your payment is confirmed." : kind === "send_reminder" ? isLateFee ? "Your late fee is pending." : "Your monthly fee is pending." : isLateFee ? "Your late-fee invoice is ready." : "Your monthly invoice is ready.";
  const links = [...(payUrl ? [["Pay now", payUrl]] : []), ...(invoiceUrl ? [["View invoice", invoiceUrl]] : []), ["Your payments", parentUrl]];
  let feeNote = "";
  if (!teamTesting && !isLateFee && !isReceipt && !isRefund && invoice.late_fees_enabled === true && ["daily", "once"].includes(invoice.late_fee_policy)) {
    if (!Number.isSafeInteger(invoice.late_fee_rate_paise) || invoice.late_fee_rate_paise <= 0) throw new TypeError("Invalid late-fee policy.");
    const fee = amount(invoice.late_fee_rate_paise);
    feeNote = invoice.late_fee_policy === "daily" ? `${fee} per overdue day after the due date.` : `Late fee: ${fee} once after the due date.`;
  }
  return render({title,intro:[`Hi ${parent},`,message],rows,links,notes:feeNote?[feeNote]:[]});
}
