import test from 'node:test';
import assert from 'node:assert/strict';
import {createCoachingHandler,createCoachingEmailActionHandler,createCoachingWorkerHandler,deriveCoachingEmailToken,coachingTokenHash} from '../supabase/functions/_shared/coaching-worker.js';

const secret='synthetic-coaching-cron-secret-over-32-chars',signingSecret='synthetic-signing-key-longer-than-32-characters';
const senderEmail='sender@example.test',recipientEmail='admin@example.test';
const url='https://abcdefghijklmnopqrst.supabase.co/functions/v1/coaching-worker';
const ticketId='20000000-0000-4000-8000-000000000001',leaseToken='20000000-0000-4000-8000-000000000009';
const registrationId='30000000-0000-4000-8000-000000000001',key=registrationId.replaceAll('-','');
const token=deriveCoachingEmailToken(signingSecret,ticketId);
const row={registrationId,childName:'Example Child',sport:'Football',community:'Example Community',status:null,revision:0};
const prepared={ticketId,recipientEmail,sessionDate:'2026-11-11',expiresAt:'2026-11-13T15:30:00Z',rows:[row],state:'ready'};
const workerRequest=(method='POST',authorization=`Bearer ${secret}`,body)=>new Request(url,{method,headers:authorization?{Authorization:authorization}:{},...(body?{body:JSON.stringify(body)}:{})});
const fields=(extra={})=>({ticketId,token,action:'save',[`status_${key}`]:'present',[`revision_${key}`]:'0',...extra});
function actionRequest(values=fields(),{method='POST',headers={'AMP-Email-Sender':senderEmail},query='',contentType='application/x-www-form-urlencoded',body}={}){
  return new Request(`${url}/attendance${query}`,{method,headers:{...headers,...(method==='POST'?{'Content-Type':contentType}:{})},...(method==='POST'?{body:body??new URLSearchParams(values).toString()}:{})});
}
function fixture({prepare=prepared,setToken=true,send={accepted:true},finish=true,ready=()=>{},overrides={}}={}){
  const calls=[],sent=[];let claimed=false;
  const handler=createCoachingWorkerHandler({secret,signingSecret,senderEmail,actionUrl:`${url}/attendance`,dynamicEmailReady:true,clock:()=>Date.parse('2026-11-11T15:31:00Z'),assertReady:ready,
    rpc:async(name,args)=>{calls.push({name,args});if(name==='enqueue_coaching_attendance')return 4;if(name==='claim_coaching_email'){if(claimed)return null;claimed=true;return {id:ticketId,leaseToken};}if(name==='prepare_coaching_email')return prepare;if(name==='set_coaching_email_token')return setToken;if(name==='finish_coaching_email')return finish;throw new Error('unexpected RPC');},sendEmail:async message=>{sent.push(message);if(send instanceof Error)throw send;return send;},...overrides});
  return {handler,calls,sent};
}

test('worker is authenticated, POST-only, disabled by default and cannot dispatch without ready configuration',async()=>{
  for(const [request,status] of [[workerRequest('GET'),405],[workerRequest('POST','Bearer wrong'),401],[workerRequest('POST',null),401]]){const f=fixture();assert.equal((await f.handler(request)).status,status);assert.equal(f.calls.length,0);}
  for(const overrides of [{dynamicEmailReady:false},{signingSecret:''},{senderEmail:'bad'},{actionUrl:'https://evil.example/action'}]){const f=fixture({overrides});assert.equal((await f.handler(workerRequest())).status,503);assert.equal(f.sent.length,0);assert.equal(f.calls.length,0);}
});

test('worker uses the persisted recipient and stable hashed token before delivering all MIME alternatives',async()=>{
  const f=fixture();const result=await f.handler(workerRequest('POST',`Bearer ${secret}`,{recipientEmail:'attacker@example.test',rows:[],actionUrl:'https://evil.example'}));
  assert.equal(result.status,200);assert.equal((await result.json()).sent,1);assert.equal(f.sent[0].recipientEmail,recipientEmail);
  assert.equal(f.sent[0].messageId,`<coaching-${ticketId}@letsaimit.com>`);assert.match(f.sent[0].amp,/action-xhr=/);assert.match(f.sent[0].text,/read|controls/);
  const store=f.calls.find(call=>call.name==='set_coaching_email_token');assert.equal(store.args.p_token_hash,coachingTokenHash(token));assert.equal(store.args.p_token_hash.length,64);assert.notEqual(store.args.p_token_hash,token);
  assert.deepEqual(f.calls.map(call=>call.name),['enqueue_coaching_attendance','claim_coaching_email','prepare_coaching_email','set_coaching_email_token','finish_coaching_email','claim_coaching_email']);
  assert.equal(deriveCoachingEmailToken(signingSecret,ticketId),token);assert.notEqual(deriveCoachingEmailToken(`${signingSecret}different`,ticketId),token);
});

test('revoked recipients are skipped, self-addressed AMP and expired tickets cannot reach SMTP',async()=>{
  const revoked=fixture({prepare:{state:'skip'}});assert.equal((await (await revoked.handler(workerRequest())).json()).skipped,1);assert.equal(revoked.sent.length,0);
  for(const prepare of [{...prepared,recipientEmail:senderEmail},{...prepared,expiresAt:'2026-11-10T15:30:00Z'},{...prepared,recipientEmail:'first@example.test,second@example.test'}]){const f=fixture({prepare});const response=await f.handler(workerRequest());assert.equal((await response.json()).failedAttempts,1);assert.equal(f.sent.length,0);}
  const lostLease=fixture({setToken:false});await lostLease.handler(workerRequest());assert.equal(lostLease.sent.length,0);
});

