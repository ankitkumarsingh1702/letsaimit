import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createCoachingWorkerHandler,createCoachingEmailActionHandler} from '../supabase/functions/_shared/coaching-worker.js';

test('real coaching SQL → queued SMTP alternatives → Gmail POST → parent tracker, including conflict refresh and lost acknowledgements',async t=>{
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
  await db.exec('update private.coaching_settings set email_enabled=true');
  assert.equal((await db.query('select private.enqueue_coaching_attendance_at($1) n',[`${today}T21:00:00+05:30`])).rows[0].n,4);
  await db.exec('update private.coaching_email_tickets set next_attempt_at=now()');
  const allowed=new Set(['enqueue_coaching_attendance','claim_coaching_email','prepare_coaching_email','set_coaching_email_token','finish_coaching_email','read_coaching_email_attendance','save_coaching_email_attendance']);
  const rpc=async(name,args)=>{
    assert.ok(allowed.has(name));const entries=Object.entries(args);
    return as('service_role',null,async()=> (await db.query(`select public.${name}(${entries.map(([key],i)=>`${key} => $${i+1}`).join(',')}) value`,entries.map(([_key,value])=>Array.isArray(value)||value&&typeof value==='object'?JSON.stringify(value):value))).rows[0].value);
  };
  const secret='synthetic-integration-worker-secret-32-plus',signingSecret='synthetic-integration-email-signing-secret-32-plus',senderEmail='attendance@letsaimit.com';
  const endpoint='https://abcdefghijklmnopqrst.supabase.co/functions/v1/coaching-worker/attendance';const sent=[];
  const worker=createCoachingWorkerHandler({secret,signingSecret,senderEmail,actionUrl:endpoint,dynamicEmailReady:true,rpc,sendEmail:async message=>{sent.push(message);return {accepted:true};}});
  const response=await worker(new Request(endpoint.replace('/attendance',''),{method:'POST',headers:{Authorization:`Bearer ${secret}`}}));
  assert.equal(response.status,200);assert.equal((await response.json()).sent,4);assert.equal(sent.length,4);assert.deepEqual(new Set(sent.map(m=>m.recipientEmail)),new Set(admins.map(a=>a.email)));
  for(const message of sent){assert.equal([...message.amp.matchAll(/name="status_/g)].length,8);assert.match(message.amp,/Not marked/);assert.doesNotMatch(message.amp,/integration\.parent|12025550123|Razorpay/);assert.doesNotMatch(message.text+message.html,/name="token"/);}
  const hidden=(mail,name)=>mail.amp.match(new RegExp(`name="${name}" value="([^"]+)"`))[1];
  const initial=mail=>{
    const fields={ticketId:hidden(mail,'ticketId'),token:hidden(mail,'token'),action:'save'};
    for(const [,id]of mail.amp.matchAll(/name="status_([0-9a-f]{32})"/g)){fields[`status_${id}`]='present';fields[`revision_${id}`]=hidden(mail,`revision_${id}`);}return fields;
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
