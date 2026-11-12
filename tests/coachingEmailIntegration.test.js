import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createCoachingWorkerHandler,createCoachingEmailActionHandler} from '../supabase/functions/_shared/coaching-worker.js';

test('admin send → real coaching SQL → SMTP alternatives → Gmail POST → parent tracker, including conflict refresh and lost acknowledgements',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin;
    create schema auth;create table auth.users(id uuid primary key,email text);
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
    grant usage on schema auth to anon,authenticated;grant execute on function auth.jwt(),auth.uid() to anon,authenticated;`);
  const directory=new URL('../supabase/migrations/',import.meta.url);
  for(const name of (await readdir(directory)).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile(new URL(name,directory),'utf8'));
  const admins=Array.from({length:4},(_,i)=>({id:randomUUID(),email:`integration.admin${i}@example.test`}));
  const parent={id:randomUUID(),email:'integration.parent@example.test'};
  for(const actor of [...admins,parent])await db.query('insert into auth.users values($1,$2)',[actor.id,actor.email]);
  for(const [i,actor]of admins.entries())await db.query('insert into public.allowed_admins(email,is_owner) values($1,$2)',[actor.email,i===0]);
  async function as(role,actor,fn){
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(actor?{sub:actor.id,email:actor.email,app_metadata:{provider:'google'},user_metadata:{full_name:'Example'}}:{})]);
    await db.exec(`set role ${role}`);try{return await fn();}finally{await db.exec('reset role');await db.query("select set_config('request.jwt.claims','{}',false)");}
  }
  const call=async(name,params=[])=>(await db.query(`select public.${name}(${params.map((_v,i)=>`$${i+1}`).join(',')}) value`,params)).rows[0].value;
  const authenticated=(actor,name,params=[])=>as('authenticated',actor,()=>call(name,params));
  const terms=await call('get_billing_terms');const ids=[];
  for(let i=0;i<8;i++){
    const receipt=await authenticated(parent,'submit_registration',[JSON.stringify({full_name:'Example parent',email:parent.email,phone:'+12025550123',metadata:{submissionId:randomUUID(),formType:'enrol',childName:`Example child ${i+1}`,age:'9',community:'Example community',sport:['Football','Basketball','Not sure'][i%3],phoneCountry:'US',address:'Example address',note:'',guardianConsent:true,termsAccepted:true,consentVersion:'2026-11-09',termsVersion:'2026-11-05',billingPricingMode:'custom_quote',billingConsent:true,billingTermsVersion:terms.version}})]);
    await authenticated(admins[0],'review_registration',[receipt.id,'accepted',1,null]);ids.push(receipt.id);
  }
  const {today}=(await db.query("select (now() at time zone 'Asia/Kolkata')::date::text today")).rows[0];
  const allowed=new Set(['enqueue_coaching_attendance','claim_coaching_email','claim_coaching_email_for_modes','prepare_coaching_email','set_coaching_email_token','finish_coaching_email','read_coaching_email_attendance','save_coaching_email_attendance']);
  const rpc=async(name,args)=>{
    assert.ok(allowed.has(name));const entries=Object.entries(args);
    return as('service_role',null,async()=> (await db.query(`select public.${name}(${entries.map(([key],i)=>`${key} => $${i+1}`).join(',')}) value`,entries.map(([key,value])=>key!=='p_modes' && value && typeof value==='object'?JSON.stringify(value):value))).rows[0].value);
  };
  const secret='synthetic-integration-worker-secret-32-plus',signingSecret='synthetic-integration-email-signing-secret-32-plus',senderEmail='attendance@letsaimit.com';
  const endpoint='https://abcdefghijklmnopqrst.supabase.co/functions/v1/coaching-worker/attendance';const sent=[];
  const workerRequest = () => new Request(endpoint.replace('/attendance',''), { method:'POST', headers:{Authorization:`Bearer ${secret}`} });

  await t.test('manual Gmail delivers an authenticated sheet link while scheduled and interactive delivery stay off', async () => {
    await assert.rejects(authenticated(parent,'send_coaching_attendance_now'), { code:'42501' });
    await db.exec('begin');
    try {
      await db.exec(`
        create schema net;
        create schema vault;
        create table vault.decrypted_secrets(name text, decrypted_secret text);
        insert into vault.decrypted_secrets values
          ('letsaimit_notification_worker_url', 'https://example.supabase.co/functions/v1/admin-notifications'),
          ('letsaimit_notification_worker_secret', repeat('x', 32));
        create table private.test_coaching_wake(id bigint generated always as identity, url text);
        create function net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds integer)
          returns bigint language sql as $$insert into private.test_coaching_wake(url) values ($1) returning id$$;
        update private.coaching_settings set manual_email_enabled=true;
      `);
      const expected = {sessionDate:today,emailEnabled:true,scheduledEnabled:false,deliveryMode:'link',queued:4,pending:4,sent:0,failed:0};
      assert.equal((await db.query('select private.enqueue_coaching_attendance_at($1) n',[`${today}T21:00:00+05:30`])).rows[0].n,0);
      assert.deepEqual(await authenticated(admins[0],'send_coaching_attendance_now'), expected);
      assert.deepEqual(await authenticated(admins[1],'send_coaching_attendance_now'), { ...expected, queued:0 });
      assert.deepEqual((await db.query('select url from private.test_coaching_wake')).rows, [
        { url:'https://example.supabase.co/functions/v1/coaching-worker' },
      ]);
      assert.equal(await rpc('claim_coaching_email', {}), null);

      const messages = [];
      const linkWorker = createCoachingWorkerHandler({
        secret, senderEmail: admins[0].email, dynamicEmailReady:false, dashboardOrigin:'https://uat.letsaimit.com',
        rpc: async (name, args) => {
          assert.ok(!['enqueue_coaching_attendance','set_coaching_email_token'].includes(name));
          return rpc(name, args);
        },
        sendLinkEmail: async message => { messages.push(message); return { accepted:true }; },
      });
      const result = await linkWorker(workerRequest());
      assert.equal(result.status, 200);
      assert.equal((await result.json()).sent, 4);
      assert.deepEqual(new Set(messages.map(message => message.recipientEmail)), new Set(admins.map(admin => admin.email)));
      for (const message of messages) {
        const url = `https://uat.letsaimit.com/admin/?view=attendance&date=${today}`;
        assert.equal(message.amp, undefined);
        assert.ok(message.html.includes(`href="${url.replace('&','&amp;')}"`));
        assert.ok(message.text.includes(url));
        assert.doesNotMatch(message.html+message.text, /Example child|integration\.parent|<form|token/i);
      }
      assert.deepEqual(await authenticated(admins[0],'get_coaching_attendance_email_status'), { ...expected, queued:0, pending:0, sent:4 });
      assert.equal((await db.query('select count(*)::int n from private.coaching_email_tickets where token_hash is not null')).rows[0].n, 0);
      await authenticated(admins[0], 'save_coaching_attendance', [today, JSON.stringify([
        { registrationId:ids[0], status:'present', revision:0 },
        { registrationId:ids[1], status:'absent', revision:0 },
      ])]);
      const tracker = await authenticated(parent, 'list_my_tracker');
      assert.deepEqual(new Set(tracker.attendance.map(row => row.status)), new Set(['present','absent']));
    } finally {
      await db.exec('rollback');
    }
  });

  await db.exec('update private.coaching_settings set email_enabled=true');
  const queued={sessionDate:today,emailEnabled:true,scheduledEnabled:true,deliveryMode:'interactive',queued:4,pending:4,sent:0,failed:0};
  assert.deepEqual(await authenticated(admins[0],'send_coaching_attendance_now'),queued);
  assert.equal((await db.query('select private.enqueue_coaching_attendance_at($1) n',[`${today}T21:00:00+05:30`])).rows[0].n,0);
  const worker=createCoachingWorkerHandler({secret,signingSecret,senderEmail,actionUrl:endpoint,dynamicEmailReady:true,rpc,sendEmail:async message=>{sent.push(message);return {accepted:true};}});
  const response=await worker(workerRequest());
  assert.equal(response.status,200);assert.equal((await response.json()).sent,4);assert.equal(sent.length,4);assert.deepEqual(new Set(sent.map(m=>m.recipientEmail)),new Set(admins.map(a=>a.email)));
  assert.deepEqual(await authenticated(admins[0],'get_coaching_attendance_email_status'),{...queued,queued:0,pending:0,sent:4});
  for(const message of sent){assert.equal([...message.amp.matchAll(/role="radiogroup"/g)].length,8);assert.match(message.amp,/✓ Present/);assert.match(message.amp,/✕ Absent/);assert.doesNotMatch(message.amp,/integration\.parent|12025550123|Razorpay/);assert.doesNotMatch(message.text+message.html,/name="token"/);}
  const hidden=(mail,name)=>mail.amp.match(new RegExp(`name="${name}" value="([^"]+)"`))[1];
  const initial=mail=>{
    const fields={ticketId:hidden(mail,'ticketId'),token:hidden(mail,'token'),action:'save'};
    for(const [,id]of mail.amp.matchAll(/name="status_([0-9a-f]{32})" value="present"/g)){fields[`status_${id}`]='present';fields[`revision_${id}`]=hidden(mail,`revision_${id}`);}return fields;
  };
  const request=fields=>new Request(endpoint,{method:'POST',headers:{'AMP-Email-Sender':senderEmail,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(fields)});
  const first=initial(sent[0]);const fieldsInOrder=Object.keys(first).filter(k=>k.startsWith('status_'));first[fieldsInOrder[1]]='absent';first[fieldsInOrder[2]]='no_session';
  let lostAck=true;
  const action=createCoachingEmailActionHandler({senderEmail,rpc:async(name,args)=>{const result=await rpc(name,args);if(name==='save_coaching_email_attendance'&&lostAck){lostAck=false;throw new Error('synthetic lost acknowledgement');}return result;}});
  assert.equal((await action(request(first))).status,503);
  assert.equal((await db.query('select count(*)::int n from private.coaching_attendance')).rows[0].n,8);
  assert.equal((await action(request(first))).status,200);
  assert.ok((await db.query('select revision from private.coaching_attendance')).rows.every(r=>r.revision===1));
  const mine=await authenticated(parent,'list_my_tracker');assert.equal(mine.attendance.length,8);assert.equal(mine.attendance.filter(r=>r.status==='present').length,6);assert.equal(mine.attendance.filter(r=>r.status==='absent').length,1);assert.equal(mine.attendance.filter(r=>r.status==='no_session').length,1);
  const second=initial(sent[1]);assert.equal((await action(request(second))).status,409);
  const refresh=await action(request({ticketId:second.ticketId,token:second.token,action:'refresh'}));assert.equal(refresh.status,200);const current=await refresh.json();assert.equal(current.used,false);assert.equal(current.sheet.row0.revision,1);
  Object.keys(second).filter(k=>k.startsWith('status_')).forEach((key,index)=>{second[key]=index===0?'absent':current.sheet[`row${index}`].status;second[`revision_${key.slice(7)}`]=String(current.sheet[`row${index}`].revision);});
  assert.equal((await action(request(second))).status,200);
  const used=await action(request({ticketId:second.ticketId,token:second.token,action:'refresh'}));assert.equal((await used.json()).used,true);
  // Queue order is by generated ticket IDs, not membership order. Never revoke the protected owner.
  const remaining=sent.slice(2),revokedMail=remaining.find(mail=>mail.recipientEmail!==admins[0].email);
  const expiredMail=remaining.find(mail=>mail!==revokedMail);
  assert.ok(revokedMail&&expiredMail);
  const revoked=initial(revokedMail);await db.query('delete from public.allowed_admins where email=$1',[revokedMail.recipientEmail]);assert.equal((await action(request(revoked))).status,403);
  const expired=initial(expiredMail);await db.query("update private.coaching_email_tickets set expires_at=now()-interval '1 second' where id=$1",[expired.ticketId]);assert.equal((await action(request(expired))).status,403);
});
