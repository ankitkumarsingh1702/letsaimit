-- Delete the Auth login through the server SDK; retain detached financial history.
-- These private tombstones also reject already-issued JWTs while deletion retries.
create table private.account_deletions (
  id uuid primary key default gen_random_uuid(),
  old_auth_user_id uuid not null unique,
  current_auth_user_id uuid references auth.users(id) on delete set null,
  policy_version text not null check(policy_version='2026-11-11'),
  accepted_forfeit boolean not null check(accepted_forfeit),
  identity_snapshot jsonb not null check(jsonb_typeof(identity_snapshot)='object'),
  status text not null default 'pending' check(status in ('pending','processing','retrying','failed','completed')),
  attempts smallint not null default 0 check(attempts between 0 and 8),
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  error_code text not null default '' check(error_code in ('','auth_delete_failed','auth_unavailable','auth_not_deleted','lease_expired','configuration_error')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check((status='completed')=(completed_at is not null))
);
create index account_deletions_due_idx on private.account_deletions(next_attempt_at,created_at) where status in ('pending','processing','retrying');
create table private.account_deletion_registrations (
  deletion_id uuid not null references private.account_deletions(id) on delete restrict,
  registration_id uuid not null unique references public.registrations(id) on delete restrict,
  snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
  primary key(deletion_id,registration_id)
);
alter table private.account_deletions enable row level security;
alter table private.account_deletion_registrations enable row level security;
revoke all on private.account_deletions,private.account_deletion_registrations from public,anon,authenticated;
alter table public.registrations add column deleted_at timestamptz,
  add column deletion_id uuid references private.account_deletions(id) on delete restrict,
  add constraint registrations_deletion_check check((deleted_at is null)=(deletion_id is null));

create or replace function private.is_allowed_admin()
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and coalesce(auth.jwt()->'app_metadata'->>'provider','')='google'
    and exists(select 1 from auth.users where id=auth.uid())
    and not exists(select 1 from private.account_deletions where old_auth_user_id=auth.uid())
    and exists(select 1 from public.allowed_admins where email=lower(coalesce(auth.jwt()->>'email','')));
$$;
create or replace function private.require_google_user()
returns uuid language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if actor is null or coalesce(auth.jwt()->'app_metadata'->>'provider','')<>'google' then
    raise exception using errcode='42501',message='Sign in with Google before submitting a request.';
  end if;
  if not exists(select 1 from auth.users where id=actor)
    or exists(select 1 from private.account_deletions where old_auth_user_id=actor) then
    raise exception using errcode='42501',message='This account is no longer available.';
  end if;
  return actor;
end;
$$;
revoke all on function private.require_google_user() from public,anon,authenticated;

-- Lock only the INSERT path: stable parent-list RPCs run in read-only transactions.
create function private.lock_google_registration_user()
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=private.require_google_user();
begin
  perform 1 from auth.users where id=actor for key share;
  if not found then raise exception using errcode='42501',message='This account is no longer available.';end if;
  -- The volatile trigger's next SPI statement observes deletion committed while waiting.
  return private.require_google_user();
end;
$$;
revoke all on function private.lock_google_registration_user() from public,anon,authenticated;

create or replace function private.guard_registration()
returns trigger language plpgsql security definer set search_path='' as $$
declare normalized jsonb; deletion private.account_deletions%rowtype;
begin
  if tg_op='INSERT' then
    new.parent_user_id:=private.lock_google_registration_user();
    normalized:=private.normalized_registration(jsonb_build_object('full_name',new.full_name,'email',new.email,'phone',new.phone,'metadata',new.metadata));
    new.id:=gen_random_uuid();new.full_name:=normalized->>'full_name';new.email:=normalized->>'email';new.phone:=normalized->>'phone';new.metadata:=normalized->'metadata';
    new.submission_id:=(new.metadata->>'submissionId')::uuid;new.fingerprint:=encode(sha256(convert_to(normalized::text,'UTF8')),'hex');
    new.status:='new';new.notes:='';new.assignee:='';new.revision:=1;new.created:=now();new.updated:=new.created;new.updated_by:='';
    new.review_decision:='pending';new.reviewed_at:=null;new.reviewed_by:='';new.deleted_at:=null;new.deletion_id:=null;
    return new;
  end if;
  -- The existing Auth FK detaches only after the actual Auth row has gone.
  if old.parent_user_id is not null and new.parent_user_id is null
    and not exists(select 1 from auth.users where id=old.parent_user_id)
    and (to_jsonb(new)-'parent_user_id')=(to_jsonb(old)-'parent_user_id') then return new;end if;
  if old.deleted_at is null and new.deleted_at is not null then
    select * into deletion from private.account_deletions where id=new.deletion_id and old_auth_user_id=old.parent_user_id;
    if coalesce(current_setting('role',true),'')='service_role' and deletion.id is not null and new.deleted_at=deletion.created_at and new.full_name='Deleted account'
      and new.email='deleted+'||old.id::text||'@example.invalid' and new.phone='+10000000'
      and new.metadata=jsonb_build_object('accountDeleted',true) and new.status='closed' and new.notes='' and new.assignee=''
      and new.revision=old.revision+1 and new.updated=deletion.created_at and new.updated_by=''
      and (to_jsonb(new)-array['full_name','email','phone','metadata','status','notes','assignee','revision','updated','updated_by','deleted_at','deletion_id'])
        =(to_jsonb(old)-array['full_name','email','phone','metadata','status','notes','assignee','revision','updated','updated_by','deleted_at','deletion_id']) then return new;end if;
    raise exception using errcode='42501',message='Account archival is restricted.';
  end if;
  if old.deleted_at is not null or new.deletion_id is distinct from old.deletion_id or new.deleted_at is distinct from old.deleted_at then
    raise exception using errcode='42501',message='This account was deleted.';
  end if;
  if not private.is_allowed_admin() then raise exception using errcode='42501',message='Admin access is required.';end if;
  if row(new.id,new.submission_id,new.full_name,new.email,new.phone,new.metadata,new.fingerprint,new.created,new.revision,new.parent_user_id)
    is distinct from row(old.id,old.submission_id,old.full_name,old.email,old.phone,old.metadata,old.fingerprint,old.created,old.revision,old.parent_user_id) then
    raise exception using errcode='42501',message='Submitted request details cannot be changed.';
  end if;
  if row(new.review_decision,new.reviewed_at,new.reviewed_by) is distinct from row(old.review_decision,old.reviewed_at,old.reviewed_by) then
    if old.review_decision<>'pending' or new.review_decision not in ('accepted','declined') then raise exception using errcode='42501',message='This request already has a review decision.';end if;
    new.reviewed_at:=clock_timestamp();new.reviewed_by:=lower(auth.jwt()->>'email');
  end if;
  new.notes:=private.registration_text(to_jsonb(new.notes),'notes',2000,true);new.assignee:=private.registration_text(to_jsonb(new.assignee),'assignee',254,true);
  new.revision:=old.revision+1;new.updated:=now();new.updated_by:=lower(auth.jwt()->>'email');return new;
end;
$$;

-- The operational register excludes archived requests; private accounting keeps them.
drop policy registrations_admin_read on public.registrations;
create policy registrations_admin_read on public.registrations for select to authenticated
  using(deleted_at is null and (select private.is_allowed_admin()));
drop policy registrations_admin_update on public.registrations;
create policy registrations_admin_update on public.registrations for update to authenticated
  using(deleted_at is null and (select private.is_allowed_admin()))
  with check(deleted_at is null and (select private.is_allowed_admin()));

-- Keep the existing quote/revision implementation, with an archived-row boundary.
alter function public.review_registration(uuid,text,bigint,integer) set schema private;
alter function private.review_registration(uuid,text,bigint,integer) rename to review_registration_before_deletion;
revoke all on function private.review_registration_before_deletion(uuid,text,bigint,integer) from public,anon,authenticated;
create function public.review_registration(p_id uuid,p_decision text,p_expected_revision bigint,p_monthly_amount_paise integer)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not private.is_allowed_admin() then raise exception using errcode='42501',message='Admin access is required.';end if;
  perform 1 from public.registrations where id=p_id and deleted_at is null for update;
  if not found then raise exception using errcode='P0002',message='This request is no longer available.';end if;
  return private.review_registration_before_deletion(p_id,p_decision,p_expected_revision,p_monthly_amount_paise);
end;
$$;
revoke all on function public.review_registration(uuid,text,bigint,integer) from public,anon,authenticated;
grant execute on function public.review_registration(uuid,text,bigint,integer) to authenticated;
alter function public.set_monthly_coaching_fee(uuid,integer,bigint) set schema private;
alter function private.set_monthly_coaching_fee(uuid,integer,bigint) rename to set_monthly_coaching_fee_before_deletion;
revoke all on function private.set_monthly_coaching_fee_before_deletion(uuid,integer,bigint) from public,anon,authenticated;
create function public.set_monthly_coaching_fee(p_registration_id uuid,p_amount_paise integer,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not private.is_allowed_admin() then raise exception using errcode='42501',message='Admin access is required.';end if;
  perform 1 from public.registrations where id=p_registration_id and deleted_at is null for update;
  if not found then raise exception using errcode='P0002',message='This request is no longer available.';end if;
  return private.set_monthly_coaching_fee_before_deletion(p_registration_id,p_amount_paise,p_expected_revision);
end;
$$;
revoke all on function public.set_monthly_coaching_fee(uuid,integer,bigint) from public,anon,authenticated;
grant execute on function public.set_monthly_coaching_fee(uuid,integer,bigint) to authenticated;

-- A concurrent scheduler cannot insert a new cycle after the deletion transaction.
create function private.guard_deleted_billing_account()
returns trigger language plpgsql security definer set search_path='' as $$
declare account private.billing_accounts%rowtype;
begin
  select * into account from private.billing_accounts where id=new.account_id for update;
  if exists(select 1 from public.registrations where id=account.registration_id and deleted_at is not null)
    or exists(select 1 from private.account_deletions where old_auth_user_id=account.parent_user_id) then
    raise exception using errcode='42501',message='This billing account was deleted.';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_deleted_billing_account() from public,anon,authenticated;
create trigger guard_deleted_billing_account before insert on private.billing_invoices for each row execute function private.guard_deleted_billing_account();

alter table private.billing_jobs drop constraint billing_jobs_kind_check;
alter table private.billing_jobs add constraint billing_jobs_kind_check check(kind in ('create_invoice','reconcile_invoice','cancel_invoice','send_invoice','send_reminder','send_receipt','send_refund','send_fee_change','send_month_summary'));

create function private.wake_account_deletion_worker()
returns void language plpgsql security definer set search_path='' as $$
declare worker_url text;worker_secret text;
begin
  if not exists(select 1 from private.account_deletions d where status in ('pending','processing','retrying')
      or (status='failed' and not exists(select 1 from auth.users where id=d.old_auth_user_id)))
    or to_regnamespace('net') is null or to_regclass('vault.decrypted_secrets') is null then return;end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name=$1 limit 1' into worker_url using 'letsaimit_notification_worker_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name=$1 limit 1' into worker_secret using 'letsaimit_notification_worker_secret';
  if worker_url is null or worker_url!~'^https://[a-z0-9]+[.]supabase[.]co/functions/v1/admin-notifications$' or char_length(coalesce(worker_secret,''))<32 then return;end if;
  worker_url:=replace(worker_url,'/admin-notifications','/delete-account');
  perform net.http_post(url:=worker_url,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||worker_secret),body:='{"mode":"worker"}'::jsonb,timeout_milliseconds:=145000);
exception when others then return;
end;
$$;
revoke all on function private.wake_account_deletion_worker() from public,anon,authenticated;

create function public.prepare_account_deletion(p_user_id uuid,p_policy_version text,p_accept_forfeit boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor auth.users%rowtype;deletion private.account_deletions%rowtype;
begin
  if p_policy_version is distinct from '2026-11-11' or p_accept_forfeit is distinct from true then
    raise exception using errcode='22023',message='Confirm the current account deletion policy.';end if;
  perform pg_advisory_xact_lock(hashtext('letsaimit.allowed_admins'));
  select * into actor from auth.users where id=p_user_id for update;
  select * into deletion from private.account_deletions where old_auth_user_id=p_user_id for update;
  if deletion.id is not null then
    if deletion.status='failed' and actor.id is not null then
      update private.account_deletions set status='retrying',attempts=0,next_attempt_at=now(),error_code='' where id=deletion.id;
      perform private.wake_account_deletion_worker();
    end if;
    return jsonb_build_object('deletion_id',deletion.id,'status',case when deletion.status='completed' then 'deleted' else 'deleting' end);
  end if;
  if actor.id is null then raise exception using errcode='P0002',message='This account is no longer available.';end if;
  if exists(select 1 from public.allowed_admins where email=lower(actor.email) and is_owner) then
    raise exception using errcode='PT409',message='owner_protected';end if;
  perform 1 from public.registrations where parent_user_id=p_user_id order by id for update;
  perform 1 from private.billing_accounts where parent_user_id=p_user_id order by id for update;
  insert into private.account_deletions(old_auth_user_id,current_auth_user_id,policy_version,accepted_forfeit,identity_snapshot)
    values(p_user_id,p_user_id,p_policy_version,true,jsonb_build_object('id',actor.id,'email',actor.email)) returning * into deletion;
  insert into private.account_deletion_registrations(deletion_id,registration_id,snapshot)
    select deletion.id,r.id,to_jsonb(r) from public.registrations r where parent_user_id=p_user_id;
  delete from public.allowed_admins where email=lower(actor.email) and not is_owner;
  update private.billing_accounts set status='cancelled',cancelled_at=coalesce(cancelled_at,deletion.created_at),
    cancelled_by=case when cancelled_by='' then 'account-deletion:'||deletion.id else cancelled_by end,revision=revision+1 where parent_user_id=p_user_id and status='active';
  -- Preserve unknown POST outcomes, and queue cancellation/reconciliation before invalidating their leases.
  insert into private.billing_jobs(invoice_id,kind,dedupe_key)
    select i.id,'cancel_invoice','delete-cancel:'||i.id from private.billing_invoices i join private.billing_accounts a on a.id=i.account_id
    where a.parent_user_id=p_user_id and i.paid_paise=0 and i.status in ('creating','pending')
      and (i.provider_invoice_id is not null or exists(select 1 from private.billing_jobs j where j.invoice_id=i.id and j.kind='create_invoice' and (j.attempts>0 or j.state in ('processing','ambiguous'))))
    on conflict do nothing;
  update private.billing_jobs j set state='ambiguous',failure_code='creation_ambiguous',lease_token=null,lease_until=null
    from private.billing_invoices i,private.billing_accounts a where j.invoice_id=i.id and i.account_id=a.id and a.parent_user_id=p_user_id
      and j.kind='create_invoice' and j.state in ('pending','processing','ambiguous') and (j.attempts>0 or j.state in ('processing','ambiguous'));
  update private.billing_jobs j set state='cancelled',finished_at=now(),lease_token=null,lease_until=null
    from private.billing_invoices i,private.billing_accounts a where j.invoice_id=i.id and i.account_id=a.id and a.parent_user_id=p_user_id
      and j.kind in ('create_invoice','send_invoice','send_reminder','send_receipt','send_refund') and j.state in ('pending','processing');
  update private.billing_invoices i set status='cancelled',updated_at=now() from private.billing_accounts a
    where i.account_id=a.id and a.parent_user_id=p_user_id and i.provider_invoice_id is null and i.status='creating'
      and not exists(select 1 from private.billing_jobs j where j.invoice_id=i.id and j.kind='create_invoice' and j.state='ambiguous');
  update private.billing_jobs j set state='cancelled',finished_at=now(),lease_token=null,lease_until=null
    from private.billing_price_changes c,private.billing_accounts a where j.change_id=c.id and c.account_id=a.id and a.parent_user_id=p_user_id and j.state in ('pending','processing');
  update private.billing_jobs set state='cancelled',finished_at=now(),lease_token=null,lease_until=null
    where kind='send_month_summary' and recipient_email=lower(actor.email) and state in ('pending','processing');
  update private.admin_notification_outbox set state='cancelled',failure_code='recipient_revoked',lease_token=null,lease_until=null
    where state in ('pending','processing') and (recipient_email=lower(actor.email) or registration_id in (select id from public.registrations where parent_user_id=p_user_id));
  update public.registrations set full_name='Deleted account',email='deleted+'||id::text||'@example.invalid',phone='+10000000',metadata=jsonb_build_object('accountDeleted',true),
    status='closed',notes='',assignee='',revision=revision+1,updated=deletion.created_at,updated_by='',deleted_at=deletion.created_at,deletion_id=deletion.id where parent_user_id=p_user_id;
  perform private.wake_account_deletion_worker();perform private.wake_billing_worker();
  return jsonb_build_object('deletion_id',deletion.id,'status','deleting');
end;
$$;
revoke all on function public.prepare_account_deletion(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.prepare_account_deletion(uuid,text,boolean) to service_role;

create function public.get_account_deletion_status(p_user_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('status',case when status='completed' then 'deleted' else 'deleting' end) from private.account_deletions where old_auth_user_id=p_user_id;
$$;
revoke all on function public.get_account_deletion_status(uuid) from public,anon,authenticated;
grant execute on function public.get_account_deletion_status(uuid) to service_role;

create function public.claim_account_deletions(p_deletion_id uuid default null,p_limit integer default 5)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  -- An Auth DELETE may succeed even when its final RPC acknowledgement is lost.
  update private.account_deletions d set status='completed',completed_at=now(),lease_token=null,lease_until=null,error_code=''
    where status<>'completed' and not exists(select 1 from auth.users where id=d.old_auth_user_id);
  update private.account_deletions set status='failed',error_code='lease_expired',lease_token=null,lease_until=null
    where status='processing' and lease_until<=now() and attempts>=8;
  with due as (
    select id from private.account_deletions where (p_deletion_id is null or id=p_deletion_id) and attempts<8
      and ((status in ('pending','retrying') and next_attempt_at<=now()) or (status='processing' and lease_until<=now()))
    order by next_attempt_at,created_at,id for update skip locked limit greatest(1,least(coalesce(p_limit,5),5))
  ), claimed as (
    update private.account_deletions d set status='processing',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes'
    from due where d.id=due.id returning d.id,d.old_auth_user_id,d.lease_token
  ) select coalesce(jsonb_agg(jsonb_build_object('id',id,'user_id',old_auth_user_id,'lease_token',lease_token)),'[]'::jsonb) into result from claimed;
  return result;
end;
$$;
revoke all on function public.claim_account_deletions(uuid,integer) from public,anon,authenticated;
grant execute on function public.claim_account_deletions(uuid,integer) to service_role;

create function public.finish_account_deletion(p_id uuid,p_lease_token uuid,p_success boolean,p_error_code text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare deletion private.account_deletions%rowtype;gone boolean;
begin
  if p_success is null or p_error_code is null or p_error_code not in ('','auth_delete_failed','auth_unavailable','auth_not_deleted','configuration_error') then
    raise exception using errcode='22023',message='Invalid account deletion outcome.';end if;
  select * into deletion from private.account_deletions where id=p_id for update;
  if not found then return null;end if;
  if deletion.status='completed' then return jsonb_build_object('status','deleted');end if;
  if deletion.status<>'processing' or deletion.lease_token is distinct from p_lease_token or deletion.lease_until<=now() then return jsonb_build_object('status','deleting');end if;
  gone:=not exists(select 1 from auth.users where id=deletion.old_auth_user_id);
  if gone then
    update private.account_deletions set status='completed',completed_at=now(),lease_token=null,lease_until=null,error_code='' where id=p_id;
  else
    update private.account_deletions set status=case when attempts>=8 then 'failed' else 'retrying' end,
      next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,attempts-1)::integer)),lease_token=null,lease_until=null,
      error_code=case when p_success then 'auth_not_deleted' else coalesce(nullif(p_error_code,''),'auth_unavailable') end where id=p_id;
  end if;
  return jsonb_build_object('status',case when gone then 'deleted' else 'deleting' end);
end;
$$;
revoke all on function public.finish_account_deletion(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.finish_account_deletion(uuid,uuid,boolean,text) to service_role;

-- Preserve frozen activity windows, but current backlog excludes archived requests.
create or replace function public.enqueue_admin_notification_digests()
returns integer language plpgsql security definer set search_path='' as $$
declare cursor_at timestamptz;closed_end timestamptz;end_at timestamptz;generated timestamptz;metrics jsonb;n integer:=0;added integer;windows integer:=0;
begin
  select digest_cursor into cursor_at from private.notification_settings where id and dispatch_enabled for update;
  if not found then return 0;end if;
  closed_end:=date_bin(interval '4 hours',now(),timestamptz '1970-01-01 00:00:00+00');
  while cursor_at<closed_end and windows<6 loop
    end_at:=cursor_at+interval '4 hours';
    select summary into metrics from private.notification_digest_windows where window_end=end_at;
    if not found then
      generated:=clock_timestamp();
      insert into private.notification_digest_windows(window_start,window_end,generated_at,summary) values(cursor_at,end_at,generated,'{}'::jsonb);
      update private.notification_activity set digest_window_end=end_at where digest_window_end is null and occurred_at<end_at;
      select jsonb_build_object('windowStartUtc',cursor_at,'windowEndUtc',end_at,'generatedAtUtc',generated,
        'newTrials',count(*) filter(where occurred_at>=cursor_at and kind='new_trial'),
        'newEnrolments',count(*) filter(where occurred_at>=cursor_at and kind='new_enrol'),
        'acceptedDecisions',count(*) filter(where occurred_at>=cursor_at and kind='accepted'),
        'declinedDecisions',count(*) filter(where occurred_at>=cursor_at and kind='declined'),
        'lateNewTrials',count(*) filter(where occurred_at<cursor_at and kind='new_trial'),
        'lateNewEnrolments',count(*) filter(where occurred_at<cursor_at and kind='new_enrol'),
        'lateAcceptedDecisions',count(*) filter(where occurred_at<cursor_at and kind='accepted'),
        'lateDeclinedDecisions',count(*) filter(where occurred_at<cursor_at and kind='declined'),
        'pendingRequests',(select count(*) from public.registrations where deleted_at is null and review_decision='pending'))
        into metrics from private.notification_activity where digest_window_end=end_at;
      update private.notification_digest_windows set summary=metrics where window_end=end_at;
    end if;
    if (metrics->>'newTrials')::bigint+(metrics->>'newEnrolments')::bigint+(metrics->>'acceptedDecisions')::bigint+(metrics->>'declinedDecisions')::bigint
      +(metrics->>'lateNewTrials')::bigint+(metrics->>'lateNewEnrolments')::bigint+(metrics->>'lateAcceptedDecisions')::bigint+(metrics->>'lateDeclinedDecisions')::bigint>0 then
      insert into private.admin_notification_outbox(kind,window_end,recipient_email) select 'digest',end_at,email from public.allowed_admins on conflict do nothing;
      get diagnostics added=row_count;n:=n+added;
    end if;
    cursor_at:=end_at;windows:=windows+1;
  end loop;
  update private.notification_settings set digest_cursor=cursor_at where id;return n;
end;
$$;

-- Archived invoices remain reconcilable without an Auth owner; never create or email.
alter function private.prepare_billing_job_at(uuid,uuid,timestamptz) rename to prepare_billing_job_before_deletion;
create function private.prepare_billing_job_at(p_id uuid,p_lease_token uuid,p_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job private.billing_jobs%rowtype;archived boolean;
begin
  select * into job from private.billing_jobs where id=p_id and state='processing' and lease_token=p_lease_token and lease_until>p_at for update;
  if not found then return null;end if;
  select r.deleted_at is not null into archived from private.billing_invoices i join private.billing_accounts a on a.id=i.account_id join public.registrations r on r.id=a.registration_id where i.id=job.invoice_id;
  if archived and job.kind in ('cancel_invoice','reconcile_invoice') then
    return jsonb_build_object('kind',job.kind,'invoice',private.billing_invoice_dto(job.invoice_id));
  end if;
  if job.kind='cancel_invoice' then update private.billing_jobs set state='cancelled',finished_at=p_at,lease_token=null,lease_until=null where id=job.id;return null;end if;
  if archived then update private.billing_jobs set state='cancelled',finished_at=p_at,lease_token=null,lease_until=null where id=job.id;return null;end if;
  return private.prepare_billing_job_before_deletion(p_id,p_lease_token,p_at);
end;
$$;
revoke all on function private.prepare_billing_job_at(uuid,uuid,timestamptz),private.prepare_billing_job_before_deletion(uuid,uuid,timestamptz) from public,anon,authenticated;

alter function public.save_billing_provider_snapshot(uuid,jsonb) set schema private;
alter function private.save_billing_provider_snapshot(uuid,jsonb) rename to save_billing_provider_snapshot_before_deletion;
revoke all on function private.save_billing_provider_snapshot_before_deletion(uuid,jsonb) from public,anon,authenticated;
create function public.save_billing_provider_snapshot(p_invoice_id uuid,p_snapshot jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare saved boolean;invoice private.billing_invoices%rowtype;archived boolean;
begin
  saved:=private.save_billing_provider_snapshot_before_deletion(p_invoice_id,p_snapshot);
  select i.* into invoice from private.billing_invoices i where i.id=p_invoice_id;
  select r.deleted_at is not null into archived from private.billing_accounts a join public.registrations r on r.id=a.registration_id where a.id=invoice.account_id;
  if archived then
    update private.billing_jobs set state='cancelled',finished_at=now(),lease_token=null,lease_until=null where invoice_id=p_invoice_id
      and kind in ('send_invoice','send_reminder','send_receipt','send_refund') and state in ('pending','processing');
    if invoice.paid_paise=0 and invoice.provider_invoice_id is not null and invoice.status in ('creating','pending') then
      insert into private.billing_jobs(invoice_id,kind,dedupe_key) values(invoice.id,'cancel_invoice','delete-cancel:'||invoice.id) on conflict do nothing;
    end if;
  end if;
  return saved;
end;
$$;
revoke all on function public.save_billing_provider_snapshot(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_billing_provider_snapshot(uuid,jsonb) to service_role;

create or replace function public.claim_billing_job()
returns jsonb language plpgsql security definer set search_path='' as $$
declare job private.billing_jobs%rowtype;enabled boolean;
begin
  select s.enabled into enabled from private.billing_settings s where id;
  update private.billing_jobs set state='ambiguous',failure_code='creation_ambiguous',lease_token=null,lease_until=null where kind='create_invoice' and state='processing' and lease_until<=now();
  update private.billing_jobs set state='failed',failure_code='lease_expired',lease_token=null,lease_until=null where kind<>'create_invoice' and state='processing' and lease_until<=now() and attempts>=8;
  select j.* into job from private.billing_jobs j where attempts<8 and
    ((state='pending' and next_attempt_at<=now()) or (kind<>'create_invoice' and state='processing' and lease_until<=now()))
    and (enabled or j.kind='cancel_invoice' or (j.kind='reconcile_invoice' and exists(select 1 from private.billing_invoices i join private.billing_accounts a on a.id=i.account_id join public.registrations r on r.id=a.registration_id where i.id=j.invoice_id and r.deleted_at is not null)))
    order by next_attempt_at,created_at,id for update skip locked limit 1;
  if not found then return null;end if;
  update private.billing_jobs set state='processing',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes' where id=job.id returning * into job;
  return jsonb_build_object('id',job.id,'leaseToken',job.lease_token,'kind',job.kind,'attempt',job.attempts);
end;
$$;

-- Billing activation controls new collection, not retained financial reconciliation.
create function private.enqueue_archived_billing_work(p_at timestamptz)
returns integer language plpgsql security definer set search_path='' as $$
declare n integer:=0;added integer;
begin
  insert into private.billing_jobs(invoice_id,kind,dedupe_key)
    select i.id,'reconcile_invoice','reconcile:'||i.id||':'||date_bin(interval '5 minutes',p_at,timestamptz '1970-01-01')::text
    from private.billing_invoices i join private.billing_accounts a on a.id=i.account_id join public.registrations r on r.id=a.registration_id
    where r.deleted_at is not null and (
      (i.provider_invoice_id is not null and (i.checked_at is null or i.checked_at<p_at-case when i.status in ('pending','creating') then interval '5 minutes' else interval '1 day' end))
      or (i.status='creating' and exists(select 1 from private.billing_jobs j where j.invoice_id=i.id and j.kind='create_invoice' and j.state='ambiguous')))
    order by i.checked_at nulls first,i.id limit 100 on conflict do nothing;
  get diagnostics added=row_count;n:=n+added;
  with matches as (
    select e.event_id,i.id from private.billing_webhook_events e join private.billing_invoices i
      on (e.provider_invoice_id=i.provider_invoice_id or e.provider_payment_id=i.provider_payment_id)
      join private.billing_accounts a on a.id=i.account_id join public.registrations r on r.id=a.registration_id
    where e.invoice_id is null and r.deleted_at is not null order by e.received_at,e.event_id limit 100
  ) update private.billing_webhook_events e set invoice_id=matches.id from matches where e.event_id=matches.event_id;
  insert into private.billing_jobs(invoice_id,kind,dedupe_key)
    select e.invoice_id,'reconcile_invoice','event:'||e.event_id from private.billing_webhook_events e
      join private.billing_invoices i on i.id=e.invoice_id join private.billing_accounts a on a.id=i.account_id join public.registrations r on r.id=a.registration_id
    where r.deleted_at is not null and e.applied_at is null order by e.received_at,e.event_id limit 100 on conflict do nothing;
  get diagnostics added=row_count;return n+added;
end;
$$;
revoke all on function private.enqueue_archived_billing_work(timestamptz) from public,anon,authenticated;
alter function public.enqueue_billing_work() set schema private;
alter function private.enqueue_billing_work() rename to enqueue_billing_work_before_deletion;
revoke all on function private.enqueue_billing_work_before_deletion() from public,anon,authenticated;
create function public.enqueue_billing_work()
returns integer language plpgsql security definer set search_path='' as $$
begin
  if (select enabled from private.billing_settings where id) then return private.enqueue_billing_work_before_deletion();end if;
  return private.enqueue_archived_billing_work(now());
end;
$$;
revoke all on function public.enqueue_billing_work() from public,anon,authenticated;
grant execute on function public.enqueue_billing_work() to service_role;

-- Recovery of deletion cancellation/accounting must work even when new billing is off.
create or replace function private.wake_billing_worker()
returns void language plpgsql security definer set search_path='' as $$
declare worker_url text;worker_secret text;
begin
  if not (select enabled from private.billing_settings where id) then perform private.enqueue_archived_billing_work(now());end if;
  if not (select enabled from private.billing_settings where id) and not exists(
    select 1 from private.billing_jobs j join private.billing_invoices i on i.id=j.invoice_id
      join private.billing_accounts a on a.id=i.account_id join public.registrations r on r.id=a.registration_id
    where r.deleted_at is not null and j.kind in ('cancel_invoice','reconcile_invoice') and j.state in ('pending','processing')
  ) then return;end if;
  if to_regnamespace('net') is null or to_regclass('vault.decrypted_secrets') is null then return;end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name=$1 limit 1' into worker_url using 'letsaimit_billing_worker_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name=$1 limit 1' into worker_secret using 'letsaimit_notification_worker_secret';
  if worker_url is null or worker_url!~'^https://[a-z0-9]+[.]supabase[.]co/functions/v1/billing-worker$' or char_length(coalesce(worker_secret,''))<32 then return;end if;
  perform net.http_post(url:=worker_url,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||worker_secret),body:='{}'::jsonb,timeout_milliseconds:=145000);
exception when others then return;
end;
$$;

do $$begin
  if to_regnamespace('cron') is not null then
    if not exists(select 1 from cron.job where jobname='letsaimit-account-deletions') then
      perform cron.schedule('letsaimit-account-deletions','* * * * *','select private.wake_account_deletion_worker();');
    end if;
  end if;
end;$$;
