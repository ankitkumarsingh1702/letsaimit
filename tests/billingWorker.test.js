import test from 'node:test';
import assert from 'node:assert/strict';
import { createBillingWorker } from '../supabase/functions/_shared/billing-worker.js';

const secret='synthetic-billing-worker-at-least-32-characters';
const bill={id:'02b6cb99-91ee-43ee-9789-c0e8ddf0233c',receipt:'LAI02b6cb9991ee43ee9789c0e8ddf0233c',currency:'INR',amount_paise:100,base_amount_paise:100,late_fee_paise:0,parent_name:'Synthetic Parent',parent_email:'parent@example.test',child_name:'Synthetic Child',period_start:'2026-11-01',due_date:'2026-11-14',payment_url:'https://rzp.io/i/synthetic',invoice_url:'https://rzp.io/i/synthetic'};
const call=(auth=`Bearer ${secret}`,method='POST')=>new Request('https://project.supabase.co/functions/v1/billing-worker',{method,headers:auth?{authorization:auth}:undefined});
function fixture({kind='create_invoice',invoice=bill,prepare,provider={},send,save=true,overrides={}}={}) {
  const calls=[],sent=[];let claimed=false;
  const client={createInvoice:async x=>{calls.push(['create',x]);return {id:'provider',amount_paise:100};},reconcileInvoice:async x=>{calls.push(['reconcile',x]);return {id:'provider'};},findByReceipt:async x=>{calls.push(['find',x]);return null;},...provider};
  const handler=createBillingWorker({secret,dashboardOrigin:'https://uat.letsaimit.com',provider:client,
    rpc:async(name,args)=>{calls.push([name,args]);if(name==='enqueue_billing_work')return 0;if(name==='claim_billing_job'){if(claimed)return null;claimed=true;return {id:'job1',leaseToken:'lease1',attempt:1};}if(name==='prepare_billing_job')return prepare?prepare(args):{kind,invoice,team_testing:true};if(name==='save_billing_provider_snapshot')return save;if(name==='finish_billing_job')return true;throw new Error('unexpected RPC');},
    sendEmail:async message=>{sent.push(message);return send?send(message):{accepted:true};},...overrides});
  return {handler,calls,sent};
}

test('billing worker requires backend-only authenticated POST before any RPC',async()=>{
  for(const [auth,method,status]of [[null,'POST',401],['Bearer invalid','POST',401],[`Bearer ${secret}`,'GET',405]]){const f=fixture();assert.equal((await f.handler(call(auth,method))).status,status);assert.equal(f.calls.length,0);}
  const f=fixture({overrides:{assertReady(){throw new Error('private config');}}});const r=await f.handler(call());assert.equal(r.status,503);assert.equal(f.calls.length,0);assert.equal((await r.text()).includes('private'),false);
});

test('a successful create is saved before completion; browser body cannot select amount or recipient',async()=>{
  const f=fixture();const request=new Request('https://project.test/billing',{method:'POST',headers:{authorization:`Bearer ${secret}`},body:JSON.stringify({amount_paise:60000,to:'attacker@example.test'})});
  const r=await f.handler(request);assert.equal((await r.json()).completed,1);assert.equal(f.calls.find(x=>x[0]==='create')[1].amount_paise,100);assert.deepEqual(f.calls.filter(x=>x[0].startsWith('save_')).map(x=>x[0]),['save_billing_provider_snapshot']);assert.equal(f.sent.length,0);
});

test('an ambiguous provider create moves to reconciliation and is never blindly retried',async()=>{
  const f=fixture({provider:{createInvoice:async()=>{throw new Error('network timeout secret');}}});const r=await f.handler(call());const body=await r.text();assert.equal(body.includes('secret'),false);const finish=f.calls.find(x=>x[0]==='finish_billing_job')[1];assert.equal(finish.p_outcome,'ambiguous');assert.equal(finish.p_failure_code,'creation_ambiguous');
  const reconcile=fixture({kind:'reconcile_invoice'});await reconcile.handler(call());assert.equal(reconcile.calls.some(x=>x[0]==='create'),false);assert.equal(reconcile.calls.find(x=>x[0]==='finish_billing_job')[1].p_failure_code,'invoice_missing');
});

test('lost database save after successful creation is also ambiguous',async()=>{
  const f=fixture({save:false});await f.handler(call());assert.equal(f.calls.find(x=>x[0]==='finish_billing_job')[1].p_outcome,'ambiguous');
});

test('payment reconciliation and current job preparation occur before an unpaid reminder',async()=>{
  let prepares=0;const f=fixture({kind:'send_reminder',invoice:{...bill,provider_invoice_id:'inv_synthetic'},prepare:()=>++prepares===1?{kind:'send_reminder',invoice:{...bill,provider_invoice_id:'inv_synthetic'},team_testing:true}:null});
  const r=await f.handler(call());assert.equal((await r.json()).skipped,1);assert.equal(f.sent.length,0);assert.equal(f.calls.filter(x=>x[0]==='prepare_billing_job').length,2);assert.equal(f.calls.some(x=>x[0]==='reconcile'),true);
});

