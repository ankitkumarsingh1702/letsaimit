import { isSingleMailbox } from './notification-worker.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTROL=/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;
const STATUSES=['present','absent','no_session'];
const LABELS={present:'Present',absent:'Absent',no_session:'No session'};
export const MAX_COACHING_EMAIL_ROWS=100;
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function text(value,max){if(typeof value!=='string'||!value.trim()||value.length>max||CONTROL.test(value))throw new TypeError('invalid_email_content');return value.trim();}
export function isCoachingUuid(value){return typeof value==='string'&&UUID.test(value);}
export function coachingFieldId(value){if(!isCoachingUuid(value))throw new TypeError('invalid_registration');return value.toLowerCase().replaceAll('-','');}
export function validateCoachingRows(rows){
  if(!Array.isArray(rows)||!rows.length||rows.length>MAX_COACHING_EMAIL_ROWS)throw new TypeError('invalid_roster');
  const seen=new Set();
  return rows.map(row=>{
    if(!row||typeof row!=='object'||Array.isArray(row)||!isCoachingUuid(row.registrationId)||seen.has(row.registrationId.toLowerCase())||!Number.isSafeInteger(row.revision)||row.revision<0||![null,'','unmarked',...STATUSES].includes(row.status))throw new TypeError('invalid_roster');
    const registrationId=row.registrationId.toLowerCase();seen.add(registrationId);
    return {...row,registrationId,status:row.status==='unmarked'?'':row.status||'',revision:row.revision};
  });
}
export function coachingSheet(rows){return Object.fromEntries(validateCoachingRows(rows).map((row,index)=>[`row${index}`,{status:row.status,revision:row.revision}]));}
function date(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new TypeError('invalid_session_date');const parsed=new Date(`${value}T00:00:00Z`);if(!Number.isFinite(+parsed)||parsed.toISOString().slice(0,10)!==value)throw new TypeError('invalid_session_date');return new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeZone:'UTC'}).format(parsed);}
export function validateCoachingActionUrl(value){
  let url;try{url=new URL(value);}catch{throw new TypeError('invalid_action_url');}
  if(typeof value!=='string'||value!==value.trim()||url.protocol!=='https:'||!/^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname)||url.port||url.username||url.password||url.pathname!=='/functions/v1/coaching-worker/attendance'||url.search||url.hash)throw new TypeError('invalid_action_url');
  return url.href;
}
const css='body{margin:0;background:#f6f8f7;color:#173f35;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5}main{max-width:660px;margin:20px auto;padding:20px;background:#fff;border:1px solid #e1e7e3;border-radius:6px}h1{font-size:21px;margin:12px 0 4px}p{margin:8px 0 14px}.muted{color:#64766e;font-size:12px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:9px 5px;border-bottom:1px solid #e5eae7;vertical-align:top}th{font-weight:400;color:#64766e}select{max-width:130px;padding:6px;border:1px solid #cad5ce;border-radius:4px;background:#fff;color:#173f35}button{margin:8px 6px 8px 0;padding:8px 12px;border:1px solid #cad5ce;border-radius:4px;background:#fff;color:#173f35;font-weight:600}.primary{background:#173f35;border-color:#173f35;color:#fff}button[disabled],select[disabled]{opacity:.6}.result{padding:8px 0}.brand{font-weight:700}@media(max-width:480px){main{margin:0;border-radius:0;padding:14px}th,td{padding:8px 3px;font-size:12px}.community{display:none}select{width:112px}}';

export function validateCoachingDashboardOrigin(value) {
  if (!['https://letsaimit.com', 'https://uat.letsaimit.com'].includes(value)) {
    throw new TypeError('invalid_dashboard_origin');
  }
  return value;
}

