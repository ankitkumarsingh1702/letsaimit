-- Read-only acceptance checks AFTER all migrations and the separate owner bootstrap.
-- SET letsaimit.production_ref = '<production ref from release-targets.json>';
-- SET letsaimit.uat_ref = '<uat ref from release-targets.json>';
-- Never run an existing database through fresh bootstrap or empty it to pass these checks.
begin read only;
do $verify$
declare production_ref text:=current_setting('letsaimit.production_ref',true);
  uat_ref text:=current_setting('letsaimit.uat_ref',true);name text;relation regclass;routine regprocedure;
  rls boolean;n bigint;valid boolean;
  tables text[]:=array['public.allowed_admins','public.registrations',
    'private.notification_settings','private.notification_digest_windows','private.notification_activity','private.admin_notification_outbox',
    'private.billing_settings','private.billing_accounts','private.billing_invoices','private.billing_ledger','private.billing_jobs',
    'private.billing_webhook_events','private.billing_approval_quotes','private.billing_price_changes','private.billing_month_summaries',
    'private.account_deletions','private.account_deletion_registrations',
    'private.coaching_assignments','private.coaching_attendance','private.coaching_feedback','private.coaching_settings','private.coaching_email_tickets'];
  service_rpcs text[]:=array['public.enqueue_admin_notification_digests()','public.claim_admin_notification()',
    'public.prepare_admin_notification(uuid,uuid)','public.finish_admin_notification(uuid,uuid,text,text)',
    'public.enqueue_billing_work()','public.claim_billing_job()','public.prepare_billing_job(uuid,uuid)',
    'public.finish_billing_job(uuid,uuid,text,text)','public.save_billing_provider_snapshot(uuid,jsonb)',
    'public.ingest_billing_webhook(text,text,text,text,text)',
    'public.prepare_account_deletion(uuid,text,boolean)','public.claim_account_deletions(uuid,integer)',
    'public.finish_account_deletion(uuid,uuid,boolean,text)','public.get_account_deletion_status(uuid)',
    'public.enqueue_coaching_attendance()','public.claim_coaching_email()','public.claim_coaching_email_for_modes(text[])','public.prepare_coaching_email(uuid,uuid)',
    'public.set_coaching_email_token(uuid,uuid,text)','public.finish_coaching_email(uuid,uuid,text,text)',
    'public.read_coaching_email_attendance(uuid,text)','public.save_coaching_email_attendance(uuid,text,jsonb)'];
  authenticated_rpcs text[]:=array['public.is_admin()','public.submit_registration(jsonb)','public.list_my_registrations()',
    'public.review_registration(uuid,text,bigint)','public.review_registration(uuid,text,bigint,integer)',
    'public.set_monthly_coaching_fee(uuid,integer,bigint)','public.cancel_billing_account(uuid,bigint)',
    'public.list_my_billing()','public.list_admin_billing()',
    'public.list_my_tracker()','public.list_staff_tracker(date)','public.list_staff_tracker(date,text)','public.has_coaching_assignments()',
    'public.set_coaching_assignment(uuid,text,integer[],date,bigint)',
    'public.save_coaching_attendance(date,jsonb)','public.save_coaching_feedback(uuid,date,text,text,bigint)',
    'public.get_coaching_attendance_email_status()','public.send_coaching_attendance_now()'];
