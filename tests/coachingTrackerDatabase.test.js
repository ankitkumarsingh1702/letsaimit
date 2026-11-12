import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const person=email=>({id:randomUUID(),email});
const owner=person('owner@example.test'),admins=[owner,person('admin.one@gmail.com'),person('admin.two@gmail.com'),person('admin.three@gmail.com')];
const parent=person('parent@example.test'),other=person('other@example.test'),coach=person('coach@gmail.com'),outsider=person('outsider@gmail.com');
const claims=u=>({sub:u.id,email:u.email,app_metadata:{provider:'google'},user_metadata:{full_name:'Coach Example'}});
const hash=token=>createHash('sha256').update(token).digest('hex');

test('coaching tracker preserves parent ownership, scoped coach writes and Gmail attendance authority',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin;
    create schema auth;create table auth.users(id uuid primary key,email text);
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
    grant usage on schema auth to anon,authenticated;grant execute on function auth.jwt(),auth.uid() to anon,authenticated;`);
  const directory=new URL('../supabase/migrations/',import.meta.url);
  for(const name of (await readdir(directory)).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile(new URL(name,directory),'utf8'));
  for(const u of [...admins,parent,other,coach,outsider])await db.query('insert into auth.users values($1,$2)',[u.id,u.email]);
  for(const [i,u] of admins.entries())await db.query('insert into public.allowed_admins(email,is_owner) values($1,$2)',[u.email,i===0]);
  const rpc=async(name,args=[])=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0]?.value;
  async function as(role,u,fn){await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(u?claims(u):{})]);await db.exec(`set role ${role}`);try{return await fn();}finally{await db.exec('reset role');await db.query("select set_config('request.jwt.claims','{}',false)");}}
  const staff=(u,name,args=[])=>as('authenticated',u,()=>rpc(name,args));
  const service=(name,args=[])=>as('service_role',null,()=>rpc(name,args));
  const terms=await rpc('get_billing_terms');
  const {today,monday,yesterday}=(await db.query("select (now() at time zone 'Asia/Kolkata')::date::text today,date_trunc('week',(now() at time zone 'Asia/Kolkata'))::date::text monday,((now() at time zone 'Asia/Kolkata')::date-1)::text yesterday")).rows[0];
  async function enrol(u,name,{accepted=true,type='enrol'}={}){
    const receipt=await staff(u,'submit_registration',[JSON.stringify({full_name:'Example parent',email:u.email,phone:'+12025550123',metadata:{submissionId:randomUUID(),formType:type,childName:name,
      age:'9',community:'Example community',sport:'Basketball',phoneCountry:'US',address:'Example address',note:'',guardianConsent:true,termsAccepted:type==='enrol',
      consentVersion:'2026-11-09',termsVersion:type==='enrol'?'2026-11-05':'',...(type==='enrol'?{billingPricingMode:'custom_quote',billingConsent:true,billingTermsVersion:terms.version}:{})}})]);
    if(accepted)await staff(owner,'review_registration',[receipt.id,'accepted',1,null]);return receipt.id;
  }
  const child=await enrol(parent,'Child One'),sibling=await enrol(parent,'Child Two'),otherChild=await enrol(other,'Other Child');
  const pending=await enrol(parent,'Pending',{accepted:false}),trial=await enrol(parent,'Trial',{type:'trial'});
  const mark=(id,status='present',revision=0)=>({registrationId:id,status,revision});
  const save=(u,day,rows)=>staff(u,'save_coaching_attendance',[day,JSON.stringify(rows)]);
  const assign=(id,email,revision=0,start=yesterday,days=[1,3])=>staff(owner,'set_coaching_assignment',[id,email,days,email?start:null,revision]);
  const ticketToken='A'.repeat(43);
  async function ticket(recipient=owner.email,ids=[child,sibling],{day=today,expires='2 days'}={}){
    return (await db.query("insert into private.coaching_email_tickets(recipient_email,session_date,roster,token_hash,expires_at,state) values($1,$2,$3,$4,now()+$5::interval,'sent') on conflict(recipient_email,session_date) do update set roster=excluded.roster,token_hash=excluded.token_hash,expires_at=excluded.expires_at,state='sent',used_at=null,saved_payload_hash=null returning id",
      [recipient,day,JSON.stringify(ids.map(registrationId=>({registrationId}))),hash(ticketToken),expires])).rows[0].id;
  }

  await t.test('all five private tables have RLS, no client table/column grants and no public RPC access',async()=>{
    const names=['coaching_assignments','coaching_attendance','coaching_feedback','coaching_settings','coaching_email_tickets'];
    for(const name of names){
      assert.equal((await db.query('select relrowsecurity from pg_class where oid=$1::regclass',['private.'+name])).rows[0].relrowsecurity,true);
      for(const role of ['anon','authenticated']){
        const grants=(await db.query("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') t,has_any_column_privilege($1,$2,'SELECT,INSERT,UPDATE') c",[role,'private.'+name])).rows[0];assert.deepEqual(grants,{t:false,c:false});
        await as(role,parent,()=>assert.rejects(db.query('select * from private.'+name),{code:'42501'}));
      }
    }
    await as('anon',null,()=>assert.rejects(rpc('list_my_tracker'),{code:'42501'}));
    await as('authenticated',parent,()=>assert.rejects(rpc('claim_coaching_email'),{code:'42501'}));
    await as('authenticated',owner,()=>assert.rejects(rpc('read_coaching_email_attendance',[randomUUID(),ticketToken]),{code:'42501'}));
    assert.equal((await db.query('select email_enabled from private.coaching_settings')).rows[0].email_enabled,false);
  });
  await t.test('parent projection includes owned accepted enrolments only, in read-only transactions',async()=>{
    await as('authenticated',parent,async()=>{await db.exec('begin read only');try{
      const result=await rpc('list_my_tracker');assert.deepEqual(new Set(result.children.map(c=>c.registrationId)),new Set([child,sibling]));
      assert.equal(result.children.some(c=>c.registrationId===pending||c.registrationId===trial||c.registrationId===otherChild),false);
      assert.deepEqual(result.attendance,[]);assert.deepEqual(result.feedback,[]);assert.equal(result.range.to,today);
      assert.equal(result.children.some(c=>'email' in c||'parentUserId' in c),false);
    }finally{await db.exec('rollback');}});
    assert.deepEqual((await staff(outsider,'list_my_tracker')).children,[]);
  });
  await t.test('only admins assign coaches; assignment edits and removals retain monotonic revisions',async()=>{
    await assert.rejects(staff(parent,'set_coaching_assignment',[child,coach.email,[1],today,0]),{code:'42501'});
    await assert.rejects(assign(pending,coach.email),{code:'42501'});
    await assert.rejects(assign(child,'invalid'),{code:'22023'});
    await assert.rejects(assign(child,coach.email,0,today,[8]),{code:'22023'});
    const first=await assign(child,' COACH@gmail.com ',0,yesterday,[3,1,3]);assert.equal(first.coachEmail,coach.email);assert.deepEqual(first.weekdays,[1,3]);assert.equal(first.assignmentRevision,1);
    await assert.rejects(assign(child,other.email),{code:'40001'});
    assert.equal((await assign(child,'',1)).assignmentRevision,2);
    assert.equal((await assign(child,coach.email,2)).assignmentRevision,3);
  });
  await t.test('a coach only sees assigned children while the same identity may independently be a parent',async()=>{
    assert.deepEqual((await staff(coach,'list_staff_tracker',[today])).children.map(c=>c.registrationId),[child]);
    assert.equal((await staff(coach,'list_staff_tracker',[today])).isAdmin,false);
    assert.equal((await staff(owner,'list_staff_tracker',[today])).children.length,3);
    await assign(otherChild,parent.email);
    assert.deepEqual((await staff(parent,'list_staff_tracker',[today])).children.map(c=>c.registrationId),[otherChild]);
    assert.deepEqual(new Set((await staff(parent,'list_my_tracker')).children.map(c=>c.registrationId)),new Set([child,sibling]));
  });
  await t.test('a future coach assignment grants no early roster, attendance or feedback access',async()=>{
    const future=(await db.query("select ((now() at time zone 'Asia/Kolkata')::date+1)::text as next_date")).rows[0].next_date;
    await assign(sibling,coach.email,0,future);
    assert.deepEqual((await staff(coach,'list_staff_tracker',[today])).children.map(c=>c.registrationId),[child]);
    await assert.rejects(save(coach,today,[mark(sibling)]),{code:'42501'});
    await assert.rejects(staff(coach,'save_coaching_feedback',[sibling,monday,'Too early','',0]),{code:'42501'});
    await assign(sibling,'',1);
  });
  await t.test('bulk attendance is atomic, rejects unauthorized rows and never invents an absence',async()=>{
    await assert.rejects(save(coach,today,[mark(child),mark(sibling)]),{code:'42501'});
    assert.equal((await db.query('select count(*)::int n from private.coaching_attendance')).rows[0].n,0);
    const result=await save(owner,today,[mark(child),mark(sibling,'no_session')]);assert.equal(result.ok,true);assert.equal(result.attendance.length,2);
    const mine=await staff(parent,'list_my_tracker');assert.equal(mine.attendance.find(r=>r.registrationId===child).status,'present');assert.equal(mine.attendance.find(r=>r.registrationId===sibling).status,'no_session');
    assert.deepEqual((await staff(other,'list_my_tracker')).attendance,[]);
    const next=await save(coach,today,[mark(child,'absent',1)]);assert.equal(next.attendance[0].revision,2);
    await assert.rejects(save(coach,today,[mark(child,'present',1)]),{code:'40001'});
    for(const rows of [[mark(child,'unmarked',2)],[mark(child,'present',2),mark(child,'absent',2)],[]])await assert.rejects(save(owner,today,rows),{code:'22023'});
    await assert.rejects(save(owner,today,Array.from({length:101},()=>mark(randomUUID()))),{code:'22023'});
    await assert.rejects(save(owner,'2099-01-01',[mark(child)]),{code:'22023'});
  });
  await t.test('manual weekly feedback validates scope, text, Monday date and stale revisions',async()=>{
    await assert.rejects(staff(coach,'save_coaching_feedback',[sibling,monday,'Good effort','Practise balance',0]),{code:'42501'});
    await assert.rejects(staff(coach,'save_coaching_feedback',[child,monday,'','',0]),{code:'22023'});
    await assert.rejects(staff(coach,'save_coaching_feedback',[child,'2099-01-01','Good effort','',0]),{code:'22023'});
    const row=await staff(coach,'save_coaching_feedback',[child,monday,'Better balance.','Try five slow squats.',0]);assert.equal(row.summary,'Better balance.');assert.equal(row.revision,1);
    await assert.rejects(staff(coach,'save_coaching_feedback',[child,monday,'Stale','',0]),{code:'40001'});
    const mine=await staff(parent,'list_my_tracker');assert.equal(mine.feedback[0].coachName,'Coach Example');assert.equal(mine.feedback[0].nextStep,'Try five slow squats.');
    assert.deepEqual((await staff(other,'list_my_tracker')).feedback,[]);
    await as('authenticated',coach,async()=>{await db.exec('begin read only');try{assert.equal((await rpc('list_staff_tracker',[today])).feedback.length,1);}finally{await db.exec('rollback');}});
  });
  await t.test('admin send wakes the existing worker once and shares the 9 PM delivery tickets',async()=>{
    const send = user => staff(user, 'send_coaching_attendance_now');
    const status = user => staff(user, 'get_coaching_attendance_email_status');
    const disabled = {sessionDate: today, emailEnabled: false, scheduledEnabled: false, deliveryMode: null, queued: 0, pending: 0, sent: 0, failed: 0};

    await as('anon', null, () => assert.rejects(rpc('send_coaching_attendance_now'), {code:'42501'}));
    await assert.rejects(send(coach), {code:'42501'});
    await assert.rejects(status(parent), {code:'42501'});
    assert.deepEqual(await send(owner), disabled);
    assert.deepEqual(await status(owner), disabled);
    assert.equal((await db.query('select count(*)::int n from private.coaching_email_tickets')).rows[0].n, 0);

    await db.exec('begin');
    try {
      await db.exec(`create schema net;
        create schema vault;
        create table vault.decrypted_secrets(name text, decrypted_secret text);
        insert into vault.decrypted_secrets values
          ('letsaimit_notification_worker_url', 'https://example.supabase.co/functions/v1/admin-notifications'),
          ('letsaimit_notification_worker_secret', repeat('x', 32));
        create table private.test_coaching_wake(id bigint generated always as identity, url text);
        create function net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds integer)
        returns bigint language sql as $$insert into private.test_coaching_wake(url) values ($1) returning id$$;
        update private.coaching_settings set email_enabled=true;`);

      const queued = {sessionDate: today, emailEnabled: true, scheduledEnabled: true, deliveryMode: 'interactive', queued: 4, pending: 4, sent: 0, failed: 0};
      assert.deepEqual(await send(owner), queued);
      assert.deepEqual(await send(admins[1]), {...queued, queued:0});
      assert.equal((await db.query('select private.enqueue_coaching_attendance_at($1) n', [today+'T21:00:00+05:30'])).rows[0].n, 0);
      assert.deepEqual((await db.query('select url from private.test_coaching_wake')).rows, [
        {url:'https://example.supabase.co/functions/v1/coaching-worker'},
      ]);

      const first = await service('claim_coaching_email');
      assert.equal(await service('finish_coaching_email', [first.id, first.leaseToken, 'sent', '']), true);
      const second = await service('claim_coaching_email');
      await db.query('update private.coaching_email_tickets set attempts=5 where id=$1', [second.id]);
      assert.equal(await service('finish_coaching_email', [second.id, second.leaseToken, 'retry', 'transport_failure']), true);
      const delivered = {...queued, queued:0, pending:2, sent:1, failed:1};
      assert.deepEqual(await status(owner), delivered);
      assert.deepEqual(await send(owner), delivered);
      assert.equal((await db.query('select count(*)::int n from private.test_coaching_wake')).rows[0].n, 1);
    } finally {
      await db.exec('rollback');
    }

    await as('authenticated', owner, async()=>{
      await db.exec('begin read only');
      try { assert.deepEqual(await rpc('get_coaching_attendance_email_status'), disabled); }
      finally { await db.exec('rollback'); }
    });
  });
  await t.test('nightly queue is off by default, starts at 21 IST, includes unassigned children and deduplicates all current admins',async()=>{
    assert.equal((await db.query('select private.enqueue_coaching_attendance_at($1) n',[today+'T21:00:00+05:30'])).rows[0].n,0);
    await db.exec('update private.coaching_settings set email_enabled=true');
    assert.equal((await db.query('select private.enqueue_coaching_attendance_at($1) n',[today+'T20:59:59+05:30'])).rows[0].n,0);
    assert.equal((await db.query('select private.enqueue_coaching_attendance_at($1) n',[today+'T21:00:00+05:30'])).rows[0].n,4);
    assert.equal((await db.query('select private.enqueue_coaching_attendance_at($1) n',[today+'T23:00:00+05:30'])).rows[0].n,0);
    const tickets=(await db.query('select * from private.coaching_email_tickets')).rows;assert.equal(tickets.length,4);
    assert.deepEqual(new Set(tickets.map(j=>j.recipient_email)),new Set(admins.map(a=>a.email)));
    assert.ok(tickets.every(j=>j.roster.length===3&&j.roster.some(r=>r.registrationId===sibling)),'unassigned accepted child remains in daily admin roster');
    assert.ok(tickets.every(j=>j.roster.every(r=>!('childName' in r))));
  });
  await t.test('email leases are bounded, token hashes are stable and wrong leases cannot send or rotate tickets',async()=>{
    await db.exec('update private.coaching_email_tickets set next_attempt_at=now()');
    const job=await service('claim_coaching_email');assert.ok(job.id);assert.ok(job.leaseToken);
    const prepared=await service('prepare_coaching_email',[job.id,job.leaseToken]);assert.equal(prepared.rows.length,3);assert.equal(prepared.ticketId,job.id);assert.equal(prepared.used,false);
    assert.equal(await service('prepare_coaching_email',[job.id,randomUUID()]),null);
    assert.equal(await service('set_coaching_email_token',[job.id,job.leaseToken,hash(ticketToken)]),true);
    assert.equal(await service('set_coaching_email_token',[job.id,job.leaseToken,hash(ticketToken)]),true);
    assert.equal(await service('set_coaching_email_token',[job.id,job.leaseToken,hash('B'.repeat(43))]),false);
    assert.equal(await service('finish_coaching_email',[job.id,randomUUID(),'sent','']),false);
    assert.equal(await service('finish_coaching_email',[job.id,job.leaseToken,'sent','']),true);
    assert.equal((await service('read_coaching_email_attendance',[job.id,ticketToken])).rows.length,3);
    assert.equal((await db.query('select token_hash from private.coaching_email_tickets where id=$1',[job.id])).rows[0].token_hash,hash(ticketToken));
  });
  await t.test('Gmail save is exact-roster, current-revision, atomic and idempotent after a lost acknowledgement',async()=>{
    const id=await ticket();const initial=await service('read_coaching_email_attendance',[id,ticketToken]);
    const rows=initial.rows.map(r=>mark(r.registrationId,r.registrationId===child?'present':'absent',r.revision));
    await assert.rejects(service('save_coaching_email_attendance',[id,ticketToken,JSON.stringify(rows.slice(0,1))]),{code:'22023'});
    await assert.rejects(service('save_coaching_email_attendance',[id,ticketToken,JSON.stringify([rows[0],mark(otherChild)])]),{code:'42501'});
    await assert.rejects(service('save_coaching_email_attendance',[id,'B'.repeat(43),JSON.stringify(rows)]),{code:'42501'});
    const receipt=await service('save_coaching_email_attendance',[id,ticketToken,JSON.stringify(rows)]);assert.deepEqual(receipt,{ok:true,saved:true,ticketId:id,count:2});
    assert.deepEqual(await service('save_coaching_email_attendance',[id,ticketToken,JSON.stringify(rows)]),receipt);
    await assert.rejects(service('save_coaching_email_attendance',[id,ticketToken,JSON.stringify(rows.map(r=>({...r,status:'no_session'})))]),{code:'40001'});
    assert.equal((await service('read_coaching_email_attendance',[id,ticketToken])).used,true);
  });
  await t.test('a second admin can refresh a conflict in Gmail without overwriting a newer mark or saving a partial batch',async()=>{
    const id=await ticket(admins[1].email);const before=await service('read_coaching_email_attendance',[id,ticketToken]);
    const rows=before.rows.map(r=>mark(r.registrationId,'present',r.revision));
    const current=rows.find(r=>r.registrationId===child);await save(owner,today,[mark(child,'absent',current.revision)]);
    const siblingBefore=(await db.query('select revision,status from private.coaching_attendance where registration_id=$1 and session_date=$2',[sibling,today])).rows[0];
    await assert.rejects(service('save_coaching_email_attendance',[id,ticketToken,JSON.stringify(rows)]),{code:'40001'});
    assert.deepEqual((await db.query('select revision,status from private.coaching_attendance where registration_id=$1 and session_date=$2',[sibling,today])).rows[0],siblingBefore);
    const refreshed=await service('read_coaching_email_attendance',[id,ticketToken]);assert.equal(refreshed.rows.find(r=>r.registrationId===child).status,'absent');
    const latest=refreshed.rows.map(r=>mark(r.registrationId,r.status,r.revision));assert.equal((await service('save_coaching_email_attendance',[id,ticketToken,JSON.stringify(latest)])).saved,true);
  });
  await t.test('expired and revoked-admin tickets are denied on both read and write even with a valid token',async()=>{
    const id=await ticket(admins[2].email,[child],{expires:'-1 second'});
    await assert.rejects(service('read_coaching_email_attendance',[id,ticketToken]),{code:'42501'});
    await assert.rejects(service('save_coaching_email_attendance',[id,ticketToken,JSON.stringify([mark(child)])]),{code:'42501'});
    await ticket(admins[2].email,[child]);await db.query('delete from public.allowed_admins where email=$1',[admins[2].email]);
    await assert.rejects(service('read_coaching_email_attendance',[id,ticketToken]),{code:'42501'});
    await assert.rejects(service('save_coaching_email_attendance',[id,ticketToken,JSON.stringify([mark(child)])]),{code:'42501'});
  });
  await t.test('email refresh reads run in PostgREST read-only transactions and never expose token hashes',async()=>{
    const id=await ticket(owner.email,[child]);
    await as('service_role',null,async()=>{await db.exec('begin read only');try{
      const result=await rpc('read_coaching_email_attendance',[id,ticketToken]);assert.equal(result.rows.length,1);assert.equal(result.token_hash,undefined);assert.equal(result.token,undefined);
    }finally{await db.exec('rollback');}});
  });
  await t.test('assignment revocation removes coach writes immediately while independent parent access remains',async()=>{
    await assign(otherChild,'',1);
    assert.deepEqual((await staff(parent,'list_staff_tracker',[today])).children,[]);
    await assert.rejects(save(parent,today,[mark(otherChild)]),{code:'42501'});
    assert.equal((await staff(parent,'list_my_tracker')).children.length,2);
  });
  await t.test('each authenticated tracker mutation holds the Auth identity lock before changing tracker rows',async()=>{
    // A real BEFORE trigger observes the transaction lock at the write boundary,
    // before a later Auth FK check could acquire its own relation lock.
    await db.exec(`create function private.test_tracker_identity_lock() returns trigger language plpgsql as $$begin
      if not exists(select 1 from pg_locks where pid=pg_backend_pid() and locktype='relation' and relation='auth.users'::regclass and mode='RowShareLock') then
        raise exception 'TRACKER_IDENTITY_LOCK_REQUIRED';end if;return new;end;$$;
      create trigger test_tracker_assignment_lock before insert or update on private.coaching_assignments for each row execute function private.test_tracker_identity_lock();
      create trigger test_tracker_attendance_lock before insert or update on private.coaching_attendance for each row execute function private.test_tracker_identity_lock();
      create trigger test_tracker_feedback_lock before insert or update on private.coaching_feedback for each row execute function private.test_tracker_identity_lock();`);
    try{
      const assignment=(await db.query('select revision from private.coaching_assignments where registration_id=$1',[child])).rows[0];
      const attendance=(await db.query('select revision,status from private.coaching_attendance where registration_id=$1 and session_date=$2',[child,today])).rows[0];
      const feedback=(await db.query('select revision,summary,next_step from private.coaching_feedback where registration_id=$1 and week_start=$2',[child,monday])).rows[0];
      // Execute the preceding implementation too: the same real writes must fail
      // this boundary observation until the forward migration is applied.
      const before=await readFile(new URL('20261110212805_coaching_tracker.sql',directory),'utf8');
      const mutationNames=new Set(['public.set_coaching_assignment','public.save_coaching_attendance','public.save_coaching_feedback']);
      for(const match of before.matchAll(/create function\s+([\w.]+)\s*\([\s\S]*?\$\$[\s\S]*?\$\$;/g))if(mutationNames.has(match[1]))await db.exec(match[0].replace('create function','create or replace function'));
      await assert.rejects(assign(child,coach.email,Number(assignment.revision)),/TRACKER_IDENTITY_LOCK_REQUIRED/);
      await assert.rejects(save(coach,today,[mark(child,attendance.status,Number(attendance.revision))]),/TRACKER_IDENTITY_LOCK_REQUIRED/);
      await assert.rejects(staff(coach,'save_coaching_feedback',[child,monday,feedback.summary,feedback.next_step,Number(feedback.revision)]),/TRACKER_IDENTITY_LOCK_REQUIRED/);
      await db.exec(await readFile(new URL('20261110220027_coaching_tracker_write_identity_lock.sql',directory),'utf8'));
      await assign(child,coach.email,Number(assignment.revision));
      await save(coach,today,[mark(child,attendance.status,Number(attendance.revision))]);
      await staff(coach,'save_coaching_feedback',[child,monday,feedback.summary,feedback.next_step,Number(feedback.revision)]);
    }finally{
      await db.exec(await readFile(new URL('20261110220027_coaching_tracker_write_identity_lock.sql',directory),'utf8'));
      await db.exec(`drop trigger test_tracker_assignment_lock on private.coaching_assignments;drop trigger test_tracker_attendance_lock on private.coaching_attendance;drop trigger test_tracker_feedback_lock on private.coaching_feedback;drop function private.test_tracker_identity_lock();`);
    }
  });
  await t.test('deleting a coach revokes assignments without removing the child’s feedback or reopening access on re-signup',async()=>{
    await save(coach,yesterday,[mark(child)]);
    await service('prepare_account_deletion',[coach.id,'2026-11-11',true]);
    assert.equal((await db.query('select coach_email from private.coaching_assignments where registration_id=$1',[child])).rows[0].coach_email,'');
    const mine=await staff(parent,'list_my_tracker');assert.equal(mine.feedback[0].summary,'Better balance.');assert.equal(mine.feedback[0].coachName,'Coach');
    await assert.rejects(staff(coach,'list_staff_tracker',[today]),{code:'42501'});
    await db.query('delete from auth.users where id=$1',[coach.id]);
    assert.equal((await db.query('select recorded_by from private.coaching_attendance where registration_id=$1 and session_date=$2',[child,yesterday])).rows[0].recorded_by,null);
    const fresh=person(coach.email);await db.query('insert into auth.users values($1,$2)',[fresh.id,fresh.email]);
    assert.deepEqual((await staff(fresh,'list_staff_tracker',[today])).children,[]);
  });
  await t.test('account deletion revokes roster tickets and removes child tracking without touching invoices or another child',async()=>{
    const id=await ticket(admins[3].email,[child,otherChild]);
    const billingBefore=(await db.query('select count(*)::int n from private.billing_invoices')).rows[0].n;
    await service('prepare_account_deletion',[parent.id,'2026-11-11',true]);
    assert.equal((await db.query('select count(*)::int n from private.coaching_feedback where registration_id=$1',[child])).rows[0].n,0);
    assert.equal((await db.query('select count(*)::int n from private.coaching_attendance where registration_id=any($1::uuid[])',[[child,sibling]])).rows[0].n,0);
    assert.equal((await db.query('select count(*)::int n from private.coaching_assignments where registration_id=$1',[child])).rows[0].n,0);
    await assert.rejects(service('read_coaching_email_attendance',[id,ticketToken]),{code:'42501'});
    await assert.rejects(service('save_coaching_email_attendance',[id,ticketToken,JSON.stringify([mark(child),mark(otherChild)])]),{code:'42501'});
    await assert.rejects(staff(parent,'list_my_tracker'),{code:'42501'});
    assert.equal((await staff(other,'list_my_tracker')).children[0].registrationId,otherChild);
    assert.equal((await db.query('select count(*)::int n from private.billing_invoices')).rows[0].n,billingBefore);
    await db.query('delete from auth.users where id=$1',[parent.id]);const fresh=person(parent.email);await db.query('insert into auth.users values($1,$2)',[fresh.id,fresh.email]);
    assert.deepEqual((await staff(fresh,'list_my_tracker')).children,[]);
  });
});
