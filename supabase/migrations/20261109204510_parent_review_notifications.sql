-- Authenticated parent ownership, independent admin review, and durable email jobs.
-- Dispatch remains OFF until the operator confirms the sender and rotated secrets.
alter table public.registrations
  add column parent_user_id uuid references auth.users(id) on delete set null,
  add column review_decision text not null default 'pending' check (review_decision in ('pending','accepted','declined')),
  add column reviewed_at timestamptz,
  add column reviewed_by text not null default '',
  add constraint registrations_review_audit_check check (
    (review_decision = 'pending' and reviewed_at is null and reviewed_by = '') or
    (review_decision in ('accepted','declined') and reviewed_at is not null and reviewed_by <> '')
  );
create index registrations_parent_created_idx on public.registrations (parent_user_id, created desc, id) where parent_user_id is not null;
create index registrations_reviewed_idx on public.registrations (reviewed_at) where reviewed_at is not null;

create function private.require_google_user()
returns uuid language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'provider','') <> 'google' then
    raise exception using errcode='42501', message='Sign in with Google before submitting a request.';
  end if;
  return auth.uid();
end;
$$;
revoke all on function private.require_google_user() from public, anon, authenticated;

create or replace function private.guard_registration()
returns trigger language plpgsql security definer set search_path = '' as $$
declare normalized jsonb;
begin
  if tg_op = 'INSERT' then
    new.parent_user_id := private.require_google_user();
    normalized := private.normalized_registration(jsonb_build_object('full_name',new.full_name,'email',new.email,'phone',new.phone,'metadata',new.metadata));
    new.id := gen_random_uuid();
    new.full_name := normalized->>'full_name'; new.email := normalized->>'email'; new.phone := normalized->>'phone'; new.metadata := normalized->'metadata';
    new.submission_id := (new.metadata->>'submissionId')::uuid;
    new.fingerprint := encode(sha256(convert_to(normalized::text,'UTF8')),'hex');
    new.status := 'new'; new.notes := ''; new.assignee := ''; new.revision := 1;
    new.created := now(); new.updated := new.created; new.updated_by := '';
    new.review_decision := 'pending'; new.reviewed_at := null; new.reviewed_by := '';
  else
    -- Only the auth-user FK can detach an owner after that account is deleted.
    if old.parent_user_id is not null and new.parent_user_id is null
      and not exists(select 1 from auth.users where id=old.parent_user_id)
      and (to_jsonb(new)-'parent_user_id') = (to_jsonb(old)-'parent_user_id') then
      return new;
    end if;
    if not private.is_allowed_admin() then
      raise exception using errcode='42501', message='Admin access is required.';
    end if;
    if row(new.id,new.submission_id,new.full_name,new.email,new.phone,new.metadata,new.fingerprint,new.created,new.revision,new.parent_user_id)
      is distinct from row(old.id,old.submission_id,old.full_name,old.email,old.phone,old.metadata,old.fingerprint,old.created,old.revision,old.parent_user_id) then
      raise exception using errcode='42501', message='Submitted request details cannot be changed.';
    end if;
    if row(new.review_decision,new.reviewed_at,new.reviewed_by) is distinct from row(old.review_decision,old.reviewed_at,old.reviewed_by) then
      if old.review_decision <> 'pending' or new.review_decision not in ('accepted','declined') then
        raise exception using errcode='42501', message='This request already has a review decision.';
      end if;
      new.reviewed_at := clock_timestamp();
      new.reviewed_by := lower(auth.jwt()->>'email');
    end if;
    new.notes := private.registration_text(to_jsonb(new.notes),'notes',2000,true);
    new.assignee := private.registration_text(to_jsonb(new.assignee),'assignee',254,true);
    new.revision := old.revision+1; new.updated := now(); new.updated_by := lower(auth.jwt()->>'email');
  end if;
  return new;
end;
$$;