begin
  if production_ref is null or production_ref!~'^[a-z0-9]{20}$'
    or uat_ref is null or uat_ref!~'^[a-z0-9]{20}$' or production_ref=uat_ref then
    raise exception 'FRESH_BACKEND_TARGET_REQUIRED';
  end if;
  foreach name in array tables loop
    relation:=to_regclass(name);
    if relation is null then raise exception 'FRESH_BACKEND_TABLE_MISSING: %',name;end if;
    select relrowsecurity into rls from pg_class where oid=relation;
    if not rls then raise exception 'FRESH_BACKEND_RLS_MISSING: %',name;end if;
    if name like 'private.%' and (
      has_table_privilege('anon',relation,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      or has_table_privilege('authenticated',relation,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      or has_any_column_privilege('anon',relation,'SELECT,INSERT,UPDATE,REFERENCES')
      or has_any_column_privilege('authenticated',relation,'SELECT,INSERT,UPDATE,REFERENCES')) then
      raise exception 'FRESH_BACKEND_PRIVATE_GRANT: %',name;
    end if;
    if name<>all(array['public.allowed_admins','private.notification_settings','private.billing_settings','private.coaching_settings']) then
      execute format('select count(*) from %s',relation) into n;
      if n<>0 then raise exception 'FRESH_BACKEND_APP_DATA_PRESENT: %',name;end if;
    end if;
  end loop;
  if (select count(*) from public.allowed_admins where is_owner)<>1 then raise exception 'FRESH_BACKEND_OWNER_REQUIRED';end if;
  if (select count(*) from private.notification_settings)<>1
    or (select dispatch_enabled from private.notification_settings where id) is distinct from false
    or (select count(*) from private.billing_settings)<>1
    or (select enabled from private.billing_settings where id) is distinct from false
    or (select count(*) from private.coaching_settings)<>1
    or (select email_enabled from private.coaching_settings where id) is distinct from false
    or (select manual_email_enabled from private.coaching_settings where id) is distinct from false then
    raise exception 'FRESH_BACKEND_DISPATCH_MUST_STAY_DISABLED';
  end if;
  if has_any_column_privilege('anon','public.registrations','SELECT,INSERT,UPDATE')
    or has_any_column_privilege('authenticated','public.registrations','INSERT')
    or has_column_privilege('authenticated','public.registrations','parent_user_id','UPDATE')
    or has_column_privilege('authenticated','public.registrations','deleted_at','UPDATE')
    or has_column_privilege('authenticated','public.allowed_admins','is_owner','INSERT,UPDATE') then
    raise exception 'FRESH_BACKEND_PUBLIC_COLUMN_GRANT';
  end if;
  foreach name in array service_rpcs loop
    routine:=to_regprocedure(name);
    if routine is null or not has_function_privilege('service_role',routine,'EXECUTE')
      or has_function_privilege('anon',routine,'EXECUTE') or has_function_privilege('authenticated',routine,'EXECUTE') then
      raise exception 'FRESH_BACKEND_SERVICE_RPC_GRANT: %',name;
    end if;
  end loop;
  foreach name in array authenticated_rpcs loop
    routine:=to_regprocedure(name);
    if routine is null or not has_function_privilege('authenticated',routine,'EXECUTE')
      or has_function_privilege('anon',routine,'EXECUTE') then raise exception 'FRESH_BACKEND_AUTHENTICATED_RPC_GRANT: %',name;end if;
  end loop;
  foreach name in array array['public.registration_health()','public.get_billing_terms()'] loop
    routine:=to_regprocedure(name);
    if routine is null or not has_function_privilege('anon',routine,'EXECUTE')
      or not has_function_privilege('authenticated',routine,'EXECUTE') then raise exception 'FRESH_BACKEND_PUBLIC_RPC_GRANT: %',name;end if;
  end loop;
  if not has_function_privilege('authenticated','private.is_allowed_admin()','EXECUTE') then raise exception 'FRESH_BACKEND_RLS_LOOKUP_GRANT';end if;
  if exists(select 1 from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='private'
    and (has_function_privilege('anon',p.oid,'EXECUTE')
      or (p.proname<>'is_allowed_admin' and has_function_privilege('authenticated',p.oid,'EXECUTE')))) then
    raise exception 'FRESH_BACKEND_PRIVATE_FUNCTION_GRANT';
  end if;
  foreach name in array array['private.require_google_user()','public.list_my_registrations()','public.list_my_billing()',
    'public.list_my_tracker()','public.list_staff_tracker(date)','public.list_staff_tracker(date,text)','public.has_coaching_assignments()',
    'public.read_coaching_email_attendance(uuid,text)',
    'public.get_coaching_attendance_email_status()'] loop
    routine:=to_regprocedure(name);
    if routine is null or (select provolatile from pg_proc where oid=routine)<>'s' then raise exception 'FRESH_BACKEND_READ_RPC_VOLATILITY: %',name;end if;
  end loop;
  if (select provolatile from pg_proc where oid=to_regprocedure('private.lock_google_registration_user()')) is distinct from 'v' then
    raise exception 'FRESH_BACKEND_WRITE_IDENTITY_LOCK_MISSING';
  end if;
  foreach name in array array['public.set_coaching_assignment(uuid,text,integer[],date,bigint)',
    'public.save_coaching_attendance(date,jsonb)','public.save_coaching_feedback(uuid,date,text,text,bigint)',
    'public.send_coaching_attendance_now()'] loop
    routine:=to_regprocedure(name);
    if routine is null or (select position('private.lock_google_registration_user()' in prosrc) from pg_proc where oid=routine)=0 then
      raise exception 'FRESH_BACKEND_WRITE_IDENTITY_LOCK_MISSING: %',name;
    end if;
  end loop;
  if to_regclass('cron.job') is null or to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then
    raise exception 'FRESH_BACKEND_SCHEDULER_EXTENSIONS_MISSING';
  end if;
  foreach name in array array['notification','billing','account_deletion','coaching'] loop
    execute 'select count(*) from cron.job where active and schedule=$1 and command=$2' into n
      using '* * * * *','select private.wake_'||name||'_worker();';
    if n<>1 then raise exception 'FRESH_BACKEND_CRON_MISSING_OR_DUPLICATED: %',name;end if;
  end loop;
  foreach name in array array['notification','billing'] loop
    execute 'select count(*)=1 and bool_and(decrypted_secret=$2) from vault.decrypted_secrets where name=$1' into valid
      using 'letsaimit_'||name||'_worker_url','https://'||production_ref||'.supabase.co/functions/v1/'||case when name='notification' then 'admin-notifications' else 'billing-worker' end;
    if valid is distinct from true then raise exception 'FRESH_BACKEND_VAULT_URL_MISMATCH: %',name;end if;
  end loop;
  execute 'select count(*)=1 and bool_and(char_length(decrypted_secret)>=32) from vault.decrypted_secrets where name=$1' into valid
    using 'letsaimit_notification_worker_secret';
  if valid is distinct from true then raise exception 'FRESH_BACKEND_VAULT_WORKER_SECRET_MISSING';end if;
  if not exists(select 1 from pg_publication_rel pr join pg_publication p on p.oid=pr.prpubid
      where p.pubname='supabase_realtime' and pr.prrelid='public.registrations'::regclass) then
    raise exception 'FRESH_BACKEND_REALTIME_REGISTRATION_MISSING';
  end if;
end;
$verify$;
select 'fresh_backend_database_checks_passed' as result,
  current_setting('letsaimit.production_ref') as expected_project_ref,
  'not_verified_by_sql' as function_deployment_oauth_smtp_webhook_or_website_evidence;
-- Hashes describe this database, not proof of equivalence until compared with the source baseline.
select ns.nspname as schema,p.proname,pg_get_function_identity_arguments(p.oid) as arguments,
  p.provolatile,p.prosecdef,encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') as definition_sha256
  from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='private'
    or (ns.nspname='public' and p.proname in ('is_admin','registration_health','get_billing_terms','submit_registration','list_my_registrations',
      'review_registration','set_monthly_coaching_fee','cancel_billing_account','list_my_billing','list_admin_billing',
      'enqueue_admin_notification_digests','claim_admin_notification','prepare_admin_notification','finish_admin_notification',
      'enqueue_billing_work','claim_billing_job','prepare_billing_job','finish_billing_job','save_billing_provider_snapshot','ingest_billing_webhook',
      'prepare_account_deletion','claim_account_deletions','finish_account_deletion','get_account_deletion_status',
      'list_my_tracker','list_staff_tracker','has_coaching_assignments','set_coaching_assignment','save_coaching_attendance','save_coaching_feedback',
      'enqueue_coaching_attendance','claim_coaching_email','claim_coaching_email_for_modes','prepare_coaching_email','set_coaching_email_token','finish_coaching_email',
      'read_coaching_email_attendance','save_coaching_email_attendance','get_coaching_attendance_email_status','send_coaching_attendance_now'))
  order by ns.nspname,p.proname,arguments;
select ns.nspname as schema,c.relname,p.polname,p.polcmd,p.polroles,
  encode(sha256(convert_to(coalesce(pg_get_expr(p.polqual,p.polrelid),'')||'|'||coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''),'UTF8')),'hex') as policy_sha256
  from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace ns on ns.oid=c.relnamespace
  where ns.nspname in ('public','private') order by ns.nspname,c.relname,p.polname;
commit;
