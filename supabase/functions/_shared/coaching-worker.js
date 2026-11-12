import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { isSingleMailbox } from './notification-worker.js';
import { buildCoachingAttendanceEmail, buildCoachingAttendanceLinkEmail, coachingSheet, isCoachingUuid, MAX_COACHING_EMAIL_ROWS, validateCoachingActionUrl, validateCoachingDashboardOrigin } from './coaching-email.js';

const MAX_BODY=48*1024;
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const EMAIL_ORIGINS=new Set(['https://mail.google.com','https://amp.gmail.dev']);
const json=(status,value,headers={})=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...headers}});
function bearer(value,secret){if(typeof secret!=='string'||secret.length<32||typeof value!=='string')return false;const a=new TextEncoder().encode(`Bearer ${secret}`),b=new TextEncoder().encode(value);return a.length===b.length&&timingSafeEqual(a,b);}
export function deriveCoachingEmailToken(secret,ticketId){if(typeof secret!=='string'||secret.length<32||!isCoachingUuid(ticketId))throw new TypeError('invalid_signing_configuration');return createHmac('sha256',secret).update(`letsaimit-coaching-email-v1:${ticketId.toLowerCase()}`).digest('base64url');}
export const coachingTokenHash=token=>createHash('sha256').update(token).digest('hex');

/** AMP sender headers authenticate the email's From address, not its recipient. The DB validates the scoped token. */
export function coachingCors(request,senderEmail,{preflight=false}={}){
  if(!isSingleMailbox(senderEmail))return null;
  const supplied=request.headers.get('AMP-Email-Sender'),origin=request.headers.get('Origin');
  const headers={'Vary':'Origin, AMP-Email-Sender','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, AMP-Email-Sender','Access-Control-Max-Age':'300'};
  if(supplied!==null){
    if(supplied.toLowerCase()!==senderEmail.toLowerCase())return null;
    headers['AMP-Email-Allow-Sender']=senderEmail;
    if(origin&&EMAIL_ORIGINS.has(origin)){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Expose-Headers']='AMP-Email-Allow-Sender';}
    return headers;
  }
  if(!origin||!EMAIL_ORIGINS.has(origin))return null;
  const sources=new URL(request.url).searchParams.getAll('__amp_source_origin');
  if(preflight&&sources.length===0){headers['Access-Control-Allow-Origin']=origin;headers['AMP-Email-Allow-Sender']=senderEmail;return headers;}
  if(sources.length!==1||sources[0].toLowerCase()!==senderEmail.toLowerCase())return null;
  headers['Access-Control-Allow-Origin']=origin;
  headers['AMP-Access-Control-Allow-Source-Origin']=senderEmail;
  headers['Access-Control-Expose-Headers']='AMP-Access-Control-Allow-Source-Origin';
  return headers;
}

async function formFields(request){
  if(!/^application\/x-www-form-urlencoded(?:;|$)/i.test(request.headers.get('Content-Type')||''))throw new TypeError('invalid_form');
  const length=request.headers.get('Content-Length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>MAX_BODY))throw new TypeError('invalid_form');
  if(!request.body)throw new TypeError('invalid_form');
  const reader=request.body.getReader();const chunks=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BODY){await reader.cancel();throw new TypeError('invalid_form');}chunks.push(value);}}finally{reader.releaseLock();}
  const body=new Uint8Array(size);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}
  const values=new URLSearchParams(new TextDecoder('utf-8',{fatal:true}).decode(body));const seen=new Set();
  for(const [key]of values){if(seen.has(key))throw new TypeError('duplicate_field');seen.add(key);}
  return values;
}
function decodeAttendance(fields){
  const ticketId=fields.get('ticketId'),token=fields.get('token'),action=fields.get('action');
  if(!isCoachingUuid(ticketId)||!TOKEN.test(token||'')||!['save','refresh'].includes(action))throw new TypeError('invalid_form');
  const keys=[...fields.keys()];const rows=[];
  for(const key of keys){
    if(['ticketId','token','action'].includes(key))continue;
    const match=key.match(/^status_([0-9a-f]{32})$/);
    if(!match){if(/^revision_[0-9a-f]{32}$/.test(key))continue;throw new TypeError('invalid_form');}
    const status=fields.get(key),revision=fields.get(`revision_${match[1]}`);
    if(!['present','absent','no_session'].includes(status)||!revision||!/^(?:0|[1-9]\d{0,15})$/.test(revision)||!Number.isSafeInteger(Number(revision)))throw new TypeError('invalid_row');
    const id=match[1];rows.push({registrationId:`${id.slice(0,8)}-${id.slice(8,12)}-${id.slice(12,16)}-${id.slice(16,20)}-${id.slice(20)}`,status,revision:Number(revision)});
  }
  if(action==='refresh'&&keys.length!==3)throw new TypeError('invalid_form');
  if(action==='save'&&(!rows.length||rows.length>MAX_COACHING_EMAIL_ROWS||keys.length!==3+rows.length*2))throw new TypeError('invalid_form');
  return {ticketId:ticketId.toLowerCase(),token,action,rows};
}
function actionError(error,headers){
  if(error?.code==='42501')return json(403,{ok:false,message:'This attendance email has expired or access has changed.'},headers);
  if(error?.code==='40001'||error?.code==='23505')return json(409,{ok:false,message:'Attendance changed. Select Load latest, review, then save.'},headers);
  if(error instanceof TypeError||error?.code==='22023')return json(400,{ok:false,message:'Review attendance for every child, then save.'},headers);
  return json(503,{ok:false,message:'Could not save attendance. Try again.'},headers);
}

