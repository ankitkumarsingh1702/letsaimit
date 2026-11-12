-- Keep the scheduled AMP approval gate independent of the manual Gmail link.
alter table private.coaching_settings
  add column manual_email_enabled boolean not null default false;
alter table private.coaching_email_tickets
  add column delivery_mode text not null default 'interactive'
    check (delivery_mode in ('interactive', 'link'));

create function private.coaching_email_mode_enabled(p_mode text)
returns boolean language sql stable set search_path='' as $$
  select coalesce((select case p_mode
    when 'interactive' then email_enabled
    when 'link' then manual_email_enabled
    else false end
    from private.coaching_settings where id), false);
$$;
revoke all on function private.coaching_email_mode_enabled(text) from public, anon, authenticated;

create function private.enqueue_coaching_attendance_for_day(p_at timestamptz, p_mode text)
returns integer language plpgsql set search_path='' as $$
declare
  session_day date := (p_at at time zone 'Asia/Kolkata')::date;
  roster jsonb;
  queued_count integer;
begin
  if session_day is null or not private.coaching_email_mode_enabled(p_mode) then
    return 0;
  end if;

  select jsonb_agg(jsonb_build_object('registrationId', child.id) order by child.created, child.id)
  into roster
  from (
    select registration.id, registration.created
    from public.registrations registration
    where private.coaching_live_registration(registration.id)
    order by registration.created, registration.id
    limit 101
  ) child;

  if roster is null then
    return 0;
  end if;
  if jsonb_array_length(roster) > 100 then
    raise exception using errcode='54000', message='The attendance roster exceeds the 100-child email limit.';
  end if;

  insert into private.coaching_email_tickets(recipient_email, session_date, roster, expires_at, next_attempt_at, delivery_mode)
  select admin.email, session_day, roster, p_at + interval '48 hours', p_at, p_mode
  from public.allowed_admins admin
  order by admin.email
  on conflict(recipient_email, session_date) do nothing;

  get diagnostics queued_count = row_count;
  return queued_count;
end;
$$;
revoke all on function private.enqueue_coaching_attendance_for_day(timestamptz, text) from public, anon, authenticated;

-- The existing 21:00 IST enqueue still creates interactive tickets only.
create or replace function private.enqueue_coaching_attendance_for_day(p_at timestamptz)
returns integer language sql set search_path='' as $$
  select private.enqueue_coaching_attendance_for_day(p_at, 'interactive');
$$;

create or replace function private.coaching_attendance_email_status_for_day(p_day date)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object(
    'sessionDate', p_day,
    'emailEnabled', settings.manual_enabled or settings.scheduled_enabled,
    'scheduledEnabled', settings.scheduled_enabled,
    'deliveryMode', case when settings.scheduled_enabled then 'interactive' when settings.manual_enabled then 'link' end,
    'queued', 0,
    'pending', delivery.pending,
    'sent', delivery.sent,
    'failed', delivery.failed
  )
  from (select
    private.coaching_email_mode_enabled('link') as manual_enabled,
    private.coaching_email_mode_enabled('interactive') as scheduled_enabled
  ) settings
  cross join lateral (
    select
      count(*) filter (where ticket.state in ('pending', 'processing') and ticket.expires_at > now()) as pending,
      count(*) filter (where ticket.state = 'sent' and ticket.sent_at is not null) as sent,
      count(*) filter (where ticket.state in ('failed', 'cancelled')
        or (ticket.state in ('pending', 'processing') and ticket.expires_at <= now())) as failed
    from public.allowed_admins admin
    join private.coaching_email_tickets ticket on ticket.recipient_email = admin.email and ticket.session_date = p_day
    where settings.manual_enabled or settings.scheduled_enabled
  ) delivery;
$$;
revoke all on function private.coaching_attendance_email_status_for_day(date) from public, anon, authenticated;

create or replace function public.send_coaching_attendance_now()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  session_day date := (now() at time zone 'Asia/Kolkata')::date;
  queued_count integer;
begin
  perform private.lock_google_registration_user();
  if not private.is_allowed_admin() then
    raise exception using errcode='42501', message='Admin access is required.';
  end if;

  queued_count := private.enqueue_coaching_attendance_for_day(
    now(),
    case when private.coaching_email_mode_enabled('interactive') then 'interactive' else 'link' end
  );
  if queued_count > 0 then
    -- pg_net starts the existing worker request after this transaction commits.
    perform private.wake_coaching_worker();
  end if;

  return private.coaching_attendance_email_status_for_day(session_day) || jsonb_build_object('queued', queued_count);
end;
$$;
revoke all on function public.send_coaching_attendance_now() from public, anon, authenticated, service_role;
grant execute on function public.send_coaching_attendance_now() to authenticated;


