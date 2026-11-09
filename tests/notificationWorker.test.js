import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotificationHandler, validateMailConfiguration, isSingleMailbox } from '../supabase/functions/_shared/notification-worker.js';

const secret='synthetic-cron-secret-at-least-32-characters';
const origin='https://uat.letsaimit.com';
const requestContent={id:'f84940a4-e4cb-4ebf-88cb-e63537834565',formType:'enrol',parentName:'Synthetic Parent',childName:'Synthetic Child',sport:'Basketball',community:'Synthetic locality',submittedAt:'2026-11-09T10:30:00.000Z'};
const summary={windowStartUtc:'2026-11-09T08:00:00.000Z',windowEndUtc:'2026-11-09T12:00:00.000Z',generatedAtUtc:'2026-11-09T12:01:00.000Z',newTrials:2,newEnrolments:1,acceptedDecisions:1,declinedDecisions:0,pendingRequests:3};
const prepared=(id='job1',recipientEmail='approved@gmail.com',kind='new_request')=>({id,kind,recipientEmail,content:kind==='digest'?summary:requestContent});
const call=(method='POST',authorization=`Bearer ${secret}`,body)=>new Request('https://project.supabase.co/functions/v1/admin-notifications',{method,headers:authorization?{Authorization:authorization}:undefined,...(body?{body:JSON.stringify(body)}:{})});
function fixture({jobs=[prepared()],prepare,send,finish,ready,overrides={}}={}) {
  const calls=[];const sent=[];let index=0;
  const handler=createNotificationHandler({secret,dashboardOrigin:origin,assertReady:ready||(()=>{}),
    rpc:async(name,args)=>{
      calls.push({name,args});
      if(name==='enqueue_admin_notification_digests')return 0;
      if(name==='claim_admin_notification'){const job=jobs[index++];return job?{id:job.id,leaseToken:`lease-${job.id}`,attempt:1}:null;}
      if(name==='prepare_admin_notification')return prepare?prepare(args):jobs.find(job=>job.id===args.p_id);
      if(name==='finish_admin_notification')return finish?finish(args):true;
      throw new Error('unexpected RPC');
    },sendEmail:async message=>{sent.push(message);return send?send(message):{accepted:true};},...overrides});
  return {handler,calls,sent};
}

test('worker accepts only authenticated POST; missing configuration never queries or sends',async()=>{
  for(const [method,token,status] of [['GET',`Bearer ${secret}`,405],['POST','Bearer wrong',401],['POST',null,401]]){
    const {handler,calls,sent}=fixture();assert.equal((await handler(call(method,token))).status,status);assert.equal(calls.length,0);assert.equal(sent.length,0);
  }
  const unconfigured=fixture({overrides:{secret:''}});assert.equal((await unconfigured.handler(call())).status,503);assert.equal(unconfigured.calls.length,0);
  const badReady=fixture({ready:()=>{throw new Error('synthetic private configuration detail');}});const result=await badReady.handler(call());assert.equal(result.status,503);assert.equal(badReady.calls.length,0);assert.equal((await result.text()).includes('private'),false);
});

test('Gmail configuration uses implicit TLS465, exact sender identity and a rotated app-password format',()=>{
  const config={smtpHost:'smtp.gmail.com',smtpPort:465,smtpUser:'sender@gmail.com',senderEmail:'sender@gmail.com',smtpPassword:'abcdefghijklmnop',dashboardOrigin:origin};
  assert.doesNotThrow(()=>validateMailConfiguration(config));
  for(const changes of [{smtpPort:587},{smtpPort:25},{smtpHost:'relay.attacker.test'},{senderEmail:'different@gmail.com'},{smtpPassword:''},{smtpPassword:'invalid'},{smtpPassword:'abcdefghijklmn\r\n'},{dashboardOrigin:'https://attacker.test'}])assert.throws(()=>validateMailConfiguration({...config,...changes}),/configuration_error/);
});

test('SMTP recipient validation allows only one plain mailbox, never an address list or display name',()=>{
  assert.equal(isSingleMailbox('staff+tag@company.test'),true);
  for(const value of ['a@gmail.com,b@gmail.com','a@gmail.com;b@gmail.com','Name <a@gmail.com>',' a@gmail.com','a@gmail.com\r\nBcc:b@gmail.com','a@gmail.com b@gmail.com','a@evil..test','a@-evil.test','a@evil.test-','a@@gmail.com',null,{},'"quoted local"@gmail.com'])assert.equal(isSingleMailbox(value),false,String(value));
});

