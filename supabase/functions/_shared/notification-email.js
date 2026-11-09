/** Pure email content only. The caller supplies a configured origin and sends to one approved recipient at a time. */
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;
const ISO_INSTANT = /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
const formatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short",
});

function field(value, name, max, { optional = false } = {}) {
  if (optional && (value === undefined || value === null || value === "")) return "";
  if (typeof value !== "string" || CONTROL.test(value)) throw new TypeError(`Invalid ${name}.`);
  const clean = value.trim();
  if ((!optional && !clean) || clean.length > max) throw new TypeError(`Invalid ${name}.`);
  return clean;
}

function instant(value, name) {
  if (typeof value !== "string" || !ISO_INSTANT.test(value)) throw new TypeError(`Invalid ${name}.`);
  const calendarDate = value.slice(0, 10);
  const day = new Date(`${calendarDate}T00:00:00Z`);
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || !Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== calendarDate) throw new TypeError(`Invalid ${name}.`);
  return ms;
}

function origin(value) {
  if (typeof value !== "string" || value !== value.trim() || CONTROL.test(value)) throw new TypeError("Invalid dashboard origin.");
  let parsed;
  try { parsed = new URL(value); } catch { throw new TypeError("Invalid dashboard origin."); }
  if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password || parsed.pathname !== "/" || value.includes("?") || value.includes("#")) throw new TypeError("Invalid dashboard origin.");
  return parsed.origin;
}

function count(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`Invalid ${name}.`);
  return value;
}
const optionalCount = (value, name) => count(value === undefined ? 0 : value, name);

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function table(rows) {
  return `<table style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.5">${rows.map(([label, value]) => `<tr><th scope="row" style="padding:9px 0;border-bottom:1px solid #e4e9e6;text-align:left;vertical-align:top;font-weight:400;color:#60736c;width:38%">${escapeHtml(label)}</th><td style="padding:9px 0 9px 16px;border-bottom:1px solid #e4e9e6;vertical-align:top;overflow-wrap:anywhere">${escapeHtml(value)}</td></tr>`).join("")}</table>`;
}

function shell(title, content) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head><body style="margin:0;padding:24px 12px;background:#f5f7f5;color:#143e35;font-family:Arial,Helvetica,sans-serif"><main style="max-width:560px;margin:0 auto;padding:24px;background:#ffffff;border:1px solid #e4e9e6;border-radius:8px"><p style="margin:0 0 20px;font-size:14px;font-weight:700">LetsAimIt</p><h1 style="margin:0 0 16px;font-size:21px;line-height:1.35;font-weight:600">${escapeHtml(title)}</h1>${content}</main></body></html>`;
}

function actionLink(url, label, primary = false) {
  return `<a href="${escapeHtml(url)}" style="display:inline-block;margin:0 8px 8px 0;padding:10px 18px;border:1px solid ${primary ? "#143e35" : "#cbd6cf"};border-radius:5px;background:${primary ? "#143e35" : "#ffffff"};color:${primary ? "#ffffff" : "#143e35"};font-size:14px;line-height:20px;font-weight:600;text-decoration:none">${escapeHtml(label)}</a>`;
}

/** Links only open the existing dashboard. An authenticated explicit action must record the decision. */
export function buildNewRequestEmail({ request, dashboardOrigin } = {}) {
  if (!request || typeof request !== "object" || Array.isArray(request)) throw new TypeError("Invalid request.");
  if (typeof request.id !== "string" || !UUID.test(request.id)) throw new TypeError("Invalid request id.");
  if (!["trial", "enrol"].includes(request.formType)) throw new TypeError("Invalid request type.");
  const base = origin(dashboardOrigin);
  const parentName = field(request.parentName, "parent name", 80);
  const childName = field(request.childName, "child name", 80, { optional: true });
  const sport = field(request.sport, "sport", 80);
  const community = field(request.community, "community", 120);
  const received = `${formatter.format(instant(request.submittedAt, "received time"))} IST`;
  const type = request.formType === "trial" ? "Trial" : "Enrolment";
  const title = `New ${type.toLowerCase()} request`;
  const links = Object.fromEntries(["accept", "decline"].map(decision => {
    const link = new URL("/admin/", base);
    link.searchParams.set("requestId", request.id.toLowerCase());
    link.searchParams.set("requestedDecision", decision);
    return [decision, link.href];
  }));
  const rows = [["Parent", parentName], ...(childName ? [["Child", childName]] : []), ["Type", type], ["Sport", sport], ["Community", community], ["Received (IST)", received]];
  const instruction = "Open the request with your approved Google account, then confirm your decision in the dashboard.";
  return {
    subject: `LetsAimIt: ${title}`,
    html: shell(title, `${table(rows)}<p style="margin:20px 0 14px;font-size:14px;line-height:1.6">${instruction}</p><div>${actionLink(links.accept, "Accept", true)}${actionLink(links.decline, "Decline")}</div><p style="margin:10px 0 0;color:#60736c;font-size:12px;line-height:1.6">The links open the request for review. Your decision is saved only after you confirm it there.</p>`),
    text: [`LetsAimIt — ${title}`, "", ...rows.map(([label, value]) => `${label}: ${value}`), "", instruction, "", `Accept: ${links.accept}`, `Decline: ${links.decline}`, "", "The links open the request for review. Your decision is saved only after you confirm it there."].join("\n"),
  };
}