-- Older workers can continue to claim interactive jobs. Link jobs require a
-- worker that explicitly declares the matching transport ready.
create function public.claim_coaching_email_for_modes(p_modes text[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  job private.coaching_email_tickets%rowtype;
begin
  update private.coaching_email_tickets
  set state='failed', error_code='lease_expired', lease_token=null, lease_until=null
  where state='processing' and lease_until<=now() and attempts>=5
    and delivery_mode=any(p_modes) and private.coaching_email_mode_enabled(delivery_mode);

  select * into job
  from private.coaching_email_tickets
  where delivery_mode=any(p_modes) and private.coaching_email_mode_enabled(delivery_mode)
    and expires_at>now() and attempts<5
    and ((state='pending' and next_attempt_at<=now()) or (state='processing' and lease_until<=now()))
  order by next_attempt_at, created_at, id
  limit 1 for update skip locked;
  if not found then
    return null;
  end if;

  update private.coaching_email_tickets
  set state='processing', attempts=attempts+1, lease_token=gen_random_uuid(), lease_until=now()+interval '2 minutes'
  where id=job.id returning * into job;
  return jsonb_build_object(
    'id', job.id, 'leaseToken', job.lease_token, 'recipientEmail', job.recipient_email,
    'sessionDate', job.session_date, 'expiresAt', job.expires_at, 'deliveryMode', job.delivery_mode
  );
end;
$$;
revoke all on function public.claim_coaching_email_for_modes(text[]) from public, anon, authenticated;
grant execute on function public.claim_coaching_email_for_modes(text[]) to service_role;

create or replace function public.claim_coaching_email()
returns jsonb language sql security definer set search_path='' as $$
  select public.claim_coaching_email_for_modes(array['interactive']);
$$;

create or replace function public.prepare_coaching_email(p_id uuid,p_lease_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job private.coaching_email_tickets%rowtype;
begin
  select * into job from private.coaching_email_tickets where id=p_id and state='processing' and lease_token=p_lease_token and lease_until>now() for update;
  if not found or not private.coaching_email_mode_enabled(job.delivery_mode) then return null;end if;
  if not private.coaching_ticket_access(job) then
    update private.coaching_email_tickets set state='cancelled',error_code='recipient_revoked',lease_token=null,lease_until=null where id=job.id;return null;end if;
  return private.coaching_ticket_projection(job)||jsonb_build_object('state','ready','deliveryMode',job.delivery_mode);
end;
$$;
revoke all on function public.prepare_coaching_email(uuid,uuid) from public,anon,authenticated;
grant execute on function public.prepare_coaching_email(uuid,uuid) to service_role;

create or replace function public.set_coaching_email_token(p_id uuid,p_lease_token uuid,p_token_hash text)
returns boolean language plpgsql security definer set search_path='' as $$
declare job private.coaching_email_tickets%rowtype;
begin
  if p_token_hash is null or p_token_hash!~'^[0-9a-f]{64}$' then raise exception using errcode='22023',message='Invalid attendance ticket.';end if;
  select * into job from private.coaching_email_tickets where id=p_id and state='processing' and lease_token=p_lease_token and lease_until>now() for update;
  if not found or job.delivery_mode<>'interactive' or not private.coaching_email_mode_enabled('interactive')
    or not private.coaching_ticket_access(job) or (job.token_hash is not null and job.token_hash<>p_token_hash) then return false;end if;
  update private.coaching_email_tickets set token_hash=p_token_hash where id=job.id;return true;
end;
$$;
revoke all on function public.set_coaching_email_token(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.set_coaching_email_token(uuid,uuid,text) to service_role;

create or replace function private.wake_coaching_worker()
returns void language plpgsql security definer set search_path='' as $$
declare worker_url text;worker_secret text;
begin
  perform private.enqueue_coaching_attendance_at(now());
  if not exists(
      select 1 from private.coaching_email_tickets
      where expires_at>now() and private.coaching_email_mode_enabled(delivery_mode)
        and ((state='pending' and next_attempt_at<=now()) or (state='processing' and lease_until<=now()))
    )
    or to_regnamespace('net') is null or to_regclass('vault.decrypted_secrets') is null then return;end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name=$1 limit 1' into worker_url using 'letsaimit_notification_worker_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name=$1 limit 1' into worker_secret using 'letsaimit_notification_worker_secret';
  if worker_url is null or worker_url!~'^https://[a-z0-9]+[.]supabase[.]co/functions/v1/admin-notifications$' or char_length(coalesce(worker_secret,''))<32 then return;end if;
  worker_url:=replace(worker_url,'/admin-notifications','/coaching-worker');
  perform net.http_post(url:=worker_url,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||worker_secret),body:='{}'::jsonb,timeout_milliseconds:=145000);
exception when others then return;
end;
$$;
revoke all on function private.wake_coaching_worker() from public,anon,authenticated;
