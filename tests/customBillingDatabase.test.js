import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile,readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const directory=new URL('../supabase/migrations/',import.meta.url);
const names=(await readdir(directory)).filter(n=>n.endsWith('.sql')).sort();
const files=await Promise.all(names.map(n=>readFile(new URL(n,directory),'utf8')));
const customIndex=names.findIndex(n=>n.endsWith('_custom_coaching_fees.sql'));
const admin={id:randomUUID(),email:'owner@example.test'},backup={id:randomUUID(),email:'backup@gmail.com'};
const parent={id:randomUUID(),email:'verified.parent@example.test'},other={id:randomUUID(),email:'verified.other@example.test'};
const claims=u=>({sub:u.id,email:u.email,app_metadata:{provider:'google'}});
function form(type='enrol',terms=null,child='Synthetic child'){
  return {full_name:'Synthetic parent',email:'different.contact@example.test',phone:'+12025550123',metadata:{submissionId:randomUUID(),formType:type,childName:child,
    age:'9',community:'Synthetic community',sport:'Basketball',phoneCountry:'US',address:'Synthetic address',note:'',guardianConsent:true,
    termsAccepted:type==='enrol',consentVersion:'2026-11-09',termsVersion:type==='enrol'?'2026-11-05':'',
    ...(terms?{billingConsent:true,billingTermsVersion:terms.version,...(terms.pricing_model==='custom_quote'?{billingPricingMode:'custom_quote'}:{})}:{})}};
}
async function setup(t,{upgrade=true}={}){
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin;
    create schema auth;create table auth.users(id uuid primary key,email text);
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
    grant usage on schema auth to anon,authenticated;grant execute on function auth.jwt(),auth.uid() to anon,authenticated;`);
  for(const u of [admin,backup,parent,other])await db.query('insert into auth.users(id,email) values($1,$2)',[u.id,u.email]);
  for(let i=0;i<(upgrade?files.length:customIndex);i++)await db.exec(files[i]);
  await db.query('insert into public.allowed_admins(email,is_owner) values($1,true),($2,false)',[admin.email,backup.email]);
  const rpc=async(name,args=[])=> (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0].value;
  async function as(role,user,fn){await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(user?claims(user):{})]);await db.exec(`set role ${role}`);try{return await fn();}finally{await db.exec('reset role');await db.query("select set_config('request.jwt.claims','{}',false)");}}
  const service=(name,args=[])=>as('service_role',null,()=>rpc(name,args));
  const submit=(input,user=parent)=>as('authenticated',user,()=>rpc('submit_registration',[JSON.stringify(input)]));
  const approve=(r,amount,user=admin)=>as('authenticated',user,()=>rpc('review_registration',[r.id,'accepted',1,amount]));
  const edit=(id,amount,revision,user=admin)=>as('authenticated',user,()=>rpc('set_monthly_coaching_fee',[id,amount,revision]));
  const accountFor=async id=>(await db.query('select * from private.billing_accounts where registration_id=$1',[id])).rows[0];
  const invoiceFor=async id=>(await db.query('select i.* from private.billing_invoices i join private.billing_accounts a on a.id=i.account_id where a.registration_id=$1 and i.kind=\'monthly\' order by i.period_start',[id])).rows;
  const prepareAt=async(job,at)=>{
    const token=randomUUID();await db.query("update private.billing_jobs set state='processing',attempts=greatest(attempts,1),lease_token=$2,lease_until=$3::timestamptz+interval '2 minutes' where id=$1",[job.id,token,at]);
    return {token,value:(await db.query('select private.prepare_billing_job_at($1,$2,$3) value',[job.id,token,at])).rows[0].value};
  };
  return {db,rpc,as,service,submit,approve,edit,accountFor,invoiceFor,prepareAt};
}

test('custom quotes upgrade without changing legacy consent or past invoices',async t=>{
  const x=await setup(t,{upgrade:false});const {db,rpc,as,submit,approve,edit,accountFor,invoiceFor,service,prepareAt}=x;
  await db.exec('update private.billing_settings set enabled=true where id');
  const oldTerms=await rpc('get_billing_terms');const legacyInput=form('enrol',oldTerms,'Legacy child');
  const legacy=await submit(legacyInput);
  await as('authenticated',admin,()=>rpc('review_registration',[legacy.id,'accepted',1]));
  const oldAccount=await accountFor(legacy.id),oldInvoices=await invoiceFor(legacy.id);
  const pending=await submit(form('enrol',oldTerms,'Old pending'));
  const beforeCount=(await db.query('select count(*)::int n from private.billing_accounts')).rows[0].n;
  for(let i=customIndex;i<files.length;i++)await db.exec(files[i]);
  let terms,receipt,input,account,invoice;

  await t.test('migration keeps legacy invoices and prices; public terms remove fixed checkout pricing',async()=>{
    terms=await rpc('get_billing_terms');assert.equal(terms.enabled,true);assert.equal(terms.pricing_model,'custom_quote');assert.equal(terms.default_amount_paise,600000);
    assert.equal(terms.first_due_days,0);assert.equal(terms.team_testing,undefined);assert.equal(terms.charge_amount_paise,undefined);
    const a=await accountFor(legacy.id);assert.equal(a.pricing_model,'legacy');assert.equal(a.charge_amount_paise,oldAccount.charge_amount_paise);assert.equal(a.team_testing,true);assert.equal(a.late_fees_enabled,false);
    assert.deepEqual(await invoiceFor(legacy.id),oldInvoices);assert.equal((await db.query('select count(*)::int n from private.billing_accounts')).rows[0].n,beforeCount);
    assert.equal((await submit(legacyInput)).duplicate,true,'old saved receipt remains retryable');
    await assert.rejects(approve(pending,600000),{code:'PT412'});
    await assert.rejects(submit(form('enrol',oldTerms)),{code:'PT412'},'old browser cannot consent to arbitrary new quotes');
    await assert.rejects(edit(legacy.id,600000,1),{code:'PT412'},'a legacy consent is not upgraded by the migration or fee editor');
  });
  await t.test('new parent explicitly accepts the custom-quote policy, without selecting the charge amount',async()=>{
    const stale=form('enrol',terms);delete stale.metadata.billingPricingMode;
    await assert.rejects(submit(stale),{code:'PT412'});
    const unchecked=form('enrol',terms);unchecked.metadata.billingConsent=false;await assert.rejects(submit(unchecked),{code:'22023'});
    input=form('enrol',terms);input.metadata.billingTerms={default_amount_paise:1};input.metadata.approved_monthly_amount_paise=1;
    receipt=await submit(input);
    const row=(await db.query('select metadata from public.registrations where id=$1',[receipt.id])).rows[0].metadata;
    assert.equal(row.billingPricingMode,'custom_quote');assert.equal(row.billingTerms.default_amount_paise,600000);assert.equal(row.approved_monthly_amount_paise,undefined);
    assert.equal(await accountFor(receipt.id),undefined,'submitting a quote request does not create an invoice');
  });
  await t.test('approval validates the custom amount and records decision, quote, account and initial invoice atomically',async()=>{
    await assert.rejects(approve(receipt,100,parent),{code:'42501'});
    for(const amount of [null,0,1,99,-100,10000001])await assert.rejects(approve(receipt,amount),{code:'22023'});
    await assert.rejects(approve(receipt,100.5),{code:'22P02'});
    assert.equal((await db.query('select review_decision from public.registrations where id=$1',[receipt.id])).rows[0].review_decision,'pending');
    assert.equal((await db.query('select count(*)::int n from private.billing_approval_quotes where registration_id=$1',[receipt.id])).rows[0].n,0);
    const accepted=await approve(receipt,100);assert.equal(accepted.approved_monthly_amount_paise,100);
    account=await accountFor(receipt.id);invoice=(await invoiceFor(receipt.id))[0];
    assert.equal(account.pricing_model,'custom_quote');assert.equal(account.team_testing,false);assert.equal(account.charge_amount_paise,100);assert.equal(account.late_fees_enabled,true);
    assert.equal(invoice.amount_paise,100);assert.equal(new Date(invoice.due_date).getTime(),Date.parse(accepted.reviewed_at));
    assert.equal((await approve(receipt,100)).approved_monthly_amount_paise,100);
    await assert.rejects(approve(receipt,200),{code:'PT409'});
    assert.equal((await invoiceFor(receipt.id)).length,1);
  });
  await t.test('free trials and declines cannot contain a fee or seed an account',async()=>{
    const trial=await submit(form('trial'));await assert.rejects(approve(trial,100),{code:'22023'});await approve(trial,null);
    assert.equal(await accountFor(trial.id),undefined);
    const declined=await submit(form('enrol',terms));
    await as('authenticated',admin,()=>assert.rejects(rpc('review_registration',[declined.id,'declined',1,100]),{code:'22023'}));
    await as('authenticated',admin,()=>rpc('review_registration',[declined.id,'declined',1,null]));assert.equal(await accountFor(declined.id),undefined);
  });
  await t.test('competing admins cannot save different prices for one approval',async()=>{
    const r=await submit(form('enrol',terms));
    const results=await as('authenticated',admin,()=>Promise.allSettled([rpc('review_registration',[r.id,'accepted',1,300000]),rpc('review_registration',[r.id,'accepted',1,600000])]));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'PT409');
    assert.equal((await invoiceFor(r.id)).length,1);
  });
  await t.test('a failed approval transaction rolls back the decision, quote, account and invoice together',async()=>{
    const r=await submit(form('enrol',terms));
    await as('authenticated',admin,()=>assert.rejects(db.transaction(async tx=>{
      await tx.query('select public.review_registration($1,$2,$3,$4)',[r.id,'accepted',1,600000]);
      throw new Error('synthetic downstream transaction failure');
    }),/synthetic downstream transaction failure/));
    assert.equal((await db.query('select review_decision from public.registrations where id=$1',[r.id])).rows[0].review_decision,'pending');
    assert.equal((await db.query('select count(*)::int n from private.billing_approval_quotes where registration_id=$1',[r.id])).rows[0].n,0);
    assert.equal(await accountFor(r.id),undefined);assert.deepEqual(await invoiceFor(r.id),[]);
  });
  await t.test('fee changes apply next month, preserve issued amounts, audit actors and reject stale edits',async()=>{
    for(const amount of [0,99,10000001])await assert.rejects(edit(receipt.id,amount,1),{code:'22023'});
    await assert.rejects(edit(receipt.id,500000,1,parent),{code:'42501'});
    const saved=await edit(receipt.id,500000,1);assert.equal(saved.monthly_amount_paise,100);assert.equal(saved.next_month_amount_paise,500000);assert.equal(saved.revision,2);
    const effective=(await db.query("select (date_trunc('month',now() at time zone 'Asia/Kolkata')+interval '1 month')::date d")).rows[0].d;
    assert.equal(saved.next_effective_month,effective.toISOString().slice(0,10));
    assert.equal((await edit(receipt.id,500000,1)).revision,2,'same saved edit retry is idempotent');
    await assert.rejects(edit(receipt.id,600000,1),{code:'PT409'});
    const changed=(await db.query('select * from private.billing_price_changes where account_id=$1',[account.id])).rows[0];
    assert.equal(changed.old_amount_paise,100);assert.equal(changed.new_amount_paise,500000);assert.equal(changed.changed_by,admin.email);
    assert.equal((await invoiceFor(receipt.id))[0].amount_paise,100);
    assert.equal((await submit(input)).duplicate,true,'fee changes do not change the original parent submission');
  });
  await t.test('superseded notices cancel; a later reversion still corrects a previously sent price',async()=>{
    const first=(await db.query("select j.* from private.billing_jobs j join private.billing_price_changes c on c.id=j.change_id where c.account_id=$1 order by c.revision",[account.id])).rows[0];
    await edit(receipt.id,600000,2);
    const now=(await db.query('select now() n')).rows[0].n.toISOString();
    assert.equal((await prepareAt(first,now)).value,null,'an old unsent price is never delivered');
    const latest=(await db.query("select j.* from private.billing_jobs j join private.billing_price_changes c on c.id=j.change_id where c.account_id=$1 order by c.revision desc limit 1",[account.id])).rows[0];
    const prepared=await prepareAt(latest,now);assert.equal(prepared.value.invoice.amount_paise,600000);assert.equal(prepared.value.invoice.parent_email,parent.email);
    await service('finish_billing_job',[latest.id,prepared.token,'done','']);
    await edit(receipt.id,100,3);
    const reversal=(await db.query("select j.* from private.billing_jobs j join private.billing_price_changes c on c.id=j.change_id where c.account_id=$1 order by c.revision desc limit 1",[account.id])).rows[0];
    assert.equal((await prepareAt(reversal,now)).value.invoice.amount_paise,100,'sent ₹6000 next-month notice is corrected when reverted to the current ₹1 fee');
  });
  await t.test('competing next-month edits retain one audited winning revision',async()=>{
    const r=await submit(form('enrol',terms));await approve(r,300000);
    const results=await as('authenticated',admin,()=>Promise.allSettled([rpc('set_monthly_coaching_fee',[r.id,500000,1]),rpc('set_monthly_coaching_fee',[r.id,600000,1])]));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'PT409');
    const a=await accountFor(r.id);assert.equal(a.revision,2);assert.equal((await db.query('select count(*)::int n from private.billing_price_changes where account_id=$1',[a.id])).rows[0].n,1);
  });
  await t.test('catch-up cycles use the fee effective in each historical month',async()=>{
    const r=await submit(form('enrol',terms));await approve(r,300000);const a=await accountFor(r.id);await edit(r.id,600000,1);
    await db.query("update private.billing_accounts set start_month=(date_trunc('month',now() at time zone 'Asia/Kolkata')-interval '2 months')::date where id=$1",[a.id]);
    await db.query("update private.billing_invoices set period_start=(date_trunc('month',now() at time zone 'Asia/Kolkata')-interval '2 months')::date where account_id=$1",[a.id]);
    const at=(await db.query("select (date_trunc('month',now() at time zone 'Asia/Kolkata')+interval '2 months 2 days') at time zone 'Asia/Kolkata' d")).rows[0].d;
    await db.query('select private.enqueue_billing_work_at($1)',[at]);
    const invoices=await invoiceFor(r.id);assert.deepEqual(invoices.map(i=>i.amount_paise),[300000,300000,300000,600000,600000]);
    assert.ok(invoices.slice(1).every(i=>new Intl.DateTimeFormat('en',{timeZone:'Asia/Kolkata',day:'2-digit'}).format(i.due_date)==='05'));
    const count=invoices.length;await db.query('select private.enqueue_billing_work_at($1)',[at]);assert.equal((await invoiceFor(r.id)).length,count);
  });
  await t.test('private pricing controls and own/admin snapshots retain their authorization boundaries',async()=>{
    for(const role of ['anon','authenticated'])await as(role,role==='authenticated'?parent:null,async()=>{
      for(const table of ['billing_approval_quotes','billing_price_changes','billing_month_summaries'])await assert.rejects(db.query(`select * from private.${table}`),{code:'42501'});
      await assert.rejects(db.query('select private.enqueue_billing_work_at(now())'),{code:'42501'});
      await assert.rejects(rpc('claim_billing_job'),{code:'42501'});
    });
    assert.deepEqual((await as('authenticated',other,()=>rpc('list_my_billing'))).accounts,[]);
    const mine=await as('authenticated',parent,()=>rpc('list_my_billing'));assert.ok(mine.accounts.every(a=>Number.isInteger(a.monthly_amount_paise)&&Number.isInteger(a.next_month_amount_paise)));
    assert.ok(mine.invoices.every(i=>!('parent_email' in i)));
    assert.equal(mine.upcoming_month.total_paise,mine.upcoming_month.children.reduce((n,r)=>n+r.monthly_fee_paise,0));
  });
});

test('parent reminder slots and month-end admin snapshots are grouped, bounded and private',async t=>{
  const x=await setup(t);const {db,rpc,as,service,submit,approve,edit,accountFor,invoiceFor,prepareAt}=x;
  await db.exec('update private.billing_settings set enabled=true where id');const terms=await rpc('get_billing_terms');
  const r1=await submit(form('enrol',terms,'First child'));await approve(r1,300000);
  const r2=await submit(form('enrol',terms,'Second child'));await approve(r2,200000);
  const r3=await submit(form('enrol',terms,'Other parent child'),other);await approve(r3,100000);
  const a1=await accountFor(r1.id),a2=await accountFor(r2.id),a3=await accountFor(r3.id);
  const i1=(await invoiceFor(r1.id))[0],i2=(await invoiceFor(r2.id))[0],i3=(await invoiceFor(r3.id))[0];
  const day=(await db.query("select (now() at time zone 'Asia/Kolkata')::date::text d")).rows[0].d;
  const at=hour=>`${day}T${hour}:00:00+05:30`;
  const pendingIds=[];
  for(const [index,i]of [i1,i2,i3].entries()){
    await db.query("update private.billing_invoices set status='pending',provider_invoice_id=$2,payment_url=$3,invoice_url=$3,checked_at=null,created_at=$4::timestamptz-interval '1 minute' where id=$1",
      [i.id,`inv_SlotBase${index}`,`https://rzp.io/i/slot${index}`,at('09')]);
    if(index<2)pendingIds.push(i.id);
  }
  for(let index=0;index<23;index++){
    const id=randomUUID();pendingIds.push(id);
    await db.query(`insert into private.billing_invoices(id,account_id,kind,base_invoice_id,fee_date,period_start,due_date,base_amount_paise,late_fee_paise,status,provider_invoice_id,payment_url,invoice_url,created_at)
      values($1,$2,'late_fee',$3,$4::date-$5::integer,$6,$7,0,10000,'pending',$8,$9,$9,$7::timestamptz-interval '1 minute')`,
      [id,a1.id,i1.id,day,index+1,i1.period_start,at('09'),`inv_SlotFee${index}`,`https://rzp.io/i/fee${index}`]);
  }
  let firstJob,firstToken;
  await t.test('one current slot per parent groups all children and late fees; repeating a slot never duplicates it',async()=>{
    await db.query('select private.enqueue_billing_work_at($1)',[at('09')]);await db.query('select private.enqueue_billing_work_at($1)',[at('09')]);
    const jobs=(await db.query("select * from private.billing_jobs where kind='send_reminder' order by dedupe_key")).rows;
    assert.equal(jobs.length,2,'25 invoices for one parent still create one job, plus the other parent');
    firstJob=jobs.find(j=>j.dedupe_key.includes(parent.id));
    const prepared=await prepareAt(firstJob,at('09'));firstToken=prepared.token;
    assert.equal(prepared.value.recipient_email,parent.email,'uses the verified account email, not an arbitrary form contact');
    assert.equal(prepared.value.invoice_count,25);assert.equal(prepared.value.total_paise,730000);
    assert.equal(prepared.value.invoices.length,25);assert.equal(prepared.value.preflight_invoices.length,20);assert.equal(prepared.value.preflight_remaining,25);
    assert.equal(prepared.value.invoices_truncated,false);assert.ok(prepared.value.invoices.some(i=>i.child_name==='Second child'));
    assert.ok(prepared.value.invoices.every(i=>i.registration_id!==r3.id));
  });
  await t.test('25-provider preflight progresses in chunks rather than postponing the group forever',async()=>{
    let work=(await db.query('select private.prepare_billing_job_at($1,$2,$3) value',[firstJob.id,firstToken,at('09')])).rows[0].value;
    for(const i of work.preflight_invoices)await db.query('update private.billing_invoices set checked_at=$2 where id=$1',[i.id,at('09')]);
    work=(await db.query('select private.prepare_billing_job_at($1,$2,$3) value',[firstJob.id,firstToken,at('09')])).rows[0].value;
    assert.equal(work.preflight_remaining,5);assert.equal(work.preflight_invoices.length,5);
    for(const i of work.preflight_invoices)await db.query('update private.billing_invoices set checked_at=$2 where id=$1',[i.id,at('09')]);
    work=(await db.query('select private.prepare_billing_job_at($1,$2,$3) value',[firstJob.id,firstToken,at('09')])).rows[0].value;
    assert.equal(work.preflight_remaining,0);assert.deepEqual(work.preflight_invoices,[]);assert.equal(work.total_paise,730000);
    await db.query("update private.billing_jobs set state='done' where id=$1",[firstJob.id]);
    await db.query('select private.enqueue_billing_work_at($1)',[at('09')]);
    assert.equal((await db.query("select count(*)::int n from private.billing_jobs where dedupe_key=$1",[firstJob.dedupe_key])).rows[0].n,1);
  });
  await t.test('09/12/15/18 are four parent slots; stale queue entries and pre-09 work cannot send',async()=>{
    for(const hour of ['12','15','18'])await db.query('select private.enqueue_billing_work_at($1)',[at(hour)]);
    const jobs=(await db.query("select * from private.billing_jobs where kind='send_reminder' and dedupe_key like $1",[`reminder:${parent.id}:${day}:%`])).rows;
    assert.equal(jobs.length,4);assert.deepEqual(jobs.map(j=>j.dedupe_key.slice(-2)).sort(),['09','12','15','18']);
    const outdated=jobs.find(j=>j.dedupe_key.endsWith(':12'));
    assert.equal((await prepareAt(outdated,at('15'))).value,null,'a delayed worker does not send a missed 12:00 slot at 15:00');
    const before=(await db.query("select count(*)::int n from private.billing_jobs where kind='send_reminder'")).rows[0].n;
    await db.query('select private.enqueue_billing_work_at($1)',[at('08')]);
    assert.equal((await db.query("select count(*)::int n from private.billing_jobs where kind='send_reminder'")).rows[0].n,before);
  });
  await t.test('captured invoices stop the queued group; recovery creates only the current slot and missing identities cancel',async()=>{
    let index=0;
    for(const id of pendingIds){
      const i=(await db.query('select * from private.billing_invoices where id=$1',[id])).rows[0];
      await service('save_billing_provider_snapshot',[id,JSON.stringify({provider_invoice_id:i.provider_invoice_id,receipt:'LAI'+id.replaceAll('-',''),currency:'INR',amount_paise:i.amount_paise,
        paid_paise:i.amount_paise,refunded_paise:0,provider_status:'paid',provider_payment_id:`pay_SlotPaid${index++}`,payment_url:i.payment_url,invoice_url:i.invoice_url,paid_at:new Date().toISOString(),captured:true})]);
    }
    const lateJob=(await db.query("select * from private.billing_jobs where dedupe_key=$1",[`reminder:${parent.id}:${day}:18`])).rows[0];
    assert.equal((await prepareAt(lateJob,at('18'))).value,null,'no reminder after all this parent’s invoices are captured');
    const tomorrow=(await db.query('select ($1::date+1)::text d',[day])).rows[0].d;
    const recovery=`${tomorrow}T15:00:00+05:30`;await db.query('select private.enqueue_billing_work_at($1)',[recovery]);
    const recovered=(await db.query("select * from private.billing_jobs where kind='send_reminder' and dedupe_key like $1",[`reminder:${other.id}:${tomorrow}:%`])).rows;
    assert.equal(recovered.length,1);assert.ok(recovered[0].dedupe_key.endsWith(':15'));
    await db.query('update auth.users set email=null where id=$1',[other.id]);
    assert.equal((await prepareAt(recovered[0],recovery)).value,null,'missing verified email never falls back to a different contact');
    await db.query('update auth.users set email=$2 where id=$1',[other.id,other.email]);
  });
  await t.test('month-end snapshot sends once to each current admin and separates next-month fees from old debt',async()=>{
    await edit(r2.id,250000,1);
    const calendar=(await db.query("select (date_trunc('month',$1::date)+interval '1 month')::date::text next,((date_trunc('month',$1::date)+interval '1 month')::date-1)::text last",[day])).rows[0];
    const late=`${calendar.last}T18:00:00+05:30`;
    await db.query(`insert into private.billing_invoices(account_id,period_start,due_date,base_amount_paise) values($1,$2,$3,999900)`,[a3.id,calendar.next,late]);
    await db.query(`insert into private.billing_invoices(account_id,kind,base_invoice_id,fee_date,period_start,due_date,base_amount_paise,late_fee_paise) values($1,'late_fee',$2,$3::date+1,$4,$5,0,10000)`,[a3.id,i3.id,calendar.next,i3.period_start,late]);
    await db.query('select private.enqueue_billing_work_at($1)',[`${calendar.last}T17:59:00+05:30`]);
    assert.equal((await db.query('select count(*)::int n from private.billing_month_summaries')).rows[0].n,0);
    await db.query('select private.enqueue_billing_work_at($1)',[late]);await db.query('select private.enqueue_billing_work_at($1)',[late]);
    const windows=(await db.query('select * from private.billing_month_summaries')).rows;assert.equal(windows.length,1);
    const s=windows[0].summary;assert.equal(s.month,calendar.next);assert.equal(s.children.length,3);assert.equal(s.total_paise,650000);
    assert.equal(s.children.reduce((n,r)=>n+r.monthly_fee_paise,0),650000);
    const expected=(await db.query(`select coalesce(sum(i.amount_paise-i.paid_paise),0)::int total,count(*)::int n from private.billing_invoices i where i.period_start<$1::date and i.status in ('pending','creating') and (i.kind<>'late_fee' or i.fee_date<=$2::date)`,[calendar.next,calendar.last])).rows[0];
    assert.equal(s.old_pending_paise,expected.total);assert.equal(s.old_pending_count,expected.n);
    const jobs=(await db.query("select * from private.billing_jobs where kind='send_month_summary'")).rows;assert.equal(jobs.length,2);
    await db.query('delete from public.allowed_admins where email=$1',[backup.email]);
    assert.equal((await prepareAt(jobs.find(j=>j.recipient_email===backup.email),late)).value,null);
    const owner=(await prepareAt(jobs.find(j=>j.recipient_email===admin.email),late)).value;assert.equal(owner.recipient_email,admin.email);assert.deepEqual(owner.summary,s);
    await edit(r2.id,260000,2);await db.query('select private.enqueue_billing_work_at($1)',[late]);
    assert.deepEqual((await db.query('select summary from private.billing_month_summaries')).rows[0].summary,s,'generated monthly snapshot is immutable');
    assert.equal((await db.query("select count(*)::int n from private.billing_jobs where kind='send_month_summary'")).rows[0].n,2);
  });
  await t.test('stopping future billing preserves reminders for issued debt without creating future cycles or fees',async()=>{
    const stopped=await as('authenticated',admin,()=>rpc('cancel_billing_account',[r3.id,1]));assert.equal(stopped.status,'cancelled');
    const before=(await db.query("select count(*) filter(where kind='monthly')::int monthly,count(*) filter(where kind='late_fee')::int fees from private.billing_invoices where account_id=$1",[a3.id])).rows[0];
    const future=(await db.query("select (date_trunc('month',now() at time zone 'Asia/Kolkata')+interval '2 months 2 days 18 hours') at time zone 'Asia/Kolkata' d")).rows[0].d;
    await db.query('select private.enqueue_billing_work_at($1)',[future]);
    assert.deepEqual((await db.query("select count(*) filter(where kind='monthly')::int monthly,count(*) filter(where kind='late_fee')::int fees from private.billing_invoices where account_id=$1",[a3.id])).rows[0],before);
    const futureDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(future);
    const job=(await db.query('select * from private.billing_jobs where dedupe_key=$1',[`reminder:${other.id}:${futureDay}:18`])).rows[0];assert.ok(job);
    const prepared=(await prepareAt(job,future.toISOString())).value;assert.equal(prepared.recipient_email,other.email);
    assert.ok(prepared.invoices.some(i=>i.id===i3.id),'the existing issued invoice is still payable and reminded');
  });
});
