import test from 'node:test';
import assert from 'node:assert/strict';
import { createBillingWorker } from '../supabase/functions/_shared/billing-worker.js';

const secret='synthetic-billing-worker-at-least-32-characters';
const bill={id:'02b6cb99-91ee-43ee-9789-c0e8ddf0233c',receipt:'LAI02b6cb9991ee43ee9789c0e8ddf0233c',currency:'INR',amount_paise:100,base_amount_paise:100,late_fee_paise:0,parent_name:'Synthetic Parent',parent_email:'parent@example.test',child_name:'Synthetic Child',period_start:'2026-11-01',due_date:'2026-11-14',payment_url:'https://rzp.io/i/synthetic',invoice_url:'https://rzp.io/i/synthetic'};
const reminderWork=(changes={})=>({kind:'send_reminder',recipient_email:'parent@example.test',parent_name:bill.parent_name,invoices:[{...bill,paid_paise:0,provider_invoice_id:'inv_synthetic'}],invoice_count:1,total_paise:100,invoices_truncated:false,preflight_invoices:[{...bill,paid_paise:0,provider_invoice_id:'inv_synthetic'}],preflight_remaining:1,...changes});
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
  let prepares=0;const f=fixture({prepare:()=>++prepares===1?reminderWork():null});
  const r=await f.handler(call());assert.equal((await r.json()).skipped,1);assert.equal(f.sent.length,0);assert.equal(f.calls.filter(x=>x[0]==='prepare_billing_job').length,2);assert.equal(f.calls.some(x=>x[0]==='reconcile'),true);
});

test('one reminder uses the verified parent recipient and a rechecked group total across children',async()=>{
  let prepares=0;
  const children=[{...bill,id:'first',child_name:'One',parent_email:'contact-one@example.test',provider_invoice_id:'inv_one',paid_paise:0},{...bill,id:'second',child_name:'Two',parent_email:'contact-two@example.test',provider_invoice_id:'inv_two',paid_paise:0}];
  const f=fixture({prepare:()=>reminderWork({recipient_email:'verified-parent@example.test',invoices:children,total_paise:200,invoice_count:2,preflight_invoices:++prepares===1?children:[],preflight_remaining:prepares===1?2:0})});
  const result=await f.handler(call());assert.equal((await result.json()).sent,1);assert.equal(f.sent.length,1);assert.equal(f.sent[0].recipientEmail,'verified-parent@example.test');assert.match(f.sent[0].text,/Total pending: ₹2/);assert.equal(f.calls.filter(x=>x[0]==='reconcile').length,2);
  assert.equal(f.calls.some(x=>x[0]==='create'),false);
});

test('a superseded reminder slot or fully paid group sends nothing after preparation cancels it',async()=>{
  let prepares=0;const f=fixture({prepare:()=>++prepares===1?reminderWork():null});
  await f.handler(call());assert.equal(f.sent.length,0);assert.equal(f.calls.some(x=>x[0]==='finish_billing_job'),false);
});

test('large parent groups make durable reconciliation progress and eventually send one complete reminder',async()=>{
  const invoices=Array.from({length:25},(_,index)=>({...bill,id:`invoice-${index}`,paid_paise:0,provider_invoice_id:`inv_${index}`}));
  const checked=new Set(),sent=[],finishes=[];let claimAvailable=false,reconciles=0;
  const handler=createBillingWorker({secret,dashboardOrigin:'https://uat.letsaimit.com',provider:{reconcileInvoice:async invoice=>{reconciles+=1;return {id:invoice.id};}},sendEmail:async message=>{sent.push(message);return {accepted:true};},rpc:async(name,args)=>{
    if(name==='enqueue_billing_work'){claimAvailable=true;return 0;}
    if(name==='claim_billing_job'){if(!claimAvailable)return null;claimAvailable=false;return {id:'large-group',leaseToken:'lease'};}
    if(name==='prepare_billing_job'){const stale=invoices.filter(invoice=>!checked.has(invoice.id));return reminderWork({invoices,invoice_count:25,total_paise:2500,preflight_invoices:stale.slice(0,20),preflight_remaining:stale.length});}
    if(name==='save_billing_provider_snapshot'){checked.add(args.p_invoice_id);return true;}
    if(name==='finish_billing_job'){finishes.push(args);return true;}
    throw new Error('unexpected RPC');
  }});
  const first=await handler(call());assert.equal((await first.json()).sent,0);assert.equal(checked.size,20);assert.equal(finishes[0].p_outcome,'retry');
  const second=await handler(call());assert.equal((await second.json()).sent,1);assert.equal(checked.size,25);assert.equal(reconciles,25);assert.equal(sent.length,1);assert.match(sent[0].text,/Total pending: ₹25/);assert.match(sent[0].text,/Unpaid bills: 25/);assert.equal(finishes[1].p_outcome,'done');
});

test('fee changes and admin month summaries reuse durable email jobs without touching Razorpay',async()=>{
  for(const work of [
    {kind:'send_fee_change',invoice:{...bill,amount_paise:450000,effective_month:'2026-12-01'}},
    {kind:'send_month_summary',recipient_email:'approved-admin@example.test',summary:{month:'2026-12-01',children:[{child_name:'Child',parent_name:'Parent',monthly_fee_paise:100}],total_paise:100,old_pending_count:1,old_pending_paise:600000}},
  ]) {
    const f=fixture({prepare:()=>work});const result=await f.handler(call());assert.equal((await result.json()).sent,1);assert.equal(f.calls.some(x=>['create','reconcile','find'].includes(x[0])),false);
    assert.equal(f.sent[0].recipientEmail,work.kind==='send_month_summary'?'approved-admin@example.test':bill.parent_email);
  }
  const revoked=fixture({prepare:()=>null});await revoked.handler(call());assert.equal(revoked.sent.length,0);
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