test('ownership or cancellation change at prepare prevents provider calls and emails',async()=>{
  const f=fixture({prepare:()=>null});await f.handler(call());assert.equal(f.calls.some(x=>['create','reconcile'].includes(x[0])),false);assert.equal(f.sent.length,0);
});

test('unpaid invoice sends only to its server-owned single recipient',async()=>{
  const f=fixture({kind:'send_invoice',invoice:{...bill,provider_invoice_id:'inv_synthetic'}});const r=await f.handler(call());assert.equal((await r.json()).sent,1);assert.equal(f.sent[0].recipientEmail,'parent@example.test');assert.equal(f.sent[0].messageId,'<billing-job1@letsaimit.com>');
  const invalid=fixture({kind:'send_invoice',invoice:{...bill,parent_email:'one@example.test,two@example.test'}});await invalid.handler(call());assert.equal(invalid.sent.length,0);
});

test('actual SQL prepared invoice timestamp dates build and deliver an email',async()=>{
  const preparedInvoice={...bill,provider_invoice_id:'inv_synthetic',due_date:'2026-11-13T20:00:00+00:00',created_at:'2026-11-09T20:00:00.123456+00:00',period_start:'2026-11-01'};
  const f=fixture({kind:'send_invoice',invoice:preparedInvoice});const response=await f.handler(call());
  assert.equal((await response.json()).sent,1);assert.equal(f.sent.length,1);assert.match(f.sent[0].text,/Due by: 14 Nov 2026/);
  assert.equal(f.calls.find(x=>x[0]==='finish_billing_job')[1].p_outcome,'done');
});

test('failed SMTP leaves durable retry state; private error text is not returned',async()=>{
  const f=fixture({kind:'send_invoice',send:()=>{throw new Error('smtp-password parent@example.test');}});const r=await f.handler(call());assert.equal((await r.text()).includes('smtp-password'),false);assert.equal(f.calls.find(x=>x[0]==='finish_billing_job')[1].p_failure_code,'send_failure');
});

test('definitive provider rejection and invalid inputs stop; rate limits retry without ambiguous duplicate creation',async()=>{
  for(const [errorCode,outcome,failureCode] of [['provider_rejected','failed','provider_mismatch'],['invalid_bill','failed','configuration_error'],['provider_retry','retry','provider_unavailable']]) {
    const f=fixture({provider:{createInvoice:async()=>{throw Object.assign(new Error('private detail'),{code:errorCode});}}});
    await f.handler(call());const finish=f.calls.find(x=>x[0]==='finish_billing_job')[1];
    assert.equal(finish.p_outcome,outcome);assert.equal(finish.p_failure_code,failureCode);
  }
});

test('late fees require the complete original invoice and reconcile it before any create',async()=>{
  let prepares=0;
  const base={...bill,provider_invoice_id:'inv_synthetic_base'};
  const late={...bill,id:'b97b1263-4417-4bb1-bf3d-fc58095d13f1',base_invoice_id:bill.id,base_provider_invoice_id:'inv_synthetic_base',base_invoice:base,kind:'late_fee'};
  const f=fixture({invoice:late,prepare:()=>++prepares===1?{kind:'create_invoice',invoice:late,team_testing:false}:null});
  await f.handler(call());assert.equal(f.calls.some(x=>x[0]==='create'),false);
  const checked=f.calls.find(x=>x[0]==='reconcile')[1];assert.equal(checked.receipt,bill.receipt);assert.equal(checked.amount_paise,100);assert.equal(checked.currency,'INR');
  assert.equal(f.calls.find(x=>x[0]==='save_billing_provider_snapshot')[1].p_invoice_id,bill.id);
  const noBase=fixture({invoice:{...late,base_provider_invoice_id:null}});await noBase.handler(call());assert.equal(noBase.calls.some(x=>['create','reconcile'].includes(x[0])),false);assert.equal(noBase.calls.find(x=>x[0]==='finish_billing_job')[1].p_failure_code,'invoice_missing');
});

test('failure codes emitted by the worker stay inside the database contract',async()=>{
  const allowed=new Set(['','provider_unavailable','configuration_error','send_failure','invoice_missing','provider_mismatch','creation_ambiguous']);
  for(const scenario of [{provider:{createInvoice:async()=>{throw new Error('network');}}},{kind:'reconcile_invoice'},{kind:'send_invoice',send:()=>{throw new Error('smtp');}},{save:false},{kind:'unrecognized'}]) {
    const f=fixture(scenario);await f.handler(call());
    for(const [,args] of f.calls.filter(x=>x[0]==='finish_billing_job'))assert.equal(allowed.has(args.p_failure_code),true,args.p_failure_code);
  }
});
