import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const directory=new URL('../supabase/migrations/',import.meta.url);
const names=(await readdir(directory)).filter(name=>name.endsWith('.sql')).sort();
const files=await Promise.all(names.map(name=>readFile(new URL(name,directory),'utf8')));
const owner={id:'10000000-0000-4000-8000-000000000011',email:'owner@example.test'};
const backup={id:'10000000-0000-4000-8000-000000000012',email:'backup@company.test'};
const parentA={id:'10000000-0000-4000-8000-000000000013',email:'parent.a@example.test'};
const parentB={id:'10000000-0000-4000-8000-000000000014',email:'parent.b@example.test'};
const claims=user=>({sub:user.id,email:user.email,app_metadata:{provider:'google'}});
function input(formType='trial') {
  return {full_name:'Synthetic parent',email:'contact@example.test',phone:'+12025550123',metadata:{submissionId:randomUUID(),formType,childName:'Synthetic child',age:'9',community:'Synthetic locality',sport:'Basketball',phoneCountry:'US',address:'Synthetic address',note:'Private parent note',guardianConsent:true,termsAccepted:formType==='enrol',consentVersion:'2026-11-09',termsVersion:formType==='enrol'?'2026-11-05':''}};
}

test('full migration chain protects parent ownership and admin decisions, with durable bounded notification delivery',async context=>{
  const db=new PGlite();context.after(()=>db.close());
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
    grant usage on schema auth to anon,authenticated;
    grant execute on function auth.jwt(),auth.uid() to anon,authenticated;
  `);
  for(const user of [owner,backup,parentA,parentB])await db.query('insert into auth.users(id) values($1)',[user.id]);
  async function as(role,user,fn){
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(user?claims(user):{})]);
    await db.exec(`set role ${role}`);
    try{return await fn();}finally{await db.exec('reset role');await db.query("select set_config('request.jwt.claims','{}',false)");}
  }
  const rpc=async(name,args=[])=> (await db.query(`select public.${name}(${args.map((_,index)=>`$${index+1}`).join(',')}) as value`,args)).rows[0].value;
  const submit=body=>rpc('submit_registration',[JSON.stringify(body)]);
  const mine=user=>as('authenticated',user,async()=> (await db.query('select * from public.list_my_registrations()')).rows);
  const service=(name,args=[])=>as('service_role',null,()=>rpc(name,args));
  const newIndex=names.findIndex(name=>name.endsWith('_parent_review_notifications.sql'));
  assert.ok(newIndex>0);
  for(let index=0;index<newIndex;index++)await db.exec(files[index]);
  await db.query('insert into public.allowed_admins(email,is_owner) values($1,true),($2,false)',[owner.email,backup.email]);
  const legacyInput=input('enrol');legacyInput.email=parentA.email;
  const legacy=await as('anon',null,()=>submit(legacyInput));
  for(let index=newIndex;index<files.length;index++)await db.exec(files[index]);
  let firstReceipt;const first=input('enrol');

  await context.test('anonymous saves and direct inserts are denied after the upgrade',async()=>{
    await as('anon',null,async()=>{
      await assert.rejects(submit(input()),{code:'42501'});
      await assert.rejects(db.query('insert into public.registrations(full_name,email,phone,metadata) values($1,$2,$3,$4::jsonb)',['x','x@example.test','+12025550123',JSON.stringify(input().metadata)]),{code:'42501'});
      await assert.rejects(db.query('select * from public.list_my_registrations()'),{code:'42501'});
    });
    assert.equal((await db.query("select count(*)::int as n from pg_policy where polrelid='public.registrations'::regclass and polcmd='a'")).rows[0].n,0);
    assert.equal((await db.query("select has_column_privilege('anon','public.registrations','full_name','insert') as allowed")).rows[0].allowed,false);
  });
  await context.test('authenticated Google identity owns a new row; client ownership metadata cannot override it',async()=>{
    first.metadata.parent_user_id=parentB.id;first.parent_user_id=parentB.id;
    firstReceipt=await as('authenticated',parentA,()=>submit(first));
    const saved=(await db.query('select * from public.registrations where id=$1',[firstReceipt.id])).rows[0];
    assert.equal(saved.parent_user_id,parentA.id);assert.equal(saved.review_decision,'pending');assert.equal(saved.reviewed_at,null);assert.equal(saved.reviewed_by,'');
    assert.equal(saved.metadata.parent_user_id,undefined);
    await as('authenticated',parentA,()=>assert.rejects(db.query('update public.registrations set parent_user_id=$1 where id=$2',[parentB.id,firstReceipt.id]),{code:'42501'}));
  });
  await context.test('owner-only receipt retries never disclose another parent or claim old matching-email records',async()=>{
    assert.equal((await as('authenticated',parentA,()=>submit(first))).duplicate,true);
    await as('authenticated',parentB,()=>assert.rejects(submit(first),{code:'PT409'}));
    await as('authenticated',parentA,()=>assert.rejects(submit(legacyInput),{code:'PT409'}));
    const old=(await db.query('select parent_user_id from public.registrations where id=$1',[legacy.id])).rows[0];
    assert.equal(old.parent_user_id,null);
    assert.equal((await mine(parentA)).some(row=>row.id===legacy.id),false);
  });
  await context.test('parent listing projects only that owner’s safe request fields and never admin notes or other emails',async()=>{
    const other=await as('authenticated',parentB,()=>submit(input()));
    const rows=await mine(parentA);assert.deepEqual(rows.map(row=>row.id),[firstReceipt.id]);
    assert.deepEqual(Object.keys(rows[0]).sort(),['created','id','metadata','review_decision','reviewed_at','submission_id']);
    assert.deepEqual(Object.keys(rows[0].metadata).sort(),['age','childName','community','formType','sport']);
    assert.deepEqual((await mine(parentB)).map(row=>row.id),[other.id]);
    await as('authenticated',parentA,async()=>{
      assert.deepEqual((await db.query('select * from public.registrations')).rows,[]);
      assert.deepEqual((await db.query('select * from public.allowed_admins')).rows,[]);
      assert.deepEqual((await db.query("update public.registrations set notes='forged' where id=$1 returning id",[firstReceipt.id])).rows,[]);
    });
    const dual=await as('authenticated',owner,()=>submit(input()));
    assert.equal((await mine(owner)).some(row=>row.id===dual.id),true);
    assert.ok((await as('authenticated',owner,()=>db.query('select id from public.registrations'))).rows.length>1);
  });
  await context.test('non-Google or missing authenticated identities cannot submit or list parent records',async()=>{
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:parentA.id,email:parentA.email,app_metadata:{provider:'email'},user_metadata:{provider:'google'}})]);
    await db.exec('set role authenticated');
    try{await assert.rejects(submit(input()),{code:'42501'});await assert.rejects(db.query('select * from public.list_my_registrations()'),{code:'42501'});}finally{await db.exec('reset role');}
    await db.query("select set_config('request.jwt.claims','{}',false)");
    await as('authenticated',null,()=>assert.rejects(submit(input()),{code:'42501'}));
  });
  await context.test('new-request outbox is transactional, recipient-specific and deduped; old rows are not backfilled',async()=>{
    assert.equal((await db.query('select count(*)::int as n from private.admin_notification_outbox where registration_id=$1',[legacy.id])).rows[0].n,0);
    assert.equal((await db.query('select count(*)::int as n from private.notification_activity where registration_id=$1',[legacy.id])).rows[0].n,0);
    const jobs=(await db.query('select recipient_email,state,attempts from private.admin_notification_outbox where registration_id=$1 order by recipient_email',[firstReceipt.id])).rows;
    assert.deepEqual(jobs.map(row=>row.recipient_email).sort(),[owner.email,backup.email].sort());
    assert.ok(jobs.every(row=>row.state==='pending'&&row.attempts===0));
    await as('authenticated',parentA,()=>submit(first));
    assert.equal((await db.query('select count(*)::int as n from private.admin_notification_outbox where registration_id=$1',[firstReceipt.id])).rows[0].n,2);
    const journalBefore=(await db.query('select count(*)::int as n from private.notification_activity')).rows[0].n;
    assert.equal((await db.query('select count(*)::int as n from private.notification_activity where registration_id=$1',[firstReceipt.id])).rows[0].n,1,'receipt retries do not create activity twice');
    const rolled=input();
    await assert.rejects(db.transaction(async tx=>{
      await tx.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify(claims(parentA))]);
      await tx.query('select public.submit_registration($1::jsonb)',[JSON.stringify(rolled)]);
      throw new Error('test rollback');
    }),/test rollback/);
    assert.equal((await db.query('select count(*)::int as n from public.registrations where submission_id=$1',[rolled.metadata.submissionId])).rows[0].n,0);
    assert.equal((await db.query('select count(*)::int as n from private.notification_activity')).rows[0].n,journalBefore,'activity also rolls back with the request');
  });
  await context.test('review is admin-only, audited, revision-safe and independent of follow-up status',async()=>{
    await as('authenticated',parentA,()=>assert.rejects(rpc('review_registration',[firstReceipt.id,'accepted',1]),{code:'42501'}));
    const accepted=await as('authenticated',owner,()=>rpc('review_registration',[firstReceipt.id,'accepted',1]));
    assert.equal(accepted.review_decision,'accepted');assert.equal(accepted.reviewed_by,owner.email);assert.equal(accepted.status,'new');assert.equal(Number(accepted.revision),2);
    assert.ok(Number.isFinite(Date.parse(accepted.reviewed_at)));assert.equal(accepted.fingerprint,undefined);assert.equal(accepted.parent_user_id,undefined);
    const duplicate=await as('authenticated',backup,()=>rpc('review_registration',[firstReceipt.id,'accepted',1]));
    assert.deepEqual(duplicate,accepted);
    assert.equal((await db.query("select count(*)::int as n from private.notification_activity where registration_id=$1 and kind='accepted'",[firstReceipt.id])).rows[0].n,1,'idempotent review retries create one activity event');
    await as('authenticated',owner,()=>assert.rejects(rpc('review_registration',[firstReceipt.id,'declined',2]),{code:'PT409'}));
    await as('authenticated',owner,()=>assert.rejects(db.query("update public.registrations set review_decision='declined' where id=$1",[firstReceipt.id]),{code:'42501'}));
    const followup=await as('authenticated',owner,()=>db.query("update public.registrations set status='contacted',notes='Synthetic admin note' where id=$1 and revision=2 returning *",[firstReceipt.id]));
    assert.equal(Number(followup.rows[0].revision),3);assert.equal((await db.query('select reviewed_at=$2::timestamptz as unchanged from public.registrations where id=$1',[firstReceipt.id,accepted.reviewed_at])).rows[0].unchanged,true);assert.equal(followup.rows[0].review_decision,'accepted');
    const pending=await as('authenticated',parentA,()=>submit(input()));
    await as('authenticated',owner,()=>assert.rejects(rpc('review_registration',[pending.id,'declined',2]),{code:'PT409'}));
    await as('authenticated',owner,()=>assert.rejects(rpc('review_registration',[pending.id,'pending',1]),{code:'22023'}));
    await as('authenticated',owner,()=>assert.rejects(rpc('review_registration',[randomUUID(),'accepted',1]),{code:'P0002'}));
    const parentRow=(await mine(parentA)).find(row=>row.id===firstReceipt.id);assert.equal(parentRow.review_decision,'accepted');assert.equal(parentRow.reviewed_by,undefined);
  });
  await context.test('queue and worker RPCs are private to the service role; dispatch starts disabled',async()=>{
    for(const role of ['anon','authenticated'])await as(role,role==='authenticated'?owner:null,async()=>{
      await assert.rejects(rpc('claim_admin_notification'),{code:'42501'});
      await assert.rejects(rpc('enqueue_admin_notification_digests'),{code:'42501'});
      await assert.rejects(db.query('select * from private.admin_notification_outbox'),{code:'42501'});
      await assert.rejects(db.query('select * from private.notification_activity'),{code:'42501'});
    });
    assert.equal(await service('claim_admin_notification'),null);assert.equal(await service('enqueue_admin_notification_digests'),0);
    assert.ok((await db.query('select attempts from private.admin_notification_outbox')).rows.every(row=>row.attempts===0));
  });
  await context.test('claims use exclusive leases; retries are bounded and stale workers cannot acknowledge another lease',async()=>{
    await db.exec('delete from private.admin_notification_outbox; update private.notification_settings set dispatch_enabled=true where id');
    const fresh=await as('authenticated',parentA,()=>submit(input()));
    const claimsNow=await as('service_role',null,()=>Promise.all([rpc('claim_admin_notification'),rpc('claim_admin_notification')]));
    assert.equal(new Set(claimsNow.map(job=>job.id)).size,2);
    const firstJob=claimsNow[0];
    await db.query("update private.admin_notification_outbox set lease_until=now()-interval '1 second' where id=$1",[firstJob.id]);
    const reclaimed=await service('claim_admin_notification');assert.equal(reclaimed.id,firstJob.id);assert.notEqual(reclaimed.leaseToken,firstJob.leaseToken);assert.equal(reclaimed.attempt,2);
    assert.equal(await service('finish_admin_notification',[firstJob.id,firstJob.leaseToken,'sent','']),false);
    assert.equal(await service('finish_admin_notification',[reclaimed.id,reclaimed.leaseToken,'retry','transport_failure']),true);
    const pending=(await db.query('select state,attempts,extract(epoch from(next_attempt_at-now()))::float8 as delay from private.admin_notification_outbox where id=$1',[firstJob.id])).rows[0];
    assert.equal(pending.state,'pending');assert.equal(pending.attempts,2);assert.ok(pending.delay>118&&pending.delay<=120);
    await db.query('delete from private.admin_notification_outbox where id<>$1',[firstJob.id]);
    for(let attempt=3;attempt<=5;attempt++){
      await db.query("update private.admin_notification_outbox set next_attempt_at=now()-interval '1 second' where id=$1",[firstJob.id]);
      const job=await service('claim_admin_notification');assert.equal(job.attempt,attempt);
      assert.equal(await service('finish_admin_notification',[job.id,job.leaseToken,'retry','transport_failure']),true);
    }
    assert.equal((await db.query('select state from private.admin_notification_outbox where id=$1',[firstJob.id])).rows[0].state,'failed');
    assert.equal(await service('claim_admin_notification'),null);
    assert.equal((await db.query('select count(*)::int as n from public.registrations where id=$1',[fresh.id])).rows[0].n,1);
  });
  await context.test('current membership is checked immediately before exposing email content',async()=>{
    await db.exec('delete from private.admin_notification_outbox');
    await as('authenticated',parentA,()=>submit(input()));
    await db.query('delete from private.admin_notification_outbox where recipient_email<>$1',[backup.email]);
    const job=await service('claim_admin_notification');
    await db.query('delete from public.allowed_admins where email=$1',[backup.email]);
    assert.equal(await service('prepare_admin_notification',[job.id,job.leaseToken]),null);
    const state=(await db.query('select state,failure_code from private.admin_notification_outbox where id=$1',[job.id])).rows[0];
    assert.deepEqual(state,{state:'cancelled',failure_code:'recipient_revoked'});
    await as('authenticated',backup,()=>assert.rejects(rpc('review_registration',[firstReceipt.id,'accepted',3]),{code:'42501'}));
    await db.query('insert into public.allowed_admins(email) values($1)',[backup.email]);
  });
  await context.test('four-hour digests use real window activity, current pending backlog and durable per-recipient dedupe',async()=>{
    await db.exec('delete from private.admin_notification_outbox; delete from private.notification_activity; delete from private.notification_digest_windows');
    const trial=await as('authenticated',parentA,()=>submit(input()));
    const enrol=await as('authenticated',parentA,()=>submit(input('enrol')));
    const declined=await as('authenticated',parentA,()=>submit(input()));
    await as('authenticated',owner,()=>rpc('review_registration',[declined.id,'declined',1]));
    const closed=(await db.query("select date_bin(interval '4 hours',now(),timestamptz '1970-01-01') as t")).rows[0].t;
    // Simulate historical committed activity without a production clock override.
    await db.exec('alter table public.registrations disable trigger user');
    try{
      await db.query("update public.registrations set created=$2::timestamptz-interval '7 hours' where id=$1",[trial.id,closed]);
      await db.query("update public.registrations set created=$2::timestamptz-interval '3 hours' where id=$1",[enrol.id,closed]);
      await db.query("update public.registrations set reviewed_at=$2::timestamptz-interval '2 hours' where id in ($1,$3)",[firstReceipt.id,closed,declined.id]);
    }finally{await db.exec('alter table public.registrations enable trigger user');}
    await db.query("update private.notification_activity set occurred_at=$2::timestamptz-interval '7 hours' where registration_id=$1 and kind='new_trial'",[trial.id,closed]);
    await db.query("update private.notification_activity set occurred_at=$2::timestamptz-interval '3 hours' where registration_id=$1 and kind='new_enrol'",[enrol.id,closed]);
    // The accepted event predates this isolated fixture; restore its synthetic historical activity explicitly.
    await db.query("insert into private.notification_activity(registration_id,kind,occurred_at) values($1,'accepted',$2::timestamptz-interval '2 hours')",[firstReceipt.id,closed]);
    await db.query("update private.notification_activity set occurred_at=$2::timestamptz-interval '2 hours' where registration_id=$1 and kind='declined'",[declined.id,closed]);
    await db.query("update private.notification_settings set digest_cursor=$1::timestamptz-interval '12 hours' where id",[closed]);
    const pending=(await db.query("select count(*)::int as n from public.registrations where review_decision='pending'")).rows[0].n;
    assert.equal(await service('enqueue_admin_notification_digests'),4);
    const windows=(await db.query('select summary from private.notification_digest_windows order by window_end')).rows.map(row=>row.summary);
    assert.equal(windows.length,3);assert.equal(windows[0].newTrials+windows[0].newEnrolments+windows[0].acceptedDecisions+windows[0].declinedDecisions,0);
    assert.ok(windows.every(summary=>summary.pendingRequests===pending));
    assert.equal(windows[1].newTrials,1);assert.equal(windows[2].newEnrolments,1);assert.equal(windows[2].acceptedDecisions,1);assert.equal(windows[2].declinedDecisions,1);
    assert.equal(await service('enqueue_admin_notification_digests'),0);
    const digests=(await db.query("select window_end,recipient_email from private.admin_notification_outbox where kind='digest'")).rows;
    assert.equal(digests.length,4);assert.equal(new Set(digests.map(job=>`${job.window_end}:${job.recipient_email}`)).size,4);
    assert.equal(digests.some(job=>Date.parse(job.window_end)===Date.parse(closed)-8*3600000),false,'an inactive window sends nothing despite a pending backlog');
    await db.query("update private.notification_settings set digest_cursor=$1::timestamptz-interval '40 hours' where id",[closed]);
    await service('enqueue_admin_notification_digests');
    const cursor=(await db.query('select digest_cursor from private.notification_settings')).rows[0].digest_cursor;
    assert.equal(Date.parse(cursor),Date.parse(closed)-16*3600000,'catch-up is bounded to six windows per invocation');
  });
  await context.test('activity first visible after its window closes is carried forward once without rewriting frozen summaries',async()=>{
    await db.exec('delete from private.admin_notification_outbox; delete from private.notification_activity; delete from private.notification_digest_windows');
    const closed=(await db.query("select date_bin(interval '4 hours',now(),timestamptz '1970-01-01') as t")).rows[0].t;
    const early=await as('authenticated',parentA,()=>submit(input()));
    await db.query("update private.notification_activity set occurred_at=$2::timestamptz-interval '31 hours' where registration_id=$1",[early.id,closed]);
    await db.query("update private.notification_settings set digest_cursor=$1::timestamptz-interval '32 hours' where id",[closed]);
    assert.equal(await service('enqueue_admin_notification_digests'),2,'six catch-up windows include one active window for two recipients');
    const frozen=(await db.query('select window_end,summary from private.notification_digest_windows order by window_end')).rows;
    assert.equal(frozen.length,6);assert.equal(frozen[0].summary.newTrials,1);
    assert.equal(frozen[0].summary.lateNewTrials,0);

    // Model commit visibility: these transactionally recorded events become visible only
    // AFTER their timestamp window was frozen. PGlite has no multi-session MVCC fixture.
    const lateTrial=await as('authenticated',parentA,()=>submit(input()));
    const lateEnrol=await as('authenticated',parentA,()=>submit(input('enrol')));
    await as('authenticated',owner,()=>rpc('review_registration',[lateTrial.id,'accepted',1]));
    await as('authenticated',owner,()=>rpc('review_registration',[lateEnrol.id,'declined',1]));
    await db.query("update private.notification_activity set occurred_at=$3::timestamptz-interval '31 hours' where registration_id in ($1,$2)",[lateTrial.id,lateEnrol.id,closed]);
    const current=await as('authenticated',parentA,()=>submit(input()));
    await db.query("update private.notification_activity set occurred_at=$2::timestamptz-interval '2 hours' where registration_id=$1",[current.id,closed]);
    assert.equal(await service('enqueue_admin_notification_digests'),4,'late-only activity also sends a summary, while the last window has ordinary activity');
    const lateSummary=(await db.query("select summary from private.notification_digest_windows where window_end=$1::timestamptz-interval '4 hours'",[closed])).rows[0].summary;
    assert.deepEqual([lateSummary.newTrials,lateSummary.newEnrolments,lateSummary.acceptedDecisions,lateSummary.declinedDecisions],[0,0,0,0]);
    assert.deepEqual([lateSummary.lateNewTrials,lateSummary.lateNewEnrolments,lateSummary.lateAcceptedDecisions,lateSummary.lateDeclinedDecisions],[1,1,1,1]);
    const summary=(await db.query('select summary from private.notification_digest_windows where window_end=$1',[closed])).rows[0].summary;
    assert.deepEqual([summary.newTrials,summary.newEnrolments,summary.acceptedDecisions,summary.declinedDecisions],[1,0,0,0],'regular counts stay within the labeled four-hour window');
    assert.deepEqual([summary.lateNewTrials,summary.lateNewEnrolments,summary.lateAcceptedDecisions,summary.lateDeclinedDecisions],[0,0,0,0]);
    assert.deepEqual((await db.query("select window_end,summary from private.notification_digest_windows where window_end<$1::timestamptz-interval '4 hours' order by window_end",[closed])).rows,frozen,'old summaries are immutable');
    const assigned=(await db.query('select id,digest_window_end from private.notification_activity order by id')).rows;
    assert.equal(assigned.length,6);assert.ok(assigned.every(event=>event.digest_window_end!==null));
    assert.equal(await service('enqueue_admin_notification_digests'),0);
    assert.deepEqual((await db.query('select id,digest_window_end from private.notification_activity order by id')).rows,assigned);

    const later=await as('authenticated',parentA,()=>submit(input()));
    await db.query("update private.notification_activity set occurred_at=$2::timestamptz-interval '31 hours' where registration_id=$1",[later.id,closed]);
    await db.query("update private.notification_settings set digest_cursor=$1::timestamptz-interval '4 hours' where id",[closed]);
    assert.equal(await service('enqueue_admin_notification_digests'),0,'revisiting a frozen window never sends a correction email');
    assert.equal((await db.query('select digest_window_end from private.notification_activity where registration_id=$1',[later.id])).rows[0].digest_window_end,null,'newly visible activity waits for a NEW scheduled window');
    assert.deepEqual((await db.query('select summary from private.notification_digest_windows where window_end=$1',[closed])).rows[0].summary,summary);
  });
  await context.test('deleting an auth account detaches ownership without claiming or exposing that row elsewhere',async()=>{
    const before=await mine(parentB);assert.ok(before.length>0);
    await db.query('delete from auth.users where id=$1',[parentB.id]);
    await assert.rejects(mine(parentB),{code:'42501'},'a deleted Auth subject cannot use its still-unexpired JWT');
    const detached=(await db.query('select parent_user_id from public.registrations where id=$1',[before[0].id])).rows[0];assert.equal(detached.parent_user_id,null);
  });
});
