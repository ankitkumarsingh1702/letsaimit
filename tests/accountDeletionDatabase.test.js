import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createAccountDeletionHandler} from '../supabase/functions/_shared/account-deletion.js';

const owner={id:randomUUID(),email:'owner@example.test'},admin={id:randomUUID(),email:'staff@gmail.com'};
const parent={id:randomUUID(),email:'parent@example.test'},other={id:randomUUID(),email:'other@example.test'};
const claims=u=>({sub:u.id,email:u.email,app_metadata:{provider:'google'}});
const input=(type,terms)=>({full_name:'Original parent',email:parent.email,phone:'+12025550123',metadata:{submissionId:randomUUID(),formType:type,
  childName:'Private child',age:'9',community:'Private community',sport:'Basketball',phoneCountry:'US',address:'Private address',note:'Private note',
  guardianConsent:true,termsAccepted:type==='enrol',consentVersion:'2026-11-09',termsVersion:type==='enrol'?'2026-11-05':'',
  ...(type==='enrol'?{billingPricingMode:'custom_quote',billingConsent:true,billingTermsVersion:terms.version}:{})}});

test('account deletion archives ownership, blocks stale credentials and preserves payment accounting',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin;
    create schema auth;create table auth.users(id uuid primary key,email text);
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
    grant usage on schema auth to anon,authenticated;grant execute on function auth.jwt(),auth.uid() to anon,authenticated;`);
  const directory=new URL('../supabase/migrations/',import.meta.url);
  for(const name of (await readdir(directory)).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile(new URL(name,directory),'utf8'));
  for(const u of [owner,admin,parent,other])await db.query('insert into auth.users values($1,$2)',[u.id,u.email]);
  await db.query('insert into public.allowed_admins(email,is_owner) values($1,true),($2,false)',[owner.email,admin.email]);
  await db.exec('update private.billing_settings set enabled=true where id;update private.notification_settings set dispatch_enabled=true where id');
  const rpc=async(name,args=[])=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0]?.value;
  async function as(role,user,fn){await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(user?claims(user):{})]);await db.exec(`set role ${role}`);try{return await fn();}finally{await db.exec('reset role');await db.query("select set_config('request.jwt.claims','{}',false)");}}
  const service=(name,args=[])=>as('service_role',null,()=>rpc(name,args));
  const terms=await rpc('get_billing_terms');
  const submit=(u,type='enrol')=>as('authenticated',u,()=>rpc('submit_registration',[JSON.stringify(input(type,terms))]));
  const approve=r=>as('authenticated',owner,()=>rpc('review_registration',[r.id,'accepted',1,600000]));
  const paid=await submit(parent);await approve(paid);
  const unknown=await submit(parent);await approve(unknown);
  const unissued=await submit(parent);await approve(unissued);
  const pending=await submit(parent,'trial');
  const unrelated=await submit(other,'trial');
  const bills=(await db.query('select i.* from private.billing_invoices i join private.billing_accounts a on a.id=i.account_id where a.parent_user_id=$1 order by i.id',[parent.id])).rows;
  const invoiceFor=async registrationId=>(await db.query('select i.* from private.billing_invoices i join private.billing_accounts a on a.id=i.account_id where a.registration_id=$1',[registrationId])).rows[0];
  const issued=await invoiceFor(paid.id),ambiguous=await invoiceFor(unknown.id),neverSent=await invoiceFor(unissued.id);
  const snapshot=(i,{captured=false,refund=0,status=captured?'paid':'issued',providerId='inv_DeletionA'}={})=>({provider_invoice_id:providerId,receipt:'LAI'+i.id.replaceAll('-',''),
    currency:'INR',amount_paise:i.amount_paise,paid_paise:captured?i.amount_paise:0,refunded_paise:refund,provider_status:status,
    provider_payment_id:captured?'pay_DeletionA':null,payment_url:'https://rzp.io/i/DeletionA',invoice_url:'https://rzp.io/i/DeletionA',captured,paid_at:captured?new Date().toISOString():null});
  await service('save_billing_provider_snapshot',[issued.id,JSON.stringify(snapshot(issued))]);
  await db.query("update private.billing_jobs set state='processing',attempts=1,lease_token=$2,lease_until=now()+interval '2 minutes' where invoice_id=$1 and kind='create_invoice'",[ambiguous.id,randomUUID()]);
  let deletion,lease;

  await t.test('stable parent list RPCs work in the same read-only transactions used by PostgREST',async()=>{
    await as('authenticated',parent,async()=>{
      await db.exec('begin read only');
      try{
        const requests=(await db.query('select * from public.list_my_registrations()')).rows;
        assert.equal(requests.length,4);
        const billing=await rpc('list_my_billing');assert.equal(billing.invoices.length,3);
      }finally{await db.exec('rollback');}
    });
    const traits=(await db.query("select proname,provolatile from pg_proc where pronamespace='private'::regnamespace and proname in ('require_google_user','lock_google_registration_user') order by proname")).rows;
    assert.deepEqual(traits,[{proname:'lock_google_registration_user',provolatile:'v'},{proname:'require_google_user',provolatile:'s'}]);
  });
  await t.test('service-only API and private snapshots cannot be read or invoked by app roles',async()=>{
    for(const role of ['anon','authenticated'])await as(role,parent,async()=>{
      for(const [name,args] of [['prepare_account_deletion',[parent.id,'2026-11-11',true]],['get_account_deletion_status',[parent.id]],['claim_account_deletions',[]],['finish_account_deletion',[randomUUID(),randomUUID(),true,'']]])await assert.rejects(rpc(name,args),{code:'42501'});
      for(const table of ['account_deletions','account_deletion_registrations'])await assert.rejects(db.query(`select * from private.${table}`),{code:'42501'});
    });
    const tables=(await db.query("select relname,relrowsecurity from pg_class where relname in ('account_deletions','account_deletion_registrations')")).rows;
    assert.ok(tables.every(r=>r.relrowsecurity));
  });
  await t.test('policy confirmation and owner protection fail before archival or membership changes',async()=>{
    await assert.rejects(service('prepare_account_deletion',[parent.id,'old',true]),{code:'22023'});
    await assert.rejects(service('prepare_account_deletion',[parent.id,'2026-11-11',false]),{code:'22023'});
    await assert.rejects(service('prepare_account_deletion',[owner.id,'2026-11-11',true]),{code:'PT409',message:'owner_protected'});
    assert.equal((await db.query('select count(*)::int n from private.account_deletions')).rows[0].n,0);
    assert.equal((await as('authenticated',owner,()=>rpc('is_admin'))),true);
  });
  await t.test('preparation is atomic, idempotent and scrubs only the deleting parent’s live rows',async()=>{
    const originals=(await db.query('select * from public.registrations where parent_user_id=$1 order by id',[parent.id])).rows;
    await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role service_role');await tx.query('select public.prepare_account_deletion($1,$2,$3)',[parent.id,'2026-11-11',true]);throw new Error('synthetic rollback');}),/synthetic rollback/);
    assert.equal((await db.query('select count(*)::int n from private.account_deletions')).rows[0].n,0);
    assert.deepEqual((await db.query('select * from public.registrations where parent_user_id=$1 order by id',[parent.id])).rows,originals);
    deletion=await service('prepare_account_deletion',[parent.id,'2026-11-11',true]);
    assert.equal(deletion.status,'deleting');
    assert.deepEqual(await service('prepare_account_deletion',[parent.id,'2026-11-11',true]),deletion);
    const live=(await db.query('select * from public.registrations where parent_user_id=$1 order by id',[parent.id])).rows;
    const archived=(await db.query('select snapshot from private.account_deletion_registrations where deletion_id=$1 order by registration_id',[deletion.deletion_id])).rows.map(r=>r.snapshot);
    assert.equal(live.length,4);assert.equal(archived.length,4);
    for(let i=0;i<live.length;i++){
      assert.equal(live[i].id,originals[i].id);assert.equal(live[i].full_name,'Deleted account');assert.equal(live[i].phone,'+10000000');assert.equal(live[i].status,'closed');
      assert.deepEqual(live[i].metadata,{accountDeleted:true});assert.equal(live[i].review_decision,originals[i].review_decision);
      assert.equal(live[i].fingerprint,originals[i].fingerprint);assert.deepEqual(archived[i].metadata,originals[i].metadata);assert.equal(archived[i].email,parent.email);
    }
    assert.equal((await db.query('select deleted_at from public.registrations where id=$1',[unrelated.id])).rows[0].deleted_at,null);
  });
  await t.test('deleting JWTs fail both parent and admin boundaries even while Auth still exists',async()=>{
    await as('authenticated',parent,async()=>{
      await assert.rejects(db.query('select * from public.list_my_registrations()'),{code:'42501'});
      await assert.rejects(rpc('list_my_billing'),{code:'42501'});
      await assert.rejects(rpc('submit_registration',[JSON.stringify(input('trial',terms))]),{code:'42501'});
      assert.equal(await rpc('is_admin'),false);
    });
    assert.equal((await db.query('select count(*)::int n from auth.users where id=$1',[parent.id])).rows[0].n,1);
    await as('authenticated',owner,async()=>{
      await assert.rejects(rpc('review_registration',[pending.id,'accepted',2,null]),{code:'P0002'});
      await assert.rejects(rpc('set_monthly_coaching_fee',[paid.id,700000,2]),{code:'P0002'});
      assert.deepEqual((await db.query("update public.registrations set status='new' where id=$1 returning id",[pending.id])).rows,[]);
      await assert.rejects(db.query('update public.registrations set deletion_id=null,deleted_at=null where id=$1',[pending.id]),{code:'42501'});
      assert.equal((await db.query('select count(*)::int n from public.registrations where id=any($1::uuid[])',[[paid.id,unknown.id,unissued.id,pending.id]])).rows[0].n,0);
    });
  });
  await t.test('new digest backlog excludes archived pending rows without rewriting historical activity',async()=>{
    await db.exec("update private.notification_settings set digest_cursor=date_bin(interval '4 hours',now(),timestamptz '1970-01-01')-interval '4 hours' where id");
    await service('enqueue_admin_notification_digests');
    const summary=(await db.query('select summary from private.notification_digest_windows order by window_end desc limit 1')).rows[0].summary;
    assert.equal(summary.pendingRequests,1,'only the other parent’s live trial awaits review');
    assert.equal((await db.query("select count(*)::int n from private.notification_activity where registration_id=$1 and kind='new_trial'",[pending.id])).rows[0].n,1,'historical activity is retained');
  });
  await t.test('future bills stop; unknown creates retain reconciliation and already-issued bills queue cancellation',async()=>{
    const accounts=(await db.query('select * from private.billing_accounts where parent_user_id=$1',[parent.id])).rows;
    assert.ok(accounts.every(a=>a.status==='cancelled'&&a.cancelled_at));
    const jobs=(await db.query('select * from private.billing_jobs where invoice_id=any($1::uuid[])',[bills.map(i=>i.id)])).rows;
    assert.ok(jobs.some(j=>j.invoice_id===issued.id&&j.kind==='cancel_invoice'));
    assert.ok(jobs.some(j=>j.invoice_id===ambiguous.id&&j.kind==='cancel_invoice'));
    assert.ok(jobs.some(j=>j.invoice_id===ambiguous.id&&j.kind==='create_invoice'&&j.state==='ambiguous'));
    assert.equal(jobs.some(j=>j.invoice_id===neverSent.id&&j.kind==='cancel_invoice'),false);
    assert.equal((await invoiceFor(unissued.id)).status,'cancelled');
    assert.ok(jobs.filter(j=>j.kind.startsWith('send_')).every(j=>j.state==='cancelled'));
    // Check future cycles before any local reminder window opens.
    await db.query(`select private.enqueue_billing_work_at(
      ((now() at time zone 'Asia/Kolkata' + interval '2 months')::date + time '06:00') at time zone 'Asia/Kolkata'
    )`);
    assert.equal((await db.query('select count(*)::int n from private.billing_invoices i join private.billing_accounts a on a.id=i.account_id where a.parent_user_id=$1',[parent.id])).rows[0].n,bills.length);
    const account=accounts[0];
    await assert.rejects(db.query("insert into private.billing_invoices(account_id,period_start,due_date,base_amount_paise) values($1,date_trunc('month',now())::date+interval '4 months',now(),100)",[account.id]),{code:'42501'});
  });
  await t.test('leases are exclusive, bounded and cannot report deleted while Auth is present',async()=>{
    const jobs=await service('claim_account_deletions',[deletion.deletion_id,5]);assert.equal(jobs.length,1);lease=jobs[0];
    assert.deepEqual(Object.keys(lease).sort(),['id','lease_token','user_id']);assert.equal(lease.user_id,parent.id);
    assert.deepEqual(await service('claim_account_deletions',[deletion.deletion_id,5]),[]);
    assert.deepEqual(await service('finish_account_deletion',[lease.id,randomUUID(),true,'']),{status:'deleting'});
    assert.deepEqual(await service('finish_account_deletion',[lease.id,lease.lease_token,true,'']),{status:'deleting'});
    const row=(await db.query('select * from private.account_deletions where id=$1',[lease.id])).rows[0];assert.equal(row.status,'retrying');assert.equal(row.error_code,'auth_not_deleted');
    assert.ok(Date.parse(row.next_attempt_at)>Date.now());assert.equal(row.completed_at,null);
    await db.query('update private.account_deletions set next_attempt_at=now() where id=$1',[lease.id]);
    [lease]=await service('claim_account_deletions',[lease.id,1]);
  });
  await t.test('hard Auth deletion detaches FKs and same-email signup never reconnects archived history',async()=>{
    // The runtime uses auth.admin.deleteUser(id,false); SQL deletion only simulates Auth here.
    await db.query('delete from auth.users where id=$1',[parent.id]);
    assert.deepEqual(await service('finish_account_deletion',[lease.id,lease.lease_token,true,'']),{status:'deleted'});
    assert.deepEqual(await service('get_account_deletion_status',[parent.id]),{status:'deleted'});
    assert.equal((await db.query('select current_auth_user_id from private.account_deletions where id=$1',[lease.id])).rows[0].current_auth_user_id,null);
    assert.equal((await db.query('select count(*)::int n from public.registrations where parent_user_id=$1',[parent.id])).rows[0].n,0);
    assert.equal((await db.query('select count(*)::int n from private.billing_accounts where parent_user_id=$1',[parent.id])).rows[0].n,0);
    await as('authenticated',parent,()=>assert.rejects(rpc('list_my_billing'),{code:'42501'}));
    const fresh={...parent,id:randomUUID()};await db.query('insert into auth.users values($1,$2)',[fresh.id,fresh.email]);
    assert.deepEqual(await as('authenticated',fresh,()=>db.query('select * from public.list_my_registrations()')).then(r=>r.rows),[]);
    assert.equal((await as('authenticated',fresh,()=>rpc('list_my_billing'))).invoices.length,0);
    assert.equal(await as('authenticated',fresh,()=>rpc('is_admin')),false);
    const newRequest=await submit(fresh,'trial');assert.notEqual(newRequest.id,pending.id);
  });
  await t.test('disabled billing wakes archived-only overdue accounting and matches missed webhooks from an empty cleanup queue',async()=>{
    await db.exec('update private.billing_settings set enabled=false where id');
    await db.query("update private.billing_jobs set state='done',lease_token=null,lease_until=null where invoice_id=any($1::uuid[]) and kind in ('cancel_invoice','reconcile_invoice')",[bills.map(i=>i.id)]);
    await db.query("update private.billing_invoices set checked_at=now()-interval '6 minutes' where id=$1",[issued.id]);
    await db.query("insert into private.billing_webhook_events(event_id,provider_invoice_id,event_type,payload_hash) values('evt_disabled_missed','inv_DeletionA','invoice.paid',$1)",['b'.repeat(64)]);
    const before=(await db.query('select count(*)::int n from private.billing_invoices')).rows[0].n;
    await db.query('select private.wake_billing_worker()');
    let jobs=(await db.query("select j.* from private.billing_jobs j join private.billing_invoices i on i.id=j.invoice_id join private.billing_accounts a on a.id=i.account_id join public.registrations r on r.id=a.registration_id where r.deleted_at is not null and j.state='pending'")).rows;
    assert.ok(jobs.length>=3);assert.ok(jobs.every(j=>j.kind==='reconcile_invoice'));
    assert.ok(jobs.some(j=>j.invoice_id===issued.id));assert.ok(jobs.some(j=>j.invoice_id===ambiguous.id),'unknown create still reconciles by receipt');
    assert.ok(jobs.some(j=>j.dedupe_key==='event:evt_disabled_missed'));
    assert.equal((await db.query("select invoice_id from private.billing_webhook_events where event_id='evt_disabled_missed'")).rows[0].invoice_id,issued.id);
    const count=jobs.length;await db.query('select private.wake_billing_worker()');
    jobs=(await db.query("select * from private.billing_jobs where state='pending' and kind='reconcile_invoice'")).rows;
    assert.equal(jobs.length,count,'same five-minute bucket and event dedupe do not duplicate work');
    assert.equal((await db.query('select count(*)::int n from private.billing_invoices')).rows[0].n,before,'disabled recovery creates no cycles or fees');
    const claimed=await service('claim_billing_job');assert.equal(claimed.kind,'reconcile_invoice');
    assert.equal((await service('prepare_billing_job',[claimed.id,claimed.leaseToken])).kind,'reconcile_invoice');
    await db.exec('update private.billing_settings set enabled=true where id');
  });
  await t.test('capture/refund and cancellation remain reconciliable after detachment without customer emails',async()=>{
    const job=(await db.query("select * from private.billing_jobs where invoice_id=$1 and kind='cancel_invoice'",[issued.id])).rows[0];
    const token=randomUUID();await db.query("update private.billing_jobs set state='processing',attempts=1,lease_token=$2,lease_until=now()+interval '2 minutes' where id=$1",[job.id,token]);
    const prepared=await service('prepare_billing_job',[job.id,token]);assert.equal(prepared.kind,'cancel_invoice');assert.equal(prepared.invoice.provider_invoice_id,'inv_DeletionA');
    await service('ingest_billing_webhook',['evt_deleted_capture','inv_DeletionA','pay_DeletionA','invoice.paid','a'.repeat(64)]);
    const reconcile=(await db.query("select * from private.billing_jobs where dedupe_key='event:evt_deleted_capture'")).rows[0];
    const reconcileToken=randomUUID();await db.query("update private.billing_jobs set state='processing',attempts=1,lease_token=$2,lease_until=now()+interval '2 minutes' where id=$1",[reconcile.id,reconcileToken]);
    assert.equal((await service('prepare_billing_job',[reconcile.id,reconcileToken])).kind,'reconcile_invoice');
    await service('save_billing_provider_snapshot',[issued.id,JSON.stringify(snapshot(issued,{captured:true}))]);
    await service('finish_billing_job',[reconcile.id,reconcileToken,'done','']);
    await service('save_billing_provider_snapshot',[issued.id,JSON.stringify(snapshot(issued,{captured:true,refund:100}))]);
    const movements=(await db.query('select kind,amount_paise from private.billing_ledger where invoice_id=$1 order by id',[issued.id])).rows;
    assert.deepEqual(movements,[{kind:'capture',amount_paise:600000},{kind:'refund',amount_paise:100}]);
    assert.equal((await db.query("select count(*)::int n from private.billing_jobs where invoice_id=$1 and kind in ('send_invoice','send_receipt','send_refund') and state in ('pending','processing')",[issued.id])).rows[0].n,0);
    assert.ok((await db.query("select applied_at from private.billing_webhook_events where event_id='evt_deleted_capture'")).rows[0].applied_at);
    await service('save_billing_provider_snapshot',[ambiguous.id,JSON.stringify(snapshot(ambiguous,{providerId:'inv_DeletionB',status:'cancelled'}))]);
    assert.equal((await invoiceFor(unknown.id)).status,'cancelled');
    assert.equal((await invoiceFor(paid.id)).amount_paise,600000);
  });
  await t.test('billing-disabled cleanup still claims archived cancellation without authorizing ordinary billing',async()=>{
    const request=await submit(other);await approve(request);const ordinary=await invoiceFor(request.id);
    const extra=(await db.query("insert into private.billing_jobs(invoice_id,kind,dedupe_key) values($1,'cancel_invoice',$2) returning *",[ordinary.id,'synthetic-unarchived-cancel:'+ordinary.id])).rows[0];
    const token=randomUUID();await db.query("update private.billing_jobs set state='processing',attempts=1,lease_token=$2,lease_until=now()+interval '2 minutes' where id=$1",[extra.id,token]);
    assert.equal(await service('prepare_billing_job',[extra.id,token]),null,'deletion cancellation is not a general invoice-cancellation capability');
    await db.exec('update private.billing_settings set enabled=false where id');
    const job=await service('claim_billing_job');assert.ok(job);assert.ok(['cancel_invoice','reconcile_invoice'].includes(job.kind));
    const work=await service('prepare_billing_job',[job.id,job.leaseToken]);assert.ok(work);assert.notEqual(work.invoice.registration_id,request.id);
    const create=(await db.query("select state,attempts from private.billing_jobs where invoice_id=$1 and kind='create_invoice'",[ordinary.id])).rows[0];
    assert.equal(create.state,'pending');assert.equal(create.attempts,0);
    await db.query("update private.billing_invoices set checked_at=now()-interval '23 hours' where id=$1",[issued.id]);
    const future=(await db.query("select now()+interval '10 minutes' as at")).rows[0].at;
    const first=await db.query('select private.enqueue_archived_billing_work($1) n',[future]);assert.equal(first.rows[0].n,0,'terminal invoices keep a daily cadence');
    await db.query("update private.billing_invoices set checked_at=now()-interval '25 hours' where id=$1",[issued.id]);
    assert.equal((await db.query('select private.enqueue_archived_billing_work($1) n',[future])).rows[0].n,1,'missed captures/refunds remain discoverable after a day');
    await db.exec('update private.billing_settings set enabled=true where id');
  });
  await t.test('deleted staff lose email-based admin access and recovery failures stay closed with bounded retries',async()=>{
    assert.equal(await as('authenticated',admin,()=>rpc('is_admin')),true);
    const d=await service('prepare_account_deletion',[admin.id,'2026-11-11',true]);
    assert.equal(await as('authenticated',admin,()=>rpc('is_admin')),false);
    assert.equal((await db.query('select count(*)::int n from public.allowed_admins where email=$1',[admin.email])).rows[0].n,0);
    let [job]=await service('claim_account_deletions',[d.deletion_id,1]);
    await db.query('update private.account_deletions set attempts=8 where id=$1',[job.id]);
    await service('finish_account_deletion',[job.id,job.lease_token,false,'auth_unavailable']);
    assert.equal((await db.query('select status from private.account_deletions where id=$1',[job.id])).rows[0].status,'failed');
    assert.deepEqual(await service('claim_account_deletions',[job.id,1]),[]);
    assert.deepEqual(await service('prepare_account_deletion',[admin.id,'2026-11-11',true]),d);
    [job]=await service('claim_account_deletions',[d.deletion_id,1]);assert.ok(job);
    await db.query('delete from auth.users where id=$1',[admin.id]);await service('finish_account_deletion',[job.id,job.lease_token,true,'']);
    const fresh={...admin,id:randomUUID()};await db.query('insert into auth.users values($1,$2)',[fresh.id,fresh.email]);
    assert.equal(await as('authenticated',fresh,()=>rpc('is_admin')),false);
  });
  await t.test('the real HTTP handler persists failed Auth deletion and the minute worker completes that same durable intent',async()=>{
    const user={id:randomUUID(),email:'handler.parent@example.test',app_metadata:{provider:'google'}};
    await db.query('insert into auth.users values($1,$2)',[user.id,user.email]);await submit(user,'trial');
    let removeCalls=0,allowDelete=false;
    const handler=createAccountDeletionHandler({allowedOrigin:'https://uat.letsaimit.com',workerSecret:'s'.repeat(40),
      verifyUser:async()=>user,verifyClaims:async()=>claims(user),revokeSessions:async()=>{},
      removeAuthUser:async id=>{++removeCalls;assert.equal(id,user.id);if(!allowDelete)return false;await db.query('delete from auth.users where id=$1',[id]);return true;},
      rpc:(name,body)=>{
        const keys={prepare_account_deletion:['p_user_id','p_policy_version','p_accept_forfeit'],get_account_deletion_status:['p_user_id'],
          claim_account_deletions:['p_deletion_id','p_limit'],finish_account_deletion:['p_id','p_lease_token','p_success','p_error_code']}[name];
        assert.ok(keys);return service(name,keys.map(key=>body[key]));
      }});
    const first=await handler(new Request('https://backend.example.test/delete-account',{method:'POST',headers:{origin:'https://uat.letsaimit.com',authorization:'Bearer synthetic-user-token'},
      body:JSON.stringify({expectedUserId:user.id,policyVersion:'2026-11-11',confirmPermanent:true,acceptForfeit:true})}));
    assert.equal(first.status,202);assert.equal((await first.json()).status,'deleting');
    const row=(await db.query('select * from private.account_deletions where old_auth_user_id=$1',[user.id])).rows[0];
    assert.equal(row.status,'retrying');assert.equal(row.error_code,'auth_delete_failed');assert.equal(removeCalls,1);
    await db.query('update private.account_deletions set next_attempt_at=now() where id=$1',[row.id]);allowDelete=true;
    const retry=await handler(new Request('https://backend.example.test/delete-account',{method:'POST',headers:{authorization:'Bearer '+'s'.repeat(40)},body:JSON.stringify({mode:'worker'})}));
    assert.equal(retry.status,200);assert.equal((await retry.json()).deleted,1);assert.equal(removeCalls,2);
    assert.equal((await db.query('select status from private.account_deletions where id=$1',[row.id])).rows[0].status,'completed');
    assert.equal((await db.query('select count(*)::int n from auth.users where id=$1',[user.id])).rows[0].n,0);
  });
  await t.test('the last successful Auth DELETE cannot remain failed when its finish acknowledgement was lost',async()=>{
    for(const state of ['processing','failed']){
      const user={id:randomUUID(),email:`lost-${state}@example.test`};await db.query('insert into auth.users values($1,$2)',[user.id,user.email]);
      const receipt=await service('prepare_account_deletion',[user.id,'2026-11-11',true]);
      const [job]=await service('claim_account_deletions',[receipt.deletion_id,1]);assert.ok(job);
      await db.query("update private.account_deletions set status=$2,attempts=8,lease_until=now()-interval '1 second' where id=$1",[job.id,state]);
      await db.query('delete from auth.users where id=$1',[user.id]);
      assert.deepEqual(await service('claim_account_deletions',[job.id,1]),[],'no second Auth DELETE is needed');
      assert.deepEqual(await service('get_account_deletion_status',[user.id]),{status:'deleted'});
      const row=(await db.query('select * from private.account_deletions where id=$1',[job.id])).rows[0];
      assert.equal(row.status,'completed');assert.ok(row.completed_at);assert.equal(row.lease_token,null);assert.equal(row.lease_until,null);assert.equal(row.error_code,'');
    }
  });
});