test('request bodies cannot choose recipients, message content, action targets or decision writes',async()=>{
  const {handler,calls,sent}=fixture();const result=await handler(call('POST',`Bearer ${secret}`,{to:'attacker@example.test',subject:'override',dashboardOrigin:'https://attacker.test',decision:'accepted'}));
  assert.equal(result.status,200);assert.equal(sent.length,1);assert.equal(sent[0].recipientEmail,'approved@gmail.com');assert.equal(sent[0].subject,'LetsAimIt: New enrolment request');assert.match(sent[0].text,/https:\/\/uat\.letsaimit\.com\/admin\/\?requestId=/);
  assert.deepEqual(calls.map(item=>item.name),['enqueue_admin_notification_digests','claim_admin_notification','prepare_admin_notification','finish_admin_notification','claim_admin_notification']);
  assert.equal(calls.some(item=>item.name==='review_registration'),false);
  assert.equal(sent[0].messageId,'<job1@letsaimit.com>');
});

test('recipient revocation returns no content and cannot send an email',async()=>{
  const {handler,calls,sent}=fixture({prepare:()=>null});const result=await handler(call());assert.equal(sent.length,0);assert.equal((await result.json()).skipped,1);assert.equal(calls.some(item=>item.name==='finish_admin_notification'),false);
});

test('new-request and digest jobs are sent separately to their approved recipients',async()=>{
  const {handler,sent}=fixture({jobs:[prepared('new','first@gmail.com'),prepared('digest','second@company.test','digest')]});const result=await handler(call());assert.equal((await result.json()).sent,2);assert.deepEqual(sent.map(message=>message.recipientEmail),['first@gmail.com','second@company.test']);assert.equal(sent[1].subject,'LetsAimIt: Four-hour activity summary');assert.match(sent[1].text,/Pending requests as of/);
});

test('SMTP errors preserve a retryable durable job and expose no provider message or recipient',async()=>{
  const {handler,calls}=fixture({send:()=>{throw new Error('synthetic-SMTP-secret approved@gmail.com');}});const result=await handler(call());const body=await result.text();assert.equal(result.status,200);assert.equal(body.includes('synthetic-SMTP-secret'),false);assert.equal(body.includes('approved@gmail.com'),false);
  const outcomes=calls.filter(item=>item.name==='finish_admin_notification').map(item=>item.args);assert.deepEqual(outcomes,[{p_id:'job1',p_lease_token:'lease-job1',p_outcome:'retry',p_failure_code:'transport_failure'}]);assert.equal(JSON.parse(body).sent,0);
});

test('invalid or multiple queued recipients cannot reach SMTP and use the same bounded retry path',async()=>{
  for(const recipient of ['a@gmail.com,b@gmail.com','a@gmail.com; b@gmail.com','a@gmail.com\r\nBcc:b@gmail.com']){
    const {handler,sent,calls}=fixture({jobs:[prepared('invalid',recipient)]});const result=await handler(call());assert.equal(sent.length,0);assert.equal((await result.json()).failedAttempts,1);assert.equal(calls.find(item=>item.name==='finish_admin_notification').args.p_outcome,'retry');
  }
});

test('an unaccepted SMTP recipient or unconfirmed finish can never report a saved sent acknowledgement',async()=>{
  const rejected=fixture({send:()=>({accepted:false})});const rejectedResult=await rejected.handler(call());assert.equal((await rejectedResult.json()).sent,0);assert.equal(rejected.calls.find(item=>item.name==='finish_admin_notification').args.p_outcome,'retry');
  const expired=fixture({finish:()=>false});const expiredResult=await expired.handler(call());const body=await expiredResult.json();assert.equal(body.sent,0);assert.equal(body.unconfirmed,1);assert.equal(expired.calls.filter(item=>item.name==='finish_admin_notification').length,1);
});

test('worker RPC failure returns a generic unavailable result without SMTP or exception contents',async()=>{
  const {handler,sent}=fixture({overrides:{rpc:()=>{throw new Error('database detail should stay private');}}});const result=await handler(call());assert.equal(result.status,503);assert.equal(sent.length,0);assert.equal((await result.text()).includes('database detail'),false);
});

test('every invocation has a hard batch bound even when there are more queued jobs',async()=>{
  const {handler,sent}=fixture({jobs:Array.from({length:12},(_,i)=>prepared(`job${i}`)),overrides:{maxJobs:100}});const result=await handler(call());assert.equal(sent.length,8);assert.equal((await result.json()).processed,8);
});