/** Caller selects the last closed four-hour outbox window and skips windows without new requests or decisions. */
export function buildDigestEmail({ summary, dashboardOrigin } = {}) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) throw new TypeError("Invalid summary.");
  const base = origin(dashboardOrigin);
  const start = instant(summary.windowStartUtc, "window start");
  const end = instant(summary.windowEndUtc, "window end");
  const generated = instant(summary.generatedAtUtc, "summary time");
  if (end - start !== FOUR_HOURS_MS || start % FOUR_HOURS_MS !== 0 || end > generated) throw new TypeError("Use a closed, aligned four-hour window.");
  const newTrials = count(summary.newTrials, "new trial count");
  const newEnrolments = count(summary.newEnrolments, "new enrolment count");
  const accepted = count(summary.acceptedDecisions, "accepted decision count");
  const declined = count(summary.declinedDecisions, "declined decision count");
  const pending = count(summary.pendingRequests, "pending request count");
  const carriedRows = [
    ["Earlier trial requests", optionalCount(summary.lateNewTrials, "carried trial count")],
    ["Earlier enrolment requests", optionalCount(summary.lateNewEnrolments, "carried enrolment count")],
    ["Earlier accepted decisions", optionalCount(summary.lateAcceptedDecisions, "carried accepted decision count")],
    ["Earlier declined decisions", optionalCount(summary.lateDeclinedDecisions, "carried declined decision count")],
  ];
  const carriedTotal = carriedRows.reduce((total, [, value]) => total + value, 0);
  if (!Number.isSafeInteger(carriedTotal)) throw new TypeError("Summary counts are too large.");
  if (!Number.isSafeInteger(newTrials + newEnrolments) || !Number.isSafeInteger(accepted + declined)) throw new TypeError("Summary counts are too large.");
  const windowLabel = `${formatter.format(start)} to ${formatter.format(end)} IST`;
  const asOfLabel = `${formatter.format(generated)} IST`;
  const rows = [["New trial requests", newTrials], ["New enrolment requests", newEnrolments], ["Accepted decisions", accepted], ["Declined decisions", declined]];
  const dashboard = new URL("/admin/", base).href;
  const title = "Four-hour activity summary";
  const note = "New requests and saved decisions are counted within this window.";
  const pendingNote = `Pending requests as of ${asOfLabel}`;
  const carriedNote = "Carried forward: activity recorded earlier and first available since the previous summary. These counts are separate from the window above.";
  const carriedHtml = carriedTotal > 0 ? `<p style="margin:20px 0 12px;font-size:14px;line-height:1.6">${carriedNote}</p>${table(carriedRows.filter(([, value]) => value > 0))}` : "";
  const carriedText = carriedTotal > 0 ? ["", carriedNote, ...carriedRows.filter(([, value]) => value > 0).map(([label, value]) => `${label}: ${value}`)] : [];
  return {
    subject: "LetsAimIt: Four-hour activity summary",
    html: shell(title, `<p style="margin:0 0 12px;font-size:14px;line-height:1.6">${escapeHtml(windowLabel)}</p>${table(rows)}<p style="margin:12px 0 20px;color:#60736c;font-size:12px;line-height:1.6">${note}</p>${carriedHtml}${table([[pendingNote, pending]])}<div style="margin-top:20px">${actionLink(dashboard, "Open dashboard", true)}</div>`),
    text: ["LetsAimIt — Four-hour activity summary", "", `Window: ${windowLabel}`, note, "", ...rows.map(([label, value]) => `${label}: ${value}`), ...carriedText, "", `${pendingNote}: ${pending}`, "", `Open dashboard: ${dashboard}`].join("\n"),
  };
}
