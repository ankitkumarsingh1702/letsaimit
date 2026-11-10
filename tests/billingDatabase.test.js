import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const directory=new URL('../supabase/migrations/',import.meta.url);
// Preserve the original fixed-price/legacy contract as an upgrade regression.
// The custom-quote suite exercises the complete current migration chain.
const names=(await readdir(directory)).filter(n=>n.endsWith('.sql')&&n.slice(0,14)<='20261109225158').sort();
const files=await Promise.all(names.map(n=>readFile(new URL(n,directory),'utf8')));
const admin={id:randomUUID(),email:'owner@example.test'};
const parent={id:randomUUID(),email:'parent@example.test'};
const other={id:randomUUID(),email:'other@example.test'};
const claims=user=>({sub:user.id,email:user.email,app_metadata:{provider:'google'}});
const body=(type='enrol')=>({full_name:'Synthetic parent',email:'parent@example.test',phone:'+12025550123',metadata:{submissionId:randomUUID(),formType:type,childName:'Synthetic child',age:'9',community:'Synthetic community',sport:'Basketball',phoneCountry:'US',address:'Synthetic address',note:'',guardianConsent:true,termsAccepted:type==='enrol',consentVersion:'2026-11-09',termsVersion:type==='enrol'?'2026-11-05':''}});

