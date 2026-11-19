import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const productionRef='pppppppppppppppppppp',uatRef='uuuuuuuuuuuuuuuuuuuu';
const ownerEmail='approved.owner@gmail.com',coachEmail='verified.coach@example.test';
const acceptance=await readFile(new URL('../supabase/checks/fresh_production.sql',import.meta.url),'utf8');

test('fresh production acceptance checks the complete migration set without enabling delivery or creating application data',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin;
    create schema auth;create table auth.users(id uuid primary key,email text);
    create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
    grant usage on schema auth to anon,authenticated;
    grant execute on function auth.jwt(),auth.uid() to anon,authenticated;`);
  for(const [name,value] of Object.entries({production_ref:productionRef,uat_ref:uatRef,approved_owner_email:ownerEmail,approved_coach_email:coachEmail})){
    await db.query('select set_config($1,$2,false)',['letsaimit.'+name,value]);
  }
  await db.exec(await readFile(new URL('../supabase/checks/fresh_target_preflight.sql',import.meta.url),'utf8'));
  const directory=new URL('../supabase/migrations/',import.meta.url);
  const files=(await readdir(directory)).filter(name=>name.endsWith('.sql')).sort();
  const createdTables=[];
  for(const file of files){
    const source=await readFile(new URL(file,directory),'utf8');
    for(const [,name] of source.matchAll(/create table\s+([\w.]+)/gi))createdTables.push(name);
    await db.exec(source);
  }
  assert.equal(files.length,19);
  assert.equal(createdTables.length,25);
  for(const table of createdTables)assert.ok(acceptance.includes("'"+table+"'"),'Acceptance covers '+table);
  const bootstrap=await readFile(new URL('../supabase/bootstrap-owner.sql',import.meta.url),'utf8');
  await db.exec(bootstrap.replace('REPLACE_WITH_OWNER_GMAIL',ownerEmail));
  await db.query('update private.coaching_settings set default_coach_email=$1',[coachEmail]);
  assert.equal((await db.query('select private.activate_confirmed_students_default($1) changed',[coachEmail])).rows[0].changed,0);
  // Mock platform facilities unavailable in PGlite. These rows contain synthetic
  // URLs and a fake bearer, and never execute a scheduler or network request.
  await db.exec(`create schema net;create schema cron;create schema vault;
    create table cron.job(active boolean,schedule text,command text);
    create table vault.decrypted_secrets(name text,decrypted_secret text);
    create publication supabase_realtime for table public.registrations;`);
  for(const name of ['notification','billing','account_deletion','coaching']){
    await db.query('insert into cron.job values(true,$1,$2)',['* * * * *','select private.wake_'+name+'_worker();']);
  }
  await db.query('insert into vault.decrypted_secrets values($1,$2),($3,$4),($5,$6)',[
    'letsaimit_notification_worker_url','https://'+productionRef+'.supabase.co/functions/v1/admin-notifications',
    'letsaimit_billing_worker_url','https://'+productionRef+'.supabase.co/functions/v1/billing-worker',
    'letsaimit_notification_worker_secret','synthetic-test-bearer-'.repeat(3)]);
  const verify=()=>db.exec(acceptance);
  const expectFailure=async(code)=>{
    try{await assert.rejects(verify(),error=>error.code==='P0001'&&error.message.includes(code));}
    finally{await db.exec('rollback');}
  };
  await t.test('all current database gates pass with empty application/Auth data',async()=>{
    await verify();
    assert.equal((await db.query('select count(*)::int n from auth.users')).rows[0].n,0);
    assert.deepEqual((await db.query('select email_enabled,manual_email_enabled,parent_attendance_email_enabled from private.coaching_settings')).rows,
      [{email_enabled:false,manual_email_enabled:false,parent_attendance_email_enabled:false}]);
    for(const table of createdTables.filter(name=>!['public.allowed_admins','private.notification_settings','private.billing_settings','private.coaching_settings'].includes(name))){
      assert.equal((await db.query('select count(*)::int n from '+table)).rows[0].n,0);
    }
  });
  await t.test('an unapproved owner or coach cannot satisfy a fresh acceptance',async()=>{
    await db.query("select set_config('letsaimit.approved_owner_email',$1,false)",['another.owner@gmail.com']);
    await expectFailure('FRESH_BACKEND_OWNER_REQUIRED');
    await db.query("select set_config('letsaimit.approved_owner_email',$1,false)",[ownerEmail]);
    await db.exec('update private.coaching_settings set confirmed_students_default_email=null');
    await expectFailure('FRESH_BACKEND_VERIFIED_COACH_REQUIRED');
    await db.query('update private.coaching_settings set confirmed_students_default_email=$1',[coachEmail]);
  });
  await t.test('parent email cannot be activated during fresh infrastructure acceptance',async()=>{
    await db.exec('update private.coaching_settings set parent_attendance_email_enabled=true');
    await expectFailure('FRESH_BACKEND_DISPATCH_MUST_STAY_DISABLED');
    await db.exec('update private.coaching_settings set parent_attendance_email_enabled=false');
  });
  await t.test('new Students tables and service RPCs retain private boundaries',async()=>{
    await db.exec('alter table private.coaching_practice disable row level security');
    await expectFailure('FRESH_BACKEND_RLS_MISSING');
    await db.exec('alter table private.coaching_practice enable row level security');
    await db.exec('grant select on private.billing_admin_invoice_changes to authenticated');
    await expectFailure('FRESH_BACKEND_PRIVATE_GRANT');
    await db.exec('revoke select on private.billing_admin_invoice_changes from authenticated');
    await db.exec('grant execute on function public.claim_parent_attendance_email() to authenticated');
    await expectFailure('FRESH_BACKEND_SERVICE_RPC_GRANT');
    await db.exec('revoke execute on function public.claim_parent_attendance_email() from authenticated');
    await db.exec('grant execute on function public.ingest_owned_billing_webhook(text,text,text,text,text,uuid) to anon');
    await expectFailure('FRESH_BACKEND_SERVICE_RPC_GRANT');
    await db.exec('revoke execute on function public.ingest_owned_billing_webhook(text,text,text,text,text,uuid) from anon');
  });
  await t.test('production workers cannot route into the UAT backend',async()=>{
    await db.query('update vault.decrypted_secrets set decrypted_secret=$1 where name=$2',[
      'https://'+uatRef+'.supabase.co/functions/v1/admin-notifications','letsaimit_notification_worker_url']);
    await expectFailure('FRESH_BACKEND_VAULT_URL_MISMATCH');
    await db.query('update vault.decrypted_secrets set decrypted_secret=$1 where name=$2',[
      'https://'+productionRef+'.supabase.co/functions/v1/admin-notifications','letsaimit_notification_worker_url']);
    await verify();
  });
});