/** The action URL contains no bearer. Scoped credentials travel only in the POST body. */
export function createCoachingEmailActionHandler({senderEmail,rpc,assertReady=()=>{}}){
  return async request=>{
    const headers=coachingCors(request,senderEmail,{preflight:request.method==='OPTIONS'});
    if(!headers)return json(403,{ok:false,message:'Email request not allowed.'});
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Cache-Control':'no-store'}});
    if(request.method!=='POST')return json(405,{ok:false,message:'Use Save attendance in the email.'},headers);
    try{
      await assertReady();const input=decodeAttendance(await formFields(request));
      if(input.action==='refresh'){
        const current=await rpc('read_coaching_email_attendance',{p_ticket_id:input.ticketId,p_token:input.token});
        if(!current||current.ticketId!==input.ticketId||typeof current.used!=='boolean')throw new Error('invalid_receipt');
        return json(200,{ok:true,sheet:coachingSheet(current.rows),used:current.used},headers);
      }
      const receipt=await rpc('save_coaching_email_attendance',{p_ticket_id:input.ticketId,p_token:input.token,p_rows:input.rows});
      if(receipt?.ok!==true||receipt?.saved!==true||receipt?.ticketId!==input.ticketId||receipt?.count!==input.rows.length)throw new Error('invalid_receipt');
      return json(200,{ok:true,saved:true,message:'Attendance saved.'},headers);
    }catch(error){return actionError(error,headers);}
  };
}

