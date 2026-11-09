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

/** Content only. The queue chooses one saved parent address; no recipients come from a request body. */
export function buildBillingEmail({ kind, invoice, dashboardOrigin, teamTesting = false } = {}) {
  if (!titles[kind] || !invoice || typeof invoice !== "object" || invoice.currency !== "INR") throw new TypeError("Invalid billing email.");
  if (!["https://uat.letsaimit.com", "https://letsaimit.com"].includes(dashboardOrigin)) throw new TypeError("Invalid billing origin.");
  const isLateFee = invoice.kind === "late_fee";
  const title = isLateFee && kind === "send_invoice" ? "Late fee" : titles[kind];
  const parent = text(invoice.parent_name), reference = text(invoice.receipt, 40);
  const isReceipt = kind === "send_receipt", isRefund = kind === "send_refund";
  const billed = amount(invoice.amount_paise);
  const paid = amount(invoice.paid_paise ?? 0), refunded = amount(invoice.refunded_paise ?? 0);
  const due = date(invoice.due_date), period = date(invoice.period_start);
  const rows = [["Reference", reference], ["Month", period], [isRefund ? "Refunded" : isReceipt ? "Paid" : "Amount", isRefund ? refunded : isReceipt ? paid : billed], ...(!isReceipt && !isRefund ? [["Due by", due]] : [])];
  const payUrl = !isReceipt && !isRefund ? safeRazorpayUrl(invoice.payment_url) : null;
  const invoiceUrl = invoice.invoice_url ? safeRazorpayUrl(invoice.invoice_url) : null;
  const parentUrl = `${dashboardOrigin}/parent/`;
  const message = isRefund ? "Your refund status is updated." : isReceipt ? "Thank you. Your payment is confirmed." : kind === "send_reminder" ? isLateFee ? "Your late fee is pending." : "Your monthly fee is pending." : isLateFee ? "Your late-fee invoice is ready." : "Your monthly invoice is ready.";
  const testing = teamTesting ? "Team payment: ₹1. Regular fee: ₹600/month. Late fees are not charged during this test." : "";
  const links = [...(payUrl ? [["Pay now", payUrl]] : []), ...(invoiceUrl ? [["View invoice", invoiceUrl]] : []), ["Your payments", parentUrl]];
  let feeNote = "";
  if (!teamTesting && !isLateFee && !isReceipt && !isRefund && invoice.late_fees_enabled === true && ["daily", "once"].includes(invoice.late_fee_policy)) {
    if (!Number.isSafeInteger(invoice.late_fee_rate_paise) || invoice.late_fee_rate_paise <= 0) throw new TypeError("Invalid late-fee policy.");
    const fee = amount(invoice.late_fee_rate_paise);
    feeNote = invoice.late_fee_policy === "daily" ? `${fee} per overdue day after the due date.` : `Late fee: ${fee} once after the due date.`;
  }
  const htmlRows = rows.map(([label, value]) => `<tr><th scope="row" style="padding:8px 0;text-align:left;font-weight:400;color:#60736c;border-bottom:1px solid #e4e9e6">${escape(label)}</th><td style="padding:8px 0 8px 16px;border-bottom:1px solid #e4e9e6">${escape(value)}</td></tr>`).join("");
  return {
    subject: `LetsAimIt: ${title}`,
    text: ["LetsAimIt", title, "", `Hi ${parent},`, message, "", ...rows.map(([label, value]) => `${label}: ${value}`), ...(testing ? ["", testing] : []), ...(feeNote ? ["", feeNote] : []), "", ...links.map(([label, url]) => `${label}: ${url}`)].join("\n"),
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title></head><body style="margin:0;padding:24px 12px;background:#f5f7f5;color:#143e35;font-family:Arial,Helvetica,sans-serif"><main style="max-width:560px;margin:0 auto;padding:24px;background:#fff;border:1px solid #e4e9e6;border-radius:8px"><p style="margin:0 0 20px;font-size:14px;font-weight:700">LetsAimIt</p><h1 style="margin:0 0 16px;font-size:21px">${escape(title)}</h1><p style="font-size:14px;line-height:1.6">Hi ${escape(parent)},<br>${escape(message)}</p><table style="width:100%;border-collapse:collapse;font-size:14px">${htmlRows}</table>${testing ? `<p style="font-size:12px;color:#60736c;line-height:1.6">${escape(testing)}</p>` : ""}${feeNote ? `<p style="font-size:12px;color:#60736c;line-height:1.6">${escape(feeNote)}</p>` : ""}<div style="margin-top:20px">${links.map(([label, url], index) => `<a href="${escape(url)}" style="display:inline-block;margin:0 8px 8px 0;padding:9px 14px;border:1px solid #143e35;border-radius:5px;text-decoration:none;font-size:13px;color:${index === 0 ? "#fff" : "#143e35"};background:${index === 0 ? "#143e35" : "#fff"}">${escape(label)}</a>`).join("")}</div></main></body></html>`,
  };
}