create or replace function public.submit_registration(payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare normalized jsonb; request_id uuid; expected_fingerprint text; saved public.registrations%rowtype;
  owner_id uuid; is_duplicate boolean := false;
begin
  owner_id := private.require_google_user();
  normalized := private.normalized_registration(payload);
  request_id := (normalized->'metadata'->>'submissionId')::uuid;
  expected_fingerprint := encode(sha256(convert_to(normalized::text,'UTF8')),'hex');
  insert into public.registrations(full_name,email,phone,metadata)
    values(normalized->>'full_name',normalized->>'email',normalized->>'phone',normalized->'metadata')
    on conflict(submission_id) do nothing returning * into saved;
  if not found then
    select * into strict saved from public.registrations where submission_id=request_id;
    if saved.parent_user_id is distinct from owner_id or saved.fingerprint <> expected_fingerprint then
      raise exception using errcode='PT409', message='These details have changed. Start a new registration.', detail='SUBMISSION_CONFLICT';
    end if;
    is_duplicate := true;
  end if;
  return jsonb_build_object('ok',true,'submissionId',saved.submission_id,'savedAt',saved.created,'duplicate',is_duplicate,'id',saved.id);
end;
$$;
revoke all on function public.submit_registration(jsonb) from public, anon, authenticated;
grant execute on function public.submit_registration(jsonb) to authenticated;
revoke insert on public.registrations from anon, authenticated;
revoke insert(full_name,email,phone,metadata) on public.registrations from anon, authenticated;
drop policy registrations_public_create on public.registrations;

-- Parent access is a projected RPC, never a SELECT policy on the private admin row.
create function public.list_my_registrations()
returns table(id uuid,submission_id uuid,created timestamptz,review_decision text,reviewed_at timestamptz,metadata jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare owner_id uuid;
begin
  owner_id := private.require_google_user();
  return query select r.id,r.submission_id,r.created,r.review_decision,r.reviewed_at,
    jsonb_build_object('formType',r.metadata->>'formType','childName',r.metadata->>'childName','age',r.metadata->>'age','community',r.metadata->>'community','sport',r.metadata->>'sport')
    from public.registrations r where r.parent_user_id=owner_id order by r.created desc,r.id desc;
end;
$$;
revoke all on function public.list_my_registrations() from public, anon, authenticated;
grant execute on function public.list_my_registrations() to authenticated;

create function public.review_registration(p_id uuid,p_decision text,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare saved public.registrations%rowtype;
begin
  if not private.is_allowed_admin() then raise exception using errcode='42501',message='Admin access is required.'; end if;
  if p_decision is null or p_decision not in ('accepted','declined') or p_expected_revision is null or p_expected_revision<1 or p_expected_revision>9007199254740991 then
    raise exception using errcode='22023',message='Check the requested decision and saved revision.';
  end if;
  select * into saved from public.registrations where id=p_id for update;
  if not found then raise exception using errcode='P0002',message='This request is no longer available.'; end if;
  if saved.review_decision <> p_decision then
    if saved.review_decision <> 'pending' or saved.revision <> p_expected_revision then
      raise exception using errcode='PT409',message='This request changed. Review its latest saved version.';
    end if;
    update public.registrations set review_decision=p_decision where id=p_id returning * into saved;
  end if;
  return to_jsonb(saved)-'fingerprint'-'parent_user_id';
end;
$$;
revoke all on function public.review_registration(uuid,text,bigint) from public, anon, authenticated;
grant execute on function public.review_registration(uuid,text,bigint) to authenticated;

create table private.notification_settings(
  id boolean primary key default true check(id),
  dispatch_enabled boolean not null default false,
  digest_cursor timestamptz not null default date_bin(interval '4 hours',now(),timestamptz '1970-01-01 00:00:00+00')
);
insert into private.notification_settings(id) values(true);
create table private.notification_digest_windows(
  window_end timestamptz primary key,
  window_start timestamptz not null,
  generated_at timestamptz not null,
  summary jsonb not null check(jsonb_typeof(summary)='object'),
  check(window_end=window_start+interval '4 hours')
);
-- A transactionally recorded action is assigned to one digest after it becomes visible.
-- Original timestamps are retained, so a late commit is explicitly carried forward.
create table private.notification_activity(
  id uuid primary key default gen_random_uuid(),
  registration_id uuid references public.registrations(id) on delete set null,
  kind text not null check(kind in ('new_trial','new_enrol','accepted','declined')),
  occurred_at timestamptz not null,
  digest_window_end timestamptz references private.notification_digest_windows(window_end),
  unique(registration_id,kind)
);
create index notification_activity_unassigned_idx on private.notification_activity(occurred_at) where digest_window_end is null;
create index notification_activity_window_idx on private.notification_activity(digest_window_end) where digest_window_end is not null;
create table private.admin_notification_outbox(
  id uuid primary key default gen_random_uuid(),
  kind text not null check(kind in ('new_request','digest')),
  registration_id uuid references public.registrations(id) on delete cascade,
  window_end timestamptz references private.notification_digest_windows(window_end) on delete cascade,
  recipient_email text not null,
  state text not null default 'pending' check(state in ('pending','processing','sent','failed','cancelled')),
  attempts smallint not null default 0 check(attempts between 0 and 5),
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  failure_code text not null default '' check(failure_code in ('','transport_failure','configuration_error','recipient_revoked','request_missing','lease_expired')),
  check((kind='new_request' and registration_id is not null and window_end is null) or (kind='digest' and registration_id is null and window_end is not null))
);
create unique index notification_new_request_dedupe on private.admin_notification_outbox(registration_id,recipient_email) where kind='new_request';
create unique index notification_digest_dedupe on private.admin_notification_outbox(window_end,recipient_email) where kind='digest';
create index notification_registration_idx on private.admin_notification_outbox(registration_id) where registration_id is not null;
create index notification_window_idx on private.admin_notification_outbox(window_end) where window_end is not null;
create index notification_due_idx on private.admin_notification_outbox(next_attempt_at,created_at) where state in ('pending','processing');
alter table private.notification_settings enable row level security;
alter table private.notification_digest_windows enable row level security;
alter table private.admin_notification_outbox enable row level security;
alter table private.notification_activity enable row level security;
revoke all on private.notification_settings,private.notification_digest_windows,private.admin_notification_outbox,private.notification_activity from public,anon,authenticated;

-- Optional hosted extensions: local policy tests work without network/scheduler extensions.
do $$
begin
  if exists(select 1 from pg_available_extensions where name='pg_net') then create extension if not exists pg_net; end if;
  if exists(select 1 from pg_available_extensions where name='pg_cron') then create extension if not exists pg_cron; end if;
end;
$$;
create function private.wake_notification_worker()
returns void language plpgsql security definer set search_path = '' as $$
declare worker_url text; worker_secret text;
begin
  if not (select dispatch_enabled from private.notification_settings where id) or to_regnamespace('net') is null or to_regclass('vault.decrypted_secrets') is null then return; end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name=$1 limit 1' into worker_url using 'letsaimit_notification_worker_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name=$1 limit 1' into worker_secret using 'letsaimit_notification_worker_secret';
  if worker_url is null or worker_url !~ '^https://[a-z0-9]+[.]supabase[.]co/functions/v1/admin-notifications$' or char_length(coalesce(worker_secret,''))<32 then return; end if;
  perform net.http_post(url:=worker_url,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||worker_secret),body:='{}'::jsonb,timeout_milliseconds:=145000);
exception when others then
  -- The durable outbox and minute recovery job remain; wake failures never reject a parent save.
  return;
end;
$$;
revoke all on function private.wake_notification_worker() from public,anon,authenticated;

create function private.enqueue_registration_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into private.notification_activity(registration_id,kind,occurred_at)
    values(new.id,'new_'||(new.metadata->>'formType'),new.created);
  insert into private.admin_notification_outbox(kind,registration_id,recipient_email)
    select 'new_request',new.id,a.email from public.allowed_admins a on conflict do nothing;
  perform private.wake_notification_worker();
  return new;
end;
$$;
revoke all on function private.enqueue_registration_notification() from public,anon,authenticated;
create trigger enqueue_registration_notification after insert on public.registrations for each row execute function private.enqueue_registration_notification();

create function private.record_registration_review_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into private.notification_activity(registration_id,kind,occurred_at)
    values(new.id,new.review_decision,new.reviewed_at);
  return new;
end;
$$;
revoke all on function private.record_registration_review_activity() from public,anon,authenticated;
create trigger record_registration_review_activity after update on public.registrations
  for each row when(old.review_decision='pending' and new.review_decision in ('accepted','declined'))
  execute function private.record_registration_review_activity();

create function public.enqueue_admin_notification_digests()
returns integer language plpgsql security definer set search_path = '' as $$
declare cursor_at timestamptz; closed_end timestamptz; end_at timestamptz; generated timestamptz; metrics jsonb; n integer:=0; added integer; windows integer:=0;
begin
  select digest_cursor into cursor_at from private.notification_settings where id and dispatch_enabled for update;
  if not found then return 0; end if;
  closed_end:=date_bin(interval '4 hours',now(),timestamptz '1970-01-01 00:00:00+00');
  while cursor_at<closed_end and windows<6 loop
    end_at:=cursor_at+interval '4 hours';
    select summary into metrics from private.notification_digest_windows where window_end=end_at;
    if not found then
      generated:=clock_timestamp();
      insert into private.notification_digest_windows(window_start,window_end,generated_at,summary)
        values(cursor_at,end_at,generated,'{}'::jsonb);
      -- The settings row lock serializes digest writers. Invisible concurrent inserts
      -- remain unassigned and join a later NEW window, never a frozen summary.
      update private.notification_activity set digest_window_end=end_at
        where digest_window_end is null and occurred_at<end_at;
      select jsonb_build_object(
        'windowStartUtc',cursor_at,'windowEndUtc',end_at,'generatedAtUtc',generated,
        'newTrials',count(*) filter(where occurred_at>=cursor_at and kind='new_trial'),
        'newEnrolments',count(*) filter(where occurred_at>=cursor_at and kind='new_enrol'),
        'acceptedDecisions',count(*) filter(where occurred_at>=cursor_at and kind='accepted'),
        'declinedDecisions',count(*) filter(where occurred_at>=cursor_at and kind='declined'),
        'lateNewTrials',count(*) filter(where occurred_at<cursor_at and kind='new_trial'),
        'lateNewEnrolments',count(*) filter(where occurred_at<cursor_at and kind='new_enrol'),
        'lateAcceptedDecisions',count(*) filter(where occurred_at<cursor_at and kind='accepted'),
        'lateDeclinedDecisions',count(*) filter(where occurred_at<cursor_at and kind='declined'),
        'pendingRequests',(select count(*) from public.registrations where review_decision='pending'))
        into metrics from private.notification_activity where digest_window_end=end_at;
      update private.notification_digest_windows set summary=metrics where window_end=end_at;
    end if;
    if (metrics->>'newTrials')::bigint+(metrics->>'newEnrolments')::bigint+(metrics->>'acceptedDecisions')::bigint+(metrics->>'declinedDecisions')::bigint
      +(metrics->>'lateNewTrials')::bigint+(metrics->>'lateNewEnrolments')::bigint+(metrics->>'lateAcceptedDecisions')::bigint+(metrics->>'lateDeclinedDecisions')::bigint>0 then
      insert into private.admin_notification_outbox(kind,window_end,recipient_email) select 'digest',end_at,email from public.allowed_admins on conflict do nothing;
      get diagnostics added=row_count; n:=n+added;
    end if;
    cursor_at:=end_at; windows:=windows+1;
  end loop;
  update private.notification_settings set digest_cursor=cursor_at where id;
  return n;
end;
$$;
revoke all on function public.enqueue_admin_notification_digests() from public,anon,authenticated;
grant execute on function public.enqueue_admin_notification_digests() to service_role;

create function public.claim_admin_notification()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare job private.admin_notification_outbox%rowtype;
begin
  if not (select dispatch_enabled from private.notification_settings where id) then return null; end if;
  update private.admin_notification_outbox set state='failed',failure_code='lease_expired',lease_token=null,lease_until=null
    where state='processing' and lease_until<=now() and attempts>=5;
  select * into job from private.admin_notification_outbox
    where attempts<5 and ((state='pending' and next_attempt_at<=now()) or (state='processing' and lease_until<=now()))
    order by next_attempt_at,created_at,id for update skip locked limit 1;
  if not found then return null; end if;
  update private.admin_notification_outbox set state='processing',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes'
    where id=job.id returning * into job;
  return jsonb_build_object('id',job.id,'leaseToken',job.lease_token,'attempt',job.attempts);
end;
$$;
revoke all on function public.claim_admin_notification() from public,anon,authenticated;
grant execute on function public.claim_admin_notification() to service_role;

create function public.prepare_admin_notification(p_id uuid,p_lease_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare job private.admin_notification_outbox%rowtype; r public.registrations%rowtype; content jsonb;
begin
  select * into job from private.admin_notification_outbox where id=p_id and state='processing' and lease_token=p_lease_token and lease_until>now() for update;
  if not found or not (select dispatch_enabled from private.notification_settings where id) then return null; end if;
  if not exists(select 1 from public.allowed_admins where email=job.recipient_email) then
    update private.admin_notification_outbox set state='cancelled',failure_code='recipient_revoked',lease_token=null,lease_until=null where id=job.id;
    return null;
  end if;
  if job.kind='new_request' then
    select * into r from public.registrations where id=job.registration_id;
    if not found then return null; end if;
    content:=jsonb_build_object('id',r.id,'formType',r.metadata->>'formType','parentName',r.full_name,'childName',r.metadata->>'childName','sport',r.metadata->>'sport','community',r.metadata->>'community','submittedAt',r.created);
  else
    select summary into content from private.notification_digest_windows where window_end=job.window_end;
  end if;
  return jsonb_build_object('id',job.id,'kind',job.kind,'recipientEmail',job.recipient_email,'content',content);
end;
$$;
revoke all on function public.prepare_admin_notification(uuid,uuid) from public,anon,authenticated;
grant execute on function public.prepare_admin_notification(uuid,uuid) to service_role;

create function public.finish_admin_notification(p_id uuid,p_lease_token uuid,p_outcome text,p_failure_code text default '')
returns boolean language plpgsql security definer set search_path = '' as $$
declare job private.admin_notification_outbox%rowtype;
begin
  if p_outcome is null or p_outcome not in ('sent','retry','cancelled') or p_failure_code is null or p_failure_code not in ('','transport_failure','configuration_error','recipient_revoked','request_missing') then raise exception using errcode='22023',message='Invalid notification result.'; end if;
  select * into job from private.admin_notification_outbox where id=p_id and state='processing' and lease_token=p_lease_token and lease_until>now() for update;
  if not found then return false; end if;
  update private.admin_notification_outbox set
    state=case when p_outcome='sent' then 'sent' when p_outcome='cancelled' then 'cancelled' when attempts>=5 then 'failed' else 'pending' end,
    sent_at=case when p_outcome='sent' then now() else sent_at end,
    failure_code=p_failure_code, lease_token=null,lease_until=null,
    next_attempt_at=case when p_outcome='retry' then now()+make_interval(secs=>least(7200,30*power(4,greatest(attempts-1,0)))::integer) else next_attempt_at end
    where id=job.id;
  return true;
end;
$$;
revoke all on function public.finish_admin_notification(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.finish_admin_notification(uuid,uuid,text,text) to service_role;

do $$
begin
  if to_regnamespace('cron') is not null then
    perform cron.schedule('letsaimit-admin-notifications','* * * * *','select private.wake_notification_worker();');
  end if;
end;
$$;