test('billing database enforces consent, identity, monthly invoices and verified accounting',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin;
    create schema auth;create table auth.users(id uuid primary key);
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
    grant usage on schema auth to anon,authenticated;grant execute on function auth.jwt(),auth.uid() to anon,authenticated;`);
  for(const u of [admin,parent,other])await db.query('insert into auth.users(id) values($1)',[u.id]);
  const rpc=async(name,args=[])=> (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0].value;
  async function as(role,user,fn){await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(user?claims(user):{})]);await db.exec(`set role ${role}`);try{return await fn();}finally{await db.exec('reset role');await db.query("select set_config('request.jwt.claims','{}',false)");}}
  const service=(name,args=[])=>as('service_role',null,()=>rpc(name,args));
  const submit=input=>as('authenticated',parent,()=>rpc('submit_registration',[JSON.stringify(input)]));
  const accept=receipt=>as('authenticated',admin,()=>rpc('review_registration',[receipt.id,'accepted',1]));
  for(const sql of files)await db.exec(sql);
  await db.query('insert into public.allowed_admins(email,is_owner) values($1,true)',[admin.email]);
  let invoice,account,savedBody,receipt,terms;
  const snapshot=(overrides={})=>({provider_invoice_id:'inv_SyntheticOne',receipt:'LAI'+invoice.id.replaceAll('-',''),currency:'INR',amount_paise:100,paid_paise:0,refunded_paise:0,provider_status:'issued',provider_payment_id:null,payment_url:'https://rzp.io/i/synthetic',invoice_url:'https://rzp.io/i/synthetic',paid_at:null,captured:false,...overrides});
  const save=value=>service('save_billing_provider_snapshot',[invoice.id,JSON.stringify(value)]);

  await t.test('safe public terms expose no credentials or private registration fields',async()=>{
    terms=await as('anon',null,()=>rpc('get_billing_terms'));
    assert.equal(terms.enabled,false);assert.equal(terms.charge_amount_paise,100);assert.equal(terms.regular_amount_paise,60000);assert.equal(terms.first_due_days,4);
    assert.match(terms.version,/^billing-2026-11-10-[a-f0-9]{64}$/);
    assert.deepEqual(Object.keys(terms).sort(),['charge_amount_paise','due_day','enabled','first_due_days','late_fee_paise','late_fee_policy','late_fees_enabled','regular_amount_paise','team_testing','version']);
    assert.deepEqual((await as('authenticated',parent,()=>rpc('list_my_billing'))).invoices,[]);
  });
  await t.test('dispatch-disabled enrolments, trials and already accepted rows never become charges',async()=>{
    const old=await submit(body());await accept(old);
    await db.exec('update private.billing_settings set enabled=true where id');
    terms=await rpc('get_billing_terms');
    const trial=await submit(body('trial'));await accept(trial);
    await service('enqueue_billing_work');
    assert.equal((await db.query('select count(*)::int n from private.billing_accounts')).rows[0].n,0);
  });
  await t.test('new enrolment requires exact current billing consent and ignores client-selected prices',async()=>{
    const missing=body();
    await assert.rejects(submit(missing),{code:'PT412'});
    missing.metadata.billingTermsVersion=terms.version;
    await assert.rejects(submit(missing),{code:'22023'});
    savedBody=body();savedBody.metadata.billingConsent=true;savedBody.metadata.billingTermsVersion=terms.version;
    savedBody.metadata.billingTerms={charge_amount_paise:1,late_fees_enabled:true};
    receipt=await submit(savedBody);
    const stored=(await db.query('select metadata from public.registrations where id=$1',[receipt.id])).rows[0].metadata;
    assert.equal(stored.billingTerms.charge_amount_paise,100);assert.equal(stored.billingTerms.late_fees_enabled,false);
    assert.equal((await db.query('select count(*)::int n from private.billing_accounts')).rows[0].n,0,'submission alone does not bill');
    await accept(receipt);
    invoice=(await db.query('select * from private.billing_invoices')).rows[0];account=(await db.query('select * from private.billing_accounts')).rows[0];
    assert.equal(invoice.amount_paise,100);assert.equal(invoice.kind,'monthly');assert.equal(invoice.status,'creating');assert.equal(account.parent_user_id,parent.id);
    const approved=(await db.query('select reviewed_at from public.registrations where id=$1',[receipt.id])).rows[0].reviewed_at;
    assert.equal(new Date(invoice.due_date)-new Date(approved),4*86400000);
    await as('authenticated',admin,()=>rpc('review_registration',[receipt.id,'accepted',1]));
    assert.equal((await db.query('select count(*)::int n from private.billing_invoices')).rows[0].n,1);
  });
  await t.test('saved same-owner receipt survives a price change; future cycles keep the accepted price',async()=>{
    await db.exec('update private.billing_settings set team_testing=false,charge_amount_paise=60000,late_fees_enabled=true where id');
    assert.equal((await submit(savedBody)).duplicate,true);
    await assert.rejects(submit({...savedBody,full_name:'Changed'}),{code:'PT409'});
    await db.query("update private.billing_accounts set start_month=(date_trunc('month',now() at time zone 'Asia/Kolkata')-interval '1 month')::date where id=$1",[account.id]);
    await db.query("update private.billing_invoices set period_start=(date_trunc('month',now() at time zone 'Asia/Kolkata')-interval '1 month')::date where id=$1",[invoice.id]);
    await service('enqueue_billing_work');await service('enqueue_billing_work');
    const bills=(await db.query('select amount_paise,period_start,due_date from private.billing_invoices order by period_start')).rows;
    assert.equal(bills.length,2);assert.ok(bills.every(b=>b.amount_paise===100));
    const next=bills[1];assert.equal(new Date(next.due_date).toLocaleString('en-CA',{timeZone:'Asia/Kolkata',day:'2-digit'}),'05');
    await db.exec('update private.billing_settings set team_testing=true,charge_amount_paise=100,late_fees_enabled=false where id');
  });
  await t.test('private tables and service mutations are denied to anonymous and signed-in parents/admins',async()=>{
    for(const role of ['anon','authenticated'])await as(role,role==='authenticated'?admin:null,async()=>{
      for(const name of ['enqueue_billing_work','claim_billing_job'])await assert.rejects(rpc(name),{code:'42501'});
      await assert.rejects(rpc('prepare_billing_job',[randomUUID(),randomUUID()]),{code:'42501'});
      await assert.rejects(rpc('save_billing_provider_snapshot',[invoice.id,JSON.stringify(snapshot())]),{code:'42501'});
      await assert.rejects(rpc('ingest_billing_webhook',['evt_1',null,null,'invoice.paid','a'.repeat(64)]),{code:'42501'});
      for(const name of ['billing_settings','billing_accounts','billing_invoices','billing_ledger','billing_jobs','billing_webhook_events'])await assert.rejects(db.query(`select * from private.${name}`),{code:'42501'});
    });
    await as('anon',null,()=>assert.rejects(rpc('list_my_billing'),{code:'42501'}));
    await as('authenticated',parent,()=>assert.rejects(rpc('list_admin_billing'),{code:'42501'}));
    assert.deepEqual((await as('authenticated',other,()=>rpc('list_my_billing'))).invoices,[]);
    const mine=await as('authenticated',parent,()=>rpc('list_my_billing'));
    assert.equal(mine.invoices.length,2);assert.equal(mine.invoices[0].parent_email,undefined);assert.equal(mine.invoices[0].provider_payment_id,undefined);
    assert.equal((await as('authenticated',admin,()=>rpc('list_admin_billing'))).invoices.length,2);
  });
  await t.test('ambiguous provider creation is never reclaimed as another create; receipt reconciliation is queued',async()=>{
    const job=await service('claim_billing_job');assert.equal(job.kind,'create_invoice');
    const prepared=await service('prepare_billing_job',[job.id,job.leaseToken]);assert.equal(prepared.invoice.receipt.length,35);
    assert.equal(prepared.invoice.amount_paise,100);assert.equal(prepared.invoice.parent_email,parent.email);
    assert.equal(prepared.invoice.late_fees_enabled,false);assert.equal(prepared.invoice.late_fee_policy,'daily');assert.equal(prepared.invoice.late_fee_rate_paise,10000);
    await db.query("update private.billing_jobs set lease_until=now()-interval '1 second' where id=$1",[job.id]);
    await service('enqueue_billing_work');
    const stale=(await db.query('select * from private.billing_jobs where id=$1',[job.id])).rows[0];assert.equal(stale.state,'ambiguous');
    assert.equal(await service('finish_billing_job',[job.id,job.leaseToken,'done','']),false);
    assert.ok((await db.query("select kind from private.billing_jobs where invoice_id=$1 and kind='reconcile_invoice'",[prepared.invoice.id])).rows.length>0);
    assert.equal((await db.query("select count(*)::int n from private.billing_jobs where invoice_id=$1 and kind='create_invoice'",[prepared.invoice.id])).rows[0].n,1);
  });
  await t.test('unknown verified webhooks persist until a matching native invoice is known; retries dedupe',async()=>{
    const args=['evt_SyntheticOne','inv_SyntheticOne',null,'invoice.paid','b'.repeat(64)];
    assert.equal(await service('ingest_billing_webhook',args),true);assert.equal(await service('ingest_billing_webhook',args),false);
    await assert.rejects(service('ingest_billing_webhook',[...args.slice(0,4),'c'.repeat(64)]),{code:'PT409'});
    assert.equal((await db.query('select invoice_id from private.billing_webhook_events where event_id=$1',[args[0]])).rows[0].invoice_id,null);
    await save(snapshot());await service('enqueue_billing_work');
    const saved=(await db.query('select invoice_id,applied_at from private.billing_webhook_events where event_id=$1',[args[0]])).rows[0];
    assert.equal(saved.invoice_id,invoice.id);assert.equal(saved.applied_at,null,'a creation snapshot does not silently consume a newer payment event');
    assert.equal((await db.query("select count(*)::int n from private.billing_jobs where dedupe_key='event:evt_SyntheticOne'")).rows[0].n,1);
  });
  await t.test('amount, receipt, currency, capture, identity and hosted URL mismatches cannot mark paid',async()=>{
    for(const invalid of [snapshot({amount_paise:60000}),snapshot({receipt:'wrong'}),snapshot({currency:'USD'}),snapshot({provider_invoice_id:'inv_Other'}),snapshot({payment_url:'https://evil.test/pay'}),snapshot({paid_paise:100,captured:false,provider_payment_id:'pay_One',paid_at:new Date().toISOString()}),snapshot({paid_paise:50,captured:true,provider_payment_id:'pay_One',paid_at:new Date().toISOString()})])await assert.rejects(save(invalid),{code:'22023'});
    const unpaid=(await db.query('select status,paid_paise from private.billing_invoices where id=$1',[invoice.id])).rows[0];assert.deepEqual(unpaid,{status:'pending',paid_paise:0});
    assert.equal((await db.query('select count(*)::int n from private.billing_ledger')).rows[0].n,0);
  });
  await t.test('only captured money enters the ledger; retries/out-of-order snapshots never double-count or regress refunds',async()=>{
    const paid=snapshot({provider_status:'paid',paid_paise:100,captured:true,provider_payment_id:'pay_One',paid_at:new Date().toISOString()});
    await save(paid);await save(paid);await save(snapshot());
    assert.deepEqual((await db.query('select status,paid_paise from private.billing_invoices where id=$1',[invoice.id])).rows[0],{status:'paid',paid_paise:100});
    assert.equal((await db.query("select count(*)::int n from private.billing_ledger where kind='capture'")).rows[0].n,1);
    assert.equal((await db.query("select count(*)::int n from private.billing_jobs where kind='send_receipt'")).rows[0].n,1);
    await save({...paid,refunded_paise:25});await save({...paid,refunded_paise:25});await save({...paid,refunded_paise:100});await save(paid);
    const final=(await db.query('select status,paid_paise,refunded_paise from private.billing_invoices where id=$1',[invoice.id])).rows[0];assert.deepEqual(final,{status:'refunded',paid_paise:100,refunded_paise:100});
    const summary=(await as('authenticated',admin,()=>rpc('list_admin_billing'))).summary;assert.equal(summary.captured_paise,100);assert.equal(summary.refunded_paise,100);
    assert.equal((await db.query("select sum(amount_paise)::int n from private.billing_ledger where kind='refund'")).rows[0].n,100);
  });
  await t.test('team mode never creates real late fees; cancelled future billing is audited and revision-safe',async()=>{
    await db.query("update private.billing_invoices set due_date=now()-interval '4 days' where account_id=$1",[account.id]);
    await service('enqueue_billing_work');
    assert.equal((await db.query("select count(*)::int n from private.billing_invoices where kind='late_fee'")).rows[0].n,0);
    await as('authenticated',parent,()=>assert.rejects(rpc('cancel_billing_account',[receipt.id,1]),{code:'42501'}));
    await as('authenticated',admin,()=>assert.rejects(rpc('cancel_billing_account',[receipt.id,2]),{code:'PT409'}));
    const result=await as('authenticated',admin,()=>rpc('cancel_billing_account',[receipt.id,1]));
    assert.equal(result.status,'cancelled');assert.equal(result.revision,2);assert.equal(result.cancelled_by,admin.email);
    assert.equal((await as('authenticated',admin,()=>rpc('cancel_billing_account',[receipt.id,1]))).revision,2);
    const before=(await db.query('select count(*)::int n from private.billing_invoices')).rows[0].n;
    await db.query("update private.billing_accounts set start_month=start_month-interval '1 month' where id=$1",[account.id]);
    await service('enqueue_billing_work');assert.equal((await db.query('select count(*)::int n from private.billing_invoices')).rows[0].n,before);
  });
  await t.test('real daily fees accrue each missing overdue date once as separate invoices and stop before issuance after capture',async()=>{
    await db.exec('update private.billing_settings set team_testing=false,charge_amount_paise=60000,late_fees_enabled=true where id');
    const realTerms=await rpc('get_billing_terms');const input=body();input.metadata.billingConsent=true;input.metadata.billingTermsVersion=realTerms.version;
    const realReceipt=await submit(input);await accept(realReceipt);
    const realInvoice=(await db.query('select i.* from private.billing_invoices i join private.billing_accounts a on a.id=i.account_id where a.registration_id=$1',[realReceipt.id])).rows[0];
    const realSnapshot={...snapshot(),provider_invoice_id:'inv_RegularInvoice',receipt:'LAI'+realInvoice.id.replaceAll('-',''),amount_paise:60000};
    await service('save_billing_provider_snapshot',[realInvoice.id,JSON.stringify(realSnapshot)]);
    await db.query("update private.billing_invoices set due_date=(((now() at time zone 'Asia/Kolkata')::date-3)+time '23:59:59') at time zone 'Asia/Kolkata' where id=$1",[realInvoice.id]);
    await service('enqueue_billing_work');await service('enqueue_billing_work');
    const fees=(await db.query("select * from private.billing_invoices where base_invoice_id=$1 order by fee_date",[realInvoice.id])).rows;
    assert.equal(fees.length,3);assert.ok(fees.every(f=>f.amount_paise===10000&&f.base_amount_paise===0));assert.equal(new Set(fees.map(f=>String(f.fee_date))).size,3);
    assert.equal((await db.query('select amount_paise from private.billing_invoices where id=$1',[realInvoice.id])).rows[0].amount_paise,60000,'issued monthly amount stays unchanged');
    const job=(await db.query("select * from private.billing_jobs where invoice_id=$1 and kind='create_invoice'",[fees[0].id])).rows[0];const lease=randomUUID();
    await db.query("update private.billing_jobs set state='processing',attempts=1,lease_token=$2,lease_until=now()+interval '2 minutes' where id=$1",[job.id,lease]);
    const prepared=await service('prepare_billing_job',[job.id,lease]);
    assert.equal(prepared.invoice.base_invoice.id,realInvoice.id);assert.equal(prepared.invoice.base_invoice.amount_paise,60000);assert.equal(prepared.invoice.base_invoice.provider_invoice_id,'inv_RegularInvoice');
    await service('save_billing_provider_snapshot',[realInvoice.id,JSON.stringify({...realSnapshot,provider_status:'paid',paid_paise:60000,captured:true,provider_payment_id:'pay_RegularCaptured',paid_at:new Date().toISOString()})]);
    assert.equal(await service('prepare_billing_job',[job.id,lease]),null);
    assert.equal((await db.query('select status from private.billing_invoices where id=$1',[fees[0].id])).rows[0].status,'cancelled');
    await service('enqueue_billing_work');assert.equal((await db.query('select count(*)::int n from private.billing_invoices where base_invoice_id=$1',[realInvoice.id])).rows[0].n,3);
  });
  await t.test('queued reminders recheck cancelled account state and failed creations are visibly failed',async()=>{
    const unpaid=(await db.query('select * from private.billing_invoices where account_id=$1 and paid_paise=0 limit 1',[account.id])).rows[0];
    const lease=randomUUID();const jobId=randomUUID();
    await db.query("update private.billing_invoices set status='pending',payment_url='https://rzp.io/i/synthetic',provider_invoice_id='inv_CancelReminder' where id=$1",[unpaid.id]);
    await db.query("insert into private.billing_jobs(id,invoice_id,kind,dedupe_key,state,attempts,lease_token,lease_until) values($1,$2,'send_reminder','synthetic-cancel-reminder','processing',1,$3,now()+interval '2 minutes')",[jobId,unpaid.id,lease]);
    assert.equal(await service('prepare_billing_job',[jobId,lease]),null);
    const newTerms=await rpc('get_billing_terms');const fresh=body();fresh.metadata.billingConsent=true;fresh.metadata.billingTermsVersion=newTerms.version;
    const r=await submit(fresh);await accept(r);
    const failedInvoice=(await db.query('select i.id from private.billing_invoices i join private.billing_accounts a on a.id=i.account_id where a.registration_id=$1',[r.id])).rows[0].id;
    await db.query("update private.billing_jobs set state='failed',failure_code='provider_mismatch' where invoice_id=$1 and kind='create_invoice'",[failedInvoice]);
    const all=await as('authenticated',admin,()=>rpc('list_admin_billing'));assert.equal(all.invoices.find(i=>i.id===failedInvoice).status,'failed');assert.equal(all.summary.failed_count,1);
  });
});