test('SMTP failure and ambiguous acknowledgement keep durable retry state and never leak private content',async()=>{
  const f=fixture({send:new Error('smtp password private-example-value admin@example.test')});const response=await f.handler(workerRequest());const body=await response.text();assert.equal(JSON.parse(body).sent,0);assert.doesNotMatch(body,/password|private-example|admin@example/);assert.equal(f.calls.find(call=>call.name==='finish_coaching_email').args.p_outcome,'retry');
  const ambiguous=fixture({finish:false});const result=await ambiguous.handler(workerRequest());assert.equal((await result.json()).unconfirmed,1);
});

test('AMP v2 save waits for a valid database receipt and exposes no token in the response',async()=>{
  const calls=[];const handler=createCoachingEmailActionHandler({senderEmail,rpc:async(name,args)=>{calls.push({name,args});return {ok:true,saved:true,ticketId,count:1};}});
  const response=await handler(actionRequest());assert.equal(response.status,200);assert.equal(response.headers.get('AMP-Email-Allow-Sender'),senderEmail);assert.equal(response.headers.get('Access-Control-Allow-Credentials'),null);
  assert.deepEqual(calls,[{name:'save_coaching_email_attendance',args:{p_ticket_id:ticketId,p_token:token,p_rows:[{registrationId,status:'present',revision:0}]}}]);
  const body=await response.text();assert.equal(JSON.parse(body).saved,true);assert.doesNotMatch(body,RegExp(token));
  const missingReceipt=createCoachingEmailActionHandler({senderEmail,rpc:async()=>({ok:true})});assert.equal((await missingReceipt(actionRequest())).status,503);
});

test('refresh is a token-authenticated POST and returns only current status/revision with used state',async()=>{
  const calls=[];const handler=createCoachingEmailActionHandler({senderEmail,rpc:async(name,args)=>{calls.push({name,args});return {ticketId,used:false,rows:[{...row,status:'absent',revision:4}]};}});
  const response=await handler(actionRequest({ticketId,token,action:'refresh'}));assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true,sheet:{row0:{status:'absent',revision:4}},used:false});assert.equal(calls[0].name,'read_coaching_email_attendance');
  assert.equal((await handler(actionRequest({}, {method:'GET'}))).status,405);assert.equal(calls.length,1);
});

test('CORS v1 accepts only the trusted Gmail origin and exact sender; invalid sender never reaches the database',async()=>{
  let calls=0;const handler=createCoachingEmailActionHandler({senderEmail,rpc:async()=>{calls++;return {ok:true,saved:true,ticketId,count:1};}});
  const response=await handler(actionRequest(fields(),{headers:{Origin:'https://mail.google.com'},query:`?__amp_source_origin=${encodeURIComponent(senderEmail)}`}));assert.equal(response.status,200);assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://mail.google.com');assert.equal(response.headers.get('AMP-Access-Control-Allow-Source-Origin'),senderEmail);
  for(const options of [{headers:{'AMP-Email-Sender':'attacker@example.test'}},{headers:{}},{headers:{Origin:'https://evil.example'},query:`?__amp_source_origin=${senderEmail}`},{headers:{Origin:'https://mail.google.com'},query:'?__amp_source_origin=attacker@example.test'},{headers:{Origin:'https://mail.google.com'},query:`?__amp_source_origin=${senderEmail}&__amp_source_origin=${senderEmail}`}])assert.equal((await handler(actionRequest(fields(),options))).status,403);
  assert.equal(calls,1);
  const preflight=await handler(actionRequest({}, {method:'OPTIONS',headers:{Origin:'https://mail.google.com'}}));assert.equal(preflight.status,204);assert.equal(calls,1);
});

test('invalid, duplicate, oversized and unmarked forms cannot call the attendance RPC',async()=>{
  let calls=0;const handler=createCoachingEmailActionHandler({senderEmail,rpc:async()=>{calls++;throw new Error();}});
  for(const request of [actionRequest(fields({token:'wrong'})),actionRequest(fields({[`status_${key}`]:''})),actionRequest(fields({[`revision_${key}`]:'1.2'})),actionRequest(fields({extra:'x'})),actionRequest(fields(),{contentType:'application/json'}),actionRequest(fields(),{body:`${new URLSearchParams(fields())}&token=${token}`}),actionRequest(fields(),{body:'x'.repeat(50000)})])assert.equal((await handler(request)).status,400);
  assert.equal(calls,0);
});

test('revocation, expiry and concurrent administrator changes have actionable inline errors without private SQL detail',async()=>{
  for(const [code,status,copy]of [['42501',403,/expired or access/],['40001',409,/Load latest/],['22023',400,/every child/],['XX000',503,/Try again/]]){
    const handler=createCoachingEmailActionHandler({senderEmail,rpc:async()=>{throw Object.assign(new Error('privateSQL token@example.test'),{code});}});const response=await handler(actionRequest());assert.equal(response.status,status);const body=await response.text();assert.match(body,copy);assert.doesNotMatch(body,/privateSQL|token@example/);assert.equal(response.headers.get('AMP-Email-Allow-Sender'),senderEmail);
  }
});

test('combined handler keeps public email actions separate from worker authority and unknown paths',async()=>{
  let calls=0;const handler=createCoachingHandler({secret,signingSecret,senderEmail,actionUrl:`${url}/attendance`,rpc:async()=>{calls++;},sendEmail:async()=>({accepted:true})});
  assert.equal((await handler(new Request(`${url}/unknown`,{method:'POST'}))).status,404);assert.equal((await handler(workerRequest('GET'))).status,405);assert.equal((await handler(workerRequest('POST',null))).status,401);assert.equal(calls,0);
});