/** The link opens the usual signed-in sheet, so the message needs no child data or access token. */
export function buildCoachingAttendanceLinkEmail({ sessionDate, rows, dashboardOrigin }) {
  const sessionLabel = date(sessionDate);
  const rosterSize = validateCoachingRows(rows).length;
  const link = new URL('/coach-dashboard/', validateCoachingDashboardOrigin(dashboardOrigin));
  link.searchParams.set('date', sessionDate);
  const copy = 'Open the attendance sheet to mark Present, Absent or No session.';
  const count = `${rosterSize} ${rosterSize === 1 ? 'child' : 'children'}`;
  return {
    subject: `LetsAimIt: Attendance · ${sessionLabel}`,
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Attendance</title><style>${css}</style></head><body><main><p class="brand">LetsAimIt</p><h1>Attendance</h1><p>${escape(sessionLabel)} · IST · ${count}</p><p>${copy}</p><p><a href="${escape(link.href)}">Open attendance sheet</a></p></main></body></html>`,
    text: [`LetsAimIt — Attendance`, `${sessionLabel} · IST · ${count}`, '', copy, link.href].join('\n'),
  };
}

/** Pure content. Recipient/session scope is checked by the worker and again by every action RPC. */
export function buildCoachingAttendanceEmail({ticketId,recipientEmail,sessionDate,expiresAt,rows,token,actionUrl}={}){
  if(!isCoachingUuid(ticketId)||!isSingleMailbox(recipientEmail)||typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))throw new TypeError('invalid_email_ticket');
  const action=validateCoachingActionUrl(actionUrl);const sessionLabel=date(sessionDate);
  const expiry=Date.parse(expiresAt);if(typeof expiresAt!=='string'||!/^\d{4}-\d\d-\d\dT/.test(expiresAt)||!Number.isFinite(expiry))throw new TypeError('invalid_expiry');
  const expiryLabel=new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'}).format(expiry);
  const roster=validateCoachingRows(rows).map(row=>({...row,childName:text(row.childName,80),sport:text(row.sport,80),community:text(row.community,120)}));
  const hidden=`<input type="hidden" name="ticketId" value="${ticketId.toLowerCase()}"><input type="hidden" name="token" value="${token}">`;
  const common=`<p class="brand">LetsAimIt</p><h1>Attendance</h1><p>${escape(sessionLabel)} · IST</p>`;
  const header='<thead><tr><th scope="col">Child</th><th scope="col">Sport</th><th scope="col" class="community">Community</th><th scope="col">Attendance</th></tr></thead>';
  const readonly=`<table>${header}<tbody>${roster.map(row=>`<tr><td>${escape(row.childName)}</td><td>${escape(row.sport)}</td><td class="community">${escape(row.community)}</td><td>${LABELS[row.status]||'Not marked'}</td></tr>`).join('')}</tbody></table>`;
  const fallback='Attendance controls are not available in this email. Contact your programme admin.';
  const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Attendance</title><style>${css}</style></head><body><main>${common}<p>${fallback}</p>${readonly}</main></body></html>`;
  const tableRows=roster.map((row,index)=>{
    const id=coachingFieldId(row.registrationId),key=`sheet.row${index}`;
    const choice=`(draft.overrides &amp;&amp; draft.overrides.row${index} != null ? draft.overrides.row${index} : (draft.bulk || ${key}.status))`;
    return `<tr><td>${escape(row.childName)}</td><td>${escape(row.sport)}</td><td class="community">${escape(row.community)}</td><td><label><span hidden>Attendance for ${escape(row.childName)}</span><select name="status_${id}" on="change:AMP.setState({draft:{overrides:{row${index}:event.value}}})" [disabled]="ticket.used" required><option value="" [selected]="${choice} == ''"${row.status===''?' selected':''}>Not marked</option>${STATUSES.map(status=>`<option value="${status}" [selected]="${choice} == '${status}'"${row.status===status?' selected':''}>${LABELS[status]}</option>`).join('')}</select></label><input type="hidden" name="revision_${id}" value="${row.revision}" [value]="${key}.revision"></td></tr>`;
  }).join('');
  const setAll=status=>`AMP.setState({draft:{bulk:'${status}',overrides:null}})`;
  const amp=`<!doctype html><html amp4email data-css-strict lang="en"><head><meta charset="utf-8"><script async src="https://cdn.ampproject.org/v0.js"></script><script async custom-element="amp-form" src="https://cdn.ampproject.org/v0/amp-form-0.1.js"></script><script async custom-element="amp-bind" src="https://cdn.ampproject.org/v0/amp-bind-0.1.js"></script><script async custom-template="amp-mustache" src="https://cdn.ampproject.org/v0/amp-mustache-0.2.js"></script><style amp4email-boilerplate>body{visibility:hidden}</style><style amp-custom>${css}</style></head><body><main>${common}<amp-state id="sheet"><script type="application/json">${JSON.stringify(coachingSheet(roster))}</script></amp-state><amp-state id="ticket"><script type="application/json">{"used":false}</script></amp-state><amp-state id="draft"><script type="application/json">{"bulk":null,"overrides":null}</script></amp-state><p class="muted">Choose each child's attendance, then save.</p><form method="post" action-xhr="${escape(action)}" enctype="application/x-www-form-urlencoded" on="submit-success:AMP.setState({sheet:event.response.sheet,draft:{bulk:null,overrides:null},ticket:{used:ticket.used || event.response.used}})">${hidden}<input type="hidden" name="action" value="refresh"><button type="submit">Load latest</button><div submitting class="result">Loading…</div><div submit-error class="result"><template type="amp-mustache">{{message}}</template></div></form><form method="post" action-xhr="${escape(action)}" enctype="application/x-www-form-urlencoded" on="submit-success:AMP.setState({ticket:{used:true}})">${hidden}<input type="hidden" name="action" value="save"><button type="button" on="tap:${setAll('present')}" [disabled]="ticket.used">Mark all present</button><button type="button" on="tap:${setAll('no_session')}" [disabled]="ticket.used">No session for all</button><table>${header}<tbody>${tableRows}</tbody></table><button type="submit" class="primary" [disabled]="ticket.used">Save attendance</button><div submitting class="result">Saving…</div><div submit-success class="result"><template type="amp-mustache">Attendance saved.</template></div><div submit-error class="result"><template type="amp-mustache">{{message}}</template></div></form><p class="muted">Save by ${escape(expiryLabel)} IST. Changes are saved only after you select Save attendance.</p></main></body></html>`;
  return {subject:`LetsAimIt: Attendance · ${sessionLabel}`,html,amp,text:[`LetsAimIt — Attendance`,`Date: ${sessionLabel} IST`,'',fallback,'',...roster.map(row=>`${row.childName} · ${row.sport} · ${row.community} · ${LABELS[row.status]||'Not marked'}`)].join('\n')};
}
