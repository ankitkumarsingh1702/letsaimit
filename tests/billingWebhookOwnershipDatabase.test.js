import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomUUID,webcrypto} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createBillingWebhookHandler,createRazorpayClient} from '../supabase/functions/_shared/razorpay-billing.js';

const directory=new URL('../supabase/migrations/',import.meta.url);
const names=(await readdir(directory)).filter(name=>name.endsWith('.sql')).sort();
const ownershipName=names.find(name=>name.endsWith('_owned_billing_webhook_intake.sql'));
const owner={id:randomUUID(),email:'owner@example.test'};
const parent={id:randomUUID(),email:'parent@example.test'};
const claims=user=>({sub:user.id,email:user.email,app_metadata:{provider:'google'}});

test('owned webhook intake isolates targets without losing early events or retained financial history',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin;
    create schema auth;create table auth.users(id uuid primary key,email text);
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
    grant usage on schema auth to anon,authenticated;grant execute on function auth.jwt(),auth.uid() to anon,authenticated;`);
  for(const name of names.filter(name=>name!==ownershipName))await db.exec(await readFile(new URL(name,directory),'utf8'));
  for(const user of [owner,parent])await db.query('insert into auth.users values($1,$2)',[user.id,user.email]);
  await db.query('insert into public.allowed_admins(email,is_owner) values($1,true)',[owner.email]);
  await db.exec('update private.billing_settings set enabled=true where id');
  const rpc=async(name,args=[])=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0].value;
  async function as(role,user,run){
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(user?claims(user):{})]);
    await db.exec('set role '+role);
    try{return await run();}finally{await db.exec('reset role');await db.query("select set_config('request.jwt.claims','{}',false)");}
  }
  const service=(name,args)=>as('service_role',null,()=>rpc(name,args));
  const terms=await rpc('get_billing_terms');
  const bills=[];
  for(let index=0;index<3;index++){
    const input={full_name:'Synthetic parent',email:parent.email,phone:'+12025550123',metadata:{
      submissionId:randomUUID(),formType:'enrol',childName:'Synthetic child '+index,age:'9',
      community:'Synthetic community',sport:'Basketball',phoneCountry:'US',address:'Synthetic address',note:'',
      guardianConsent:true,termsAccepted:true,consentVersion:'2026-11-09',termsVersion:'2026-11-05',
      billingPricingMode:'custom_quote',billingConsent:true,billingTermsVersion:terms.version}};
    const receipt=await as('authenticated',parent,()=>rpc('submit_registration',[JSON.stringify(input)]));
    await as('authenticated',owner,()=>rpc('review_registration',[receipt.id,'accepted',1,600000]));
    bills.push((await db.query('select i.* from private.billing_invoices i join private.billing_accounts a on a.id=i.account_id where a.registration_id=$1',[receipt.id])).rows[0]);
  }
  // A migration may encounter unresolved receipts saved by an older handler.
  const historicalArgs=['evt_pre_upgrade','inv_PreUpgrade',null,'invoice.paid','a'.repeat(64)];
  assert.equal(await service('ingest_billing_webhook',historicalArgs),true);
  const historical=(await db.query('select * from private.billing_webhook_events where event_id=$1',[historicalArgs[0]])).rows[0];
  await db.exec(await readFile(new URL(ownershipName,directory),'utf8'));
  await db.exec(`create table private.webhook_wake_probe(calls integer not null);
    insert into private.webhook_wake_probe values(0);
    create or replace function private.wake_billing_worker() returns void language sql security definer set search_path='' as $$update private.webhook_wake_probe set calls=calls+1$$;`);
  const owned=(args,hint=null)=>service('ingest_owned_billing_webhook',[...args,hint]);
  const snapshot=(invoice,providerId,paymentId=null)=>({provider_invoice_id:providerId,
    receipt:'LAI'+invoice.id.replaceAll('-',''),currency:'INR',amount_paise:invoice.amount_paise,
    paid_paise:paymentId?invoice.amount_paise:0,refunded_paise:0,provider_status:paymentId?'paid':'issued',
    provider_payment_id:paymentId,payment_url:'https://rzp.io/i/synthetic',invoice_url:'https://rzp.io/i/synthetic',
    paid_at:paymentId?new Date().toISOString():null,captured:Boolean(paymentId)});
  const counts=async()=>(await db.query(`select
    (select count(*)::int from private.billing_webhook_events) events,
    (select count(*)::int from private.billing_jobs) jobs,
    (select count(*)::int from private.billing_ledger) ledger,
    (select count(*)::int from private.billing_invoices) invoices,
    (select calls from private.webhook_wake_probe) wakes`)).rows[0];

  await t.test('migration preserves prior unknown receipts and gives the new RPC one service-only signature',async()=>{
    assert.deepEqual((await db.query('select * from private.billing_webhook_events where event_id=$1',[historicalArgs[0]])).rows[0],historical);
    assert.deepEqual(await owned(historicalArgs,randomUUID()),{status:'duplicate'},'existing receipts are checked before foreign ownership');
    await assert.rejects(owned([...historicalArgs.slice(0,4),'b'.repeat(64)],randomUUID()),{code:'PT409'});
    assert.deepEqual((await db.query("select pronargs,pronargdefaults from pg_proc where pronamespace='public'::regnamespace and proname='ingest_owned_billing_webhook'")).rows,[{pronargs:6,pronargdefaults:0}]);
    for(const role of ['anon','authenticated'])await as(role,parent,async()=>{
      await assert.rejects(rpc('ingest_owned_billing_webhook',['evt_denied','inv_Denied',null,'invoice.paid','b'.repeat(64),bills[0].id]),{code:'42501'});
      await assert.rejects(rpc('ingest_billing_webhook',['evt_denied','inv_Denied',null,'invoice.paid','b'.repeat(64)]),{code:'42501'});
    });
  });
  await t.test('unresolved and foreign events never persist, enqueue, wake or alter financial rows',async()=>{
    const before=await counts();
    const args=['evt_unknown','inv_Unknown','pay_Unknown','payment.captured','b'.repeat(64)];
    assert.deepEqual(await owned(args),{status:'unresolved'});
    await assert.rejects(service('ingest_billing_webhook',args),{code:'PT503'},'legacy callers retry instead of bypassing ownership');
    assert.deepEqual(await owned(args,randomUUID()),{status:'foreign'});
    assert.deepEqual(await owned(args,randomUUID()),{status:'foreign'});
    assert.deepEqual(await counts(),before);
  });
  await t.test('a local UUID accepts an early event without inventing its provider binding',async()=>{
    const args=['evt_early','inv_Early','pay_Early','invoice.paid','c'.repeat(64)];
    const before=await counts();
    assert.deepEqual(await owned(args,bills[0].id),{status:'accepted'});
    assert.equal((await db.query('select invoice_id from private.billing_webhook_events where event_id=$1',[args[0]])).rows[0].invoice_id,null);
    assert.deepEqual((await db.query('select provider_invoice_id,paid_paise from private.billing_invoices where id=$1',[bills[0].id])).rows[0],{provider_invoice_id:null,paid_paise:0});
    const after=await counts();assert.equal(after.events,before.events+1);assert.equal(after.jobs,before.jobs);assert.equal(after.ledger,before.ledger);
    assert.deepEqual(await owned(args,bills[0].id),{status:'duplicate'});
    assert.deepEqual(await counts(),after);
    await assert.rejects(owned([...args.slice(0,4),'d'.repeat(64)],bills[0].id),{code:'PT409'});
    await service('save_billing_provider_snapshot',[bills[0].id,JSON.stringify(snapshot(bills[0],'inv_Early'))]);
    await service('enqueue_billing_work',[]);await service('enqueue_billing_work',[]);
    assert.equal((await db.query('select invoice_id from private.billing_webhook_events where event_id=$1',[args[0]])).rows[0].invoice_id,bills[0].id);
    assert.equal((await db.query("select count(*)::int n from private.billing_jobs where dedupe_key='event:evt_early'")).rows[0].n,1);
  });
  await t.test('known provider mappings retain legacy retries and permit distinct failed payment attempts',async()=>{
    await service('save_billing_provider_snapshot',[bills[1].id,JSON.stringify(snapshot(bills[1],'inv_Other','pay_Other'))]);
    const args=['evt_wrapper','inv_Early','pay_FailedAttempt','payment.failed','d'.repeat(64)];
    assert.equal(await service('ingest_billing_webhook',args),true);
    assert.equal(await service('ingest_billing_webhook',args),false);
    assert.deepEqual(await owned(['evt_other_attempt','inv_Other','pay_AnotherAttempt','payment.failed','e'.repeat(64)],bills[1].id),{status:'accepted'});
    assert.equal((await db.query("select count(*)::int n from private.billing_jobs where dedupe_key='event:evt_wrapper'")).rows[0].n,1);
  });
  await t.test('contradictory local IDs or UUID evidence fail without introducing rows',async()=>{
    const before=await counts();
    for(const [invoiceId,paymentId,hint] of [
      ['inv_Early','pay_Other',null],
      ['inv_Early',null,bills[1].id],
      ['inv_Early',null,randomUUID()],
      ['inv_NotTheSavedInvoice',null,bills[0].id],
      ['inv_NotTheSavedInvoice','pay_Other',null],
    ])await assert.rejects(owned(['evt_conflict',invoiceId,paymentId,'invoice.paid','f'.repeat(64)],hint),{code:'PT409'});
    await assert.rejects(owned(['evt_invalid',null,null,'invoice.paid','f'.repeat(64)],bills[0].id),{code:'22023'});
    assert.deepEqual(await counts(),before);
  });
  await t.test('signed handler and exact provider reads obey the real SQL ownership and retry contract',async()=>{
    const secret='synthetic-integrated-webhook-secret';
    const invoiceId='inv_IntegratedLocal',paymentId='pay_IntegratedLocal';
    const providerInvoice={entity:'invoice',id:invoiceId,receipt:'LAI'+bills[2].id.replaceAll('-',''),notes:{billing_id:bills[2].id}};
    const providerPayment={entity:'payment',id:paymentId,invoice_id:invoiceId,notes:[]};
    const foreignId=randomUUID(),foreignInvoiceId='inv_IntegratedForeign';
    const replies=[providerInvoice,providerPayment,providerInvoice,
      {entity:'invoice',id:foreignInvoiceId,receipt:'LAI'+foreignId.replaceAll('-',''),notes:{billing_id:foreignId}},
      {entity:'payment',id:'pay_IntegratedPending',invoice_id:null,notes:[]},
      new Response(JSON.stringify({error:{description:'synthetic temporary failure'}}),{status:500})];
    const requests=[],intakes=[];
    const client=createRazorpayClient({keyId:'rzp_live_synthetic',keySecret:'synthetic-provider-secret',
      fetch:async(url,options)=>{
        requests.push({url,method:options.method});
        assert.equal(options.method,'GET');assert.equal(options.body,undefined);
        assert.equal(options.signal.aborted,false);
        assert.ok(replies.length,'No additional provider requests are allowed');
        const value=replies.shift();
        return value instanceof Response?value:new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
      }});
    const handler=createBillingWebhookHandler({secret,crypto:webcrypto,
      resolveOwnership:(ids,options)=>client.resolveWebhookOwnership(ids,options),
      rpc:async(name,args,options)=>{
        assert.equal(name,'ingest_owned_billing_webhook');
        const fields=Object.keys(args);
        assert.deepEqual(fields,['p_event_id','p_invoice_id','p_payment_id','p_event_type','p_payload_hash','p_billing_id']);
        assert.equal(options.signal.aborted,false);
        // Named parameters exercise the exact handler/PostgREST/SQL contract.
        const result=await as('service_role',null,async()=>(await db.query(
          `select public.ingest_owned_billing_webhook(${fields.map((field,index)=>field+'=>$'+(index+1)).join(',')}) value`,
          fields.map(field=>args[field]))).rows[0].value);
        intakes.push({eventId:args.p_event_id,status:result.status});return result;
      }});
    const request=(eventId,eventType,payload)=>{
      const raw=JSON.stringify({entity:'event',event:eventType,payload});
      return new Request('https://example.test/webhook',{method:'POST',body:raw,headers:{
        'x-razorpay-event-id':eventId,'x-razorpay-signature':createHmac('sha256',secret).update(raw).digest('hex')}});
    };
    const before=await counts();
    const paymentRequest=()=>request('evt_integrated_payment','payment.captured',{payment:{entity:providerPayment}});
    const refundRequest=()=>request('evt_integrated_refund','refund.processed',{
      refund:{entity:{entity:'refund',id:'rfnd_IntegratedLocal',payment_id:paymentId,notes:[]}}});
    for(const makeRequest of [paymentRequest,refundRequest]){
      assert.equal((await handler(makeRequest())).status,200);
      const saved=await counts(),reads=requests.length;
      assert.equal((await handler(makeRequest())).status,200);
      assert.deepEqual(await counts(),saved,'An identical retry must not persist or wake again');
      assert.equal(requests.length,reads,'A durable duplicate must not perform another provider lookup');
    }
    assert.deepEqual(requests,[
      {url:'https://api.razorpay.com/v1/invoices/'+invoiceId,method:'GET'},
      {url:'https://api.razorpay.com/v1/payments/'+paymentId,method:'GET'},
      {url:'https://api.razorpay.com/v1/invoices/'+invoiceId,method:'GET'},
    ]);
    assert.deepEqual((await db.query("select event_id,invoice_id,provider_invoice_id,provider_payment_id from private.billing_webhook_events where event_id like 'evt_integrated_%' order by event_id")).rows,[
      {event_id:'evt_integrated_payment',invoice_id:null,provider_invoice_id:invoiceId,provider_payment_id:paymentId},
      {event_id:'evt_integrated_refund',invoice_id:null,provider_invoice_id:invoiceId,provider_payment_id:paymentId},
    ]);
    assert.deepEqual((await db.query('select provider_invoice_id,provider_payment_id,paid_paise from private.billing_invoices where id=$1',[bills[2].id])).rows[0],
      {provider_invoice_id:null,provider_payment_id:null,paid_paise:0});
    const afterLocal=await counts();
    assert.deepEqual(afterLocal,{...before,events:before.events+2,wakes:before.wakes+2});
    assert.equal((await handler(request('evt_integrated_foreign','payment.captured',{
      payment:{entity:{entity:'payment',id:'pay_IntegratedForeign',invoice_id:foreignInvoiceId,notes:[]}}}))).status,200);
    assert.deepEqual(await counts(),afterLocal,'Foreign ownership creates no receipt, job, wake or financial row');
    assert.equal((await handler(request('evt_integrated_pending','refund.processed',{
      refund:{entity:{entity:'refund',id:'rfnd_IntegratedPending',payment_id:'pay_IntegratedPending',notes:[]}}}))).status,503);
    assert.deepEqual(await counts(),afterLocal,'A payment without an invoice association remains retryable with no receipt, job or financial row');
    assert.equal((await handler(request('evt_integrated_transient','payment.captured',{
      payment:{entity:{entity:'payment',id:'pay_IntegratedRetry',invoice_id:'inv_IntegratedRetry',notes:[]}}}))).status,503);
    assert.deepEqual(await counts(),afterLocal,'Provider failure must remain retryable without persisting an unresolved receipt');
    assert.equal(replies.length,0);assert.equal(requests.length,6);
    assert.deepEqual(intakes,[
      {eventId:'evt_integrated_payment',status:'unresolved'},{eventId:'evt_integrated_payment',status:'accepted'},{eventId:'evt_integrated_payment',status:'duplicate'},
      {eventId:'evt_integrated_refund',status:'unresolved'},{eventId:'evt_integrated_refund',status:'accepted'},{eventId:'evt_integrated_refund',status:'duplicate'},
      {eventId:'evt_integrated_foreign',status:'unresolved'},{eventId:'evt_integrated_foreign',status:'foreign'},
      {eventId:'evt_integrated_pending',status:'unresolved'},
      {eventId:'evt_integrated_transient',status:'unresolved'},
    ]);
  });
  await t.test('retained retired invoice IDs remain owned without trusting event amounts',async()=>{
    const retired=(await db.query(`insert into private.billing_invoices(account_id,kind,base_invoice_id,fee_date,period_start,due_date,
      base_amount_paise,late_fee_paise,provider_invoice_id,provider_payment_id,provider_status,status,paid_paise)
      values($1,'late_fee',$2,current_date,$3,now(),0,100,'inv_Retired','pay_Retired','paid','paid',100) returning *`,
      [bills[2].account_id,bills[2].id,bills[2].period_start])).rows[0];
    const before=(await db.query('select amount_paise,paid_paise,refunded_paise from private.billing_invoices where id=$1',[retired.id])).rows[0];
    assert.deepEqual(await owned(['evt_retired_refund',null,'pay_Retired','refund.processed','1'.repeat(64)]),{status:'accepted'});
    assert.equal((await db.query("select invoice_id from private.billing_webhook_events where event_id='evt_retired_refund'")).rows[0].invoice_id,retired.id);
    assert.equal((await db.query("select count(*)::int n from private.billing_jobs where dedupe_key='event:evt_retired_refund'")).rows[0].n,1);
    assert.deepEqual((await db.query('select amount_paise,paid_paise,refunded_paise from private.billing_invoices where id=$1',[retired.id])).rows[0],before);
  });
});