/** Authenticated scheduler work cannot choose a recipient or take roster content from the HTTP body. */
export function createCoachingWorkerHandler({
  secret, signingSecret, senderEmail, actionUrl, dynamicEmailReady=false,
  dashboardOrigin='', sendLinkEmail=null, rpc, sendEmail, assertReady=()=>{}, clock=Date.now, maxJobs=8,
}){
  return async request=>{
    if(request.method!=='POST')return json(405,{ok:false,error:'method_not_allowed'});
    if(typeof secret!=='string'||secret.length<32)return json(503,{ok:false,error:'not_configured'});
    if(!bearer(request.headers.get('Authorization'),secret))return json(401,{ok:false,error:'unauthorized'});
    const modes = [];
    if (dynamicEmailReady === true && isSingleMailbox(senderEmail) && typeof signingSecret === 'string' && signingSecret.length >= 32) {
      try {
        validateCoachingActionUrl(actionUrl);
        modes.push('interactive');
      } catch { /* Link delivery can still use its own validated configuration. */ }
    }
    if (typeof sendLinkEmail === 'function') {
      try {
        validateCoachingDashboardOrigin(dashboardOrigin);
        modes.push('link');
      } catch { /* Invalid dashboard origins never appear in mail. */ }
    }
    if (!modes.length) {
      return json(503,{ok:false,error:dynamicEmailReady ? 'not_configured' : 'dynamic_email_not_enabled'});
    }
    try { await assertReady(); } catch { return json(503,{ok:false,error:'not_configured'}); }
    const counts={processed:0,sent:0,skipped:0,failedAttempts:0,unconfirmed:0};const deadline=clock()+90000;
    try{
      if (modes.includes('interactive')) await rpc('enqueue_coaching_attendance',{});
      for(let i=0;i<Math.min(8,Math.max(1,maxJobs))&&clock()<deadline;i++){
        const job = modes.includes('link')
          ? await rpc('claim_coaching_email_for_modes', { p_modes: modes })
          : await rpc('claim_coaching_email', {});
        if (!job) break;
        counts.processed++;
        try{
          const prepared=await rpc('prepare_coaching_email',{p_id:job.id,p_lease_token:job.leaseToken});
          if(!prepared||prepared.state==='skip'){counts.skipped++;continue;}
          const mode = prepared.deliveryMode ?? 'interactive';
          if (prepared.state !== 'ready' || prepared.ticketId !== job.id || !isSingleMailbox(prepared.recipientEmail)
            || !modes.includes(mode) || mode !== (job.deliveryMode ?? 'interactive')
            || Date.parse(prepared.expiresAt) <= clock() || !Number.isFinite(Date.parse(prepared.expiresAt))) {
            throw new Error('invalid_job');
          }
          const envelope = { recipientEmail: prepared.recipientEmail, messageId: `<coaching-${job.id}@letsaimit.com>` };
          let delivered;
          if (mode === 'link') {
            const message = buildCoachingAttendanceLinkEmail({ ...prepared, dashboardOrigin });
            delivered = await sendLinkEmail({ ...message, ...envelope });
          } else {
            if (prepared.recipientEmail.toLowerCase() === senderEmail.toLowerCase()) throw new Error('invalid_job');
            const token = deriveCoachingEmailToken(signingSecret, prepared.ticketId);
            const message = buildCoachingAttendanceEmail({ ...prepared, token, actionUrl });
            const stored = await rpc('set_coaching_email_token', {
              p_id: job.id, p_lease_token: job.leaseToken, p_token_hash: coachingTokenHash(token),
            });
            if (stored !== true) throw new Error('lease_expired');
            delivered = await sendEmail({ ...message, ...envelope });
          }
          if(delivered?.accepted!==true)throw new Error('transport_failure');
          if(await rpc('finish_coaching_email',{p_id:job.id,p_lease_token:job.leaseToken,p_outcome:'sent',p_error_code:''}))counts.sent++;else counts.unconfirmed++;
        }catch{
          counts.failedAttempts++;
          try{if(!await rpc('finish_coaching_email',{p_id:job.id,p_lease_token:job.leaseToken,p_outcome:'retry',p_error_code:'transport_failure'}))counts.unconfirmed++;}catch{counts.unconfirmed++;}
        }
      }
      return json(200,{ok:true,...counts});
    }catch{return json(503,{ok:false,error:'worker_unavailable',...counts});}
  };
}

export function createCoachingHandler(options){
  const action=createCoachingEmailActionHandler({senderEmail:options.senderEmail,rpc:options.rpc,assertReady:options.assertActionReady});
  const worker=createCoachingWorkerHandler(options);
  return request=>{const path=new URL(request.url).pathname.replace(/\/+$/,'')||'/';return path.endsWith('/coaching-worker/attendance')?action(request):path==='/'||path.endsWith('/coaching-worker')?worker(request):json(404,{ok:false,error:'not_found'});};
}
